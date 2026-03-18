import { describe, expect, it } from 'vitest';
import { normalizeIncomingBeaconBindingKey } from '@/features/mission';

describe('normalizeIncomingBeaconBindingKey', () => {
  it('normalizes legacy 0-based beacon ids to 1-based values', () => {
    expect(normalizeIncomingBeaconBindingKey(0)).toBe('1');
    expect(normalizeIncomingBeaconBindingKey(1)).toBe('2');
    expect(normalizeIncomingBeaconBindingKey(15)).toBe('16');
  });

  it('keeps canonical max beacon id', () => {
    expect(normalizeIncomingBeaconBindingKey(16)).toBe('16');
  });

  it('returns null for invalid values', () => {
    expect(normalizeIncomingBeaconBindingKey(-1)).toBeNull();
    expect(normalizeIncomingBeaconBindingKey(17)).toBeNull();
    expect(normalizeIncomingBeaconBindingKey('')).toBeNull();
    expect(normalizeIncomingBeaconBindingKey('abc')).toBeNull();
    expect(normalizeIncomingBeaconBindingKey(null)).toBeNull();
  });
});
