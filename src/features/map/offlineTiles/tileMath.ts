const MAX_LAT = 85.05112878;

const clampLat = (lat: number): number => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

const normalizeLon = (lon: number): number => {
  if (!Number.isFinite(lon)) return 0;
  let normalized = lon;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
};

export const lonToTileX = (lon: number, zoom: number): number => {
  const n = 2 ** zoom;
  const x = ((normalizeLon(lon) + 180) / 360) * n;
  return Math.max(0, Math.min(n - 1, Math.floor(x)));
};

export const latToTileY = (lat: number, zoom: number): number => {
  const n = 2 ** zoom;
  const clamped = clampLat(lat);
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return Math.max(0, Math.min(n - 1, Math.floor(y)));
};

export type TileBbox = {
  north: number;
  south: number;
  west: number;
  east: number;
};

export type TileRange = {
  zoom: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  tilesCount: number;
};

export const bboxToTileRange = (bbox: TileBbox, zoom: number): TileRange => {
  const west = Math.min(bbox.west, bbox.east);
  const east = Math.max(bbox.west, bbox.east);
  const north = Math.max(bbox.north, bbox.south);
  const south = Math.min(bbox.north, bbox.south);

  const xMin = lonToTileX(west, zoom);
  const xMax = lonToTileX(east, zoom);
  const yMin = latToTileY(north, zoom);
  const yMax = latToTileY(south, zoom);
  const tilesCount = Math.max(0, xMax - xMin + 1) * Math.max(0, yMax - yMin + 1);

  return { zoom, xMin, xMax, yMin, yMax, tilesCount };
};

export const enumerateTiles = (range: TileRange): Array<{ z: number; x: number; y: number }> => {
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let x = range.xMin; x <= range.xMax; x += 1) {
    for (let y = range.yMin; y <= range.yMax; y += 1) {
      out.push({ z: range.zoom, x, y });
    }
  }
  return out;
};
