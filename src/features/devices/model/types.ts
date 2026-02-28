export const EQUIPMENT_SETTINGS_SCHEMA_VERSION = 3 as const;
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
  sectionTitle?: string;
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
    allowEmpty?: boolean;
  };
};

export type DeviceSchema = {
  id: string;
  title: string;
  fields: DeviceFieldSchema[];
};

export type DeviceConfig = Record<string, string | number | boolean>;

export type DeviceInstance = {
  id: string;
  schema_id: string;
  name?: string;
  config: DeviceConfig;
  is_primary?: boolean;
};

export type EquipmentProfile = {
  id: string;
  name: string;
  device_instance_ids: string[];
};

export type EquipmentSettingsV3 = {
  schema_version: typeof EQUIPMENT_SETTINGS_SCHEMA_VERSION;
  selected_profile_id: string;
  selected_device_instance_id: string;
  profiles: EquipmentProfile[];
  device_instances: Record<string, DeviceInstance>;
};

export type EquipmentRuntimeV3 = {
  schema_version: 3;
  active_profile: {
    id: string;
    name: string;
    device_ids: string[];
    device_instance_ids: string[];
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
    instance_id: string;
    instance_name: string | null;
  };
  gnss_udp?: {
    interface: 'udp';
    protocol: 'nmea0183';
    ipAddress: string;
    dataPort: number;
    instance_id: string;
    instance_name: string | null;
  };
  gnss_com?: {
    interface: 'serial';
    protocol: 'nmea0183';
    autoDetectPort: boolean;
    comPort: string;
    baudRate: number;
    instance_id: string;
    instance_name: string | null;
  };
};

export type DeviceChangedPayload = {
  settings: EquipmentSettingsV3;
  runtime: EquipmentRuntimeV3;
};

export type DeviceValidationIssue = {
  schemaId: string;
  schemaTitle: string;
  sectionTitle?: string;
  fieldKey: string;
  fieldLabel: string;
  message: string;
  summary: string;
  instanceId?: string;
  instanceName?: string;
};
