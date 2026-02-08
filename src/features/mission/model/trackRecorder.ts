import type { MissionDocument, TrackPoint } from './types';

export type TrackRecorderStatus = 'recording' | 'paused' | 'stopped';

export type TrackRecorderState = {
  mission: MissionDocument | null;
  trackPointsByTrackId: Record<string, TrackPoint[]>;
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
  | { type: 'hydrate'; mission: MissionDocument | null; trackPointsByTrackId: Record<string, TrackPoint[]>; trackStatus?: TrackRecorderStatus }
  | { type: 'start'; timestamp?: string }
  | { type: 'pause'; timestamp?: string }
  | { type: 'resume'; timestamp?: string }
  | { type: 'stop'; timestamp?: string }
  | { type: 'deleteTrack'; trackId: string }
  | { type: 'fixReceived'; fix: TrackFixPayload }
  | { type: 'connectionRestored' };

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

export const createTrackRecorderState = (
  mission: MissionDocument | null,
  trackPointsByTrackId: Record<string, TrackPoint[]>,
  trackStatus?: TrackRecorderStatus,
): TrackRecorderState => ({
  mission,
  trackPointsByTrackId,
  trackStatus: trackStatus ?? (mission?.active_track_id ? 'recording' : 'stopped'),
  segmentByTrackId: buildSegmentMap(mission, trackPointsByTrackId),
});

const ensureRecording = (state: TrackRecorderState, timestamp?: string): TrackRecorderState => {
  if (!state.mission) return state;

  if (state.mission.active_track_id) {
    const activeTrackId = state.mission.active_track_id;
    return {
      ...state,
      trackStatus: 'recording',
      segmentByTrackId: {
        ...state.segmentByTrackId,
        [activeTrackId]: toSegmentId(state.segmentByTrackId[activeTrackId]),
      },
    };
  }

  const startedAt = timestamp ?? nowIso();
  const nextIndex = state.mission.tracks.length + 1;
  const id = createTrackId();
  const file = `tracks/track-${String(nextIndex).padStart(4, '0')}.csv`;

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: id,
      tracks: [
        ...state.mission.tracks,
        {
          id,
          file,
          started_at: startedAt,
          ended_at: null,
          note: null,
        },
      ],
    },
    trackStatus: 'recording',
    segmentByTrackId: {
      ...state.segmentByTrackId,
      [id]: 1,
    },
  };
};

const closeActiveTrack = (
  state: TrackRecorderState,
  nextStatus: TrackRecorderStatus,
  timestamp?: string,
): TrackRecorderState => {
  if (!state.mission) {
    return { ...state, trackStatus: nextStatus };
  }
  if (!state.mission.active_track_id) {
    return { ...state, trackStatus: nextStatus };
  }

  const endedAt = timestamp ?? nowIso();
  const activeTrackId = state.mission.active_track_id;

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: null,
      tracks: state.mission.tracks.map((track) =>
        track.id === activeTrackId
          ? {
              ...track,
              ended_at: track.ended_at ?? endedAt,
            }
          : track,
      ),
    },
    trackStatus: nextStatus,
  };
};

const appendFix = (state: TrackRecorderState, fix: TrackFixPayload): TrackRecorderState => {
  if (!state.mission?.active_track_id || state.trackStatus !== 'recording') {
    return state;
  }

  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) {
    return state;
  }

  const activeTrackId = state.mission.active_track_id;
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

const incrementSegment = (state: TrackRecorderState): TrackRecorderState => {
  if (!state.mission?.active_track_id || state.trackStatus !== 'recording') {
    return state;
  }

  const activeTrackId = state.mission.active_track_id;
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
  if (!state.mission.tracks.some((track) => track.id === trackId)) return state;

  const isActiveTrack = state.mission.active_track_id === trackId;
  const { [trackId]: _removedPoints, ...nextTrackPointsByTrackId } = state.trackPointsByTrackId;
  const { [trackId]: _removedSegment, ...nextSegmentByTrackId } = state.segmentByTrackId;

  return {
    ...state,
    mission: {
      ...state.mission,
      active_track_id: isActiveTrack ? null : state.mission.active_track_id,
      tracks: state.mission.tracks.filter((track) => track.id !== trackId),
    },
    trackPointsByTrackId: nextTrackPointsByTrackId,
    segmentByTrackId: nextSegmentByTrackId,
    trackStatus: isActiveTrack ? 'stopped' : state.trackStatus,
  };
};

export const trackRecorderReduce = (
  state: TrackRecorderState,
  event: TrackRecorderEvent,
): TrackRecorderState => {
  switch (event.type) {
    case 'hydrate':
      return createTrackRecorderState(event.mission, event.trackPointsByTrackId, event.trackStatus);
    case 'start':
      return ensureRecording(state, event.timestamp);
    case 'resume':
      return ensureRecording(state, event.timestamp);
    case 'pause':
      return closeActiveTrack(state, 'paused', event.timestamp);
    case 'stop':
      return closeActiveTrack(state, 'stopped', event.timestamp);
    case 'deleteTrack':
      return deleteTrack(state, event.trackId);
    case 'fixReceived':
      return appendFix(state, event.fix);
    case 'connectionRestored':
      return incrementSegment(state);
    default:
      return state;
  }
};
