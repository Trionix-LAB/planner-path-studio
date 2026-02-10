import { describe, expect, it } from 'vitest';
import { createDefaultDeviceConfig, loadDeviceSchemas } from '@/features/devices';

describe('device schema loader', () => {
  it('loads zima2r schema from file', () => {
    const schemas = loadDeviceSchemas();
    const zima = schemas.find((schema) => schema.id === 'zima2r');

    expect(zima).toBeTruthy();
    expect(zima?.title).toBe('Zima2R');
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
    expect(commandPortField?.enabledBy).toBe('useCommandPort');
    expect(gnssBaudField?.enabledBy).toBe('useExternalGnss');
    expect(latitudeField?.enabledBy).toBe('!useExternalGnss');
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
      latitude: '',
      longitude: '',
      azimuth: '',
    });
  });
});
