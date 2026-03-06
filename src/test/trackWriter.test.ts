import { describe, expect, it, vi } from 'vitest';
import type { FileStoreBridge } from '@/platform/contracts';
import { createTrackWriter } from '@/features/mission/model/trackWriter';
import type { TrackPoint } from '@/features/mission';

const flushMicrotasks = async (turns = 8) => {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
};

const createPoint = (index: number): TrackPoint => ({
  timestamp: `2026-03-06T12:00:${String(index).padStart(2, '0')}.000Z`,
  lat: 59.9 + index * 0.0001,
  lon: 30.3 + index * 0.0001,
  segment_id: 1,
  depth_m: 10 + index,
  sog_mps: 1.2,
  cog_deg: 45,
});

const createMockFileStore = (overrides?: Partial<FileStoreBridge>): FileStoreBridge => ({
  exists: vi.fn(async () => false),
  readText: vi.fn(async () => null),
  writeText: vi.fn(async () => undefined),
  appendText: vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  list: vi.fn(async () => []),
  stat: vi.fn(async () => null),
  ...overrides,
});

describe('track writer', () => {
  it('append lazily creates CSV header when file does not exist', async () => {
    const fileStore = createMockFileStore({ exists: vi.fn(async () => false) });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
    });

    writer.append([createPoint(1)]);
    await writer.flush();

    expect(fileStore.appendText).toHaveBeenCalledTimes(2);
    const firstCall = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    const secondCall = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[1] as [string, string];
    expect(firstCall[1]).toContain('timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg');
    expect(secondCall[1]).toContain('2026-03-06T12:00:01.000Z');
  });

  it('append skips header creation when CSV file already exists', async () => {
    const fileStore = createMockFileStore({ exists: vi.fn(async () => true) });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
    });

    writer.append([createPoint(2)]);
    await writer.flush();

    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    const [, payload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(payload).toContain('2026-03-06T12:00:02.000Z');
  });

  it('auto-flushes when buffered lines reach threshold', async () => {
    const fileStore = createMockFileStore({ exists: vi.fn(async () => true) });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
      maxBufferLines: 50,
    });

    for (let i = 0; i < 50; i += 1) {
      writer.append([createPoint(i)]);
    }
    await flushMicrotasks();

    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    const [, payload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(payload.trimEnd().split('\n')).toHaveLength(50);
  });

  it('stop flushes buffered points and prevents timer writes', async () => {
    vi.useFakeTimers();
    const fileStore = createMockFileStore({ exists: vi.fn(async () => true) });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
    });

    writer.append([createPoint(3)]);
    await writer.stop();
    expect(fileStore.appendText).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('rewrite writes full CSV snapshot through writeText', async () => {
    const fileStore = createMockFileStore();
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
    });

    await writer.rewrite([createPoint(1), createPoint(2)]);

    expect(fileStore.writeText).toHaveBeenCalledTimes(1);
    const [, payload] = (fileStore.writeText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(payload).toContain('timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg');
    expect(payload).toContain('2026-03-06T12:00:01.000Z');
    expect(payload).toContain('2026-03-06T12:00:02.000Z');
  });

  it('returns failed append chunk back to buffer for retry', async () => {
    let call = 0;
    const fileStore = createMockFileStore({
      exists: vi.fn(async () => true),
      appendText: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('append failed');
      }),
    });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
    });

    writer.append([createPoint(4)]);
    await writer.flush();
    await writer.flush();

    expect(fileStore.appendText).toHaveBeenCalledTimes(2);
    const [, payload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[1] as [string, string];
    expect(payload).toContain('2026-03-06T12:00:04.000Z');
  });

  it('append does not throw even when appendText rejects', async () => {
    const fileStore = createMockFileStore({
      exists: vi.fn(async () => true),
      appendText: vi.fn(async () => {
        throw new Error('storage unavailable');
      }),
    });
    const writer = createTrackWriter({
      trackPath: '/mission-a/tracks/track-0001.csv',
      fileStore,
      maxBufferLines: 50,
    });

    expect(() => {
      for (let i = 0; i < 60; i += 1) {
        writer.append([createPoint(i)]);
      }
    }).not.toThrow();

    await flushMicrotasks();
  });
});
