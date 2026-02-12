import type { MissionDocument, TrackPoint } from './types';

export type TrackRecorderStatus = 'recording' | 'paused' | 'stopped';

export type TrackRecorderState = {
  mission: MissionDocument | null;
  trackPointsByTrackId: Record<string, TrackPoint[]>;
  /** Per-agent recording status */
  trackStatusByAgentId: Record<string, TrackRecorderStatus>;
  /** @deprecated Single status kept for backward compat in UI that hasn't migrated */
  trackStatus: TrackRecorderStatus;
  segmentByTrackId: Record<string, number>;
};

export type TrackFixPayload = {
  lat: number;
  lon: number;
  speed: number;
  course: number;
  depth: number;
  timestamp?: string;
};

export type TrackRecorderEvent =
  | { type: 'hydrate'; mission: MissionDocument | null; trackPointsByTrackId: Record<string, TrackPoint[]>; trackStatusByAgentId?: Record<string, TrackRecorderStatus> }
  | { type: 'start'; agentId: string; timestamp?: string }
  | { type: 'pause'; agentId: string; timestamp?: string }
  | { type: 'resume'; agentId: string; timestamp?: string }
  | { type: 'stop'; agentId: string; timestamp?: string }
  | { type: 'stopAll'; timestamp?: string }
  | { type: 'deleteTrack'; trackId: string }
  | { type: 'fixReceived'; agentId: string; fix: TrackFixPayload }
  | { type: 'connectionRestored'; agentId: string };

const nowIso = (): string => new Date().toISOString();

const createTrackId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const toSegmentId = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value as number));
};

const buildSegmentMap = (
  mission: MissionDocument | null,
  trackPointsByTrackId: Record<string, TrackPoint[]>,
): Record<string, number> => {
  if (!mission) return {};
  const segmentByTrackId: Record<string, number> = {};
  for (const track of mission.tracks) {
    const points = trackPointsByTrackId[track.id] ?? [];
    const maxSegment = points.reduce((max, point) => Math.max(max, toSegmentId(point.segment_id)), 1);
    segmentByTrackId[track.id] = maxSegment;
  }
  return segmentByTrackId;
};

/** Derive per-agent status from mission active_tracks */
const deriveStatusByAgentId = (
  mission: MissionDocument | null,
  explicit?: Record<string, TrackRecorderStatus>,
): Record<string, TrackRecorderStatus> => {
  if (explicit && Object.keys(explicit).length > 0) return explicit;
  if (!mission) return {};
  const result: Record<string, TrackRecorderStatus> = {};
  for (const [agentId, trackId] of Object.entries(mission.active_tracks)) {
    if (trackId) {
      result[agentId] = 'recording';
    }
  }
  return result;
};

/** Derive legacy single trackStatus from per-agent statuses */
const deriveLegacyStatus = (statusByAgentId: Record<string, TrackRecorderStatus>): TrackRecorderStatus => {
  const statuses = Object.values(statusByAgentId);
  if (statuses.includes('recording')) return 'recording';
  if (statuses.includes('paused')) return 'paused';
  return 'stopped';
};

const safeAgentPrefix = (agentId: string): string => {
  const sanitized = agentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return sanitized || 'unknown';
};

export const createTrackRecorderState = (
  mission: MissionDocument | null,
  trackPointsByTrackId: Record<string, TrackPoint[]>,
  trackStatusByAgentId?: Record<string, TrackRecorderStatus>,
): TrackRecorderState => {
  const derived = deriveStatusByAgentId(mission, trackStatusByAgentId);
  return {
    mission,
    trackPointsByTrackId,
    trackStatusByAgentId: derived,
    trackStatus: deriveLegacyStatus(derived),
    segmentByTrackId: buildSegmentMap(mission, trackPointsByTrackId),
  };
};

const ensureRecordingForAgent = (state: TrackRecorderState, agentId: string, timestamp?: string): TrackRecorderState => {
  if (!state.mission) return state;

  // Check if this agent already has an active track
  const existingTrackId = state.mission.active_tracks[agentId];
  if (existingTrackId) {
    const nextStatusByAgentId = {
      ...state.trackStatusByAgentId,
      [agentId]: 'recording' as TrackRecorderStatus,
    };
    return {
      ...state,
      trackStatusByAgentId: nextStatusByAgentId,
      trackStatus: deriveLegacyStatus(nextStatusByAgentId),
      segmentByTrackId: {
        ...state.segmentByTrackId,
        [existingTrackId]: toSegmentId(state.segmentByTrackId[existingTrackId]),
      },
    };
  }

  const startedAt = timestamp ?? nowIso();
  const agentTracks = state.mission.tracks.filter((t) => t.agent_id === agentId);
  const nextIndex = agentTracks.length + 1;
  const id = createTrackId();
  const prefix = safeAgentPrefix(agentId);
  const file = `tracks/${prefix}-track-${String(nextIndex).padStart(4, '0')}.csv`;

  const nextActiveTracks = { ...state.mission.active_tracks, [agentId]: id };
  const nextStatusByAgentId = {
    ...state.trackStatusByAgentId,
    [agentId]: 'recording' as TrackRecorderStatus,
  };

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: null,
      active_tracks: nextActiveTracks,
      tracks: [
        ...state.mission.tracks,
        {
          id,
          agent_id: agentId,
          file,
          started_at: startedAt,
          ended_at: null,
          note: null,
        },
      ],
    },
    trackStatusByAgentId: nextStatusByAgentId,
    trackStatus: deriveLegacyStatus(nextStatusByAgentId),
    segmentByTrackId: {
      ...state.segmentByTrackId,
      [id]: 1,
    },
  };
};

const closeAgentTrack = (
  state: TrackRecorderState,
  agentId: string,
  nextAgentStatus: TrackRecorderStatus,
  timestamp?: string,
): TrackRecorderState => {
  if (!state.mission) {
    const nextStatusByAgentId = { ...state.trackStatusByAgentId, [agentId]: nextAgentStatus };
    return { ...state, trackStatusByAgentId: nextStatusByAgentId, trackStatus: deriveLegacyStatus(nextStatusByAgentId) };
  }

  const activeTrackId = state.mission.active_tracks[agentId];
  if (!activeTrackId) {
    const nextStatusByAgentId = { ...state.trackStatusByAgentId, [agentId]: nextAgentStatus };
    return { ...state, trackStatusByAgentId: nextStatusByAgentId, trackStatus: deriveLegacyStatus(nextStatusByAgentId) };
  }

  const endedAt = timestamp ?? nowIso();
  const { [agentId]: _removed, ...remainingActiveTracks } = state.mission.active_tracks;
  const nextStatusByAgentId = { ...state.trackStatusByAgentId, [agentId]: nextAgentStatus };

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: null,
      active_tracks: remainingActiveTracks,
      tracks: state.mission.tracks.map((track) =>
        track.id === activeTrackId
          ? { ...track, ended_at: track.ended_at ?? endedAt }
          : track,
      ),
    },
    trackStatusByAgentId: nextStatusByAgentId,
    trackStatus: deriveLegacyStatus(nextStatusByAgentId),
  };
};

const stopAllAgents = (state: TrackRecorderState, timestamp?: string): TrackRecorderState => {
  if (!state.mission) return state;

  const endedAt = timestamp ?? nowIso();
  const activeTrackIds = new Set(Object.values(state.mission.active_tracks));
  const nextStatusByAgentId: Record<string, TrackRecorderStatus> = {};
  for (const agentId of Object.keys(state.trackStatusByAgentId)) {
    nextStatusByAgentId[agentId] = 'stopped';
  }

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: null,
      active_tracks: {},
      tracks: state.mission.tracks.map((track) =>
        activeTrackIds.has(track.id)
          ? { ...track, ended_at: track.ended_at ?? endedAt }
          : track,
      ),
    },
    trackStatusByAgentId: nextStatusByAgentId,
    trackStatus: 'stopped',
  };
};

const appendFix = (state: TrackRecorderState, agentId: string, fix: TrackFixPayload): TrackRecorderState => {
  if (!state.mission) return state;

  const activeTrackId = state.mission.active_tracks[agentId];
  if (!activeTrackId || state.trackStatusByAgentId[agentId] !== 'recording') {
    return state;
  }

  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) {
    return state;
  }

  const segmentId = toSegmentId(state.segmentByTrackId[activeTrackId]);
  const trackPoints = state.trackPointsByTrackId[activeTrackId] ?? [];

  const point: TrackPoint = {
    timestamp: fix.timestamp ?? nowIso(),
    lat: fix.lat,
    lon: fix.lon,
    segment_id: segmentId,
    depth_m: fix.depth,
    sog_mps: fix.speed,
    cog_deg: fix.course,
  };

  return {
    ...state,
    trackPointsByTrackId: {
      ...state.trackPointsByTrackId,
      [activeTrackId]: [...trackPoints, point],
    },
    segmentByTrackId: {
      ...state.segmentByTrackId,
      [activeTrackId]: segmentId,
    },
  };
};

const incrementSegment = (state: TrackRecorderState, agentId: string): TrackRecorderState => {
  if (!state.mission) return state;

  const activeTrackId = state.mission.active_tracks[agentId];
  if (!activeTrackId || state.trackStatusByAgentId[agentId] !== 'recording') {
    return state;
  }

  return {
    ...state,
    segmentByTrackId: {
      ...state.segmentByTrackId,
      [activeTrackId]: toSegmentId(state.segmentByTrackId[activeTrackId]) + 1,
    },
  };
};

const deleteTrack = (state: TrackRecorderState, trackId: string): TrackRecorderState => {
  if (!state.mission) return state;
  const track = state.mission.tracks.find((t) => t.id === trackId);
  if (!track) return state;

  // Find which agent owns this track
  const ownerAgentId = track.agent_id;
  const isActive = ownerAgentId
    ? state.mission.active_tracks[ownerAgentId] === trackId
    : state.mission.active_track_id === trackId;

  const { [trackId]: _removedPoints, ...nextTrackPointsByTrackId } = state.trackPointsByTrackId;
  const { [trackId]: _removedSegment, ...nextSegmentByTrackId } = state.segmentByTrackId;

  let nextActiveTracks = { ...state.mission.active_tracks };
  const nextStatusByAgentId = { ...state.trackStatusByAgentId };

  if (isActive && ownerAgentId) {
    const { [ownerAgentId]: _removed, ...remaining } = nextActiveTracks;
    nextActiveTracks = remaining;
    nextStatusByAgentId[ownerAgentId] = 'stopped';
  }

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: isActive && !ownerAgentId ? null : state.mission.active_track_id,
      active_tracks: nextActiveTracks,
      tracks: state.mission.tracks.filter((t) => t.id !== trackId),
    },
    trackPointsByTrackId: nextTrackPointsByTrackId,
    segmentByTrackId: nextSegmentByTrackId,
    trackStatusByAgentId: nextStatusByAgentId,
    trackStatus: deriveLegacyStatus(nextStatusByAgentId),
  };
};

export const trackRecorderReduce = (
  state: TrackRecorderState,
  event: TrackRecorderEvent,
): TrackRecorderState => {
  switch (event.type) {
    case 'hydrate':
      return createTrackRecorderState(event.mission, event.trackPointsByTrackId, event.trackStatusByAgentId);
    case 'start':
      return ensureRecordingForAgent(state, event.agentId, event.timestamp);
    case 'resume':
      return ensureRecordingForAgent(state, event.agentId, event.timestamp);
    case 'pause':
      return closeAgentTrack(state, event.agentId, 'paused', event.timestamp);
    case 'stop':
      return closeAgentTrack(state, event.agentId, 'stopped', event.timestamp);
    case 'stopAll':
      return stopAllAgents(state, event.timestamp);
    case 'deleteTrack':
      return deleteTrack(state, event.trackId);
    case 'fixReceived':
      return appendFix(state, event.agentId, event.fix);
    case 'connectionRestored':
      return incrementSegment(state, event.agentId);
    default:
      return state;
  }
};
