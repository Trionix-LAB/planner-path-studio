import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { getTileCache } from '@/features/map/offlineTiles/tileCache';
import { resolveTileUrl } from '@/features/map/offlineTiles/tileUrl';
import { resolveTileCandidate } from '@/features/map/offlineTiles/tileLoadStrategy';

const PLACEHOLDER_TILE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#0f172a"/><path d="M0 0L256 256M256 0L0 256" stroke="#334155" stroke-width="2"/></svg>',
  );

interface CachedTileLayerProps {
  providerKey: string;
  urlTemplate: string;
  subdomains?: string | string[];
  tileSize?: number;
  maxNativeZoom?: number;
  maxCacheBytes?: number;
  opacity?: number;
  zIndex?: number;
}

type TileSourceRequest = {
  z: number;
  x: number;
  y: number;
  scale: number;
  childOffsetX: number;
  childOffsetY: number;
};

const normalizeTileCoords = (z: number, x: number, y: number): { z: number; x: number; y: number } | null => {
  const n = 2 ** z;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (y < 0 || y >= n) return null;
  const wrappedX = ((x % n) + n) % n;
  return { z, x: wrappedX, y };
};

const resolveSourceRequestAtZoom = (coords: L.Coords, sourceZ: number): TileSourceRequest => {
  const clampedSourceZ = Math.max(0, Math.trunc(sourceZ));
  const diff = Math.max(0, coords.z - clampedSourceZ);
  const scale = 2 ** diff;
  if (scale <= 1) {
    return {
      z: coords.z,
      x: coords.x,
      y: coords.y,
      scale: 1,
      childOffsetX: 0,
      childOffsetY: 0,
    };
  }

  const sourceX = Math.floor(coords.x / scale);
  const sourceY = Math.floor(coords.y / scale);
  const childOffsetX = ((coords.x % scale) + scale) % scale;
  const childOffsetY = ((coords.y % scale) + scale) % scale;
  return {
    z: clampedSourceZ,
    x: sourceX,
    y: sourceY,
    scale,
    childOffsetX,
    childOffsetY,
  };
};

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode tile image'));
    };
    image.src = objectUrl;
  });

const renderOverzoomBlob = async (
  sourceBlob: Blob,
  tileSize: number,
  request: TileSourceRequest,
): Promise<Blob | null> => {
  if (request.scale <= 1) return sourceBlob;
  const image = await loadImageFromBlob(sourceBlob);
  const sourceWidth = image.naturalWidth || tileSize;
  const sourceHeight = image.naturalHeight || tileSize;
  const sampleWidth = sourceWidth / request.scale;
  const sampleHeight = sourceHeight / request.scale;
  const sx = Math.max(0, Math.min(sourceWidth - sampleWidth, request.childOffsetX * sampleWidth));
  const sy = Math.max(0, Math.min(sourceHeight - sampleHeight, request.childOffsetY * sampleHeight));

  const canvas = document.createElement('canvas');
  canvas.width = tileSize;
  canvas.height = tileSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, sampleWidth, sampleHeight, 0, 0, tileSize, tileSize);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
};

const isImageBlob = (blob: Blob): boolean =>
  blob.size > 0 && (!blob.type || blob.type.toLowerCase().startsWith('image/'));

const CachedTileLayer = ({
  providerKey,
  urlTemplate,
  subdomains,
  tileSize = 256,
  maxNativeZoom,
  maxCacheBytes,
  opacity = 1,
  zIndex = 1,
}: CachedTileLayerProps) => {
  const map = useMap();

  useEffect(() => {
    const cache = getTileCache();
    let isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const handleOnline = () => {
      isOnline = true;
    };
    const handleOffline = () => {
      isOnline = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof maxCacheBytes === 'number') {
      cache.setMaxBytes(maxCacheBytes);
    }

    const GridLayer = L.GridLayer.extend({
      options: {
        tileSize,
        opacity,
        zIndex,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 3,
      },
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = L.DomUtil.create('img', 'leaflet-tile') as HTMLImageElement;
        tile.alt = '';
        tile.role = 'presentation';
        tile.decoding = 'async';
        tile.width = tileSize;
        tile.height = tileSize;
        tile.style.backgroundColor = '#0f172a';
        tile.src = PLACEHOLDER_TILE;
        let isDone = false;
        const finish = () => {
          if (isDone) return;
          isDone = true;
          done(null, tile);
        };
        // Leaflet expects async layers to call done asynchronously.
        window.setTimeout(finish, 0);

        let activeObjectUrl: string | null = null;
        const revokeActiveObjectUrl = () => {
          if (!activeObjectUrl) return;
          URL.revokeObjectURL(activeObjectUrl);
          activeObjectUrl = null;
        };
        const applyUrlToTile = (url: string) => {
          revokeActiveObjectUrl();
          tile.onload = null;
          tile.onerror = () => {
            tile.src = PLACEHOLDER_TILE;
          };
          tile.src = url;
        };
        const applyBlobToTile = (blob: Blob, onDecodeError?: () => void) => {
          revokeActiveObjectUrl();
          const objectUrl = URL.createObjectURL(blob);
          activeObjectUrl = objectUrl;
          tile.onload = () => {
            if (activeObjectUrl === objectUrl) {
              URL.revokeObjectURL(objectUrl);
              activeObjectUrl = null;
            }
          };
          tile.onerror = () => {
            if (activeObjectUrl === objectUrl) {
              URL.revokeObjectURL(objectUrl);
              activeObjectUrl = null;
            }
            tile.src = PLACEHOLDER_TILE;
            onDecodeError?.();
          };
          tile.src = objectUrl;
        };

        const run = async () => {
          const nativeZoom =
            typeof maxNativeZoom === 'number' && Number.isFinite(maxNativeZoom)
              ? Math.max(0, Math.trunc(maxNativeZoom))
              : coords.z;
          const startSourceZoom = Math.min(coords.z, nativeZoom);

          const loadFromCacheHierarchy = async (): Promise<{ blob: Blob; request: TileSourceRequest; key: string } | null> => {
            for (let sourceZ = startSourceZoom; sourceZ >= 0; sourceZ -= 1) {
              const request = resolveSourceRequestAtZoom(coords, sourceZ);
              const normalized = normalizeTileCoords(request.z, request.x, request.y);
              if (!normalized) continue;

              const key = cache.makeKey(providerKey, normalized.z, normalized.x, normalized.y);
              const cached = await cache.get(key);
              if (!cached) continue;

              if (!isImageBlob(cached.blob)) {
                await cache.remove(key);
                continue;
              }

              return { blob: cached.blob, request, key };
            }
            return null;
          };

          const applySourceBlob = async (
            blob: Blob,
            request: TileSourceRequest,
            onDecodeError?: () => void,
          ) => {
            if (request.scale <= 1) {
              applyBlobToTile(blob, onDecodeError);
              return;
            }
            const renderedBlob = await renderOverzoomBlob(blob, tileSize, request);
            if (renderedBlob) {
              applyBlobToTile(renderedBlob, onDecodeError);
              return;
            }
            applyBlobToTile(blob, onDecodeError);
          };

          try {
            const request = resolveSourceRequestAtZoom(coords, startSourceZoom);
            const normalized = normalizeTileCoords(request.z, request.x, request.y);
            if (!normalized) {
              tile.src = PLACEHOLDER_TILE;
              return;
            }

            const key = cache.makeKey(providerKey, normalized.z, normalized.x, normalized.y);
            const url = resolveTileUrl(urlTemplate, normalized, subdomains);
            const loadFromNetwork = async () => {
              const response = await fetch(url);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const blob = await response.blob();
              if (!isImageBlob(blob)) {
                throw new Error('Invalid image tile');
              }
              await cache.put(key, {
                provider: providerKey,
                url,
                z: normalized.z,
                x: normalized.x,
                y: normalized.y,
                blob,
              });
              return { blob, request, key };
            };

            const resolved = await resolveTileCandidate({
              isOnline,
              loadFromCacheHierarchy,
              loadFromNetwork,
            });
            if (resolved) {
              await applySourceBlob(resolved.candidate.blob, resolved.candidate.request, () => {
                void cache.remove(resolved.candidate.key);
              });
              return;
            }

            if (isOnline) {
              // Runtime fallback for environments where fetch/blob path is blocked,
              // but direct image loading still works.
              applyUrlToTile(url);
              return;
            }

            tile.src = PLACEHOLDER_TILE;
          } catch {
            tile.src = PLACEHOLDER_TILE;
          }
        };

        void run();
        return tile;
      },
    });

    const layer = new GridLayer();

    layer.addTo(map);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      layer.removeFrom(map);
    };
  }, [map, maxCacheBytes, maxNativeZoom, opacity, providerKey, subdomains, tileSize, urlTemplate, zIndex]);

  return null;
};

export default CachedTileLayer;
