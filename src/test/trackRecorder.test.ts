import {
  createTrackRecorderState,
  trackRecorderReduce,
  type MissionDocument,
} from '@/features/mission';

const createMission = (): MissionDocument => ({
  schema_version: 1,
  mission_id: 'mission-1',
  name: 'Test Mission',
  created_at: '2026-02-08T10:00:00.000Z',
  updated_at: '2026-02-08T10:00:00.000Z',
  active_track_id: null,
  tracks: [],
  files: {
    routes: 'routes/routes.geojson',
    markers: 'markers/markers.geojson',
  },
});

describe('track recorder', () => {
  it('starts, pauses, resumes and stops with track metadata updates', () => {
    let state = createTrackRecorderState(createMission(), {});

    state = trackRecorderReduce(state, { type: 'resume', timestamp: '2026-02-08T10:00:01.000Z' });
    expect(state.trackStatus).toBe('recording');
    expect(state.mission?.tracks).toHaveLength(1);
    const firstTrackId = state.mission?.active_track_id;
    expect(firstTrackId).toBeTruthy();

    state = trackRecorderReduce(state, {
      type: 'fixReceived',
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

    state = trackRecorderReduce(state, { type: 'connectionRestored' });
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
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

    state = trackRecorderReduce(state, { type: 'pause', timestamp: '2026-02-08T10:00:04.000Z' });
    expect(state.trackStatus).toBe('paused');
    expect(state.mission?.active_track_id).toBeNull();
    expect(state.mission?.tracks[0].ended_at).toBe('2026-02-08T10:00:04.000Z');

    state = trackRecorderReduce(state, { type: 'resume', timestamp: '2026-02-08T10:00:05.000Z' });
    expect(state.trackStatus).toBe('recording');
    expect(state.mission?.tracks).toHaveLength(2);
    expect(state.mission?.active_track_id).not.toBe(firstTrackId);

    state = trackRecorderReduce(state, { type: 'stop', timestamp: '2026-02-08T10:00:06.000Z' });
    expect(state.trackStatus).toBe('stopped');
    expect(state.mission?.active_track_id).toBeNull();
    expect(state.mission?.tracks[1].ended_at).toBe('2026-02-08T10:00:06.000Z');
  });

  it('does not append points while not recording', () => {
    let state = createTrackRecorderState(createMission(), {}, 'stopped');
    state = trackRecorderReduce(state, {
      type: 'fixReceived',
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
    state = trackRecorderReduce(state, { type: 'resume', timestamp: '2026-02-08T10:00:01.000Z' });
    const activeTrackId = state.mission?.active_track_id as string;

    state = trackRecorderReduce(state, {
      type: 'fixReceived',
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

    expect(state.trackStatus).toBe('stopped');
    expect(state.mission?.active_track_id).toBeNull();
    expect(state.mission?.tracks).toHaveLength(0);
    expect(state.trackPointsByTrackId[activeTrackId]).toBeUndefined();
  });
});
