export type ColoredTrackSegment = {
  trackId: string;
  points: Array<[number, number]>;
  color: string;
};

export const filterVisibleTrackSegments = (
  segments: ColoredTrackSegment[],
  hiddenTrackIds: Iterable<string>,
): ColoredTrackSegment[] => {
  const hidden = new Set(hiddenTrackIds);
  if (hidden.size === 0) return segments;
  return segments.filter((segment) => !hidden.has(segment.trackId));
};
