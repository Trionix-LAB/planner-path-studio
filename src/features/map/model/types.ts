export type Tool = "select" | "route" | "zone" | "marker" | "measure";

export type GeoPoint = {
  lat: number;
  lon: number;
};

export type MapObjectType = "route" | "zone" | "marker" | "rwlt_buoy" | "lane" | "measure";

export type MapObjectGeometry =
  | { type: "route"; points: GeoPoint[] }
  | { type: "zone"; points: GeoPoint[] }
  | { type: "marker"; point: GeoPoint }
  | { type: "measure"; points: [GeoPoint, GeoPoint] };

export type MapObject = {
  id: string;
  type: MapObjectType;
  name: string;
  visible: boolean;
  color?: string;
  laneColor?: string;
  markerSizePx?: number;

  // Optional while the app is still MVP/mocked.
  geometry?: MapObjectGeometry;

  // MVP object metadata used by dialogs.
  note?: string;
  laneAngle?: number;
  laneWidth?: number;
  laneBearingDeg?: number;
  laneStart?: GeoPoint;
  rwltBuoyId?: number;
  rwltAntennaDepthM?: number;
  rwltBatteryV?: number | null;
  rwltSogMps?: number;
  rwltCourseDeg?: number;
  rwltUpdatedAt?: number;
};
