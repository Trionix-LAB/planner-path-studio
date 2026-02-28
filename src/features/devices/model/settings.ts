import type { SettingsBridge } from '@/platform/contracts';
import { createDefaultDeviceConfig, loadDeviceSchemas } from './schemaLoader';
import { isEnabledByConditionSatisfied } from './enabledBy';
import type {
  DeviceChangedPayload,
  DeviceConfig,
  DeviceFieldSchema,
  DeviceInstance,
  DeviceSchema,
  DeviceValidationIssue,
  EquipmentProfile,
  EquipmentRuntimeV3,
  EquipmentSettingsV3,
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

type LegacyEquipmentProfileV2 = {
  id: string;
  name: string;
  device_ids: string[];
};

type LegacyEquipmentSettingsV2 = {
  schema_version: 2;
  selected_profile_id?: unknown;
  selected_device_id?: unknown;
  profiles?: unknown;
  devices?: unknown;
};

const DEFAULT_PROFILE_PRESETS = [
  {
    id: 'profile-zima-usbl',
    name: 'Профиль Zima USBL',
    schema_ids: ['zima2r'],
  },
  {
    id: 'profile-zima-gnss',
    name: 'Профиль Zima + GNSS',
    schema_ids: ['zima2r', 'gnss-udp'],
  },
  {
    id: 'profile-gnss',
    name: 'Профиль GNSS',
    schema_ids: ['gnss-udp'],
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

const createDeviceInstanceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`;
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const ensureUniqueId = (candidate: string, usedIds: Set<string>, factory: () => string): string => {
  let next = candidate || factory();
  while (!next || usedIds.has(next)) {
    next = factory();
  }
  usedIds.add(next);
  return next;
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

const normalizeLegacyProfileSchemaIds = (
  value: unknown,
  knownSchemaIds: Set<string>,
  fallbackSchemaId: string,
): string[] => {
  const fromInput = Array.isArray(value)
    ? value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0 && knownSchemaIds.has(item))
    : [];

  const unique: string[] = [];
  for (const schemaId of fromInput) {
    if (!unique.includes(schemaId)) {
      unique.push(schemaId);
    }
  }

  if (unique.length > 0) return unique;
  return fallbackSchemaId ? [fallbackSchemaId] : [];
};

const coerceLegacyProfile = (
  raw: unknown,
  index: number,
  knownSchemaIds: Set<string>,
  fallbackSchemaId: string,
): LegacyEquipmentProfileV2 | null => {
  if (!isRecord(raw)) return null;

  const rawId = normalizeText(raw.id);
  const rawName = normalizeText(raw.name);
  const id = rawId || createProfileId();
  const name = rawName || `Профиль ${index + 1}`;
  const device_ids = normalizeLegacyProfileSchemaIds(raw.device_ids, knownSchemaIds, fallbackSchemaId);

  if (device_ids.length === 0) return null;
  return { id, name, device_ids };
};

const createDefaultLegacyProfiles = (schemas: DeviceSchema[]): LegacyEquipmentProfileV2[] => {
  const knownSchemaIds = new Set(schemas.map((schema) => schema.id));
  const fallbackSchemaId = schemas[0]?.id ?? '';

  const defaults = DEFAULT_PROFILE_PRESETS.map((profile) => {
    const device_ids = profile.schema_ids.filter((schemaId) => knownSchemaIds.has(schemaId));
    if (device_ids.length === 0) return null;
    return {
      id: profile.id,
      name: profile.name,
      device_ids,
    } satisfies LegacyEquipmentProfileV2;
  }).filter((profile) => profile !== null) as LegacyEquipmentProfileV2[];

  if (defaults.length > 0) return defaults;

  if (!fallbackSchemaId) return [];
  return [
    {
      id: 'profile-default',
      name: 'Профиль 1',
      device_ids: [fallbackSchemaId],
    },
  ];
};

const normalizeLegacyProfileList = (rawProfiles: unknown, schemas: DeviceSchema[]): LegacyEquipmentProfileV2[] => {
  const baseProfiles = createDefaultLegacyProfiles(schemas);
  const knownSchemaIds = new Set(schemas.map((schema) => schema.id));
  const fallbackSchemaId = schemas[0]?.id ?? '';
  if (!Array.isArray(rawProfiles)) return baseProfiles;

  const result: LegacyEquipmentProfileV2[] = [];
  const usedIds = new Set<string>();

  rawProfiles.forEach((profileRaw, index) => {
    const fallbackFromBase = baseProfiles[index]?.device_ids[0] ?? fallbackSchemaId;
    const profile = coerceLegacyProfile(profileRaw, index, knownSchemaIds, fallbackFromBase);
    if (!profile) return;

    const nextId = ensureUniqueId(profile.id, usedIds, createProfileId);
    result.push({ ...profile, id: nextId });
  });

  if (result.length > 0) return result;
  return baseProfiles;
};

const normalizeLegacyDevices = (rawDevices: unknown, schemas: DeviceSchema[]): Record<string, DeviceConfig> => {
  const source = isRecord(rawDevices) ? rawDevices : {};
  const devices: Record<string, DeviceConfig> = {};

  for (const schema of schemas) {
    devices[schema.id] = normalizeDeviceConfig(schema, source[schema.id]);
  }

  return devices;
};

const normalizeProfileInstanceIds = (
  value: unknown,
  knownInstanceIds: Set<string>,
  fallbackInstanceId: string,
): string[] => {
  const fromInput = Array.isArray(value)
    ? value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0 && knownInstanceIds.has(item))
    : [];

  const unique: string[] = [];
  for (const instanceId of fromInput) {
    if (!unique.includes(instanceId)) {
      unique.push(instanceId);
    }
  }

  if (unique.length > 0) return unique;
  return fallbackInstanceId ? [fallbackInstanceId] : [];
};

const coerceProfile = (
  raw: unknown,
  index: number,
  knownInstanceIds: Set<string>,
  fallbackInstanceId: string,
): EquipmentProfile | null => {
  if (!isRecord(raw)) return null;

  const rawId = normalizeText(raw.id);
  const rawName = normalizeText(raw.name);
  const id = rawId || createProfileId();
  const name = rawName || `Профиль ${index + 1}`;
  const device_instance_ids = normalizeProfileInstanceIds(
    raw.device_instance_ids,
    knownInstanceIds,
    fallbackInstanceId,
  );

  if (device_instance_ids.length === 0) return null;
  return { id, name, device_instance_ids };
};

const createFallbackProfilesFromInstances = (instanceIds: string[]): EquipmentProfile[] => {
  if (instanceIds.length === 0) return [];
  return [
    {
      id: 'profile-default',
      name: 'Профиль 1',
      device_instance_ids: [...instanceIds],
    },
  ];
};

const normalizeProfileList = (
  rawProfiles: unknown,
  deviceInstances: Record<string, DeviceInstance>,
): EquipmentProfile[] => {
  const knownInstanceIds = new Set(Object.keys(deviceInstances));
  const fallbackProfile = createFallbackProfilesFromInstances(Object.keys(deviceInstances));
  const fallbackInstanceId = fallbackProfile[0]?.device_instance_ids[0] ?? '';

  if (!Array.isArray(rawProfiles)) return fallbackProfile;

  const result: EquipmentProfile[] = [];
  const usedIds = new Set<string>();

  rawProfiles.forEach((profileRaw, index) => {
    const fallbackFromBase = fallbackProfile[index]?.device_instance_ids[0] ?? fallbackInstanceId;
    const profile = coerceProfile(profileRaw, index, knownInstanceIds, fallbackFromBase);
    if (!profile) return;

    const nextId = ensureUniqueId(profile.id, usedIds, createProfileId);
    result.push({ ...profile, id: nextId });
  });

  if (result.length > 0) return result;
  return fallbackProfile;
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

const resolveSelectedDeviceInstanceId = (
  selectedDeviceInstanceId: unknown,
  selectedProfile: EquipmentProfile | null,
  deviceInstances: Record<string, DeviceInstance>,
): string => {
  const requestedId = normalizeText(selectedDeviceInstanceId);

  if (selectedProfile) {
    if (requestedId && selectedProfile.device_instance_ids.includes(requestedId)) return requestedId;
    if (requestedId) {
      const requestedSchemaInstance = selectedProfile.device_instance_ids.find(
        (instanceId) => deviceInstances[instanceId]?.schema_id === requestedId,
      );
      if (requestedSchemaInstance) return requestedSchemaInstance;
    }
    return selectedProfile.device_instance_ids[0] ?? '';
  }

  if (requestedId && deviceInstances[requestedId]) return requestedId;
  if (requestedId) {
    const instanceBySchema = Object.values(deviceInstances).find((instance) => instance.schema_id === requestedId);
    if (instanceBySchema) return instanceBySchema.id;
  }

  return Object.keys(deviceInstances)[0] ?? '';
};

const ensureSinglePrimaryPerSchema = (
  profiles: EquipmentProfile[],
  deviceInstances: Record<string, DeviceInstance>,
): Record<string, DeviceInstance> => {
  const next: Record<string, DeviceInstance> = Object.fromEntries(
    Object.entries(deviceInstances).map(([instanceId, instance]) => [instanceId, { ...instance }]),
  );

  for (const profile of profiles) {
    const grouped = new Map<string, string[]>();

    for (const instanceId of profile.device_instance_ids) {
      const instance = next[instanceId];
      if (!instance) continue;
      const list = grouped.get(instance.schema_id) ?? [];
      list.push(instanceId);
      grouped.set(instance.schema_id, list);
    }

    for (const instanceIds of grouped.values()) {
      const primaryId = instanceIds.find((instanceId) => next[instanceId]?.is_primary) ?? instanceIds[0];
      for (const instanceId of instanceIds) {
        const current = next[instanceId];
        if (!current) continue;
        next[instanceId] = { ...current, is_primary: instanceId === primaryId };
      }
    }
  }

  return next;
};

const buildProfilesAndInstancesFromLegacy = (
  legacyProfiles: LegacyEquipmentProfileV2[],
  legacyDevices: Record<string, DeviceConfig>,
  schemas: DeviceSchema[],
): { profiles: EquipmentProfile[]; deviceInstances: Record<string, DeviceInstance> } => {
  const schemaById = new Map(schemas.map((schema) => [schema.id, schema]));
  const usedInstanceIds = new Set<string>();
  const deviceInstances: Record<string, DeviceInstance> = {};

  const profiles = legacyProfiles
    .map((legacyProfile) => {
      const counters = new Map<string, number>();
      const device_instance_ids: string[] = [];

      for (const schemaId of legacyProfile.device_ids) {
        const schema = schemaById.get(schemaId);
        if (!schema) continue;

        const index = (counters.get(schemaId) ?? 0) + 1;
        counters.set(schemaId, index);

        const baseId = `${legacyProfile.id}-${schemaId}-${index}`;
        const instanceId = ensureUniqueId(baseId, usedInstanceIds, createDeviceInstanceId);
        const titleWithIndex = index > 1 ? `${schema.title} ${index}` : schema.title;

        deviceInstances[instanceId] = {
          id: instanceId,
          schema_id: schemaId,
          name: titleWithIndex,
          config: { ...(legacyDevices[schemaId] ?? createDefaultDeviceConfig(schema)) },
          is_primary: index === 1,
        };
        device_instance_ids.push(instanceId);
      }

      if (device_instance_ids.length === 0) return null;

      return {
        id: legacyProfile.id,
        name: legacyProfile.name,
        device_instance_ids,
      } satisfies EquipmentProfile;
    })
    .filter((profile) => profile !== null) as EquipmentProfile[];

  return {
    profiles,
    deviceInstances,
  };
};

const migrateLegacySettingsV1 = (
  raw: LegacyEquipmentSettingsV1,
  schemas: DeviceSchema[],
): EquipmentSettingsV3 => {
  const legacyProfiles = createDefaultLegacyProfiles(schemas);
  const legacyDevices = normalizeLegacyDevices(raw.devices, schemas);
  const { profiles, deviceInstances } = buildProfilesAndInstancesFromLegacy(legacyProfiles, legacyDevices, schemas);
  const selectedProfile =
    profiles.find((profile) =>
      profile.device_instance_ids.some(
        (instanceId) => deviceInstances[instanceId]?.schema_id === normalizeText(raw.selected_device_id),
      ),
    ) ?? profiles[0] ?? null;
  const selectedDeviceInstanceId = resolveSelectedDeviceInstanceId(raw.selected_device_id, selectedProfile, deviceInstances);

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_profile_id: selectedProfile?.id ?? '',
    selected_device_instance_id: selectedDeviceInstanceId,
    profiles,
    device_instances: ensureSinglePrimaryPerSchema(profiles, deviceInstances),
  };
};

const migrateLegacySettingsV2 = (
  raw: LegacyEquipmentSettingsV2,
  schemas: DeviceSchema[],
): EquipmentSettingsV3 => {
  const legacyProfiles = normalizeLegacyProfileList(raw.profiles, schemas);
  const legacyDevices = normalizeLegacyDevices(raw.devices, schemas);
  const { profiles, deviceInstances } = buildProfilesAndInstancesFromLegacy(legacyProfiles, legacyDevices, schemas);
  const selectedProfile = resolveSelectedProfile(profiles, raw.selected_profile_id);
  const selectedDeviceInstanceId = resolveSelectedDeviceInstanceId(raw.selected_device_id, selectedProfile, deviceInstances);

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_profile_id: selectedProfile?.id ?? '',
    selected_device_instance_id: selectedDeviceInstanceId,
    profiles,
    device_instances: ensureSinglePrimaryPerSchema(profiles, deviceInstances),
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

export const createDefaultEquipmentSettings = (schemas = loadDeviceSchemas()): EquipmentSettingsV3 => {
  const legacyProfiles = createDefaultLegacyProfiles(schemas);
  const legacyDevices = Object.fromEntries(
    schemas.map((schema) => [schema.id, createDefaultDeviceConfig(schema)]),
  ) as Record<string, DeviceConfig>;

  return migrateLegacySettingsV2(
    {
      schema_version: 2,
      selected_profile_id: legacyProfiles[0]?.id ?? '',
      selected_device_id: legacyProfiles[0]?.device_ids[0] ?? '',
      profiles: legacyProfiles,
      devices: legacyDevices,
    },
    schemas,
  );
};

const normalizeDeviceInstances = (
  rawDeviceInstances: unknown,
  schemas: DeviceSchema[],
): Record<string, DeviceInstance> => {
  const source = isRecord(rawDeviceInstances) ? rawDeviceInstances : {};
  const knownSchemaIds = new Set(schemas.map((schema) => schema.id));
  const schemaById = new Map(schemas.map((schema) => [schema.id, schema]));
  const usedIds = new Set<string>();
  const result: Record<string, DeviceInstance> = {};

  for (const [entryId, entryValue] of Object.entries(source)) {
    if (!isRecord(entryValue)) continue;

    const schemaId = normalizeText(entryValue.schema_id);
    if (!schemaId || !knownSchemaIds.has(schemaId)) continue;

    const schema = schemaById.get(schemaId);
    if (!schema) continue;

    const requestedId = normalizeText(entryValue.id) || normalizeText(entryId);
    const id = ensureUniqueId(requestedId, usedIds, createDeviceInstanceId);
    const name = normalizeText(entryValue.name);
    const isPrimary = parseBooleanWithFallback(entryValue.is_primary, false);

    result[id] = {
      id,
      schema_id: schemaId,
      ...(name ? { name } : {}),
      config: normalizeDeviceConfig(schema, entryValue.config),
      is_primary: isPrimary,
    };
  }

  return result;
};

export const normalizeEquipmentSettings = (raw: unknown, schemas = loadDeviceSchemas()): EquipmentSettingsV3 => {
  const base = createDefaultEquipmentSettings(schemas);
  if (!isRecord(raw)) return base;

  if (raw.schema_version === 1) {
    return migrateLegacySettingsV1(raw as LegacyEquipmentSettingsV1, schemas);
  }

  if (raw.schema_version === 2) {
    return migrateLegacySettingsV2(raw as LegacyEquipmentSettingsV2, schemas);
  }

  if (raw.schema_version !== EQUIPMENT_SETTINGS_SCHEMA_VERSION) {
    return base;
  }

  const deviceInstances = normalizeDeviceInstances(raw.device_instances, schemas);
  if (Object.keys(deviceInstances).length === 0) return base;

  const profiles = normalizeProfileList(raw.profiles, deviceInstances);
  if (profiles.length === 0) return base;

  const selectedProfile = resolveSelectedProfile(profiles, raw.selected_profile_id);
  const selectedDeviceInstanceId = resolveSelectedDeviceInstanceId(
    raw.selected_device_instance_id ?? raw.selected_device_id,
    selectedProfile,
    deviceInstances,
  );

  return {
    schema_version: EQUIPMENT_SETTINGS_SCHEMA_VERSION,
    selected_profile_id: selectedProfile?.id ?? base.selected_profile_id,
    selected_device_instance_id: selectedDeviceInstanceId || base.selected_device_instance_id,
    profiles,
    device_instances: ensureSinglePrimaryPerSchema(profiles, deviceInstances),
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

    // GNSS-COM manual mode requires selecting any non-empty real port name/path.
    if (schema.id === 'gnss-com' && field.key === 'comPort') {
      if (String(value ?? '').trim().length === 0) {
        errors[field.key] = 'Выберите COM-порт';
      }
      continue;
    }

    const validationError = validateFieldValue(field, value);
    if (validationError) {
      errors[field.key] = validationError;
    }
  }

  return errors;
};

const pickPrimaryInstanceForSchema = (
  profile: EquipmentProfile,
  settings: EquipmentSettingsV3,
  schemaId: string,
): DeviceInstance | null => {
  const candidates = profile.device_instance_ids
    .map((instanceId) => settings.device_instances[instanceId])
    .filter((instance): instance is DeviceInstance => Boolean(instance) && instance.schema_id === schemaId);

  if (candidates.length === 0) return null;
  return candidates.find((instance) => instance.is_primary) ?? candidates[0];
};

export const buildEquipmentRuntime = (
  settings: EquipmentSettingsV3,
  schemas = loadDeviceSchemas(),
): EquipmentRuntimeV3 => {
  const activeProfile = settings.profiles.find((profile) => profile.id === settings.selected_profile_id) ?? null;

  const activeDeviceIds = activeProfile
    ? Array.from(
        new Set(
          activeProfile.device_instance_ids
            .map((instanceId) => settings.device_instances[instanceId]?.schema_id)
            .filter((schemaId): schemaId is string => Boolean(schemaId)),
        ),
      )
    : [];

  const runtime: EquipmentRuntimeV3 = {
    schema_version: 3,
    active_profile: activeProfile
      ? {
          id: activeProfile.id,
          name: activeProfile.name,
          device_ids: activeDeviceIds,
          device_instance_ids: [...activeProfile.device_instance_ids],
        }
      : null,
  };

  if (!activeProfile) return runtime;

  const zimaInstance = pickPrimaryInstanceForSchema(activeProfile, settings, 'zima2r');
  if (zimaInstance) {
    const zimaSchema = schemas.find((schema) => schema.id === 'zima2r');
    if (zimaSchema) {
      const zimaConfig = zimaInstance.config ?? {};
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
        instance_id: zimaInstance.id,
        instance_name: zimaInstance.name ?? null,
      };
    }
  }

  const gnssInstance = pickPrimaryInstanceForSchema(activeProfile, settings, 'gnss-udp');
  if (gnssInstance) {
    const gnssSchema = schemas.find((schema) => schema.id === 'gnss-udp');
    if (gnssSchema) {
      const gnssConfig = gnssInstance.config ?? {};
      const defaultIp = String(readSchemaFieldDefault(gnssSchema, 'ipAddress', '127.0.0.1'));
      const defaultDataPort = parseIntWithFallback(readSchemaFieldDefault(gnssSchema, 'dataPort', 28128), 28128);

      runtime.gnss_udp = {
        interface: 'udp',
        protocol: 'nmea0183',
        ipAddress: String(gnssConfig.ipAddress ?? defaultIp).trim() || defaultIp,
        dataPort: parseIntWithFallback(gnssConfig.dataPort, defaultDataPort),
        instance_id: gnssInstance.id,
        instance_name: gnssInstance.name ?? null,
      };
    }
  }

  const gnssComInstance = pickPrimaryInstanceForSchema(activeProfile, settings, 'gnss-com');
  if (gnssComInstance) {
    const gnssComSchema = schemas.find((schema) => schema.id === 'gnss-com');
    if (gnssComSchema) {
      const gnssComConfig = gnssComInstance.config ?? {};
      const defaultAutoDetectPort = readSchemaBooleanDefault(gnssComSchema, 'autoDetectPort', true);
      const defaultComPort = String(readSchemaFieldDefault(gnssComSchema, 'comPort', '')).trim();
      const defaultBaudRate = parseIntWithFallback(readSchemaFieldDefault(gnssComSchema, 'baudRate', 115200), 115200);

      runtime.gnss_com = {
        interface: 'serial',
        protocol: 'nmea0183',
        autoDetectPort: parseBooleanWithFallback(gnssComConfig.autoDetectPort, defaultAutoDetectPort),
        comPort: String(gnssComConfig.comPort ?? defaultComPort).trim(),
        baudRate: parseIntWithFallback(gnssComConfig.baudRate, defaultBaudRate),
        instance_id: gnssComInstance.id,
        instance_name: gnssComInstance.name ?? null,
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
): Promise<EquipmentSettingsV3> => {
  const raw = await settingsBridge.readJson<unknown>(EQUIPMENT_SETTINGS_STORAGE_KEY);
  return normalizeEquipmentSettings(raw, schemas);
};

export const writeEquipmentSettings = async (
  settingsBridge: SettingsBridge,
  raw: unknown,
  schemas = loadDeviceSchemas(),
): Promise<{ settings: EquipmentSettingsV3; runtime: EquipmentRuntimeV3 }> => {
  const settings = normalizeEquipmentSettings(raw, schemas);
  const runtime = buildEquipmentRuntime(settings, schemas);

  await settingsBridge.writeJson(EQUIPMENT_SETTINGS_STORAGE_KEY, settings);
  await settingsBridge.writeJson(EQUIPMENT_RUNTIME_STORAGE_KEY, runtime);
  emitDeviceChanged({ settings, runtime });

  return { settings, runtime };
};
