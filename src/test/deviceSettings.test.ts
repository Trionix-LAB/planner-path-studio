import { describe, expect, it } from 'vitest';
import {
  buildEquipmentRuntime,
  createDefaultDeviceConfig,
  createDefaultEquipmentSettings,
  describeDeviceConfigErrors,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
  validateDeviceConfig,
} from '@/features/devices';

describe('equipment settings', () => {
  it('migrates legacy schema_version=1 settings to profiles with device instances', () => {
    const schemas = loadDeviceSchemas();
    const normalized = normalizeEquipmentSettings(
      {
        schema_version: 1,
        selected_device_id: 'gnss-udp',
        devices: {
          zima2r: {
            ipAddress: '10.0.0.3',
          },
          'gnss-udp': {
            ipAddress: '10.0.0.10',
          },
        },
      },
      schemas,
    );

    expect(normalized.schema_version).toBe(3);
    expect(normalized.profiles.length).toBeGreaterThan(0);
    expect(normalized.selected_profile_id).toBeTruthy();

    const selectedInstance = normalized.device_instances[normalized.selected_device_instance_id];
    expect(selectedInstance?.schema_id).toBe('gnss-udp');

    const zimaInstance = Object.values(normalized.device_instances).find((instance) => instance.schema_id === 'zima2r');
    const gnssInstance = Object.values(normalized.device_instances).find((instance) => instance.schema_id === 'gnss-udp');

    expect(zimaInstance?.config.ipAddress).toBe('10.0.0.3');
    expect(gnssInstance?.config.ipAddress).toBe('10.0.0.10');
  });

  it('migrates profile-based schema_version=2 settings and keeps selected profile/device valid', () => {
    const schemas = loadDeviceSchemas();
    const normalized = normalizeEquipmentSettings(
      {
        schema_version: 2,
        selected_profile_id: 'missing',
        selected_device_id: 'missing',
        profiles: [
          {
            id: 'custom',
            name: 'Мой профиль',
            device_ids: ['zima2r', 'gnss-udp'],
          },
        ],
        devices: {
          zima2r: { ipAddress: '10.0.0.4' },
          'gnss-udp': { dataPort: '30001' },
        },
      },
      schemas,
    );

    expect(normalized.selected_profile_id).toBe('custom');

    const selectedProfile = normalized.profiles.find((profile) => profile.id === normalized.selected_profile_id);
    expect(selectedProfile?.device_instance_ids.length).toBe(2);

    const selectedInstance = normalized.device_instances[normalized.selected_device_instance_id];
    expect(selectedInstance?.schema_id).toBe('zima2r');

    const zimaInstanceId = selectedProfile?.device_instance_ids.find(
      (instanceId) => normalized.device_instances[instanceId]?.schema_id === 'zima2r',
    );
    const gnssInstanceId = selectedProfile?.device_instance_ids.find(
      (instanceId) => normalized.device_instances[instanceId]?.schema_id === 'gnss-udp',
    );

    expect(zimaInstanceId).toBeTruthy();
    expect(gnssInstanceId).toBeTruthy();
    expect(normalized.device_instances[zimaInstanceId!].config.ipAddress).toBe('10.0.0.4');
    expect(normalized.device_instances[gnssInstanceId!].config.dataPort).toBe('30001');
  });

  it('validates zima2r ip and ports', () => {
    const zimaSchema = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zimaSchema).toBeTruthy();

    const errors = validateDeviceConfig(zimaSchema!, {
      ipAddress: '999.2.3.4',
      commandPort: '70000',
      dataPort: '0',
      gnssBaud: 'abc',
      useExternalGnss: true,
      useCommandPort: true,
      latitude: '59.9',
      longitude: '30.3',
      azimuth: '100',
    });

    expect(errors.ipAddress).toBeTruthy();
    expect(errors.commandPort).toBeTruthy();
    expect(errors.dataPort).toBeTruthy();
    expect(errors.gnssBaud).toBeTruthy();
  });

  it('accepts zima2r defaults from schema without validation errors', () => {
    const zimaSchema = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zimaSchema).toBeTruthy();

    const defaults = createDefaultDeviceConfig(zimaSchema!);
    const errors = validateDeviceConfig(zimaSchema!, defaults);

    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('accepts defaults for all device schemas without validation errors', () => {
    const schemas = loadDeviceSchemas();
    expect(schemas.length).toBeGreaterThan(0);

    for (const schema of schemas) {
      const defaults = createDefaultDeviceConfig(schema);
      const errors = validateDeviceConfig(schema, defaults);
      expect(Object.keys(errors), `${schema.id} should validate defaults`).toHaveLength(0);
    }
  });

  it('validates gnss-udp required fields', () => {
    const gnssUdpSchema = loadDeviceSchemas().find((schema) => schema.id === 'gnss-udp');
    expect(gnssUdpSchema).toBeTruthy();

    const errors = validateDeviceConfig(gnssUdpSchema!, {
      ipAddress: '300.1.2.3',
      dataPort: '65536',
    });

    expect(errors.ipAddress).toContain('IPv4');
    expect(errors.dataPort).toContain('целым числом');
  });

  it('validates gnss-com manual COM number and baud rate', () => {
    const gnssComSchema = loadDeviceSchemas().find((schema) => schema.id === 'gnss-com');
    expect(gnssComSchema).toBeTruthy();

    const invalidManual = validateDeviceConfig(gnssComSchema!, {
      autoDetectPort: false,
      comPort: '',
      baudRate: '0',
    });
    expect(invalidManual.comPort).toContain('Выберите');
    expect(invalidManual.baudRate).toContain('Минимум');

    const validManualPath = validateDeviceConfig(gnssComSchema!, {
      autoDetectPort: false,
      comPort: '/dev/ttyUSB0',
      baudRate: '9600',
    });
    expect(validManualPath.comPort).toBeUndefined();

    const validManualWindows = validateDeviceConfig(gnssComSchema!, {
      autoDetectPort: false,
      comPort: 'COM7',
      baudRate: '38400',
    });
    expect(validManualWindows.comPort).toBeUndefined();
    expect(validManualWindows.baudRate).toBeUndefined();

    const autoModeSkipsComPortValidation = validateDeviceConfig(gnssComSchema!, {
      autoDetectPort: true,
      comPort: 'COM3',
      baudRate: '38400',
    });
    expect(autoModeSkipsComPortValidation.comPort).toBeUndefined();
  });

  it('skips validation for disabled dependent fields', () => {
    const zimaSchema = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zimaSchema).toBeTruthy();

    const errors = validateDeviceConfig(zimaSchema!, {
      ipAddress: '127.0.0.1',
      commandPort: '70000',
      dataPort: '28127',
      gnssBaud: 'abc',
      useExternalGnss: false,
      useCommandPort: false,
      latitude: '',
      longitude: '',
      azimuth: '',
    });

    expect(errors.commandPort).toBeUndefined();
    expect(errors.gnssBaud).toBeUndefined();
  });

  it('requires manual coordinates when command port mode is enabled', () => {
    const zimaSchema = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zimaSchema).toBeTruthy();

    const errors = validateDeviceConfig(zimaSchema!, {
      ipAddress: '127.0.0.1',
      commandPort: '28128',
      dataPort: '28127',
      gnssBaud: '115200',
      useExternalGnss: false,
      useCommandPort: true,
      latitude: '',
      longitude: '',
      azimuth: '',
    });

    expect(errors.latitude).toBe('Введите число');
    expect(errors.longitude).toBe('Введите число');
    expect(errors.azimuth).toBe('Введите число');
  });

  it('builds human-readable validation issues with schema and field context', () => {
    const zimaSchema = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zimaSchema).toBeTruthy();

    const errors = validateDeviceConfig(zimaSchema!, {
      ipAddress: '999.2.3.4',
      commandPort: '28128',
      dataPort: '28127',
      gnssBaud: '115200',
      useExternalGnss: false,
      useCommandPort: false,
      latitude: '',
      longitude: '',
      azimuth: '',
    });
    const issues = describeDeviceConfigErrors(zimaSchema!, errors);

    expect(issues).toHaveLength(1);
    expect(issues[0].fieldKey).toBe('ipAddress');
    expect(issues[0].fieldLabel).toBe('IP-адрес');
    expect(issues[0].schemaTitle).toBe('Zima2R');
    expect(issues[0].summary).toContain('Zima2R');
    expect(issues[0].summary).toContain('IP-адрес');
    expect(issues[0].summary).toContain('Введите корректный IPv4 адрес');
  });

  it('builds runtime for active profile with primary zima and gnss instances', () => {
    const schemas = loadDeviceSchemas();
    const base = createDefaultEquipmentSettings(schemas);
    const profile = base.profiles.find((item) => item.id === 'profile-zima-gnss');
    expect(profile).toBeTruthy();

    const zimaInstanceId = profile?.device_instance_ids.find(
      (instanceId) => base.device_instances[instanceId]?.schema_id === 'zima2r',
    );
    const gnssInstanceId = profile?.device_instance_ids.find(
      (instanceId) => base.device_instances[instanceId]?.schema_id === 'gnss-udp',
    );
    expect(zimaInstanceId).toBeTruthy();
    expect(gnssInstanceId).toBeTruthy();

    const extraGnssInstanceId = 'profile-zima-gnss-gnss-2';

    const runtime = buildEquipmentRuntime(
      {
        ...base,
        selected_profile_id: 'profile-zima-gnss',
        selected_device_instance_id: zimaInstanceId!,
        profiles: base.profiles.map((item) =>
          item.id === 'profile-zima-gnss'
            ? { ...item, device_instance_ids: [...item.device_instance_ids, extraGnssInstanceId] }
            : item,
        ),
        device_instances: {
          ...base.device_instances,
          [zimaInstanceId!]: {
            ...base.device_instances[zimaInstanceId!],
            is_primary: true,
            config: {
              ...base.device_instances[zimaInstanceId!].config,
              ipAddress: '192.168.0.55',
              commandPort: '28131',
              dataPort: '28132',
              gnssBaud: '9600',
              useExternalGnss: true,
              useCommandPort: true,
              latitude: '59.9375',
              longitude: '30.3086',
              azimuth: '120',
            },
          },
          [gnssInstanceId!]: {
            ...base.device_instances[gnssInstanceId!],
            is_primary: false,
            config: {
              ...base.device_instances[gnssInstanceId!].config,
              ipAddress: '192.168.0.1',
              dataPort: '28000',
            },
          },
          [extraGnssInstanceId]: {
            id: extraGnssInstanceId,
            schema_id: 'gnss-udp',
            name: 'GNSS резерв',
            is_primary: true,
            config: {
              ...base.device_instances[gnssInstanceId!].config,
              ipAddress: '192.168.0.99',
              dataPort: '29000',
            },
          },
        },
      },
      schemas,
    );

    expect(runtime.active_profile?.id).toBe('profile-zima-gnss');
    expect(runtime.active_profile?.device_ids).toEqual(['zima2r', 'gnss-udp']);
    expect(runtime.zima).toEqual({
      interface: 'udp',
      ipAddress: '192.168.0.55',
      commandPort: 28131,
      dataPort: 28132,
      gnssBaud: 9600,
      useExternalGnss: true,
      useCommandPort: true,
      latitude: 59.9375,
      longitude: 30.3086,
      azimuth: 120,
      instance_id: zimaInstanceId!,
      instance_name: 'Zima2R',
    });
    expect(runtime.gnss_udp).toEqual({
      interface: 'udp',
      protocol: 'nmea0183',
      ipAddress: '192.168.0.99',
      dataPort: 29000,
      instance_id: extraGnssInstanceId,
      instance_name: 'GNSS резерв',
    });
  });

  it('builds runtime for gnss-com instance with auto port detection', () => {
    const schemas = loadDeviceSchemas();
    const base = createDefaultEquipmentSettings(schemas);
    const profile = base.profiles.find((item) => item.id === 'profile-zima-gnss');
    expect(profile).toBeTruthy();

    const gnssComInstanceId = 'profile-zima-gnss-gnss-com-1';

    const runtime = buildEquipmentRuntime(
      {
        ...base,
        selected_profile_id: 'profile-zima-gnss',
        profiles: base.profiles.map((item) =>
          item.id === 'profile-zima-gnss'
            ? { ...item, device_instance_ids: [...item.device_instance_ids, gnssComInstanceId] }
            : item,
        ),
        device_instances: {
          ...base.device_instances,
          [gnssComInstanceId]: {
            id: gnssComInstanceId,
            schema_id: 'gnss-com',
            name: 'GNSS COM',
            is_primary: true,
            config: {
              autoDetectPort: true,
              comPort: '',
              baudRate: 38400,
            },
          },
        },
      },
      schemas,
    );

    expect(runtime.gnss_com).toEqual({
      interface: 'serial',
      protocol: 'nmea0183',
      autoDetectPort: true,
      comPort: '',
      baudRate: 38400,
      instance_id: gnssComInstanceId,
      instance_name: 'GNSS COM',
    });
  });
});
