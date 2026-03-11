import { describe, expect, it } from 'vitest';
import { resolveHasSelectedAgentTelemetry, resolveSelectedAgentHudData } from '@/features/mission/model/hudSelection';

const DEFAULT_HUD_DATA = {
  lat: 1,
  lon: 2,
  speed: 3,
  course: 4,
  depth: 5,
};

describe('hud selection helpers', () => {
  it('returns default data and false telemetry when no agent is selected', () => {
    const hudData = resolveSelectedAgentHudData({
      selectedAgentId: null,
      selectedAgentTelemetryKey: '',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: null,
      diverTelemetryById: {
        diver1: { lat: 10, lon: 20, speed: 1.1, course: 45.4, depth: 9 },
      },
      defaultHudData: DEFAULT_HUD_DATA,
    });
    const hasTelemetry = resolveHasSelectedAgentTelemetry({
      selectedAgentId: null,
      selectedAgentTelemetryKey: '',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: null,
      diverTelemetryById: {
        diver1: { lat: 10, lon: 20, speed: 1.1, course: 45.4, depth: 9 },
      },
    });

    expect(hudData).toEqual(DEFAULT_HUD_DATA);
    expect(hasTelemetry).toBe(false);
  });

  it('uses base station telemetry when base station is selected', () => {
    const hudData = resolveSelectedAgentHudData({
      selectedAgentId: 'base-station',
      selectedAgentTelemetryKey: 'ignored',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: { lat: 11, lon: 22, speed: 3.3, course: 124.6, depth: 7.5 },
      diverTelemetryById: {},
      defaultHudData: DEFAULT_HUD_DATA,
    });
    const hasTelemetry = resolveHasSelectedAgentTelemetry({
      selectedAgentId: 'base-station',
      selectedAgentTelemetryKey: 'ignored',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: { lat: 11, lon: 22, speed: 3.3, course: 124.6, depth: 7.5 },
      diverTelemetryById: {},
    });

    expect(hudData).toEqual({ lat: 11, lon: 22, speed: 3.3, course: 125, depth: 7.5 });
    expect(hasTelemetry).toBe(true);
  });

  it('returns default and false when selected diver telemetry key is missing (stale selection)', () => {
    const hudData = resolveSelectedAgentHudData({
      selectedAgentId: 'agent-2',
      selectedAgentTelemetryKey: '',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: null,
      diverTelemetryById: {
        diver1: { lat: 10, lon: 20, speed: 1.1, course: 45.4, depth: 9 },
      },
      defaultHudData: DEFAULT_HUD_DATA,
    });
    const hasTelemetry = resolveHasSelectedAgentTelemetry({
      selectedAgentId: 'agent-2',
      selectedAgentTelemetryKey: '',
      baseStationAgentId: 'base-station',
      baseStationTelemetry: null,
      diverTelemetryById: {
        diver1: { lat: 10, lon: 20, speed: 1.1, course: 45.4, depth: 9 },
      },
    });

    expect(hudData).toEqual(DEFAULT_HUD_DATA);
    expect(hasTelemetry).toBe(false);
  });
});

