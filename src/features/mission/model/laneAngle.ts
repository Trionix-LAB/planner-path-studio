export const clampLaneAngleInputDeg = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(360, Math.max(0, value));
};

export const normalizeLaneAngleDeg = (value: number): number => {
  const clamped = clampLaneAngleInputDeg(value);
  return clamped % 180;
};

export const parseLaneAngleInput = (value: string, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeLaneAngleDeg(fallback);
  return normalizeLaneAngleDeg(numeric);
};
