import type { SettingsBridge } from '@/platform/contracts';
import { createDefaultDeviceConfig, loadDeviceSchemas } from './schemaLoader';
import { isEnabledByConditionSatisfied } from './enabledBy';
import type {
  DeviceChangedPayload,
  DeviceConfig,
  DeviceFieldSchema,
  DeviceSchema,
  DeviceValidationIssue,
  EquipmentProfile,
  EquipmentRuntimeV2,
  EquipmentSettingsV2,
} from './types';
import {
  DEVICE_CHANGED_EVENT,
  EQUIPMENT_RUNTIME_STORAGE_KEY,
  EQUIPMENT_SETTINGS_SCHEMA_VERSION,
  EQUIPMENT_SETTINGS_STORAGE_KEY,
} from './types';

type LegacyEquipmentSettingsV1 = {
  schema_version: 1;
  selected_device_id?: unknown;
  devices?: unknown;
};

const DEFAULT_PROFILE_PRESETS = [
  {
    id: 'profile-zima-usbl',
    name: 'Профиль Zima USBL',
    device_ids: ['zima2r'],
  },
  {
    id: 'profile-zima-gnss',
    name: 'Профиль Zima + GNSS',
    device_ids: ['zima2r', 'gnss-udp'],
  },
  {
    id: 'profile-gnss',
    name: 'Профиль GNSS',
    device_ids: ['gnss-udp'],
  },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const createProfileId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return isEnabledByConditionSatisfied(field.enabledBy, config);
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

const normalizeProfileDeviceIds = (
  value: unknown,
  knownDeviceIds: Set<string>,
  fallbackDeviceId: string,
): string[] => {
  const fromInput = Array.isArray(value)
    ? value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0 && knownDeviceIds.has(item))
    : [];

  const unique: string[] = [];
  for (const deviceId of fromInput) {
    if (!unique.includes(deviceId)) {
      unique.push(deviceId);
    }
  }

  if (unique.length > 0) return unique;
  return fallbackDeviceId ? [fallbackDeviceId] : [];
};

const coerceProfile = (
  raw: unknown,
  index: number,
  knownDeviceIds: Set<string>,
  fallbackDeviceId: string,
): EquipmentProfile | null => {
  if (!isRecord(raw)) return null;

  const rawId = normalizeText(raw.id);
  const rawName = normalizeText(raw.name);
  const id = rawId || createProfileId();
  const name = rawName || `Профиль ${index + 1}`;
  const device_ids = normalizeProfileDeviceIds(raw.device_ids, knownDeviceIds, fallbackDeviceId);

  if (device_ids.length === 0) return null;
  return { id, name, device_ids };
};

const createDefaultProfiles = (schemas: DeviceSchema[]): EquipmentProfile[] => {
  const knownDeviceIds = new Set(schemas.map((schema) => schema.id));
  const fallbackDeviceId = schemas[0]?.id ?? '';
  const defaults = DEFAULT_PROFILE_PRESETS.map((profile) => {
    const device_ids = profile.device_ids.filter((deviceId) => knownDeviceIds.has(deviceId));
    if (device_ids.length === 0) return null;
    return {
      id: profile.id,
      name: profile.name,
      device_ids,
    } satisfies EquipmentProfile;
  }).filter((p) => p !== null) as EquipmentProfile[];

  if (defaults.length > 0) return defaults;

  if (!fallbackDeviceId) return [];
  return [
    {
      id: 'profile-default',
      name: 'Профиль 1',
      device_ids: [fallbackDeviceId],
    },
  ];
};

const normalizeProfileList = (rawProfiles: unknown, schemas: DeviceSchema[]): EquipmentProfile[] => {
  const baseProfiles = createDefaultProfiles(schemas);
  const knownDeviceIds = new Set(schemas.map((schema) => schema.id));
  const fallbackDeviceId = schemas[0]?.id ?? '';
  if (!Array.isArray(rawProfiles)) return baseProfiles;

  const result: EquipmentProfile[] = [];
  const usedIds = new Set<string>();

  rawProfiles.forEach((profileRaw, index) => {
    const fallbackFromBase = baseProfiles[index]?.device_ids[0] ?? fallbackDeviceId;
    const profile = coerceProfile(profileRaw, index, knownDeviceIds, fallbackFromBase);
    if (!profile) return;

    let nextId = profile.id;
    if (usedIds.has(nextId)) {
      nextId = createProfileId();
    }

    usedIds.add(nextId);
    result.push({ ...profile, id: nextId });
  });

  if (result.length > 0) return result;
  return baseProfiles;
};

const resolveSelectedProfile = (
  profiles: EquipmentProfile[],
  selectedProfileId: unknown,
): EquipmentProfile | null => {
  if (profiles.length === 0) return null;
  const requestedId = normalizeText(selectedProfileId);
  if (!requestedId) return profiles[0];
  return profiles.find((profile) => profile.id === requestedId) ?? profiles[0];
};

const resolveSelectedDeviceId = (
  selectedDeviceId: unknown,
  selectedProfile: EquipmentProfile | null,
  schemas: DeviceSchema[],
): string => {
  const requestedId = normalizeText(selectedDeviceId);
  if (selectedProfile) {
    if (requestedId && selectedProfile.device_ids.includes(requestedId)) return requestedId;
    return selectedProfile.device_ids[0] ?? '';
  }

  if (requestedId && schemas.some((schema) => schema.id === requestedId)) return requestedId;
  return schemas[0]?.id ?? '';
};

const normalizeLegacySettingsV1 = (raw: LegacyEquipmentSettingsV1, schemas: DeviceSchema[]): EquipmentSettingsV2 => {
  const base = createDefaultEquipmentSettings(schemas);
  const profiles = createDefaultProfiles(schemas);
  const selectedLegacyDevice = normalizeText(raw.selected_device_id);
  const selectedProfile =
    profiles.find((profile) => selectedLegacyDevice && profile.device_ids.includes(selectedLegacyDevice)) ??
    profiles[0] ??
    null;
  const selectedDeviceId = resolveSelectedDeviceId(selectedLegacyDevice, selectedProfile, schemas);

  return {
    ...base,
    profiles,
    selected_profile_id: selectedProfile?.id ?? base.selected_profile_id,
    selected_device_id: selectedDeviceId || base.selected_device_id,
  };
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
  if (value === null || value === undefined || value === '') return null;
  const n = toNumber(value);
  if (n === null) return null;
  return n;
};

export const normalizeDeviceConfig = (schema: DeviceSchema, raw: unknown): DeviceConfig => {
  const source = isRecord(raw) ? raw : {};
  const config: DeviceConfig = {};
  for (const field of schema.fields) {
    config[field.key] = normalizeFieldValue(field, source[field.key] ?? getFieldDefault(field));
  }
  return config;
};

export const createDefaultEquipmentSettings = (schemas = loadDeviceSchemas()): EquipmentSettingsV2 => {
  const devices = Object.fromEntries(schemas.map((schema) => [schema.id, createDefaultDeviceConfig(schema)]));
  const profiles = createDefaultProfiles(schemas);
  const selectedProfile = profiles[0] ?? null;

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_profile_id: selectedProfile?.id ?? '',
    selected_device_id: selectedProfile?.device_ids[0] ?? schemas[0]?.id ?? '',
    profiles,
    devices,
  };
};

export const normalizeEquipmentSettings = (raw: unknown, schemas = loadDeviceSchemas()): EquipmentSettingsV2 => {
  const base = createDefaultEquipmentSettings(schemas);
  if (!isRecord(raw)) return base;

  const devicesRaw = isRecord(raw.devices) ? raw.devices : {};
  const devices: Record<string, DeviceConfig> = {};
  for (const schema of schemas) {
    devices[schema.id] = normalizeDeviceConfig(schema, devicesRaw[schema.id]);
  }

  if (raw.schema_version === 1) {
    const migrated = normalizeLegacySettingsV1(raw as LegacyEquipmentSettingsV1, schemas);
    return { ...migrated, devices };
  }

  if (raw.schema_version !== EQUIPMENT_SETTINGS_SCHEMA_VERSION) {
    return { ...base, devices };
  }

  const profiles = normalizeProfileList(raw.profiles, schemas);
  const selectedProfile = resolveSelectedProfile(profiles, raw.selected_profile_id);
  const selectedDeviceId = resolveSelectedDeviceId(raw.selected_device_id, selectedProfile, schemas);

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_profile_id: selectedProfile?.id ?? base.selected_profile_id,
    selected_device_id: selectedDeviceId || base.selected_device_id,
    profiles,
    devices,
  };
};

const validateFieldValue = (field: DeviceFieldSchema, value: unknown): string | null => {
  if (field.validation.type === 'ip') {
    const text = String(value).trim();
    if (!isValidIpAddress(text)) {
      return 'Введите корректный IPv4 адрес (например 127.0.0.1)';
    }
    return null;
  }

  if (field.validation.type === 'port') {
    const port = toNumber(value);
    if (port === null || !Number.isInteger(port) || port < 1 || port > 65535) {
      return 'Порт должен быть целым числом от 1 до 65535';
    }
    return null;
  }

  if (field.validation.type === 'number' || field.inputForm === 'number') {
    if (typeof value === 'string' && value.trim().length === 0) {
      if (field.validation.allowEmpty) {
        return null;
      }
      return 'Введите число';
    }

    if (field.validation.allowEmpty) {
      const text = String(value).trim();
      if (text.length === 0) {
        return null;
      }
    }

    const n = toNumber(value);
    if (n === null) {
      return 'Введите число';
    }
    if (field.validation.integer && !Number.isInteger(n)) {
      return 'Требуется целое число';
    }
    if (typeof field.validation.min === 'number' && n < field.validation.min) {
      return `Минимум: ${field.validation.min}`;
    }
    if (typeof field.validation.max === 'number' && n > field.validation.max) {
      return `Максимум: ${field.validation.max}`;
    }
  }

  return null;
};

export const describeDeviceConfigErrors = (
  schema: DeviceSchema,
  errors: Record<string, string>,
): DeviceValidationIssue[] => {
  const fieldOrder = new Map(schema.fields.map((field, index) => [field.key, index]));

  return Object.entries(errors)
    .sort((a, b) => (fieldOrder.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (fieldOrder.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
    .map(([fieldKey, message]) => {
      const field = schema.fields.find((item) => item.key === fieldKey);
      const fieldLabel = field?.label ?? fieldKey;
      const sectionTitle = field?.sectionTitle;
      const context = sectionTitle ? `${schema.title} / ${sectionTitle}` : schema.title;

      return {
        schemaId: schema.id,
        schemaTitle: schema.title,
        ...(sectionTitle ? { sectionTitle } : {}),
        fieldKey,
        fieldLabel,
        message,
        summary: `${context}: ${fieldLabel} — ${message}`,
      };
    });
};

export const validateDeviceConfig = (schema: DeviceSchema, config: DeviceConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const field of schema.fields) {
    if (!isFieldEnabledForValidation(field, config)) {
      continue;
    }

    const rawValue = config[field.key];
    const value = rawValue ?? field.defaultValue;
    const validationError = validateFieldValue(field, value);
    if (validationError) {
      errors[field.key] = validationError;
    }
  }

  return errors;
};

export const buildEquipmentRuntime = (
  settings: EquipmentSettingsV2,
  schemas = loadDeviceSchemas(),
): EquipmentRuntimeV2 => {
  const activeProfile = settings.profiles.find((profile) => profile.id === settings.selected_profile_id) ?? null;
  const runtime: EquipmentRuntimeV2 = {
    schema_version: 2,
    active_profile: activeProfile
      ? {
          id: activeProfile.id,
          name: activeProfile.name,
          device_ids: [...activeProfile.device_ids],
        }
      : null,
  };

  if (!activeProfile) return runtime;

  if (activeProfile.device_ids.includes('zima2r')) {
    const zimaSchema = schemas.find((schema) => schema.id === 'zima2r');
    if (zimaSchema) {
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
    }
  }

  if (activeProfile.device_ids.includes('gnss-udp')) {
    const gnssSchema = schemas.find((schema) => schema.id === 'gnss-udp');
    if (gnssSchema) {
      const gnssConfig = settings.devices['gnss-udp'] ?? {};
      const defaultIp = String(readSchemaFieldDefault(gnssSchema, 'ipAddress', '127.0.0.1'));
      const defaultDataPort = parseIntWithFallback(readSchemaFieldDefault(gnssSchema, 'dataPort', 28128), 28128);

      runtime.gnss_udp = {
        interface: 'udp',
        protocol: 'nmea0183',
        ipAddress: String(gnssConfig.ipAddress ?? defaultIp).trim() || defaultIp,
        dataPort: parseIntWithFallback(gnssConfig.dataPort, defaultDataPort),
      };
    }
  }

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
): Promise<EquipmentSettingsV2> => {
  const raw = await settingsBridge.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
  return normalizeEquipmentSettings(raw, schemas);
};

export const writeEquipmentSettings = async (
  settingsBridge: SettingsBridge,
  raw: unknown,
  schemas = loadDeviceSchemas(),
): Promise<{ settings: EquipmentSettingsV2; runtime: EquipmentRuntimeV2 }> => {
  const settings = normalizeEquipmentSettings(raw, schemas);
  const runtime = buildEquipmentRuntime(settings, schemas);

  await settingsBridge.writeJson(EQUIPMENT_SETTINGS_STORAGE_KEY, settings);
  await settingsBridge.writeJson(EQUIPMENT_RUNTIME_STORAGE_KEY, runtime);
  emitDeviceChanged({ settings, runtime });

  return { settings, runtime };
};
