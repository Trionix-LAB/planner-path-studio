import type { DiverUiConfig } from '@/features/mission';

export type DiverTelemetryPosition = {
  lat: number;
  lon: number;
  course?: number;
};

export type VisibleDiverMarker = {
  uid: string;
  markerColor: string;
  markerSizePx: number;
  position: [number, number];
  course: number;
};

const normalizeCourse = (value: number): number => ((value % 360) + 360) % 360;

const resolveTelemetryForDiver = (
  diver: DiverUiConfig,
  positionsById: Record<string, DiverTelemetryPosition>,
): DiverTelemetryPosition | null => {
  const diverId = diver.id.trim();
  if (!diverId) return null;
  return positionsById[diverId] ?? null;
};

export const normalizeDiverTelemetryById = (
  positionsById: Record<string, DiverTelemetryPosition>,
): Record<string, DiverTelemetryPosition> => {
  const next: Record<string, DiverTelemetryPosition> = {};
  for (const [id, value] of Object.entries(positionsById)) {
    const key = id.trim();
    if (!key) continue;
    next[key] = value;
  }
  return next;
};

export const resolvePrimaryDiverPosition = (
  divers: DiverUiConfig[],
  positionsById: Record<string, DiverTelemetryPosition>,
): [number, number] | null => {
  const primaryDiverId = divers[0]?.id?.trim() ?? '';
  if (!primaryDiverId) return null;
  const telemetry = positionsById[primaryDiverId];
  if (!telemetry) return null;
  return [telemetry.lat, telemetry.lon];
};

export const resolveFollowDiverPosition = (
  divers: DiverUiConfig[],
  positionsById: Record<string, DiverTelemetryPosition>,
  followAgentId: string | null,
): [number, number] | null => {
  if (!followAgentId) return null;
  const diver = divers.find((item) => item.uid === followAgentId);
  if (!diver) return null;
  const telemetry = resolveTelemetryForDiver(diver, positionsById);
  if (!telemetry) return null;
  return [telemetry.lat, telemetry.lon];
};

export const buildVisibleDiverMarkers = (
  divers: DiverUiConfig[],
  positionsById: Record<string, DiverTelemetryPosition>,
): VisibleDiverMarker[] => {
  const markers: VisibleDiverMarker[] = [];
  for (const diver of divers) {
    const telemetry = resolveTelemetryForDiver(diver, positionsById);
    if (!telemetry) continue;

    const course =
      typeof telemetry.course === 'number' && Number.isFinite(telemetry.course)
        ? normalizeCourse(telemetry.course)
        : 0;

    markers.push({
      uid: diver.uid,
      markerColor: diver.marker_color,
      markerSizePx: diver.marker_size_px,
      position: [telemetry.lat, telemetry.lon],
      course,
    });
  }
  return markers;
};
