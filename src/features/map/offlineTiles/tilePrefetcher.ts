import type { TileBbox } from './tileMath';
import { bboxToTileRange, enumerateTiles } from './tileMath';
import { resolveTileUrl } from './tileUrl';
import type { TileCache } from './tileCache';

export type PrefetchProgress = {
  total: number;
  completed: number;
  downloaded: number;
  skipped: number;
  failed: number;
  bytesDownloaded: number;
};

export type PrefetchOptions = {
  cache: TileCache;
  providerKey: string;
  tileUrlTemplate: string;
  subdomains?: string | string[];
  bbox: TileBbox;
  zoomMin: number;
  zoomMax: number;
  concurrency?: number;
  retryCount?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PrefetchProgress) => void;
};

const buildTasks = (bbox: TileBbox, zoomMin: number, zoomMax: number): Array<{ z: number; x: number; y: number }> => {
  const tasks: Array<{ z: number; x: number; y: number }> = [];
  for (let zoom = zoomMin; zoom <= zoomMax; zoom += 1) {
    const range = bboxToTileRange(bbox, zoom);
    tasks.push(...enumerateTiles(range));
  }
  return tasks;
};

const isMissingTileStatus = (status: number): boolean =>
  status === 204 ||
  status === 404 ||
  status === 410 ||
  (status >= 400 && status < 500 && status !== 408 && status !== 429);

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const isLikelyImage = (response: Response, blob: Blob): boolean => {
  const header =
    response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-type')
      : null;
  const normalizedHeader = header?.toLowerCase() ?? '';
  if (normalizedHeader.includes('image/')) return true;
  if (blob.type && blob.type.toLowerCase().startsWith('image/')) return true;
  if (!normalizedHeader && !blob.type) return true;
  return false;
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error && error.message === 'aborted';
};

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('aborted'));
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

const fetchTileWithRetry = async (
  url: string,
  retryCount: number,
  retryDelayMs: number,
  signal?: AbortSignal,
): Promise<Blob | null> => {
  let attempt = 0;
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  while (attempt <= retryCount) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const response = await fetch(url, signal ? { signal } : undefined);
      if (!response.ok) {
        lastStatus = response.status;
        if (isMissingTileStatus(response.status)) {
          return null;
        }
        if (isRetryableStatus(response.status) && attempt < retryCount) {
          attempt += 1;
          await wait(retryDelayMs * attempt, signal);
          continue;
        }
        return null;
      }
      const blob = await response.blob();
      if (blob.size <= 0 || !isLikelyImage(response, blob)) {
        return null;
      }
      return blob;
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || attempt === retryCount) {
        throw error;
      }
      attempt += 1;
      await wait(retryDelayMs * attempt, signal);
    }
  }

  if (lastStatus !== null) {
    return null;
  }
  throw lastError ?? new Error('tile fetch failed');
};

export const prefetchTiles = async (options: PrefetchOptions): Promise<PrefetchProgress> => {
  const concurrency = Math.max(1, Math.min(16, options.concurrency ?? 6));
  const retryCount = Math.max(0, Math.min(5, Math.trunc(options.retryCount ?? 2)));
  const retryDelayMs = Math.max(0, Math.min(5000, Math.trunc(options.retryDelayMs ?? 250)));
  const tasks = buildTasks(options.bbox, options.zoomMin, options.zoomMax);
  const progress: PrefetchProgress = {
    total: tasks.length,
    completed: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    bytesDownloaded: 0,
  };

  if (progress.total === 0) {
    options.onProgress?.(progress);
    return progress;
  }

  let cursor = 0;
  const step = async () => {
    while (cursor < tasks.length) {
      if (options.signal?.aborted) throw new Error('aborted');

      const task = tasks[cursor];
      cursor += 1;

      const key = options.cache.makeKey(options.providerKey, task.z, task.x, task.y);
      const cached = await options.cache.get(key);
      if (cached) {
        const hasImageType =
          !cached.blob.type || cached.blob.type.toLowerCase().startsWith('image/');
        if (cached.blob.size > 0 && hasImageType) {
          progress.skipped += 1;
          progress.completed += 1;
          options.onProgress?.({ ...progress });
          continue;
        }
        await options.cache.remove(key);
      }

      const url = resolveTileUrl(options.tileUrlTemplate, task, options.subdomains);
      try {
        const blob = await fetchTileWithRetry(url, retryCount, retryDelayMs, options.signal);
        if (!blob) {
          progress.skipped += 1;
          continue;
        }
        await options.cache.put(key, {
          provider: options.providerKey,
          url,
          z: task.z,
          x: task.x,
          y: task.y,
          blob,
        });
        progress.downloaded += 1;
        progress.bytesDownloaded += blob.size;
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        progress.failed += 1;
      } finally {
        progress.completed += 1;
        options.onProgress?.({ ...progress });
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => step());
  await Promise.all(workers);
  return progress;
};
