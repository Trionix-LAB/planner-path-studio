import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveRwltModeFromCommand } = require('../../electron/rwlt-com-simulator.cjs') as {
  resolveRwltModeFromCommand: (line: string) => 'pinger' | 'divers' | null;
};

const buildPunv0Sentence = (modeAt11: string, modeAt10 = ''): string => {
  const fields = new Array<string>(12).fill('');
  // PUNV0 payload fields: rwlt_mode is the 11th field after sentence id.
  fields[10] = modeAt11;
  // Legacy fallback in parser reads one field earlier (index 10 after sentence id).
  fields[9] = modeAt10;
  return `$PUNV0,${fields.join(',')}*00`;
};

describe('rwlt-com simulator mode command parser', () => {
  it('reads rwlt_mode from field 11 for PUNV0', () => {
    const line = buildPunv0Sentence('1');
    expect(resolveRwltModeFromCommand(line)).toBe('divers');
  });

  it('supports legacy fallback to field 10 when field 11 is empty', () => {
    const line = buildPunv0Sentence('', '0');
    expect(resolveRwltModeFromCommand(line)).toBe('pinger');
  });

  it('returns null for unrelated sentences', () => {
    expect(resolveRwltModeFromCommand('$GNRMC,120000,A,,,,,,,,*00')).toBeNull();
  });
});
