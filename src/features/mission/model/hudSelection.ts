type HudData = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  depth: number;
};

type TelemetryState = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  depth: number;
};

type BaseStationTelemetryState = TelemetryState | null;

type ResolveSelectedAgentHudDataParams = {
  selectedAgentId: string | null;
  selectedAgentTelemetryKey: string;
  baseStationAgentId: string;
  baseStationTelemetry: BaseStationTelemetryState;
  diverTelemetryById: Record<string, TelemetryState>;
  defaultHudData: HudData;
};

type ResolveHasSelectedAgentTelemetryParams = {
  selectedAgentId: string | null;
  selectedAgentTelemetryKey: string;
  baseStationAgentId: string;
  baseStationTelemetry: BaseStationTelemetryState;
  diverTelemetryById: Record<string, TelemetryState>;
};

export const resolveSelectedAgentHudData = ({
  selectedAgentId,
  selectedAgentTelemetryKey,
  baseStationAgentId,
  baseStationTelemetry,
  diverTelemetryById,
  defaultHudData,
}: ResolveSelectedAgentHudDataParams): HudData => {
  if (!selectedAgentId) return defaultHudData;

  if (selectedAgentId === baseStationAgentId) {
    if (!baseStationTelemetry) return defaultHudData;
    return {
      lat: baseStationTelemetry.lat,
      lon: baseStationTelemetry.lon,
      speed: baseStationTelemetry.speed,
      course: Math.round(baseStationTelemetry.course),
      depth: baseStationTelemetry.depth,
    };
  }

  if (!selectedAgentTelemetryKey) return defaultHudData;
  const telemetry = diverTelemetryById[selectedAgentTelemetryKey];
  if (!telemetry) return defaultHudData;
  return {
    lat: telemetry.lat,
    lon: telemetry.lon,
    speed: telemetry.speed,
    course: Math.round(telemetry.course),
    depth: telemetry.depth,
  };
};

export const resolveHasSelectedAgentTelemetry = ({
  selectedAgentId,
  selectedAgentTelemetryKey,
  baseStationAgentId,
  baseStationTelemetry,
  diverTelemetryById,
}: ResolveHasSelectedAgentTelemetryParams): boolean => {
  if (!selectedAgentId) return false;
  if (selectedAgentId === baseStationAgentId) return baseStationTelemetry !== null;
  if (!selectedAgentTelemetryKey) return false;
  return selectedAgentTelemetryKey in diverTelemetryById;
};

