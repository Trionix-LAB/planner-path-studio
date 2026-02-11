import { describe, expect, it } from 'vitest';
import {
  buildEquipmentRuntime,
  createDefaultEquipmentSettings,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
  validateDeviceConfig,
} from '@/features/devices';

describe('equipment settings', () => {
  it('migrates legacy schema_version=1 settings to profiles', () => {
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

    expect(normalized.schema_version).toBe(2);
    expect(normalized.profiles.length).toBeGreaterThan(0);
    expect(normalized.selected_profile_id).toBeTruthy();
    expect(normalized.selected_device_id).toBe('gnss-udp');
    expect(normalized.devices.zima2r.ipAddress).toBe('10.0.0.3');
    expect(normalized.devices['gnss-udp'].ipAddress).toBe('10.0.0.10');
  });

  it('normalizes profile-based settings and keeps selected profile/device valid', () => {
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
    expect(normalized.selected_device_id).toBe('zima2r');
    expect(normalized.devices.zima2r.ipAddress).toBe('10.0.0.4');
    expect(normalized.devices['gnss-udp'].dataPort).toBe('30001');
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

  it('builds runtime for active profile with zima and gnss', () => {
    const schemas = loadDeviceSchemas();
    const base = createDefaultEquipmentSettings(schemas);
    const runtime = buildEquipmentRuntime(
      {
        ...base,
        selected_profile_id: 'profile-zima-gnss',
        selected_device_id: 'zima2r',
        devices: {
          ...base.devices,
          zima2r: {
            ...base.devices.zima2r,
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
          'gnss-udp': {
            ...base.devices['gnss-udp'],
            ipAddress: '192.168.0.99',
            dataPort: '29000',
          },
        },
      },
      schemas,
    );

    expect(runtime.active_profile?.id).toBe('profile-zima-gnss');
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
    });
    expect(runtime.gnss_udp).toEqual({
      interface: 'udp',
      protocol: 'nmea0183',
      ipAddress: '192.168.0.99',
      dataPort: 29000,
    });
  });
});
