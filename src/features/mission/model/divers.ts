import type { DiverUiConfig, NavigationSourceId } from './types';
import {
  clampDiverMarkerSizePx,
  DIVER_MARKER_SIZE_DEFAULT_PX,
} from './diverMarkerSize';

const DEFAULT_DIVER_MARKER_COLOR = '#0ea5e9';
const DEFAULT_DIVER_TRACK_COLOR = '#a855f7';
const DEFAULT_NAVIGATION_SOURCE: NavigationSourceId = 'zima2r';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeHexColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
};

const normalizeText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeNavigationSource = (value: unknown, fallback: NavigationSourceId): NavigationSourceId =>
  normalizeText(value, fallback);

const normalizeBeaconId = (value: unknown, fallback: string): string => {
  const normalized = normalizeText(value, fallback);
  const n = Number(normalized);
  if (!Number.isInteger(n) || n < 0 || n > 15) return fallback;
  return String(n);
};

export const createDefaultDiver = (index: number): DiverUiConfig => ({
  uid: crypto.randomUUID(),
  id: `${index + 1}`,
  beacon_id: String(Math.max(0, Math.min(15, index))),
  title: `Маяк ${index + 1}`,
  marker_color: DEFAULT_DIVER_MARKER_COLOR,
  marker_size_px: DIVER_MARKER_SIZE_DEFAULT_PX,
  track_color: DEFAULT_DIVER_TRACK_COLOR,
  navigation_source: DEFAULT_NAVIGATION_SOURCE,
});

export const createDefaultDivers = (count = 1): DiverUiConfig[] => {
  const total = Math.max(1, Math.trunc(count));
  return Array.from({ length: total }, (_, index) => createDefaultDiver(index));
};

export const normalizeDivers = (raw: unknown): DiverUiConfig[] => {
  if (!Array.isArray(raw)) return createDefaultDivers(1);

  const parsed = raw.map((item, index) => {
    const fallback = createDefaultDiver(index);
    if (!isRecord(item)) return fallback;
    const id = normalizeText(item.id, fallback.id);
    const beacon_id = normalizeBeaconId(
      item.beacon_id ?? item.id,
      fallback.beacon_id,
    );
    return {
      uid: normalizeText(item.uid, crypto.randomUUID()),
      id,
      beacon_id,
      title: normalizeText(item.title, fallback.title),
      marker_color: normalizeHexColor(item.marker_color, fallback.marker_color),
      marker_size_px: clampDiverMarkerSizePx(item.marker_size_px, fallback.marker_size_px),
      track_color: normalizeHexColor(item.track_color, fallback.track_color),
      navigation_source: normalizeNavigationSource(item.navigation_source, fallback.navigation_source),
    } satisfies DiverUiConfig;
  });

  return parsed.length > 0 ? parsed : createDefaultDivers(1);
};
