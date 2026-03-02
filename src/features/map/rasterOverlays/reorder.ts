type RasterLike = {
  id: string;
  z_index: number;
};

export const moveRasterOverlayByDelta = <T extends RasterLike>(
  overlays: T[],
  id: string,
  delta: -1 | 1,
): T[] => {
  if (overlays.length < 2) return overlays;

  const sorted = [...overlays].sort((a, b) => a.z_index - b.z_index);
  const currentIndex = sorted.findIndex((overlay) => overlay.id === id);
  if (currentIndex < 0) return overlays;

  const targetIndex = currentIndex + delta;
  if (targetIndex < 0 || targetIndex >= sorted.length) return overlays;

  const reordered = [...sorted];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

  return reordered.map((overlay, index) => ({
    ...overlay,
    z_index: index + 1,
  }));
};
