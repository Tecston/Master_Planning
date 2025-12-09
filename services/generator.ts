import * as turf from '@turf/turf';
import { point, polygon, multiPolygon, lineString, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
import { SiteConfig, GeneratedGeometry, ProjectStats, LatLng, AccessControl, UserConstraint } from '../types';

const getPrincipalAxis = (poly: Feature<Polygon>): number => {
    if (!poly || !poly.geometry || !poly.geometry.coordinates || !Array.isArray(poly.geometry.coordinates) || poly.geometry.coordinates.length === 0) return 0;
    const coords = poly.geometry.coordinates[0];
    if (!coords || coords.length < 2) return 0;

    let maxLen = 0;
    let bestBearing = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        if (!coords[i] || !coords[i+1]) continue;
        const start = point(coords[i]);
        const end = point(coords[i+1]);
        const dist = turf.distance(start, end);
        if (dist > maxLen) {
            maxLen = dist;
            bestBearing = turf.bearing(start, end);
        }
    }
    return bestBearing;
};

const safePolygonToLine = (poly: Feature<Polygon>): Feature<LineString> | null => {
    if (!poly) return null;
    try {
        const result = turf.polygonToLine(poly);
        if (result.type === 'Feature' && result.geometry.type === 'LineString') {
            return result as Feature<LineString>;
        } else if (result.type === 'FeatureCollection' && result.features.length > 0) {
            return result.features[0] as Feature<LineString>;
        }
    } catch (e) {
        return null;
    }
    return null;
}

export const generateBuilding = (
  points: LatLng[],
  config: SiteConfig,
  constraints: UserConstraint[] = [] 
): { geometry: GeneratedGeometry; stats: ProjectStats } => {
  
  const emptyStats: ProjectStats = {
    siteArea: 0,
    netSellableArea: 0,
    roadArea: 0,
    parkArea: 0,
    totalLots: 0,
    efficiency: 0,
    possibleEntrances: 0,
  };

  const emptyGeometry: GeneratedGeometry = {
    siteBoundary: null,
    superblocks: [],
    roads: [],
    lots: [],
    buildings: [],
    parks: [],
    trees: [],
    perimeterWalls: [],
    accessControl: null,
    roadMarkings: [],
    stopSigns: [],
    entranceCandidates: [],
    isValid: false,
  };

  if (!points || points.length < 3) return { geometry: emptyGeometry, stats: emptyStats };

  let globalLotIndex = 0;

  try {
    const coordinates = points.map((p) => [p.lng, p.lat]);
    
    if (
      coordinates.length > 0 &&
      (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
      coordinates[0][1] !== coordinates[coordinates.length - 1][1])
    ) {
      coordinates.push(coordinates[0]);
    }

    let originalSitePoly = polygon([coordinates]);
    const cleanResult = turf.cleanCoords(originalSitePoly);
    originalSitePoly = cleanResult as Feature<Polygon>;
    
    if (!originalSitePoly || !originalSitePoly.geometry || !originalSitePoly.geometry.coordinates || !Array.isArray(originalSitePoly.geometry.coordinates) || originalSitePoly.geometry.coordinates.length === 0) {
        return { geometry: { ...emptyGeometry, error: "Invalid Geometry" }, stats: emptyStats };
    }

    turf.rewind(originalSitePoly, { mutate: true });

    const kinks = turf.kinks(originalSitePoly);
    if (kinks.features.length > 0) {
        return { 
            geometry: { 
                ...emptyGeometry, 
                siteBoundary: originalSitePoly, 
                isValid: false,
                error: "El polígono se intersecta a sí mismo"
            }, 
            stats: emptyStats 
        };
    }

    const siteArea = turf.area(originalSitePoly);
    if (siteArea < 100) throw new Error("Area too small");
    const center = turf.center(originalSitePoly);
    let effectiveSitePoly: Feature<Polygon | MultiPolygon> = originalSitePoly;

    // Use principal axis for alignment
    const alignmentAngle = getPrincipalAxis(originalSitePoly);
    const workingSitePoly = turf.transformRotate(originalSitePoly, -alignmentAngle, { pivot: center }) as Feature<Polygon>;
    const workingEffectivePoly = turf.transformRotate(effectiveSitePoly, -alignmentAngle, { pivot: center }) as Feature<Polygon>;
    
    const workingConstraints = constraints.map(c => {
        const pt = point([c.position.lng, c.position.lat]);
        const rotatedPt = turf.transformRotate(pt, -alignmentAngle, { pivot: center });
        return { ...c, localPos: rotatedPt };
    });

    const centerLat = center.geometry.coordinates[1];
    const My = 1 / 111320; 
    const Mx = 1 / (111320 * Math.cos(centerLat * Math.PI / 180));

    const bbox = turf.bbox(workingEffectivePoly); 
    const blockDepthDeg = (config.lotDepth * 2) * My; 
    const lotsPerBlockRow = 8; // Reduce block length slightly to allow better fitting in irregular shapes
    const targetBlockWidthDeg = (config.lotWidth * lotsPerBlockRow) * Mx;
    const roadWidthDegX = config.roadWidth * Mx;
    const roadWidthDegY = config.roadWidth * My;
    const xStep = targetBlockWidthDeg + roadWidthDegX;
    const yStep = blockDepthDeg + roadWidthDegY;

    const gridInfo: { 
        poly: Feature<Polygon | MultiPolygon>, 
        type: string, 
        originalPoly: Feature<Polygon>, 
        col: number, 
        row: number,
        originalBbox: number[] 
    }[] = [];

    const intersections: number[][] = [];
    
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];
    const numCols = Math.ceil(width / xStep);
    const numRows = Math.ceil(height / yStep);
    
    // CENTER THE GRID to avoid massive gaps on one side
    const startX = bbox[0] + (width - (numCols * xStep)) / 2;
    const startY = bbox[1] + (height - (numRows * yStep)) / 2;
    
    const bufferCols = 2;
    const bufferRows = 2;

    let colCounter = 0;
    for (let i = -bufferCols; i < numCols + bufferCols; i++) { 
        const x = startX + (i * xStep);
        let rowCounter = 0;
        for (let j = -bufferRows; j < numRows + bufferRows; j++) {
            const y = startY + (j * yStep);
            // Create the block cell
            const cellPoly = turf.bboxPolygon([x, y, x + targetBlockWidthDeg, y + blockDepthDeg]);
            
            // Intersection points for road markings
            const intersectX = x + targetBlockWidthDeg + (roadWidthDegX / 2);
            const intersectY = y + blockDepthDeg + (roadWidthDegY / 2);
            intersections.push([intersectX, intersectY]);

            if (turf.booleanIntersects(cellPoly, workingEffectivePoly)) {
                try {
                    const intersection = turf.intersect(featureCollection([cellPoly, workingEffectivePoly]));
                    if (intersection) {
                        const area = turf.area(intersection);
                        // LOWER THRESHOLD to capture smaller irregular pieces at edges
                        // We will fix the "thinness" later via merging
                        if (area > 50) { 
                            gridInfo.push({ 
                                poly: intersection, 
                                type: 'unknown', 
                                originalPoly: cellPoly,
                                col: colCounter,
                                row: rowCounter,
                                originalBbox: [x, y, x + targetBlockWidthDeg, y + blockDepthDeg]
                            });
                        }
                    }
                } catch (err) { continue; }
            }
            rowCounter++;
        }
        colCounter++;
    }

    // Assign Park Types based on anchors
    gridInfo.forEach(block => {
        const isForcedPark = workingConstraints.some(c => {
            if (c.type === 'PARK_ANCHOR') {
                return turf.booleanPointInPolygon(c.localPos, block.poly);
            }
            return false;
        });
        if (isForcedPark) block.type = 'park';
    });

    const totalBlockArea = gridInfo.reduce((acc, item) => acc + turf.area(item.poly), 0);
    const targetParkArea = totalBlockArea * (config.parkPercentage / 100);
    let currentParkArea = gridInfo.filter(b => b.type === 'park').reduce((acc, item) => acc + turf.area(item.poly), 0);
    
    // Sort blocks by area (largest first preference for housing)
    gridInfo.sort((a, b) => turf.area(b.poly) - turf.area(a.poly));
    
    // Assign parks to remaining small/irregular blocks first to improve efficiency
    const potentialParks = [...gridInfo].filter(b => b.type === 'unknown');
    // We prefer making small irregular blocks parks, rather than sliver lots
    potentialParks.sort((a, b) => turf.area(a.poly) - turf.area(b.poly));
    
    potentialParks.forEach(block => {
        if (currentParkArea < targetParkArea) {
            block.type = 'park';
            currentParkArea += turf.area(block.poly);
        } else {
            block.type = 'residential';
        }
    });

    potentialParks.forEach(p => {
        const original = gridInfo.find(g => g.poly === p.poly);
        if (original) original.type = p.type;
    });

    const tempLots: Feature<Polygon | MultiPolygon>[] = [];
    const tempBuildings: Feature<Polygon | MultiPolygon>[] = [];
    const tempParks: Feature<Polygon | MultiPolygon>[] = [];
    const tempTrees: Feature<any>[] = [];
    const tempSuperblocks: Feature<Polygon | MultiPolygon>[] = [];
    const tempRoads: Feature<Polygon | MultiPolygon>[] = [];

    const fillParkWithTrees = (parkPoly: Feature<Polygon | MultiPolygon>, parkId: number) => {
        const parkArea = turf.area(parkPoly);
        const density = 40; 
        const targetTreeCount = Math.max(3, Math.floor(parkArea / density));
        const maxTrees = 500; 
        const actualTarget = Math.min(targetTreeCount, maxTrees);
        const parkBbox = turf.bbox(parkPoly);
        const placedTrees: any[] = []; 
        let searchPoly = parkPoly;
        try {
            const buffered = turf.buffer(parkPoly, -0.002, { units: 'kilometers' });
            if (buffered) searchPoly = buffered as Feature<Polygon | MultiPolygon>;
        } catch(e) {}
        let attempts = 0;
        const maxAttempts = actualTarget * 15;
        while (placedTrees.length < actualTarget && attempts < maxAttempts) {
            attempts++;
            const lng = parkBbox[0] + Math.random() * (parkBbox[2] - parkBbox[0]);
            const lat = parkBbox[1] + Math.random() * (parkBbox[3] - parkBbox[1]);
            const pt = point([lng, lat]);
            if (turf.booleanPointInPolygon(pt, searchPoly)) {
                const isTooClose = placedTrees.some(t => turf.distance(pt, t, { units: 'meters' }) < 4);
                if (!isTooClose) {
                    pt.properties = { type: 'park-tree', parkId };
                    placedTrees.push(pt);
                    tempTrees.push(pt); 
                }
            }
        }
    };

    const parkBlocks = gridInfo.filter(b => b.type === 'park');
    const residentialBlocks = gridInfo.filter(b => b.type !== 'park');

    residentialBlocks.forEach(block => {
        const finalBlock = block.poly as Feature<Polygon>;
        let processedBlock = turf.cleanCoords(finalBlock);
        let lotsGeneratedInBlock = 0;
        const gridMinY = block.originalBbox[1];
        const gridMaxY = block.originalBbox[3];
        const gridMidY = gridMinY + ((gridMaxY - gridMinY) / 2);
        const gridMinX = block.originalBbox[0];
        const gridMaxX = block.originalBbox[2];

        // Ensure we explicitly carve out the roads defined by grid spacing
        // This makes sure the "wide roads" are actual roads and not just voids
        const bottomRoadBox = turf.bboxPolygon([gridMinX, gridMinY - roadWidthDegY, gridMaxX, gridMinY]);
        try {
            // Check if there is land where the road should be
            const bottomRoadInt = turf.intersect(featureCollection([bottomRoadBox, workingEffectivePoly]));
            if (bottomRoadInt) {
                // If the block accidentally overlaps the road zone, cut it back
                 const diff = turf.difference(featureCollection([processedBlock, bottomRoadBox]));
                 if (diff) processedBlock = diff as Feature<Polygon>;
            }
        } catch(e) {}

        const topRoadBox = turf.bboxPolygon([gridMinX, gridMaxY, gridMaxX, gridMaxY + roadWidthDegY]);
        try {
            const topRoadInt = turf.intersect(featureCollection([topRoadBox, workingEffectivePoly]));
            if (topRoadInt) {
                 const diff = turf.difference(featureCollection([processedBlock, topRoadBox]));
                 if (diff) processedBlock = diff as Feature<Polygon>;
            }
        } catch(e) {}

        const targetLotArea = config.lotWidth * config.lotDepth;
        
        // --- IMPROVED LOT PROCESSING ---
        const processZone = (zonePoly: Feature<Polygon | MultiPolygon>, isBottom: boolean) => {
             if (!zonePoly) return;
             
             // Handle MultiPolygons by splitting them
             const zones = zonePoly.geometry.type === 'MultiPolygon' 
                ? (zonePoly.geometry.coordinates.map(coords => polygon(coords)) as Feature<Polygon>[])
                : [zonePoly as Feature<Polygon>];

             zones.forEach(zone => {
                 const area = turf.area(zone);
                 // If the remnant is too small for even one lot, discard or make green area
                 if (area < targetLotArea * 0.5) return;

                 // Calculate ideal number of lots based on width
                 const zoneBox = turf.bbox(zone);
                 const zoneWidthM = turf.distance(point([zoneBox[0], zoneBox[1]]), point([zoneBox[2], zoneBox[1]])) * 1000;
                 
                 // How many lots can we fit?
                 let numLots = Math.floor(zoneWidthM / config.lotWidth);
                 if (numLots < 1) numLots = 1;
                 
                 const sliceWidthDeg = (zoneBox[2] - zoneBox[0]) / numLots;
                 const candidateLots: Feature<Polygon>[] = [];

                 // Slicing Logic
                 for (let k = 0; k < numLots; k++) {
                     const sliceStart = zoneBox[0] + (k * sliceWidthDeg);
                     // Add a tiny buffer to end to ensure coverage
                     const sliceEnd = (k === numLots - 1) ? zoneBox[2] + 0.000001 : sliceStart + sliceWidthDeg;
                     
                     const slicePoly = turf.bboxPolygon([sliceStart, zoneBox[1], sliceEnd, zoneBox[3]]);
                     try {
                         const lotShape = turf.intersect(featureCollection([slicePoly, zone]));
                         if (lotShape) candidateLots.push(lotShape as Feature<Polygon>);
                     } catch(e) {}
                 }

                 if (candidateLots.length > 0) {
                     // --- SMART MERGE LOGIC (Fix for Thin Lots) ---
                     // Iteratively merge lots that are too small or too thin
                     let mergedLots = [...candidateLots];
                     let keepMerging = true;
                     const minViableArea = targetLotArea * 0.75; // Strict 75% area check
                     
                     while (keepMerging && mergedLots.length > 0) {
                         keepMerging = false;
                         // Find the "worst" lot (smallest area)
                         let worstIdx = -1;
                         let minScore = Infinity;

                         for(let i=0; i<mergedLots.length; i++) {
                             const a = turf.area(mergedLots[i]);
                             // Score is just area for now, could include width ratio
                             if (a < minViableArea && a < minScore) {
                                 minScore = a;
                                 worstIdx = i;
                             }
                         }

                         if (worstIdx !== -1) {
                             // Attempt merge with smallest neighbor
                             const mergeLeft = worstIdx > 0;
                             const mergeRight = worstIdx < mergedLots.length - 1;
                             let targetIdx = -1;

                             if (mergeLeft && !mergeRight) targetIdx = worstIdx - 1;
                             else if (mergeRight && !mergeLeft) targetIdx = worstIdx + 1;
                             else if (mergeLeft && mergeRight) {
                                 const areaLeft = turf.area(mergedLots[worstIdx-1]);
                                 const areaRight = turf.area(mergedLots[worstIdx+1]);
                                 targetIdx = (areaLeft < areaRight) ? worstIdx - 1 : worstIdx + 1;
                             }

                             if (targetIdx !== -1) {
                                 const idxA = Math.min(worstIdx, targetIdx);
                                 const idxB = Math.max(worstIdx, targetIdx);
                                 try {
                                     const union = turf.union(featureCollection([mergedLots[idxA], mergedLots[idxB]]));
                                     if (union) {
                                         // Replace the two lots with the union
                                         mergedLots.splice(idxA, 2, union as Feature<Polygon>);
                                         keepMerging = true; // Changes happened, re-evaluate
                                     }
                                 } catch(e) { /* Ignore merge error */ }
                             } else {
                                 // Isolated small lot (cannot merge)
                                 // If it's REALLY small, delete it to create side-yard/green space instead of bad lot
                                 if (turf.area(mergedLots[worstIdx]) < targetLotArea * 0.4) {
                                     mergedLots.splice(worstIdx, 1);
                                     keepMerging = true;
                                 } else {
                                     // It's small but acceptable as a weird corner lot
                                     // Stop considering it for this pass to avoid infinite loop
                                     // In a real robust algo we would flag it.
                                 }
                             }
                         }
                     }

                     // Final generation of assets for surviving lots
                     mergedLots.forEach(lotShape => {
                        // Double check area one last time
                        if (turf.area(lotShape) < 20) return; // Discard trash geometry

                        lotShape.properties = { ...lotShape.properties, lotId: globalLotIndex, isBottomRow: isBottom, alignmentAngle: alignmentAngle };
                        tempLots.push(lotShape);
                        lotsGeneratedInBlock++;

                        // Building placement logic
                        const lotBbox = turf.bbox(lotShape);
                        const lotH = lotBbox[3] - lotBbox[1];
                        const sideSetback = 0.6 * Mx; 
                        const rearSetback = 1.0 * My; 
                        const depthFactor = 0.50 + (Math.random() * 0.1); 
                        const buildingDepthDeg = lotH * depthFactor; 
                        let bMinX = lotBbox[0] + sideSetback, bMaxX = lotBbox[2] - sideSetback, bMinY, bMaxY;
                        
                        if (isBottom) { bMaxY = lotBbox[3] - rearSetback; bMinY = bMaxY - buildingDepthDeg; } 
                        else { bMinY = lotBbox[1] + rearSetback; bMaxY = bMinY + buildingDepthDeg; }
                        
                        if (bMinX < bMaxX - (1*Mx) && bMinY < bMaxY - (1*My)) {
                            const buildingPoly = turf.bboxPolygon([bMinX, bMinY, bMaxX, bMaxY]);
                            try {
                                const clipped = turf.intersect(featureCollection([buildingPoly, lotShape]));
                                if (clipped) {
                                    clipped.properties = { heightFactor: (Math.random() * 0.2) + 0.9, colorVariant: Math.floor(Math.random() * 3), lotId: globalLotIndex };
                                    tempBuildings.push(clipped);
                                }
                            } catch(e) {}
                        }

                        // Tree placement
                        const treeSetbackDeg = 2.5 * My; 
                        const sideMarginDeg = 1.0 * Mx; 
                        const isLeft = Math.random() > 0.5;
                        let treeX = isLeft ? lotBbox[0] + sideMarginDeg : lotBbox[2] - sideMarginDeg;
                        let treeY = isBottom ? lotBbox[1] + treeSetbackDeg : lotBbox[3] - treeSetbackDeg;
                        treeX = Math.max(lotBbox[0], Math.min(lotBbox[2], treeX));
                        treeY = Math.max(lotBbox[1], Math.min(lotBbox[3], treeY));
                        const idealTreePt = point([treeX, treeY]);
                        
                        if (turf.booleanPointInPolygon(idealTreePt, lotShape)) {
                            idealTreePt.properties = { ...idealTreePt.properties, lotId: globalLotIndex };
                            tempTrees.push(idealTreePt);
                        }
                        globalLotIndex++;
                     });
                 }
             });
        };

        const bottomBand = turf.bboxPolygon([gridMinX, gridMinY, gridMaxX, gridMidY]);
        const topBand = turf.bboxPolygon([gridMinX, gridMidY, gridMaxX, gridMaxY]);
        try {
            const bottomZone = turf.intersect(featureCollection([processedBlock, bottomBand]));
            const topZone = turf.intersect(featureCollection([processedBlock, topBand]));
            if (bottomZone) processZone(bottomZone, true);
            if (topZone) processZone(topZone, false);

            if (lotsGeneratedInBlock > 0) {
                 tempSuperblocks.push(processedBlock);
            } else if (processedBlock) {
                 // Convert failed residential block to park if it's substantial
                 if (turf.area(processedBlock) > 50) {
                    const parkIndex = tempParks.length;
                    processedBlock.properties = { ...processedBlock.properties, parkId: parkIndex };
                    tempParks.push(processedBlock);
                    tempSuperblocks.push(processedBlock);
                    fillParkWithTrees(processedBlock, parkIndex); 
                 }
            }
        } catch(e) { tempSuperblocks.push(finalBlock); }
    });

    // Park Merging Logic (Keep existing logic but ensure it runs robustly)
    if (parkBlocks.length > 0) {
        const parkMap = new Map<string, typeof gridInfo[0]>();
        parkBlocks.forEach(p => parkMap.set(`${p.col},${p.row}`, p));
        const featuresToMerge: Feature<Polygon | MultiPolygon>[] = [];
        parkBlocks.forEach(p => featuresToMerge.push(p.poly));
        const epsilon = 0.000001; 
        parkBlocks.forEach(p => {
            const right = parkMap.get(`${p.col + 1},${p.row}`);
            if (right) {
                const gapPoly = turf.bboxPolygon([p.originalBbox[2] - epsilon, Math.max(p.originalBbox[1], right.originalBbox[1]), right.originalBbox[0] + epsilon, Math.min(p.originalBbox[3], right.originalBbox[3])]);
                try {
                    const clippedGap = turf.intersect(featureCollection([gapPoly, workingEffectivePoly]));
                    if (clippedGap) featuresToMerge.push(clippedGap);
                } catch(e) {}
            }
            const top = parkMap.get(`${p.col},${p.row + 1}`);
            if (top) {
                 const gapPoly = turf.bboxPolygon([Math.max(p.originalBbox[0], top.originalBbox[0]), p.originalBbox[3] - epsilon, Math.min(p.originalBbox[2], top.originalBbox[2]), top.originalBbox[1] + epsilon]);
                try {
                    const clippedGap = turf.intersect(featureCollection([gapPoly, workingEffectivePoly]));
                    if (clippedGap) featuresToMerge.push(clippedGap);
                } catch(e) {}
            }
        });
        try {
            const mergedParks = turf.dissolve(featureCollection(featuresToMerge) as any);
            mergedParks.features.forEach(feature => {
                const poly = feature as Feature<Polygon | MultiPolygon>;
                turf.rewind(poly, { mutate: true });
                const parkIndex = tempParks.length;
                poly.properties = { ...poly.properties, parkId: parkIndex };
                tempParks.push(poly);
                tempSuperblocks.push(poly); 
                fillParkWithTrees(poly, parkIndex);
            });
        } catch (err) {
            parkBlocks.forEach(b => {
                const parkIndex = tempParks.length;
                b.poly.properties = { ...b.poly.properties, parkId: parkIndex };
                tempParks.push(b.poly);
                tempSuperblocks.push(b.poly);
                fillParkWithTrees(b.poly as Feature<Polygon>, parkIndex);
            });
        }
    }

    const tempMarkings: Feature<MultiPolygon>[] = [];
    const tempStopSigns: Feature<any>[] = [];
    const parkBoundaries = tempParks.map(p => safePolygonToLine(p as Feature<Polygon>)).filter(l => l !== null) as Feature<LineString>[];

    intersections.forEach(([ix, iy]) => {
        const intersectionPt = point([ix, iy]);
        if (turf.booleanPointInPolygon(intersectionPt, workingSitePoly)) {
            if (tempParks.some(p => turf.booleanPointInPolygon(intersectionPt, p))) return;
            let isNearPark = false;
            for (const parkLine of parkBoundaries) {
                const distMeters = turf.distance(intersectionPt, turf.nearestPointOnLine(parkLine, intersectionPt), {units: 'meters'});
                if (distMeters < config.roadWidth * 2) { isNearPark = true; break; }
            }
            if (isNearPark) {
                const generateZebraStripes = (cx: number, cy: number, isVertical: boolean): Feature<MultiPolygon> | null => {
                    const stripes: number[][][][] = [];
                    const roadW = config.roadWidth;
                    const pathW = 4.0, stripeW_M = 0.6;
                    const stripeW_DegX = stripeW_M * Mx, stripeW_DegY = stripeW_M * My;
                    const pathW_DegX = pathW * Mx, pathW_DegY = pathW * My;
                    const roadW_DegX = roadW * Mx, roadW_DegY = roadW * My;
                    const gapW_M = 0.6;
                    const gap_DegX = gapW_M * Mx, gap_DegY = gapW_M * My;
                    const intersectsPark = (boxCoords: number[][]) => tempParks.some(park => turf.booleanIntersects(polygon([boxCoords]), park));

                    if (isVertical) {
                         const totalHeight = roadW_DegY * 0.8;
                         const startY = cy - (totalHeight / 2);
                         const stripeH = stripeW_DegY, gapH = gap_DegY, stripeLen = pathW_DegX;
                         let currY = startY;
                         while (currY < startY + totalHeight) {
                             const box = [[cx - stripeLen/2, currY], [cx + stripeLen/2, currY], [cx + stripeLen/2, currY + stripeH], [cx - stripeLen/2, currY + stripeH], [cx - stripeLen/2, currY]];
                             if (!intersectsPark(box)) stripes.push([box]);
                             currY += (stripeH + gapH);
                         }
                    } else {
                         const totalWidth = roadW_DegX * 0.8; 
                         const startX = cx - (totalWidth / 2);
                         const stripeW = stripeW_DegX, gapW = gap_DegX, stripeLen = pathW_DegY;
                         let currX = startX;
                         while (currX < startX + totalWidth) {
                             const box = [[currX, cy - stripeLen/2], [currX + stripeW, cy - stripeLen/2], [currX + stripeW, cy + stripeLen/2], [currX, cy + stripeLen/2], [currX, cy - stripeLen/2]];
                             if (!intersectsPark(box)) stripes.push([box]);
                             currX += (stripeW + gapW);
                         }
                    }
                    return stripes.length > 0 ? multiPolygon(stripes) : null;
                };
                const offsets = [{ x: 0, y: roadWidthDegY * 0.65, vert: false }, { x: 0, y: -roadWidthDegY * 0.65, vert: false }, { x: roadWidthDegX * 0.65, y: 0, vert: true }, { x: -roadWidthDegX * 0.65, y: 0, vert: true }];
                offsets.forEach(off => {
                    const zebra = generateZebraStripes(ix + off.x, iy + off.y, off.vert);
                    if (zebra && turf.booleanPointInPolygon(point([ix + off.x, iy + off.y]), workingSitePoly)) tempMarkings.push(zebra);
                });
            }
        }
    });

    const rotateBack = (features: any[]) => features.map(f => turf.transformRotate(f, alignmentAngle, { pivot: center }));
    const finalSuperblocks = rotateBack(tempSuperblocks);
    const finalLots = rotateBack(tempLots);
    const finalBuildings = rotateBack(tempBuildings);
    const finalParks = rotateBack(tempParks);
    const finalTrees = rotateBack(tempTrees);
    const finalMarkings = rotateBack(tempMarkings);
    const finalStopSigns = rotateBack(tempStopSigns);
    const finalRoads = rotateBack(tempRoads); 

    let accessControlData: AccessControl | null = null;
    let perimeterWalls: Feature<any>[] = [];
    const uniqueCandidates: { midpoint: any, roadBearing: number }[] = [];
    
    const boundaryResult = turf.polygonToLine(originalSitePoly);
    const boundaryLine = (boundaryResult.type === 'FeatureCollection' ? boundaryResult.features[0] : boundaryResult) as Feature<LineString>;

    if (finalSuperblocks.length > 0) {
        const roadProjectionLines: any[] = [];
        for (let i = -bufferCols; i <= numCols + bufferCols; i++) {
             const x = startX + (i * xStep);
             const roadCenterX = x + targetBlockWidthDeg + (roadWidthDegX / 2);
             const lineLocal = lineString([[roadCenterX, bbox[1] - 0.05], [roadCenterX, bbox[3] + 0.05]]);
             const rotatedLine = turf.transformRotate(lineLocal, alignmentAngle, { pivot: center });
             roadProjectionLines.push({ line: rotatedLine, bearing: alignmentAngle }); 
        }
        for (let j = -bufferRows; j <= numRows + bufferRows; j++) {
            const y = startY + (j * yStep);
            const roadCenterY = y + blockDepthDeg + (roadWidthDegY / 2);
            const lineLocal = lineString([[bbox[0] - 0.05, roadCenterY], [bbox[2] + 0.05, roadCenterY]]);
            const rotatedLine = turf.transformRotate(lineLocal, alignmentAngle, { pivot: center });
            roadProjectionLines.push({ line: rotatedLine, bearing: alignmentAngle + 90 }); 
        }
        roadProjectionLines.forEach(item => {
             const intersects = turf.lineIntersect(item.line, boundaryLine);
             if (intersects.features.length > 0) {
                 intersects.features.forEach(pt => {
                     const bearing = item.bearing;
                     const p1 = turf.destination(pt, 0.002, bearing, { units: 'kilometers' });
                     const p2 = turf.destination(pt, 0.002, bearing + 180, { units: 'kilometers' });
                     let insidePoint = null;
                     if (turf.booleanPointInPolygon(p1, originalSitePoly)) insidePoint = p1;
                     else if (turf.booleanPointInPolygon(p2, originalSitePoly)) insidePoint = p2;
                     if (insidePoint) {
                        const isBlockedBySuperblock = finalSuperblocks.some(block => turf.booleanPointInPolygon(insidePoint!, block));
                        const isBlockedByPark = finalParks.some(park => turf.booleanPointInPolygon(insidePoint!, park));
                        if (!isBlockedBySuperblock && !isBlockedByPark) uniqueCandidates.push({ midpoint: pt, roadBearing: item.bearing });
                     }
                 });
             }
        });

        const uniqueFiltered: any[] = [];
        uniqueCandidates.forEach(cand => {
            const isDuplicate = uniqueFiltered.some(u => turf.distance(cand.midpoint, u.midpoint, {units: 'meters'}) < 15);
            if (!isDuplicate) uniqueFiltered.push(cand);
        });
        uniqueFiltered.sort((a, b) => {
             const angleA = turf.bearing(center, a.midpoint);
             const angleB = turf.bearing(center, b.midpoint);
             return angleA - angleB;
        });

        if (uniqueFiltered.length > 0) {
            const safeIndex = config.entryIndex % uniqueFiltered.length;
            const selected = uniqueFiltered[safeIndex];
            const pt = selected.midpoint;
            const rotation = selected.roadBearing; 
            const toDeg = (m: number) => m / 111320; 
            const islandWidth = toDeg(2.2);
            const islandLength = toDeg(8);
            const houseWidth = toDeg(1.5);
            const houseLength = toDeg(3);

            let island = turf.transformRotate(turf.bboxPolygon([pt.geometry.coordinates[0] - islandWidth/2, pt.geometry.coordinates[1] - islandLength/2, pt.geometry.coordinates[0] + islandWidth/2, pt.geometry.coordinates[1] + islandLength/2]), rotation, { pivot: pt });
            let guardHouse = turf.transformRotate(turf.bboxPolygon([pt.geometry.coordinates[0] - houseWidth/2, pt.geometry.coordinates[1] - houseLength/4, pt.geometry.coordinates[0] + houseWidth/2, pt.geometry.coordinates[1] + houseLength/4]), rotation, { pivot: pt });

            const centerPt = pt;
            const leftStart = turf.destination(centerPt, islandWidth/2000, rotation - 90, {units: 'kilometers'}); 
            const leftEnd = turf.destination(centerPt, (config.roadWidth/2)/1000, rotation - 90, {units: 'kilometers'}); 
            const leftBarrier = lineString([leftStart.geometry.coordinates, leftEnd.geometry.coordinates]);
            const rightStart = turf.destination(centerPt, islandWidth/2000, rotation + 90, {units: 'kilometers'}); 
            const rightEnd = turf.destination(centerPt, (config.roadWidth/2)/1000, rotation + 90, {units: 'kilometers'}); 
            const rightBarrier = lineString([rightStart.geometry.coordinates, rightEnd.geometry.coordinates]);

             accessControlData = { 
                type: 'GATE',
                island: island as Feature<Polygon>, 
                guardHouse: guardHouse as Feature<Polygon>, 
                barriers: [leftBarrier, rightBarrier], 
                entryPoint: { lat: pt.geometry.coordinates[1], lng: pt.geometry.coordinates[0] }, 
                rotation: rotation 
            };
        }
        uniqueCandidates.length = 0; 
        uniqueFiltered.forEach(c => uniqueCandidates.push(c));
    }

    if (accessControlData) {
        const entryPoint = point([accessControlData.entryPoint.lng, accessControlData.entryPoint.lat]);
        const cutoutRadius = (config.roadWidth / 1000) * 0.6; 
        const cutoutMask = turf.circle(entryPoint, cutoutRadius, { units: 'kilometers', steps: 16 }); 
        const maskPoly = cutoutMask;
        const maskLine = turf.polygonToLine(maskPoly) as Feature<LineString>; 
        const split = turf.lineSplit(boundaryLine, maskLine);
        if (split && split.features.length > 0) {
            split.features.forEach(seg => {
                const len = turf.length(seg);
                if (len > 0) {
                    const mid = turf.along(seg, len / 2);
                    if (!turf.booleanPointInPolygon(mid, maskPoly)) perimeterWalls.push(seg);
                }
            });
        } else { perimeterWalls.push(boundaryLine); }
    } else { perimeterWalls.push(boundaryLine); }

    const netSellableArea = finalLots.reduce((sum, l) => sum + turf.area(l), 0);
    const parkArea = finalParks.reduce((sum, p) => sum + turf.area(p), 0);
    const roadArea = siteArea - netSellableArea - parkArea;

    return {
      geometry: { siteBoundary: originalSitePoly, superblocks: finalSuperblocks, roads: [...finalRoads], lots: finalLots, buildings: finalBuildings, parks: finalParks, trees: finalTrees, perimeterWalls: perimeterWalls, accessControl: accessControlData, roadMarkings: finalMarkings as any, stopSigns: finalStopSigns, entranceCandidates: uniqueCandidates.map(c => ({ lat: c.midpoint.geometry.coordinates[1], lng: c.midpoint.geometry.coordinates[0] })), isValid: true },
      stats: { siteArea, netSellableArea, roadArea, parkArea, totalLots: finalLots.length, efficiency: netSellableArea / siteArea, possibleEntrances: uniqueCandidates.length },
    };
  } catch (e) {
    return { geometry: { ...emptyGeometry, error: "Calculation Failed" }, stats: emptyStats };
  }
};

export const geoToCartesian = (lon: number, lat: number, centerLon: number, centerLat: number) => {
  const R = 6371000; 
  const latRad = centerLat * Math.PI / 180;
  const x = (lon - centerLon) * (Math.PI / 180) * R * Math.cos(latRad);
  const y = (lat - centerLat) * (Math.PI / 180) * R;
  return [x, y]; 
};