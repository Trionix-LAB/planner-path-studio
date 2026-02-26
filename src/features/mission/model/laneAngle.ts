export const normalizeLaneAngleDeg = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return ((value % 180) + 180) % 180;
};

export const parseLaneAngleInput = (value: string, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeLaneAngleDeg(fallback);
  return normalizeLaneAngleDeg(numeric);
};
