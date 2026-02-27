import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTileCache } from '@/features/map/offlineTiles/tileCache';
import type { TileBbox } from '@/features/map/offlineTiles/tileMath';
import { prefetchTiles, type PrefetchProgress } from '@/features/map/offlineTiles/tilePrefetcher';

type ViewBounds = {
  north: number;
  south: number;
  west: number;
  east: number;
} | null;

interface OfflineMapsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tileUrlTemplate: string;
  tileSubdomains?: string | string[];
  providerKey: string;
  maxZoom: number;
  maxNativeZoom: number;
  viewBounds: ViewBounds;
  currentZoom: number;
}

const toFixedString = (value: number): string => value.toFixed(6);
const clampNumber = (value: string, fallback: number, min: number, max: number): number => {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const bytesToHuman = (value: number): string => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
};

const initialProgress: PrefetchProgress = {
  total: 0,
  completed: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  bytesDownloaded: 0,
};

const LAT_MIN = -85;
const LAT_MAX = 85;
const LON_MIN = -180;
const LON_MAX = 180;
const ZOOM_MIN_ALLOWED = 0;
const MB = 1024 * 1024;
const AUTO_CACHE_FALLBACK_BYTES = 512 * MB;
const AUTO_CACHE_MIN_BYTES = 256 * MB;
const AUTO_CACHE_MAX_BYTES = 8 * 1024 * MB;
const FALLBACK_HALF_LAT_SPAN = 0.05;
const FALLBACK_HALF_LON_SPAN = 0.05;

const resolveAutoCacheLimitBytes = async (): Promise<number> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return AUTO_CACHE_FALLBACK_BYTES;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ?? 0;
    const usage = estimate.usage ?? 0;
    if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(usage) || usage < 0) {
      return AUTO_CACHE_FALLBACK_BYTES;
    }

    const available = Math.max(0, quota - usage);
    const byQuota = quota * 0.2;
    const byAvailable = available * 0.5;
    const target = Math.min(byQuota, byAvailable);
    const clamped = Math.max(AUTO_CACHE_MIN_BYTES, Math.min(AUTO_CACHE_MAX_BYTES, target));
    return Math.trunc(clamped);
  } catch {
    return AUTO_CACHE_FALLBACK_BYTES;
  }
};

const OfflineMapsDialog = ({
  open,
  onOpenChange,
  tileUrlTemplate,
  tileSubdomains,
  providerKey,
  maxZoom,
  maxNativeZoom,
  viewBounds,
  currentZoom,
}: OfflineMapsDialogProps) => {
  const cache = useMemo(() => getTileCache(), []);
  const [latitude, setLatitude] = useState('0');
  const [longitude, setLongitude] = useState('0');
  const [zoomMin, setZoomMin] = useState('8');
  const [zoomMax, setZoomMax] = useState('14');
  const [progress, setProgress] = useState<PrefetchProgress>(initialProgress);
  const [isRunning, setIsRunning] = useState(false);
  const [cacheSize, setCacheSize] = useState(0);
  const [cacheEntries, setCacheEntries] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheMisses, setCacheMisses] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const effectiveDownloadMaxZoom = Math.max(
    ZOOM_MIN_ALLOWED,
    Math.min(maxZoom, maxNativeZoom),
  );

  useEffect(() => {
    if (!open) return;
    if (viewBounds) {
      const centerLat = (viewBounds.north + viewBounds.south) / 2;
      const centerLon = (viewBounds.west + viewBounds.east) / 2;
      setLatitude(toFixedString(centerLat));
      setLongitude(toFixedString(centerLon));
      const minDefault = Math.max(0, Math.min(maxZoom, Math.floor(currentZoom) - 2));
      const maxDefault = Math.max(minDefault, Math.min(maxZoom, Math.floor(currentZoom) + 2));
      setZoomMin(String(minDefault));
      setZoomMax(String(maxDefault));
    }
  }, [currentZoom, maxZoom, open, viewBounds]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const poll = async () => {
      const stats = await cache.getStats();
      if (!active) return;
      setCacheSize(stats.totalBytes);
      setCacheEntries(stats.entries);
      setCacheHits(stats.hits);
      setCacheMisses(stats.misses);
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [cache, open]);

  const applyCurrentViewport = () => {
    if (!viewBounds) return;
    const centerLat = (viewBounds.north + viewBounds.south) / 2;
    const centerLon = (viewBounds.west + viewBounds.east) / 2;
    setLatitude(toFixedString(centerLat));
    setLongitude(toFixedString(centerLon));
  };

  const buildBbox = (): TileBbox => {
    const fallbackLat = viewBounds ? (viewBounds.north + viewBounds.south) / 2 : 0;
    const fallbackLon = viewBounds ? (viewBounds.west + viewBounds.east) / 2 : 0;
    const centerLat = clampNumber(latitude, fallbackLat, LAT_MIN, LAT_MAX);
    const centerLon = clampNumber(longitude, fallbackLon, LON_MIN, LON_MAX);

    const viewportHalfLat = viewBounds
      ? Math.max(0.0005, Math.abs(viewBounds.north - viewBounds.south) / 2)
      : FALLBACK_HALF_LAT_SPAN;
    const viewportHalfLon = viewBounds
      ? Math.max(0.0005, Math.abs(viewBounds.east - viewBounds.west) / 2)
      : FALLBACK_HALF_LON_SPAN;

    const halfLat = Math.min(45, viewportHalfLat);
    const halfLon = Math.min(90, viewportHalfLon);
    return {
      north: Math.min(LAT_MAX, centerLat + halfLat),
      south: Math.max(LAT_MIN, centerLat - halfLat),
      west: Math.max(LON_MIN, centerLon - halfLon),
      east: Math.min(LON_MAX, centerLon + halfLon),
    };
  };

  const handleStart = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setProgress(initialProgress);
    const controller = new AbortController();
    abortRef.current = controller;
    const normalizedZoomMin = Math.trunc(clampNumber(zoomMin, 8, ZOOM_MIN_ALLOWED, effectiveDownloadMaxZoom));
    const normalizedZoomMax = Math.trunc(clampNumber(zoomMax, 14, ZOOM_MIN_ALLOWED, effectiveDownloadMaxZoom));
    const effectiveZoomMin = Math.min(normalizedZoomMin, normalizedZoomMax, effectiveDownloadMaxZoom);
    const effectiveZoomMax = Math.min(
      Math.max(normalizedZoomMin, normalizedZoomMax),
      effectiveDownloadMaxZoom,
    );

    try {
      cache.setMaxBytes(await resolveAutoCacheLimitBytes());
      await prefetchTiles({
        cache,
        providerKey,
        tileUrlTemplate,
        subdomains: tileSubdomains,
        bbox: buildBbox(),
        zoomMin: effectiveZoomMin,
        zoomMax: effectiveZoomMax,
        signal: controller.signal,
        onProgress: (next) => setProgress(next),
      });
    } catch {
      // cancelled
    } finally {
      abortRef.current = null;
      setIsRunning(false);
      const stats = await cache.getStats();
      setCacheSize(stats.totalBytes);
      setCacheEntries(stats.entries);
      setCacheHits(stats.hits);
      setCacheMisses(stats.misses);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  };

  const handleClear = async () => {
    if (isRunning) return;
    await cache.clear();
    setProgress(initialProgress);
    setCacheSize(0);
    setCacheEntries(0);
    setCacheHits(0);
    setCacheMisses(0);
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Скачать карты</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Кэш: {cacheEntries} тайлов, {bytesToHuman(cacheSize)}
            </div>
            <Button variant="outline" size="sm" onClick={applyCurrentViewport} disabled={!viewBounds}>
              Текущий вид
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bbox-latitude">Широта</Label>
              <Input
                id="bbox-latitude"
                type="number"
                min={LAT_MIN}
                max={LAT_MAX}
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bbox-longitude">Долгота</Label>
              <Input
                id="bbox-longitude"
                type="number"
                min={LON_MIN}
                max={LON_MAX}
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="zoom-min">Минимальный зум</Label>
              <Input
                id="zoom-min"
                type="number"
                min={ZOOM_MIN_ALLOWED}
                max={maxZoom}
                step="1"
                value={zoomMin}
                onChange={(e) => setZoomMin(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="zoom-max">Максимальный зум</Label>
              <Input
                id="zoom-max"
                type="number"
                min={ZOOM_MIN_ALLOWED}
                max={maxZoom}
                step="1"
                value={zoomMax}
                onChange={(e) => setZoomMax(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Прогресс</span>
              <span>{progress.completed}/{progress.total} ({progressPercent}%)</span>
            </div>
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="text-sm text-muted-foreground">
              Скачано: {progress.downloaded}, Пропущено: {progress.skipped}, Ошибок: {progress.failed}, Загружено:
              {' '}
              {bytesToHuman(progress.bytesDownloaded)}
            </div>
            <div className="text-sm text-muted-foreground">
              Найдено в кэше: {cacheHits}, Загрузок из сети: {cacheMisses}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClear} disabled={isRunning}>Очистить кэш</Button>
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>Остановить</Button>
          ) : (
            <Button onClick={() => void handleStart()}>Скачать тайлы</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfflineMapsDialog;
