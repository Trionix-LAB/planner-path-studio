export const EQUIPMENT_SETTINGS_SCHEMA_VERSION = 2 as const;
export const EQUIPMENT_SETTINGS_STORAGE_KEY = 'planner.equipmentSettings.v1';
export const EQUIPMENT_RUNTIME_STORAGE_KEY = 'planner.equipmentRuntime.v1';
export const DEVICE_CHANGED_EVENT = 'device:changed';

export type DeviceInputForm = 'text-line' | 'number' | 'boolean' | 'select';
export type DeviceValidationType = 'none' | 'ip' | 'port' | 'number';

export type DeviceFieldOption = {
  label: string;
  value: string;
};

export type DeviceFieldSchema = {
  key: string;
  label: string;
  description?: string;
  inputForm: DeviceInputForm;
  inputMask?: string;
  enabledBy?: string;
  defaultValue: string | number | boolean;
  options?: DeviceFieldOption[];
  validation: {
    type: DeviceValidationType;
    min?: number;
    max?: number;
    integer?: boolean;
  };
};

export type DeviceSchema = {
  id: string;
  title: string;
  fields: DeviceFieldSchema[];
};

export type DeviceConfig = Record<string, string | number | boolean>;

export type EquipmentProfile = {
  id: string;
  name: string;
  device_ids: string[];
};

export type EquipmentSettingsV2 = {
  schema_version: typeof EQUIPMENT_SETTINGS_SCHEMA_VERSION;
  selected_profile_id: string;
  selected_device_id: string;
  profiles: EquipmentProfile[];
  devices: Record<string, DeviceConfig>;
};

export type EquipmentRuntimeV2 = {
  schema_version: 2;
  active_profile: {
    id: string;
    name: string;
    device_ids: string[];
  } | null;
  zima?: {
    interface: 'udp';
    ipAddress: string;
    commandPort: number;
    dataPort: number;
    gnssBaud: number;
    useExternalGnss: boolean;
    useCommandPort: boolean;
    latitude: number | null;
    longitude: number | null;
    azimuth: number | null;
  };
  gnss_udp?: {
    interface: 'udp';
    protocol: 'nmea0183';
    ipAddress: string;
    dataPort: number;
  };
};

export type DeviceChangedPayload = {
  settings: EquipmentSettingsV2;
  runtime: EquipmentRuntimeV2;
};
