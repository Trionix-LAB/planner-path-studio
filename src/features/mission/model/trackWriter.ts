import type { FileStoreBridge } from '@/platform/contracts';
import type { TrackPoint } from './types';

const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const DEFAULT_MAX_BUFFER_LINES = 50;
const CSV_HEADER = 'timestamp,lat,lon,segment_id,depth_m,sog_mps,cog_deg';

export type TrackWriterOptions = {
  trackPath: string;
  fileStore: FileStoreBridge;
  flushIntervalMs?: number;
  maxBufferLines?: number;
};

export type TrackWriter = {
  append: (newPoints: TrackPoint[]) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
  rewrite: (allPoints: TrackPoint[]) => Promise<void>;
};

const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/g, '');

const toCsvLine = (point: TrackPoint): string => {
  const depth = point.depth_m ?? '';
  const sog = point.sog_mps ?? '';
  const cog = point.cog_deg ?? '';
  return `${point.timestamp},${point.lat},${point.lon},${point.segment_id},${depth},${sog},${cog}`;
};

const toCsvTrack = (points: TrackPoint[]): string => {
  return [CSV_HEADER, ...points.map(toCsvLine)].join('\n');
};

export const createTrackWriter = (options: TrackWriterOptions): TrackWriter => {
  const trackPath = normalizePath(options.trackPath);
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const maxBufferLines = options.maxBufferLines ?? DEFAULT_MAX_BUFFER_LINES;
  const buffer: string[] = [];

  let intervalId: number | null = null;
  let stopped = false;
  let flushInFlight: Promise<void> | null = null;
  let headerEnsured = false;
  let headerEnsureInFlight: Promise<void> | null = null;

  const ensureAutoFlush = () => {
    if (intervalId !== null || stopped) return;
    intervalId = window.setInterval(() => {
      void flush().catch(() => {
        // Keep append path non-fatal.
      });
    }, flushIntervalMs);
  };

  const clearAutoFlush = () => {
    if (intervalId === null) return;
    window.clearInterval(intervalId);
    intervalId = null;
  };

  const ensureHeader = async (): Promise<void> => {
    if (headerEnsured) return;
    if (headerEnsureInFlight) {
      await headerEnsureInFlight;
      return;
    }
    headerEnsureInFlight = (async () => {
      try {
        const exists = await options.fileStore.exists(trackPath);
        if (!exists) {
          await options.fileStore.appendText(trackPath, `${CSV_HEADER}\n`);
        }
        headerEnsured = true;
      } catch (error) {
        console.warn('Failed to ensure track CSV header', error);
      } finally {
        headerEnsureInFlight = null;
      }
    })();
    await headerEnsureInFlight;
  };

  const flushOnce = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await ensureHeader();
    if (!headerEnsured) return;

    const lines = buffer.splice(0, buffer.length);
    try {
      await options.fileStore.appendText(trackPath, `${lines.join('\n')}\n`);
    } catch (error) {
      buffer.unshift(...lines);
      console.warn('Failed to append track CSV chunk', error);
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
    append: (newPoints: TrackPoint[]) => {
      if (stopped || newPoints.length === 0) return;
      try {
        ensureAutoFlush();
        for (const point of newPoints) {
          buffer.push(toCsvLine(point));
        }
        if (buffer.length >= maxBufferLines) {
          void flush().catch(() => {
            // Keep append path non-fatal.
          });
        }
      } catch (error) {
        console.warn('Failed to buffer track CSV points', error);
      }
    },
    flush,
    stop: async () => {
      stopped = true;
      clearAutoFlush();
      await flush();
    },
    rewrite: async (allPoints: TrackPoint[]) => {
      stopped = true;
      clearAutoFlush();
      buffer.length = 0;
      headerEnsured = true;
      headerEnsureInFlight = null;
      await options.fileStore.writeText(trackPath, toCsvTrack(allPoints));
    },
  };
};
