import { describe, expect, it } from 'vitest';
import { isEnabledByConditionSatisfied } from '@/features/devices/model/enabledBy';

describe('enabledBy evaluator', () => {
  it('supports single and combined conditions', () => {
    const config = {
      useExternalGnss: false,
      useCommandPort: true,
    };

    expect(isEnabledByConditionSatisfied('useCommandPort', config)).toBe(true);
    expect(isEnabledByConditionSatisfied('!useExternalGnss', config)).toBe(true);
    expect(isEnabledByConditionSatisfied('!useExternalGnss && useCommandPort', config)).toBe(true);
  });

  it('returns false when any combined condition is not satisfied', () => {
    const config = {
      useExternalGnss: false,
      useCommandPort: false,
    };

    expect(isEnabledByConditionSatisfied('!useExternalGnss && useCommandPort', config)).toBe(false);
  });
});

