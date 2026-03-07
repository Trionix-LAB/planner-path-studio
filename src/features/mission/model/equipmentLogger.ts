import type { FileStoreBridge } from '@/platform/contracts';

const AUTO_FLUSH_INTERVAL_MS = 1000;
const MAX_BUFFERED_LINES = 50;

export type EquipmentLoggerOptions = {
  rootPath: string;
  deviceInstanceId: string;
  profileName: string;
  fileStore: FileStoreBridge;
};

export type EquipmentLogger = {
  write: (raw: string) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
};

const normalizeRootPath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/g, '');

export const createEquipmentLogger = (options: EquipmentLoggerOptions): EquipmentLogger => {
  const rootPath = normalizeRootPath(options.rootPath);
  const logPath = `${rootPath}/logs/equipment/${options.deviceInstanceId}.log`;
  const buffer: string[] = [];
  let intervalId: number | null = null;
  let stopped = false;
  let flushInFlight: Promise<void> | null = null;

  const ensureAutoFlush = () => {
    if (intervalId !== null || stopped) return;
    intervalId = window.setInterval(() => {
      void flush().catch(() => {
        // Intentionally swallow to keep logger non-fatal.
      });
    }, AUTO_FLUSH_INTERVAL_MS);
  };

  const flushOnce = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const lines = buffer.splice(0, buffer.length);
    const payload = lines.join('');
    try {
      await options.fileStore.appendText(logPath, payload);
    } catch (error) {
      buffer.unshift(...lines);
      console.warn('Failed to append equipment log chunk', error);
    }
  };

  const flush = async (): Promise<void> => {
    if (flushInFlight) {
      await flushInFlight;
      return;
    }
    flushInFlight = flushOnce().finally(() => {
      flushInFlight = null;
    });
    await flushInFlight;
  };

  return {
    write: (raw: string) => {
      if (stopped) return;
      try {
        ensureAutoFlush();
        const line = `${new Date().toISOString()} ${JSON.stringify({
          profile_name: options.profileName,
          raw,
        })}\n`;
        buffer.push(line);
        if (buffer.length >= MAX_BUFFERED_LINES) {
          void flush().catch(() => {
            // Intentionally swallow to keep logger non-fatal.
          });
        }
      } catch (error) {
        console.warn('Failed to buffer equipment log line', error);
      }
    },
    flush,
    stop: async () => {
      stopped = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      await flush();
    },
  };
};
