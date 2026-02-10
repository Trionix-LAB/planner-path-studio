import { describe, expect, it } from 'vitest';
import {
  buildEquipmentRuntime,
  createDefaultEquipmentSettings,
  loadDeviceSchemas,
  normalizeEquipmentSettings,
  validateDeviceConfig,
} from '@/features/devices';

describe('equipment settings', () => {
  it('normalizes raw settings to schema defaults', () => {
    const schemas = loadDeviceSchemas();
    const normalized = normalizeEquipmentSettings(
      {
        schema_version: 1,
        selected_device_id: 'unknown-device',
        devices: {
          zima2r: {
            ipAddress: '10.0.0.3',
          },
        },
      },
      schemas,
    );

    expect(normalized.selected_device_id).toBe('zima2r');
    expect(normalized.devices.zima2r.ipAddress).toBe('10.0.0.3');
    expect(normalized.devices.zima2r.commandPort).toBe('28128');
    expect(normalized.devices.zima2r.dataPort).toBe('28127');
    expect(normalized.devices.zima2r.gnssBaud).toBe('115200');
    expect(normalized.devices.zima2r.useExternalGnss).toBe(false);
    expect(normalized.devices.zima2r.useCommandPort).toBe(false);
    expect(normalized.devices.zima2r.latitude).toBe('');
    expect(normalized.devices.zima2r.longitude).toBe('');
    expect(normalized.devices.zima2r.azimuth).toBe('');
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

  it('builds runtime zima config with numeric ports', () => {
    const schemas = loadDeviceSchemas();
    const base = createDefaultEquipmentSettings(schemas);
    const runtime = buildEquipmentRuntime(
      {
        ...base,
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
        },
      },
      schemas,
    );

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
  });
});
