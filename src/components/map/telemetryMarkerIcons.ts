import L from 'leaflet';

import {
  clampDiverMarkerSizePx,
  DIVER_MARKER_SIZE_DEFAULT_PX,
} from '@/features/mission/model/diverMarkerSize';

const BASE_STATION_MARKER_COLOR = '#0f172a';

const normalizeDirectionDeg = (value: number): number => ((value % 360) + 360) % 360;

const hasDirection = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeHexColor = (value: string | undefined, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
};

/**
 * Navigation-style arrow marker for diver/agent.
 * The entire marker is a teardrop/chevron shape pointing in the course direction,
 * similar to Google Maps / Yandex Navigator navigation arrows.
 */
export const createDiverIcon = (
  courseDeg: number,
  isFollowing: boolean,
  color: string,
  sizePx: number,
): L.DivIcon => {
  const size = clampDiverMarkerSizePx(sizePx, DIVER_MARKER_SIZE_DEFAULT_PX);
  const markerColor = normalizeHexColor(color, '#0ea5e9');
  const normalizedDirection = normalizeDirectionDeg(courseDeg);

  // Navigation arrow dimensions proportional to marker size
  const arrowSize = Math.max(16, Math.round(size * 1.1));
  // Canvas is square, arrow is centered
  const canvasSize = arrowSize;

  return L.divIcon({
    className: 'diver-marker',
    html: `
      <div
        style="position:relative;display:flex;align-items:center;justify-content:center;width:${canvasSize}px;height:${canvasSize}px;"
        data-marker-size="${size}"
        data-marker-color="${markerColor}"
        data-marker-direction="${normalizedDirection.toFixed(2)}"
      >
        <svg
          data-course-arrow="1"
          data-arrow-size="${arrowSize}"
          data-arrow-color="${markerColor}"
          data-arrow-direction="${normalizedDirection.toFixed(2)}"
          viewBox="0 0 100 100"
          width="${arrowSize}"
          height="${arrowSize}"
          style="transform:rotate(${normalizedDirection}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));${isFollowing ? 'animation:pulse 2s ease-in-out infinite;' : ''}"
          aria-hidden="true"
        >
          <!-- Navigation arrow: pointed top, rounded bottom like a location pin arrow -->
          <path
            d="M50 8 L78 72 Q50 58 22 72 Z"
            fill="${markerColor}"
            stroke="#ffffff"
            stroke-width="5"
            stroke-linejoin="round"
          />
          <!-- Inner highlight for depth -->
          <path
            d="M50 22 L68 62 Q50 52 32 62 Z"
            fill="rgba(255,255,255,0.2)"
          />
          <!-- Center dot -->
          <circle cx="50" cy="50" r="6" fill="#ffffff" opacity="0.9" />
        </svg>
      </div>
    `,
    iconSize: [canvasSize, canvasSize],
    iconAnchor: [canvasSize / 2, canvasSize / 2],
  });
};

export const createBaseStationIcon = (
  courseDeg: number | null,
  sizePx = 34,
): L.DivIcon => {
  const size = clampDiverMarkerSizePx(sizePx, 34);
  const markerColor = BASE_STATION_MARKER_COLOR;
  const innerSize = Math.max(12, Math.round(size * 0.76));
  const svgSize = Math.max(10, Math.round(size * 0.41));
  const pointerDirection = hasDirection(courseDeg) ? normalizeDirectionDeg(courseDeg) : null;

  // External course arrow — a prominent navigation-style pointer orbiting outside the marker
  const arrowLength = Math.max(14, Math.round(size * 0.5));
  const arrowWidth = Math.max(8, Math.round(size * 0.28));
  // Arrow canvas placed above the marker, rotated around center
  const arrowCanvasSize = size + arrowLength * 2 + 4;
  const arrowCenterOffset = arrowCanvasSize / 2;

  return L.divIcon({
    className: 'base-station-marker',
    html: `
      <div
        style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;"
        data-marker-size="${size}"
        data-marker-color="${markerColor}"
        data-marker-direction="${pointerDirection !== null ? pointerDirection.toFixed(2) : ''}"
      >
        ${
          pointerDirection === null
            ? ''
            : `<svg
                data-course-arrow="1"
                data-arrow-format="external-pointer"
                data-arrow-size="${arrowLength}"
                data-arrow-color="${markerColor}"
                data-arrow-direction="${pointerDirection.toFixed(2)}"
                viewBox="0 0 ${arrowCanvasSize} ${arrowCanvasSize}"
                width="${arrowCanvasSize}"
                height="${arrowCanvasSize}"
                style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${pointerDirection}deg);pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));"
                aria-hidden="true"
              >
                <!-- Arrow pointing up from the circle edge -->
                <polygon
                  points="${arrowCenterOffset},2 ${arrowCenterOffset - arrowWidth / 2},${arrowLength + 2} ${arrowCenterOffset + arrowWidth / 2},${arrowLength + 2}"
                  fill="${markerColor}"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                />
              </svg>`
        }
        <div style="position:relative;z-index:1;width:${innerSize}px;height:${innerSize}px;border-radius:9999px;background:#f8fafc;border:2px solid ${markerColor};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 6px rgba(15,23,42,0.35);">
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2V9" stroke="${markerColor}" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="10" r="2.1" stroke="${markerColor}" stroke-width="2" fill="none"/>
            <path d="M5 13C5 16.3 7.7 19 11 19" stroke="${markerColor}" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 13C19 16.3 16.3 19 13 19" stroke="${markerColor}" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 12V22" stroke="${markerColor}" stroke-width="2" stroke-linecap="round"/>
            <path d="M9 19L12 22L15 19" stroke="${markerColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

export const createRwltBuoyIcon = (buoyId: number): L.DivIcon => {
  const size = 24;
  const label = Number.isInteger(buoyId) ? String(buoyId) : '?';
  return L.divIcon({
    className: 'rwlt-buoy-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
        <div style="width:${size}px;height:${size}px;border-radius:9999px;background:#ffffff;border:2px solid #1d4ed8;box-shadow:0 1px 4px rgba(15,23,42,0.25);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#1d4ed8;line-height:1;">
          ${label}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};
