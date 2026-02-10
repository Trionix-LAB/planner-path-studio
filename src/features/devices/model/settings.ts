import type { SettingsBridge } from '@/platform/contracts';
import { createDefaultDeviceConfig, loadDeviceSchemas } from './schemaLoader';
import type {
  DeviceChangedPayload,
  DeviceConfig,
  DeviceFieldSchema,
  DeviceSchema,
  EquipmentRuntimeV1,
  EquipmentSettingsV1,
} from './types';
import {
  DEVICE_CHANGED_EVENT,
  EQUIPMENT_RUNTIME_STORAGE_KEY,
  EQUIPMENT_SETTINGS_SCHEMA_VERSION,
  EQUIPMENT_SETTINGS_STORAGE_KEY,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const isValidIpAddress = (value: string): boolean => {
  const chunks = value.trim().split('.');
  if (chunks.length !== 4) return false;
  return chunks.every((chunk) => {
    if (!/^\d{1,3}$/.test(chunk)) return false;
    const n = Number(chunk);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
};

const isFieldEnabledForValidation = (field: DeviceFieldSchema, config: DeviceConfig): boolean => {
  if (!field.enabledBy) return true;
  const negate = field.enabledBy.startsWith('!');
  const controllerKey = negate ? field.enabledBy.slice(1) : field.enabledBy;
  const controller = config[controllerKey];
  let nextValue = false;
  if (typeof controller === 'boolean') {
    nextValue = controller;
  } else if (typeof controller === 'string') {
    nextValue = controller.trim().toLowerCase() === 'true';
  } else {
    nextValue = Boolean(controller);
  }
  return negate ? !nextValue : nextValue;
};

const normalizeFieldValue = (field: DeviceFieldSchema, value: unknown): string | number | boolean => {
  if (field.inputForm === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return field.defaultValue === true;
  }

  if (field.inputForm === 'number') {
    const n = toNumber(value);
    if (n === null) {
      return typeof field.defaultValue === 'number' ? field.defaultValue : 0;
    }
    return n;
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof field.defaultValue === 'string' ? field.defaultValue : String(field.defaultValue);
};

const getFieldDefault = (field: DeviceFieldSchema): string | number | boolean => field.defaultValue;

export const normalizeDeviceConfig = (schema: DeviceSchema, raw: unknown): DeviceConfig => {
  const source = isRecord(raw) ? raw : {};
  const config: DeviceConfig = {};
  for (const field of schema.fields) {
    config[field.key] = normalizeFieldValue(field, source[field.key] ?? getFieldDefault(field));
  }
  return config;
};

export const createDefaultEquipmentSettings = (schemas = loadDeviceSchemas()): EquipmentSettingsV1 => {
  const devices = Object.fromEntries(schemas.map((schema) => [schema.id, createDefaultDeviceConfig(schema)]));
  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_device_id: schemas[0]?.id ?? '',
    devices,
  };
};

export const normalizeEquipmentSettings = (raw: unknown, schemas = loadDeviceSchemas()): EquipmentSettingsV1 => {
  const base = createDefaultEquipmentSettings(schemas);
  if (!isRecord(raw)) return base;
  if (raw.schema_version !== EQUIPMENT_SETTINGS_SCHEMA_VERSION) return base;

  const devicesRaw = isRecord(raw.devices) ? raw.devices : {};
  const devices: Record<string, DeviceConfig> = {};
  for (const schema of schemas) {
    devices[schema.id] = normalizeDeviceConfig(schema, devicesRaw[schema.id]);
  }

  const selectedRaw = typeof raw.selected_device_id === 'string' ? raw.selected_device_id : base.selected_device_id;
  const selected = schemas.some((schema) => schema.id === selectedRaw) ? selectedRaw : base.selected_device_id;

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_device_id: selected,
    devices,
  };
};

export const validateDeviceConfig = (schema: DeviceSchema, config: DeviceConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const field of schema.fields) {
    if (!isFieldEnabledForValidation(field, config)) {
      continue;
    }

    const rawValue = config[field.key];
    const value = rawValue ?? field.defaultValue;

    if (field.validation.type === 'ip') {
      const text = String(value).trim();
      if (!isValidIpAddress(text)) {
        errors[field.key] = 'Введите корректный IPv4 адрес (например 127.0.0.1)';
      }
      continue;
    }

    if (field.validation.type === 'port') {
      const port = toNumber(value);
      if (port === null || !Number.isInteger(port) || port < 1 || port > 65535) {
        errors[field.key] = 'Порт должен быть целым числом от 1 до 65535';
      }
      continue;
    }

    if (field.validation.type === 'number' || field.inputForm === 'number') {
      const n = toNumber(value);
      if (n === null) {
        errors[field.key] = 'Введите число';
        continue;
      }
      if (field.validation.integer && !Number.isInteger(n)) {
        errors[field.key] = 'Требуется целое число';
        continue;
      }
      if (typeof field.validation.min === 'number' && n < field.validation.min) {
        errors[field.key] = `Минимум: ${field.validation.min}`;
        continue;
      }
      if (typeof field.validation.max === 'number' && n > field.validation.max) {
        errors[field.key] = `Максимум: ${field.validation.max}`;
      }
    }
  }

  return errors;
};

const parseIntWithFallback = (value: unknown, fallback: number): number => {
  const n = toNumber(value);
  if (n === null || !Number.isFinite(n)) return fallback;
  return Math.trunc(n);
};

const parseBooleanWithFallback = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

const parseNullableNumber = (value: unknown): number | null => {
  const n = toNumber(value);
  if (n === null) return null;
  return n;
};

const readSchemaFieldDefault = (schema: DeviceSchema, key: string, fallback: string | number): string | number => {
  const field = schema.fields.find((item) => item.key === key);
  if (!field) return fallback;
  if (typeof field.defaultValue === 'string' || typeof field.defaultValue === 'number') {
    return field.defaultValue;
  }
  return fallback;
};

const readSchemaBooleanDefault = (schema: DeviceSchema, key: string, fallback: boolean): boolean => {
  const field = schema.fields.find((item) => item.key === key);
  if (!field) return fallback;
  if (typeof field.defaultValue === 'boolean') return field.defaultValue;
  return fallback;
};

export const buildEquipmentRuntime = (
  settings: EquipmentSettingsV1,
  schemas = loadDeviceSchemas(),
): EquipmentRuntimeV1 => {
  const runtime: EquipmentRuntimeV1 = {
    schema_version: 1,
  };

  const zimaSchema = schemas.find((schema) => schema.id === 'zima2r');
  if (!zimaSchema) return runtime;

  const zimaConfig = settings.devices.zima2r ?? {};
  const defaultIp = String(readSchemaFieldDefault(zimaSchema, 'ipAddress', '127.0.0.1'));
  const defaultCommandPort = parseIntWithFallback(readSchemaFieldDefault(zimaSchema, 'commandPort', 28128), 28128);
  const defaultDataPort = parseIntWithFallback(readSchemaFieldDefault(zimaSchema, 'dataPort', 28127), 28127);
  const defaultGnssBaud = parseIntWithFallback(readSchemaFieldDefault(zimaSchema, 'gnssBaud', 115200), 115200);
  const defaultUseExternalGnss = readSchemaBooleanDefault(zimaSchema, 'useExternalGnss', false);
  const defaultUseCommandPort = readSchemaBooleanDefault(zimaSchema, 'useCommandPort', false);

  runtime.zima = {
    interface: 'udp',
    ipAddress: String(zimaConfig.ipAddress ?? defaultIp).trim() || defaultIp,
    commandPort: parseIntWithFallback(zimaConfig.commandPort, defaultCommandPort),
    dataPort: parseIntWithFallback(zimaConfig.dataPort, defaultDataPort),
    gnssBaud: parseIntWithFallback(zimaConfig.gnssBaud, defaultGnssBaud),
    useExternalGnss: parseBooleanWithFallback(zimaConfig.useExternalGnss, defaultUseExternalGnss),
    useCommandPort: parseBooleanWithFallback(zimaConfig.useCommandPort, defaultUseCommandPort),
    latitude: parseNullableNumber(zimaConfig.latitude),
    longitude: parseNullableNumber(zimaConfig.longitude),
    azimuth: parseNullableNumber(zimaConfig.azimuth),
  };

  return runtime;
};

const emitDeviceChanged = (payload: DeviceChangedPayload): void => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent<DeviceChangedPayload>(DEVICE_CHANGED_EVENT, { detail: payload }));
};

export const subscribeDeviceChanged = (listener: (payload: DeviceChangedPayload) => void): (() => void) => {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<DeviceChangedPayload>;
    if (!custom.detail) return;
    listener(custom.detail);
  };
  window.addEventListener(DEVICE_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(DEVICE_CHANGED_EVENT, handler);
  };
};

export const readEquipmentSettings = async (
  settingsBridge: SettingsBridge,
  schemas = loadDeviceSchemas(),
): Promise<EquipmentSettingsV1> => {
  const raw = await settingsBridge.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
  return normalizeEquipmentSettings(raw, schemas);
};

export const writeEquipmentSettings = async (
  settingsBridge: SettingsBridge,
  raw: unknown,
  schemas = loadDeviceSchemas(),
): Promise<{ settings: EquipmentSettingsV1; runtime: EquipmentRuntimeV1 }> => {
  const settings = normalizeEquipmentSettings(raw, schemas);
  const runtime = buildEquipmentRuntime(settings, schemas);

  await settingsBridge.writeJson(EQUIPMENT_SETTINGS_STORAGE_KEY, settings);
  await settingsBridge.writeJson(EQUIPMENT_RUNTIME_STORAGE_KEY, runtime);
  emitDeviceChanged({ settings, runtime });

  return { settings, runtime };
};
