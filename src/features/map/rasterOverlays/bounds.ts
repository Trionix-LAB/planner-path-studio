export type RasterBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const isBoundsWithinEpsg4326 = (bounds: RasterBounds): boolean => {
  if (
    !isFiniteNumber(bounds.north) ||
    !isFiniteNumber(bounds.south) ||
    !isFiniteNumber(bounds.east) ||
    !isFiniteNumber(bounds.west)
  ) {
    return false;
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    return false;
  }

  return (
    bounds.north <= 90 &&
    bounds.south >= -90 &&
    bounds.east <= 180 &&
    bounds.west >= -180
  );
};

export const assertBoundsWithinEpsg4326 = (bounds: RasterBounds, sourceLabel: string): void => {
  if (
    !isFiniteNumber(bounds.north) ||
    !isFiniteNumber(bounds.south) ||
    !isFiniteNumber(bounds.east) ||
    !isFiniteNumber(bounds.west)
  ) {
    throw new Error(`Некорректные координаты ${sourceLabel}: обнаружены нечисловые значения.`);
  }
  if (bounds.north < bounds.south || bounds.east < bounds.west) {
    throw new Error(`Некорректные координаты ${sourceLabel}: нарушен порядок границ.`);
  }
  if (isBoundsWithinEpsg4326(bounds)) return;

  throw new Error(
    `Координаты ${sourceLabel} выходят за диапазон EPSG:4326 (широта -90..90, долгота -180..180). ` +
      'Похоже, используется проекция в метрах (например UTM/WebMercator), которая не поддерживается в MVP.',
  );
};
