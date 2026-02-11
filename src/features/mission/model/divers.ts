import type { DiverUiConfig, NavigationSourceId } from './types';

const DEFAULT_DIVER_MARKER_COLOR = '#0ea5e9';
const DEFAULT_DIVER_TRACK_COLOR = '#a855f7';
const DEFAULT_DIVER_MARKER_SIZE = 32;
const DEFAULT_NAVIGATION_SOURCE: NavigationSourceId = 'zima2r';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

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

const isNavigationSourceId = (value: unknown): value is NavigationSourceId =>
  value === 'zima2r' || value === 'gnss-udp' || value === 'simulation';

const normalizeNavigationSource = (value: unknown, fallback: NavigationSourceId): NavigationSourceId =>
  isNavigationSourceId(value) ? value : fallback;

export const createDefaultDiver = (index: number): DiverUiConfig => ({
  uid: crypto.randomUUID(),
  id: `${index + 1}`,
  title: `Маяк ${index + 1}`,
  marker_color: DEFAULT_DIVER_MARKER_COLOR,
  marker_size_px: DEFAULT_DIVER_MARKER_SIZE,
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
    return {
      uid: normalizeText(item.uid, crypto.randomUUID()),
      id: normalizeText(item.id, fallback.id),
      title: normalizeText(item.title, fallback.title),
      marker_color: normalizeHexColor(item.marker_color, fallback.marker_color),
      marker_size_px: clampInt(item.marker_size_px, fallback.marker_size_px, 12, 64),
      track_color: normalizeHexColor(item.track_color, fallback.track_color),
      navigation_source: normalizeNavigationSource(item.navigation_source, fallback.navigation_source),
    } satisfies DiverUiConfig;
  });

  return parsed.length > 0 ? parsed : createDefaultDivers(1);
};
