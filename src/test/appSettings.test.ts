import { describe, expect, it } from 'vitest';
import { createDefaultAppSettings, mergeDefaultsWithMissionUi, normalizeAppSettings } from '@/features/settings';

describe('app settings', () => {
  it('normalizes missing settings to defaults', () => {
    const settings = normalizeAppSettings(null);
    expect(settings.schema_version).toBe(1);
    expect(settings.defaults.coordinates.precision).toBe(6);
    expect(settings.defaults.layers.scale_bar).toBe(true);
    expect(settings.defaults.layers.base_station).toBe(true);
    expect(settings.defaults.measurements.grid.line_style).toBe('dashed');
    expect(settings.defaults.connection.host).toBe('localhost');
    expect(settings.defaults.connection.port).toBe(9000);
  });

  it('clamps invalid numeric settings', () => {
    const raw = {
      schema_version: 1,
      defaults: {
        connection: { host: '', port: 99999 },
        coordinates: { precision: 999 },
        styles: {
          track: { width_px: 0 },
          survey_area: { fill_opacity: 5 },
        },
        measurements: { grid: { mode: 'manual', step_m: -10 } },
      },
    };
    const normalized = normalizeAppSettings(raw);
    expect(normalized.defaults.coordinates.precision).toBe(12);
    expect(normalized.defaults.styles.track.width_px).toBe(1);
    expect(normalized.defaults.styles.survey_area.fill_opacity).toBe(1);
    expect(normalized.defaults.measurements.grid.mode).toBe('manual');
    expect(normalized.defaults.measurements.grid.step_m).toBe(1);
    expect(normalized.defaults.measurements.grid.line_style).toBe('dashed');
    expect(normalized.defaults.connection.host).toBe('localhost');
    expect(normalized.defaults.connection.port).toBe(65535);
  });

  it('merges mission ui overrides onto defaults (R-046)', () => {
    const defaults = createDefaultAppSettings().defaults;
    const effective = mergeDefaultsWithMissionUi(defaults, {
      follow_diver: false,
      layers: { grid: true, scale_bar: false },
      coordinates: { precision: 7 },
      measurements: {
        grid: { mode: 'manual', step_m: 100, color: '#112233', width_px: 2, line_style: 'dotted' },
        segment_lengths_mode: 'always',
      },
      styles: { track: { color: '#112233', width_px: 4 } },
    });
    expect(effective.follow_diver).toBe(false);
    expect(effective.layers.grid).toBe(true);
    expect(effective.layers.scale_bar).toBe(false);
    expect(effective.layers.base_station).toBe(true);
    expect(effective.coordinates.precision).toBe(7);
    expect(effective.measurements.grid.mode).toBe('manual');
    expect(effective.measurements.grid.step_m).toBe(100);
    expect(effective.measurements.grid.color).toBe('#112233');
    expect(effective.measurements.grid.width_px).toBe(2);
    expect(effective.measurements.grid.line_style).toBe('dotted');
    expect(effective.measurements.segment_lengths_mode).toBe('always');
    expect(effective.styles.track.color).toBe('#112233');
    expect(effective.styles.track.width_px).toBe(4);
  });
});
