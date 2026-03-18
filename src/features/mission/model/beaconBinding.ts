import { DIVER_BEACON_ID_MAX, DIVER_BEACON_ID_MIN } from './divers';

export const normalizeIncomingBeaconBindingKey = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isInteger(n)) return null;
  if (n >= 0 && n <= 15) return String(n + 1);
  if (n >= DIVER_BEACON_ID_MIN && n <= DIVER_BEACON_ID_MAX) return String(n);
  return null;
};
