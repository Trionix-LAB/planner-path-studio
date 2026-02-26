import { clampLaneAngleInputDeg, normalizeLaneAngleDeg, parseLaneAngleInput } from '@/features/mission/model/laneAngle';

describe('lane angle helpers', () => {
  it('clamps user input to 0..360', () => {
    expect(clampLaneAngleInputDeg(-10)).toBe(0);
    expect(clampLaneAngleInputDeg(120)).toBe(120);
    expect(clampLaneAngleInputDeg(480)).toBe(360);
  });

  it('normalizes clamped input to undirected axis 0..180', () => {
    expect(normalizeLaneAngleDeg(0)).toBe(0);
    expect(normalizeLaneAngleDeg(30)).toBe(30);
    expect(normalizeLaneAngleDeg(210)).toBe(30);
    expect(normalizeLaneAngleDeg(360)).toBe(0);
    expect(normalizeLaneAngleDeg(480)).toBe(0);
    expect(normalizeLaneAngleDeg(-45)).toBe(0);
  });

  it('parses input string with fallback', () => {
    expect(parseLaneAngleInput('30')).toBe(30);
    expect(parseLaneAngleInput('400')).toBe(0);
    expect(parseLaneAngleInput('abc', 210)).toBe(30);
  });
});
