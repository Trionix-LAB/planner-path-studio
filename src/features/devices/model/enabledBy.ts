import type { DeviceConfig } from './types';

const toFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
};

const parseEnabledByConditions = (enabledBy: string): string[] => {
  return enabledBy
    .split('&&')
    .map((condition) => condition.trim())
    .filter((condition) => condition.length > 0);
};

const isSingleConditionEnabled = (condition: string, config: DeviceConfig): boolean => {
  const negate = condition.startsWith('!');
  const controllerKey = negate ? condition.slice(1).trim() : condition;
  if (!controllerKey) return true;
  const value = toFlag(config[controllerKey]);
  return negate ? !value : value;
};

export const isEnabledByConditionSatisfied = (enabledBy: string | undefined, config: DeviceConfig): boolean => {
  if (!enabledBy) return true;
  const conditions = parseEnabledByConditions(enabledBy);
  if (conditions.length === 0) return true;
  return conditions.every((condition) => isSingleConditionEnabled(condition, config));
};

