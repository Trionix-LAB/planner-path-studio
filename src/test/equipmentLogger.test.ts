import { describe, expect, it, vi } from 'vitest';
import type { FileStoreBridge } from '@/platform/contracts';
import { createEquipmentLogger } from '@/features/mission/model/equipmentLogger';

const flushMicrotasks = async (turns = 8) => {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
};

const createMockFileStore = (appendText?: FileStoreBridge['appendText']): FileStoreBridge => ({
  exists: vi.fn(async () => false),
  readText: vi.fn(async () => null),
  writeText: vi.fn(async () => undefined),
  appendText: appendText ?? vi.fn(async () => undefined),
  flush: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  list: vi.fn(async () => []),
  stat: vi.fn(async () => null),
});

describe('equipment logger', () => {
  it('buffers writes and flushes with a single appendText call', async () => {
    const fileStore = createMockFileStore();
    const logger = createEquipmentLogger({
      rootPath: '/mission-a',
      deviceInstanceId: 'device-1',
      profileName: 'Profile A',
      fileStore,
    });

    logger.write('$AZMLOC,1');
    logger.write('$AZMLOC,2');
    await logger.flush();

    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    const [path, payload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(path).toBe('/mission-a/logs/equipment/device-1.log');
    const lines = payload.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"profile_name":"Profile A"');
    expect(lines[0]).toContain('"raw":"$AZMLOC,1"');
    expect(lines[1]).toContain('"raw":"$AZMLOC,2"');
  });

  it('auto-flushes when buffer reaches 50 lines', async () => {
    const fileStore = createMockFileStore();
    const logger = createEquipmentLogger({
      rootPath: '/mission-a',
      deviceInstanceId: 'device-2',
      profileName: 'Profile B',
      fileStore,
    });

    for (let i = 0; i < 50; i += 1) {
      logger.write(`$GPRMC,${i}`);
    }
    await flushMicrotasks();

    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    const [, payload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(payload.trimEnd().split('\n')).toHaveLength(50);
  });

  it('stop flushes remaining buffer and prevents interval flushes', async () => {
    vi.useFakeTimers();
    const fileStore = createMockFileStore();
    const logger = createEquipmentLogger({
      rootPath: '/mission-a',
      deviceInstanceId: 'device-3',
      profileName: 'Profile C',
      fileStore,
    });

    logger.write('$GPRMC,123');
    await logger.stop();

    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(fileStore.appendText).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('returns failed append chunk back to buffer for retry', async () => {
    let call = 0;
    const fileStore = createMockFileStore(
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          throw new Error('append failed');
        }
      }),
    );
    const logger = createEquipmentLogger({
      rootPath: '/mission-a',
      deviceInstanceId: 'device-4',
      profileName: 'Profile D',
      fileStore,
    });

    logger.write('$AZMREM,1');
    await logger.flush();
    await logger.flush();

    expect(fileStore.appendText).toHaveBeenCalledTimes(2);
    const [, retryPayload] = (fileStore.appendText as ReturnType<typeof vi.fn>).mock.calls[1] as [string, string];
    expect(retryPayload).toContain('"raw":"$AZMREM,1"');
  });

  it('write does not throw even when appendText rejects', async () => {
    const fileStore = createMockFileStore(
      vi.fn(async () => {
        throw new Error('storage unavailable');
      }),
    );
    const logger = createEquipmentLogger({
      rootPath: '/mission-a',
      deviceInstanceId: 'device-5',
      profileName: 'Profile E',
      fileStore,
    });

    expect(() => {
      for (let i = 0; i < 60; i += 1) {
        logger.write(`$GPRMC,${i}`);
      }
    }).not.toThrow();

    await flushMicrotasks();
  });
});
