import type { Feature, Polygon, MultiPolygon, Point, LineString, MultiLineString } from 'geojson';

export interface SiteConfig {
  roadWidth: number; // meters (vialidades)
  lotWidth: number; // meters (frente de lote)
  lotDepth: number; // meters (fondo de lote)
  parkPercentage: number; // Target % for donation/green areas
  stories: number; // For the houses on lots
  entryIndex: number; // Selected index for access point location
}

export interface ProjectStats {
  siteArea: number;
  netSellableArea: number; // Area de lotes vendibles
  roadArea: number;
  parkArea: number;
  totalLots: number;
  efficiency: number; // Net Sellable / Site Area
  possibleEntrances: number; // Count of detected valid entrance points
}

export interface AccessControl {
  type: 'GATE' | 'ROUNDABOUT';
  island: Feature<Polygon>; // Concrete median or Roundabout center
  guardHouse?: Feature<Polygon>; // The building (Gate only)
  barriers?: Feature<LineString>[]; // Boom gates (Gate only)
  roundaboutExt?: Feature<Polygon>; // Asphalt ring (Roundabout only)
  entryPoint: LatLng;
  rotation: number; // Bearing in degrees
}

export type ConstraintType = 'PARK_ANCHOR';

export interface UserConstraint {
  id: string;
  type: ConstraintType;
  position: LatLng;
}

export interface GeneratedGeometry {
  siteBoundary: Feature<Polygon | MultiPolygon> | null;
  superblocks: (Feature<Polygon | MultiPolygon> | null)[]; // The concrete base (sidewalk + lots)
  roads: Feature<Polygon | MultiPolygon>[]; // Implicit site roads + Custom User Roads
  lots: (Feature<Polygon | MultiPolygon> | null)[];
  buildings: Feature<Polygon | MultiPolygon>[]; 
  parks: (Feature<Polygon | MultiPolygon> | null)[];
  trees: Feature<Point>[];
  perimeterWalls: Feature<LineString | MultiLineString>[];
  accessControl: AccessControl | null;
  roadMarkings: Feature<Polygon>[]; // Zebra crossings
  stopSigns: Feature<Point>[]; // Stop sign locations
  entranceCandidates: LatLng[]; // List of valid locations for the entrance
  isValid: boolean;
  error?: string;
}

export interface SavedProject {
  id: string;
  name: string;
  createdAt: number;
  data: {
    sitePoints: LatLng[];
    constraints: UserConstraint[];
    config: SiteConfig;
    customRoads: {p1: LatLng, p2: LatLng}[];
    overrides: Record<string, Feature<Polygon | MultiPolygon> | null>;
    buildingColor: string;
  }
}

export type ViewMode = '2D' | '3D' | 'STATS';
// Added DRAW_ROAD
export type ToolMode = 'SELECT' | 'DRAW_SITE' | 'PLACE_PARK' | 'EDIT_GEOMETRY' | 'DRAW_ROAD';

export interface LatLng {
  lat: number;
  lng: number;
}