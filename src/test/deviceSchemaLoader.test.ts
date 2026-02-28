import { describe, expect, it } from 'vitest';
import { createDefaultDeviceConfig, loadDeviceSchemas } from '@/features/devices';

describe('device schema loader', () => {
  it('loads zima2r, gnss-udp and gnss-com schemas from files', () => {
    const schemas = loadDeviceSchemas();
    const zima = schemas.find((schema) => schema.id === 'zima2r');
    const gnss = schemas.find((schema) => schema.id === 'gnss-udp');
    const gnssCom = schemas.find((schema) => schema.id === 'gnss-com');

    expect(zima).toBeTruthy();
    expect(gnss).toBeTruthy();
    expect(gnssCom).toBeTruthy();
    expect(zima?.title).toBe('Zima2R');
    expect(gnss?.title).toBe('GNSS-UDP');
    expect(gnssCom?.title).toBe('GNSS-COM');
    expect(zima?.fields.map((field) => field.key)).toEqual([
      'ipAddress',
      'commandPort',
      'dataPort',
      'gnssBaud',
      'useExternalGnss',
      'useCommandPort',
      'latitude',
      'longitude',
      'azimuth',
    ]);
    expect(zima?.fields[0]?.inputMask).toBe('0.0.0.0');
    const commandPortField = zima?.fields.find((field) => field.key === 'commandPort');
    const gnssBaudField = zima?.fields.find((field) => field.key === 'gnssBaud');
    const latitudeField = zima?.fields.find((field) => field.key === 'latitude');
    const useCommandPortField = zima?.fields.find((field) => field.key === 'useCommandPort');
    expect(commandPortField?.enabledBy).toBe('useCommandPort');
    expect(commandPortField?.validation.type).toBe('port');
    expect(gnssBaudField?.enabledBy).toBe('useExternalGnss');
    expect(latitudeField?.enabledBy).toBe('!useExternalGnss && useCommandPort');
    expect(latitudeField?.validation.allowEmpty).toBeUndefined();
    expect(useCommandPortField?.validation.type).toBe('none');
    expect(gnss?.fields.map((field) => field.key)).toEqual(['ipAddress', 'dataPort']);
    expect(gnssCom?.fields.map((field) => field.key)).toEqual(['autoDetectPort', 'comPort', 'baudRate']);
    const comPortField = gnssCom?.fields.find((field) => field.key === 'comPort');
    const autoDetectPortField = gnssCom?.fields.find((field) => field.key === 'autoDetectPort');
    expect(comPortField?.inputForm).toBe('select');
    expect(comPortField?.enabledBy).toBe('!autoDetectPort');
    expect(comPortField?.validation.type).toBe('none');
    expect(autoDetectPortField?.inputForm).toBe('boolean');
  });

  it('builds default config from schema defaults', () => {
    const zima = loadDeviceSchemas().find((schema) => schema.id === 'zima2r');
    expect(zima).toBeTruthy();

    const defaults = createDefaultDeviceConfig(zima!);
    expect(defaults).toEqual({
      ipAddress: '127.0.0.1',
      commandPort: '28128',
      dataPort: '28127',
      gnssBaud: '115200',
      useExternalGnss: false,
      useCommandPort: false,
      latitude: '48.123456',
      longitude: '44.123456',
      azimuth: '0.0',
    });
  });
});
