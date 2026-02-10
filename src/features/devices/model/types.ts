export const EQUIPMENT_SETTINGS_SCHEMA_VERSION = 1 as const;
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

export type EquipmentSettingsV1 = {
  schema_version: typeof EQUIPMENT_SETTINGS_SCHEMA_VERSION;
  selected_device_id: string;
  devices: Record<string, DeviceConfig>;
};

export type EquipmentRuntimeV1 = {
  schema_version: 1;
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
};

export type DeviceChangedPayload = {
  settings: EquipmentSettingsV1;
  runtime: EquipmentRuntimeV1;
};
