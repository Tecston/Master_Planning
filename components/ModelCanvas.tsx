
import React, { useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, ContactShadows, Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import { GeneratedGeometry, SiteConfig, LatLng } from '../types';
import { geoToCartesian } from '../services/generator';

// Monkey-patch to fix missing React Three Fiber intrinsic elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        [elemName: string]: any;
      }
    }
  }
}

interface ModelCanvasProps {
  geometry: GeneratedGeometry;
  config: SiteConfig;
  points: LatLng[];
  buildingColor: string;
  mapStyle: 'light' | 'dark' | 'satellite';
}

// LEVEL DEFINITIONS
const LEVELS = {
    GROUND: -0.5,     // Grid
    ROAD: 0,          // Base asphalt
    MARKING: 0.05,    
    SIDEWALK: 0.25,   
    LOT: 0.26,        
    BUILDING_BASE: 0.26
};

// Shared Materials
const BASE_MATERIAL = new THREE.MeshStandardMaterial({ 
    color: '#94a3b8', 
    roughness: 0.9 
});

const WHITE_WALL_MATERIAL = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.5
});

// Helper to create Three Shape from GeoJSON
const useShape = (feature: any, center: LatLng) => {
    return useMemo(() => {
        if (!feature || !feature.geometry || !feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) return null;
        const coordinates = feature.geometry.coordinates;
        const type = feature.geometry.type;
        
        const createShapeFromRing = (ring: number[][]) => {
          if (!ring || ring.length === 0) return null;
          const s = new THREE.Shape();
          ring.forEach((coord, i) => {
            if (!coord || coord.length < 2) return;
            const [x, y] = geoToCartesian(coord[0], coord[1], center.lng, center.lat);
            if (i === 0) s.moveTo(x, y); 
            else s.lineTo(x, y);
          });
          return s;
        };
    
        if (type === 'Polygon') {
            if (!coordinates[0]) return null;
            return createShapeFromRing(coordinates[0]);
        }
        if (type === 'MultiPolygon') {
            const shapes: THREE.Shape[] = [];
            coordinates.forEach((poly: any) => {
                if (poly && poly[0]) {
                    const s = createShapeFromRing(poly[0]);
                    if (s) shapes.push(s);
                }
            });
            return shapes;
        }
        if (type === 'LineString') return createShapeFromRing(coordinates); 
        return null;
      }, [feature, center]);
}

/**
 * Optimized House Component
 */
const DetailedHouse = React.memo(({ feature, height, center, color }: { feature: any; height: number; center: LatLng; color: string }) => {
  const shape = useShape(feature, center);
  const heightFactor = feature?.properties?.heightFactor || 1;
  const finalHeight = height * heightFactor;

  const bodySettings = useMemo(() => ({ 
      steps: 1, 
      depth: finalHeight - 1.2, 
      bevelEnabled: false 
  }), [finalHeight]);

  const roofSettings = useMemo(() => ({ 
      steps: 1, 
      depth: 0.2, 
      bevelEnabled: true, 
      bevelThickness: 1.2, 
      bevelSize: 0.8,
      bevelSegments: 1 
  }), []);

  const roofMaterial = useMemo(() => {
      return new THREE.MeshStandardMaterial({
          color: color, 
          roughness: 0.6
      });
  }, [color]);

  if (!shape) return null;

  return (
    <group position={[0, LEVELS.BUILDING_BASE, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <extrudeGeometry args={[shape, { depth: 0.2, bevelEnabled: false }]} />
            <primitive object={BASE_MATERIAL} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} castShadow receiveShadow>
            <extrudeGeometry args={[shape, bodySettings]} />
            <primitive object={WHITE_WALL_MATERIAL} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2 + (finalHeight - 1.2), 0]} castShadow>
            <extrudeGeometry args={[shape, roofSettings]} />
            <primitive object={roofMaterial} />
        </mesh>
    </group>
  );
});

const FlatFeature: React.FC<{ feature: any; center: LatLng; color: string; yLevel: number; depth?: number; opacity?: number }> = React.memo(({ feature, center, color, yLevel, depth = 0, opacity = 1 }) => {
    const shape = useShape(feature, center);
    if (!shape) return null;
    
    if (depth > 0) {
        const extrudeSettings = useMemo(() => ({ steps: 1, depth: depth, bevelEnabled: false }), [depth]);
        return (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yLevel, 0]} receiveShadow>
                <extrudeGeometry args={[shape, extrudeSettings]} />
                <meshStandardMaterial color={color} roughness={0.9} transparent opacity={opacity} />
            </mesh>
        );
    }

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yLevel, 0]} receiveShadow>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial color={color} roughness={0.9} transparent opacity={opacity} />
        </mesh>
    )
});

const ExtrudedFeature: React.FC<{ feature: any; height: number; center: LatLng; color: string; lift?: number }> = React.memo(({ feature, height, center, color, lift = 0 }) => {
    const shape = useShape(feature, center);
    if (!shape) return null;
    const extrudeSettings = useMemo(() => ({ steps: 1, depth: height, bevelEnabled: false }), [height]);
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, LEVELS.BUILDING_BASE + lift, 0]} receiveShadow castShadow>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    );
});

const BarrierFeature: React.FC<{ feature: any; center: LatLng }> = React.memo(({ feature, center }) => {
    if (!feature?.geometry?.coordinates) return null;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    if (!coords[0] || !coords[1]) return null;
    
    const [x1, y1] = geoToCartesian(coords[0][0], coords[0][1], center.lng, center.lat);
    const [x2, y2] = geoToCartesian(coords[1][0], coords[1][1], center.lng, center.lat);

    const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    return (
        <mesh position={[midX, 1.0, -midY]} rotation={[0, angle, 0]} castShadow>
             <boxGeometry args={[dist, 0.1, 0.1]} />
             <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
    );
});

const WallFeature: React.FC<{ feature: any; center: LatLng }> = React.memo(({ feature, center }) => {
    if (!feature?.geometry?.coordinates) return null;
    const coords = feature.geometry.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length < 2) return null;

    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const c1 = coords[i];
        const c2 = coords[i+1];
        if (!c1 || !c2) continue;

        const [x1, y1] = geoToCartesian(c1[0], c1[1], center.lng, center.lat);
        const [x2, y2] = geoToCartesian(c2[0], c2[1], center.lng, center.lat);
        
        const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        segments.push(
            <mesh key={`w-${i}`} position={[midX, 1.5, -midY]} rotation={[0, angle, 0]} castShadow receiveShadow>
                <boxGeometry args={[dist, 3.0, 0.2]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
            </mesh>
        );
        segments.push(
            <mesh key={`p-${i}`} position={[x2, 1.6, -y2]} castShadow receiveShadow>
                <boxGeometry args={[0.4, 3.2, 0.4]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
            </mesh>
        )
    }
    return <group>{segments}</group>;
});

const StopSignFeature: React.FC<{ feature: any; center: LatLng }> = React.memo(({ feature, center }) => {
    if (!feature?.geometry?.coordinates || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2) return null;
    if (feature.geometry.coordinates[0] === undefined) return null;
    const [x, y] = geoToCartesian(feature.geometry.coordinates[0], feature.geometry.coordinates[1], center.lng, center.lat);
    return (
        <group position={[x, 0, -y]}>
            <mesh position={[0, 1.25, 0]} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 2.5]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.5} />
            </mesh>
            <mesh position={[0, 2.2, 0.04]} rotation={[0, 0, Math.PI / 8]}>
                <cylinderGeometry args={[0.3, 0.3, 0.02, 8]} />
                <meshStandardMaterial color="#dc2626" />
            </mesh>
        </group>
    )
});

const RoadMarkingFeature: React.FC<{ feature: any; center: LatLng }> = React.memo(({ feature, center }) => {
    return (
        <FlatFeature 
            feature={feature} 
            center={center} 
            color="#ffffff" 
            yLevel={LEVELS.MARKING} 
            opacity={1.0}
        />
    )
});


const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 5);
trunkGeo.translate(0, 0.4, 0); 
const foliageGeo = new THREE.ConeGeometry(0.8, 2.0, 5);
foliageGeo.translate(0, 0.8 + 1.0, 0); 

export const ModelCanvas: React.FC<ModelCanvasProps> = ({ geometry, config, points, buildingColor, mapStyle }) => {
  const center = useMemo(() => {
    if (points.length === 0) return { lat: 0, lng: 0 };
    const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    return { lat, lng };
  }, [points]);

  const baseHouseHeight = config.stories * 3;
  
  const treeInstancesData = useMemo(() => {
      if (!geometry.trees) return [];
      return geometry.trees.map(t => {
          if (!t || !t.geometry || !t.geometry.coordinates || !Array.isArray(t.geometry.coordinates)) return null;
          const [x, y_map] = geoToCartesian(t.geometry.coordinates[0], t.geometry.coordinates[1], center.lng, center.lat);
          return {
              position: [x, LEVELS.LOT, -y_map] as [number, number, number],
              rotation: [0, Math.random() * Math.PI, 0] as [number, number, number],
              scale: 0.8 + Math.random() * 0.4,
          };
      }).filter(Boolean) as any[];
  }, [geometry.trees, center]);

  return (
    <Canvas 
        shadows 
        camera={{ position: [50, 80, 50], fov: 45 }} 
        dpr={[1, 2]}
        className="outline-none focus:outline-none"
    >
      <color attach="background" args={['#f8fafc']} />
      
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={10} maxDistance={800} enableDamping={false} />
      
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[100, 200, 100]} 
        intensity={1.2} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0005}
      >
         <orthographicCamera attach="shadow-camera" args={[-1000, 1000, 1000, -1000, 1, 1000]} />
      </directionalLight>

      <Environment preset="city" />

      {/* NO MAP TILES / UNDERLAY - Only Project Geometry */}

      <group>
        {/* 1. Base Asphalt (The Site) - Opaque dark base */}
        {geometry.siteBoundary && (
             <FlatFeature 
                feature={geometry.siteBoundary} 
                center={center} 
                color="#1e293b" 
                yLevel={LEVELS.ROAD} 
            />
        )}

        {/* 2. Superblocks */}
        {geometry.superblocks?.map((block, i) => (
            <FlatFeature 
                key={`block-${i}`} 
                feature={block} 
                center={center} 
                color="#cbd5e1" 
                yLevel={LEVELS.ROAD} 
                depth={LEVELS.SIDEWALK - LEVELS.ROAD} 
            />
        ))}

        {/* 3. Lots */}
        {geometry.lots.map((lot, i) => (
            <FlatFeature key={`lot-${i}`} feature={lot} center={center} color="#e2e8f0" yLevel={LEVELS.LOT} />
        ))}
        
        {/* 4. Buildings */}
        {geometry.buildings.map((b, i) => (
            <DetailedHouse 
                key={`bldg-${i}`} 
                feature={b} 
                height={baseHouseHeight} 
                center={center} 
                color={buildingColor} 
            />
        ))}

        {/* Parks */}
        {geometry.parks.map((park, i) => (
            <FlatFeature key={`park-${i}`} feature={park} center={center} color="#86efac" yLevel={LEVELS.LOT} />
        ))}
        
        {/* Walls & Infrastructure */}
        {geometry.perimeterWalls?.map((wall, i) => (
            <WallFeature key={`wall-${i}`} feature={wall} center={center} />
        ))}

        {geometry.roadMarkings?.map((mark, i) => (
            <RoadMarkingFeature key={`mark-${i}`} feature={mark} center={center} />
        ))}

        {geometry.stopSigns?.map((sign, i) => (
            <StopSignFeature key={`stop-${i}`} feature={sign} center={center} />
        ))}

        {/* ACCESS CONTROL */}
        {geometry.accessControl && (
            <>
                {geometry.accessControl.type === 'GATE' && (
                    <>
                        <ExtrudedFeature 
                            feature={geometry.accessControl.island} 
                            height={0.15} 
                            center={center}
                            color="#94a3b8" 
                            lift={LEVELS.ROAD - LEVELS.BUILDING_BASE} 
                        />
                        {geometry.accessControl.guardHouse && (
                             <ExtrudedFeature 
                                feature={geometry.accessControl.guardHouse} 
                                height={3.0} 
                                center={center}
                                color="#334155" 
                                lift={0.15} 
                            />
                        )}
                        {geometry.accessControl.barriers?.map((bar, i) => (
                            <BarrierFeature key={`barrier-${i}`} feature={bar} center={center} />
                        ))}
                    </>
                )}
                
                {geometry.accessControl.type === 'ROUNDABOUT' && (
                    <>
                         {geometry.accessControl.roundaboutExt && (
                            <FlatFeature 
                                feature={geometry.accessControl.roundaboutExt} 
                                center={center} 
                                color="#1e293b" 
                                yLevel={LEVELS.ROAD + 0.02} 
                            />
                        )}
                        <ExtrudedFeature 
                            feature={geometry.accessControl.island} 
                            height={0.3} 
                            center={center}
                            color="#86efac" 
                            lift={LEVELS.ROAD - LEVELS.BUILDING_BASE} 
                        />
                    </>
                )}
            </>
        )}

        {/* TREES (Instanced) */}
        {treeInstancesData.length > 0 && (
            <group>
                <Instances range={treeInstancesData.length} geometry={trunkGeo} castShadow receiveShadow>
                    <meshStandardMaterial color="#5d4037" roughness={0.9} />
                    {treeInstancesData.map((data, i) => (
                        <Instance key={`trunk-${i}`} position={data.position} rotation={data.rotation as any} scale={data.scale} />
                    ))}
                </Instances>

                <Instances range={treeInstancesData.length} geometry={foliageGeo} castShadow receiveShadow>
                    <meshStandardMaterial color="#15803d" roughness={0.7} />
                    {treeInstancesData.map((data, i) => (
                        <Instance key={`foliage-${i}`} position={data.position} rotation={data.rotation as any} scale={data.scale} />
                    ))}
                </Instances>
            </group>
        )}

      </group>

      <ContactShadows opacity={0.5} scale={1000} blur={2} far={10} resolution={1024} color="#1e293b" position={[0, LEVELS.GROUND, 0]} />
    </Canvas>
  );
};
