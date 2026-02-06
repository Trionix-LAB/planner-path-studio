export type Tool = "select" | "route" | "zone" | "marker";

export type GeoPoint = {
  lat: number;
  lon: number;
};

export type MapObjectType = "route" | "zone" | "marker" | "lane";

export type MapObjectGeometry =
  | { type: "route"; points: GeoPoint[] }
  | { type: "zone"; points: GeoPoint[] }
  | { type: "marker"; point: GeoPoint };

export type MapObject = {
  id: string;
  type: MapObjectType;
  name: string;
  visible: boolean;
  color?: string;

  // Optional while the app is still MVP/mocked.
  geometry?: MapObjectGeometry;

  // MVP object metadata used by dialogs.
  note?: string;
  laneAngle?: number;
  laneWidth?: number;
};
