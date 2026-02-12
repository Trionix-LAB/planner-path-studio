import {
  createTrackRecorderState,
  trackRecorderReduce,
  type MissionDocument,
} from '@/features/mission';

const AGENT_UID = 'test-agent-1';
const AGENT_UID_2 = 'test-agent-2';

const createMission = (): MissionDocument => ({
  schema_version: 1,
  mission_id: 'mission-1',
  name: 'Test Mission',
  created_at: '2026-02-08T10:00:00.000Z',
  updated_at: '2026-02-08T10:00:00.000Z',
  active_track_id: null,
  active_tracks: {},
  tracks: [],
  files: {
    routes: 'routes/routes.geojson',
    markers: 'markers/markers.geojson',
  },
});

describe('track recorder', () => {
  it('starts, pauses, resumes and stops with track metadata updates', () => {
    let state = createTrackRecorderState(createMission(), {});

    state = trackRecorderReduce(state, { type: 'start', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:01.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('recording');
    expect(state.trackStatus).toBe('recording');
    expect(state.mission?.tracks).toHaveLength(1);
    const firstTrackId = state.mission?.active_tracks[AGENT_UID];
    expect(firstTrackId).toBeTruthy();
    expect(state.mission?.tracks[0].agent_id).toBe(AGENT_UID);

    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID,
      fix: {
        lat: 59.9,
        lon: 30.3,
        speed: 0.8,
        course: 10,
        depth: 5,
        timestamp: '2026-02-08T10:00:02.000Z',
      },
    });
    expect(state.trackPointsByTrackId[firstTrackId as string]).toHaveLength(1);
    expect(state.trackPointsByTrackId[firstTrackId as string][0].segment_id).toBe(1);

    state = trackRecorderReduce(state, { type: 'connectionRestored', agentId: AGENT_UID });
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID,
      fix: {
        lat: 59.9001,
        lon: 30.3001,
        speed: 0.9,
        course: 11,
        depth: 5.1,
        timestamp: '2026-02-08T10:00:03.000Z',
      },
    });
    expect(state.trackPointsByTrackId[firstTrackId as string][1].segment_id).toBe(2);

    state = trackRecorderReduce(state, { type: 'pause', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:04.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('paused');
    expect(state.mission?.active_tracks[AGENT_UID]).toBeUndefined();
    expect(state.mission?.tracks[0].ended_at).toBe('2026-02-08T10:00:04.000Z');

    state = trackRecorderReduce(state, { type: 'resume', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:05.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('recording');
    expect(state.mission?.tracks).toHaveLength(2);
    expect(state.mission?.active_tracks[AGENT_UID]).not.toBe(firstTrackId);

    state = trackRecorderReduce(state, { type: 'stop', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:06.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('stopped');
    expect(state.trackStatus).toBe('stopped');
    expect(state.mission?.active_tracks[AGENT_UID]).toBeUndefined();
    expect(state.mission?.tracks[1].ended_at).toBe('2026-02-08T10:00:06.000Z');
  });

  it('does not append points while not recording', () => {
    let state = createTrackRecorderState(createMission(), {}, { [AGENT_UID]: 'stopped' });
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID,
      fix: {
        lat: 59.9,
        lon: 30.3,
        speed: 0.8,
        course: 0,
        depth: 3,
      },
    });
    expect(Object.keys(state.trackPointsByTrackId)).toHaveLength(0);
  });

  it('deletes track metadata and points, and stops recording when active track is removed', () => {
    let state = createTrackRecorderState(createMission(), {});
    state = trackRecorderReduce(state, { type: 'start', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:01.000Z' });
    const activeTrackId = state.mission?.active_tracks[AGENT_UID] as string;

    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID,
      fix: {
        lat: 59.9,
        lon: 30.3,
        speed: 0.8,
        course: 0,
        depth: 4,
        timestamp: '2026-02-08T10:00:02.000Z',
      },
    });

    expect(state.mission?.tracks).toHaveLength(1);
    expect(state.trackPointsByTrackId[activeTrackId]).toHaveLength(1);

    state = trackRecorderReduce(state, { type: 'deleteTrack', trackId: activeTrackId });

    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('stopped');
    expect(state.mission?.active_tracks[AGENT_UID]).toBeUndefined();
    expect(state.mission?.tracks).toHaveLength(0);
    expect(state.trackPointsByTrackId[activeTrackId]).toBeUndefined();
  });

  it('supports parallel recording for multiple agents', () => {
    let state = createTrackRecorderState(createMission(), {});

    // Start agent 1
    state = trackRecorderReduce(state, { type: 'start', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:01.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('recording');

    // Start agent 2
    state = trackRecorderReduce(state, { type: 'start', agentId: AGENT_UID_2, timestamp: '2026-02-08T10:00:02.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID_2]).toBe('recording');
    expect(state.trackStatus).toBe('recording');
    expect(state.mission?.tracks).toHaveLength(2);

    const track1Id = state.mission?.active_tracks[AGENT_UID] as string;
    const track2Id = state.mission?.active_tracks[AGENT_UID_2] as string;
    expect(track1Id).not.toBe(track2Id);

    // Fix for agent 1
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID,
      fix: { lat: 59.9, lon: 30.3, speed: 0.5, course: 10, depth: 5, timestamp: '2026-02-08T10:00:03.000Z' },
    });
    // Fix for agent 2
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
      agentId: AGENT_UID_2,
      fix: { lat: 60.0, lon: 31.0, speed: 1.0, course: 90, depth: 3, timestamp: '2026-02-08T10:00:03.000Z' },
    });

    expect(state.trackPointsByTrackId[track1Id]).toHaveLength(1);
    expect(state.trackPointsByTrackId[track2Id]).toHaveLength(1);
    expect(state.trackPointsByTrackId[track1Id][0].lat).toBe(59.9);
    expect(state.trackPointsByTrackId[track2Id][0].lat).toBe(60.0);

    // Pause agent 1, agent 2 still recording
    state = trackRecorderReduce(state, { type: 'pause', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:04.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('paused');
    expect(state.trackStatusByAgentId[AGENT_UID_2]).toBe('recording');
    expect(state.trackStatus).toBe('recording'); // aggregate

    // Stop all
    state = trackRecorderReduce(state, { type: 'stopAll', timestamp: '2026-02-08T10:00:05.000Z' });
    expect(state.trackStatusByAgentId[AGENT_UID]).toBe('stopped');
    expect(state.trackStatusByAgentId[AGENT_UID_2]).toBe('stopped');
    expect(state.trackStatus).toBe('stopped');
    expect(Object.keys(state.mission?.active_tracks ?? {})).toHaveLength(0);
  });

  it('track files are named with agent prefix', () => {
    let state = createTrackRecorderState(createMission(), {});
    state = trackRecorderReduce(state, { type: 'start', agentId: AGENT_UID, timestamp: '2026-02-08T10:00:01.000Z' });
    expect(state.mission?.tracks[0].file).toContain(AGENT_UID);
    expect(state.mission?.tracks[0].file).toMatch(/^tracks\//);
  });
});
