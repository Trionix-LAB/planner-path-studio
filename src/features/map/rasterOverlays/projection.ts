import type { RasterBounds } from '@/features/map/rasterOverlays/bounds';
import { utmToWgs84, type UtmHemisphere } from '@/features/geo/utm';

const WEB_MERCATOR_MAX = 20037508.342789244;
const EARTH_RADIUS_M = 6378137;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const metersToLongitude = (x: number): number => (x / EARTH_RADIUS_M) * (180 / Math.PI);

const metersToLatitude = (y: number): number => {
  const normalized = clamp(y, -WEB_MERCATOR_MAX, WEB_MERCATOR_MAX) / EARTH_RADIUS_M;
  return (Math.atan(Math.sinh(normalized)) * 180) / Math.PI;
};

export const convertWebMercatorBoundsToEpsg4326 = (bounds: RasterBounds): RasterBounds => {
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west)
  ) {
    throw new Error('Некорректные координаты TFW (метры): обнаружены нечисловые значения.');
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    throw new Error('Некорректные координаты TFW (метры): нарушен порядок границ.');
  }

  const north = metersToLatitude(bounds.north);
  const south = metersToLatitude(bounds.south);
  const east = metersToLongitude(bounds.east);
  const west = metersToLongitude(bounds.west);

  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
};

export const convertUtmBoundsToEpsg4326 = (
  bounds: RasterBounds,
  zone: number,
  hemisphere: UtmHemisphere,
): RasterBounds => {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error('Некорректная UTM зона: ожидается число от 1 до 60.');
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    throw new Error('Некорректные координаты TFW (UTM): нарушен порядок границ.');
  }

  const nw = utmToWgs84({ easting: bounds.west, northing: bounds.north, zone, hemisphere });
  const ne = utmToWgs84({ easting: bounds.east, northing: bounds.north, zone, hemisphere });
  const sw = utmToWgs84({ easting: bounds.west, northing: bounds.south, zone, hemisphere });
  const se = utmToWgs84({ easting: bounds.east, northing: bounds.south, zone, hemisphere });

  const lats = [nw.lat, ne.lat, sw.lat, se.lat];
  const lons = [nw.lon, ne.lon, sw.lon, se.lon];

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lons),
    west: Math.min(...lons),
  };
};
