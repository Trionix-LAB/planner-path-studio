export type FloatingPosition = { x: number; y: number };
export type FloatingSize = { width: number; height: number };

export const VIEWPORT_PADDING_PX = 12;
export const SNAP_THRESHOLD_PX = 16;
export const FALLBACK_PANEL_SIZE: FloatingSize = { width: 320, height: 380 };
export const FALLBACK_ICON_SIZE: FloatingSize = { width: 44, height: 44 };

export const clampFloatingPosition = (
  position: FloatingPosition,
  viewport: FloatingSize,
  element: FloatingSize,
  paddingPx: number = VIEWPORT_PADDING_PX,
): FloatingPosition => {
  const maxX = Math.max(paddingPx, viewport.width - element.width - paddingPx);
  const maxY = Math.max(paddingPx, viewport.height - element.height - paddingPx);
  return {
    x: Math.min(Math.max(paddingPx, position.x), maxX),
    y: Math.min(Math.max(paddingPx, position.y), maxY),
  };
};

export const snapFloatingPosition = (
  position: FloatingPosition,
  viewport: FloatingSize,
  element: FloatingSize,
  paddingPx: number = VIEWPORT_PADDING_PX,
  thresholdPx: number = SNAP_THRESHOLD_PX,
): FloatingPosition => {
  const right = viewport.width - element.width - paddingPx;
  const bottom = viewport.height - element.height - paddingPx;
  const next = { ...position };

  if (Math.abs(position.x - paddingPx) <= thresholdPx) next.x = paddingPx;
  if (Math.abs(position.y - paddingPx) <= thresholdPx) next.y = paddingPx;
  if (Math.abs(position.x - right) <= thresholdPx) next.x = right;
  if (Math.abs(position.y - bottom) <= thresholdPx) next.y = bottom;
  return next;
};

export const getDefaultZoneLanePanelPosition = (): FloatingPosition => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return {
    x: Math.max(VIEWPORT_PADDING_PX, viewportWidth - FALLBACK_PANEL_SIZE.width - VIEWPORT_PADDING_PX),
    y: 92,
  };
};

export const getDefaultZoneLanePanelIconPosition = (): FloatingPosition => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return {
    x: Math.max(VIEWPORT_PADDING_PX, viewportWidth - FALLBACK_ICON_SIZE.width - VIEWPORT_PADDING_PX),
    y: 92,
  };
};
