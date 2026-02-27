import { GripHorizontal, Minimize2, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  FALLBACK_ICON_SIZE,
  FALLBACK_PANEL_SIZE,
  clampFloatingPosition,
  snapFloatingPosition,
  type FloatingPosition,
  type FloatingSize,
} from './zoneDraftLanePanelUtils';

type LanePickMode = 'none' | 'edge' | 'start';
type DragTarget = 'panel' | 'icon';

type DragState = {
  target: DragTarget;
  pointerOffsetX: number;
  pointerOffsetY: number;
  element: FloatingSize;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type ZoneDraftLanePanelProps = {
  open: boolean;
  minimized: boolean;
  panelPosition: FloatingPosition;
  iconPosition: FloatingPosition;
  laneAngle: string;
  laneWidth: string;
  laneBearingDeg: number | null;
  laneStart: { lat: number; lon: number } | null;
  drawingPointsCount: number;
  previewLanesCount: number;
  lanePickMode: LanePickMode;
  onDragStart?: () => void;
  onPanelPositionChange: (next: FloatingPosition) => void;
  onIconPositionChange: (next: FloatingPosition) => void;
  onMinimizedChange: (next: boolean) => void;
  onLaneAngleChange: (value: string) => void;
  onLaneWidthChange: (value: string) => void;
  onLanePickModeChange: (next: LanePickMode) => void;
  onCancelDraft: () => void;
  onCompleteDraft: () => void;
};

const resolveViewport = (): FloatingSize => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1280,
  height: typeof window !== 'undefined' ? window.innerHeight : 720,
});

export const ZoneDraftLanePanel = ({
  open,
  minimized,
  panelPosition,
  iconPosition,
  laneAngle,
  laneWidth,
  laneBearingDeg,
  laneStart,
  drawingPointsCount,
  previewLanesCount,
  lanePickMode,
  onDragStart,
  onPanelPositionChange,
  onIconPositionChange,
  onMinimizedChange,
  onLaneAngleChange,
  onLaneWidthChange,
  onLanePickModeChange,
  onCancelDraft,
  onCompleteDraft,
}: ZoneDraftLanePanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const getPositionFromPointer = useCallback((event: MouseEvent): FloatingPosition => {
    const state = dragStateRef.current;
    if (!state) return { x: 0, y: 0 };

    const viewport = resolveViewport();
    const raw = {
      x: event.clientX - state.pointerOffsetX,
      y: event.clientY - state.pointerOffsetY,
    };
    return clampFloatingPosition(raw, viewport, state.element);
  }, []);

  const handlePointerMove = useCallback((event: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state) return;

    if (!state.moved) {
      const dx = Math.abs(event.clientX - state.startClientX);
      const dy = Math.abs(event.clientY - state.startClientY);
      if (dx > 3 || dy > 3) state.moved = true;
    }

    const next = getPositionFromPointer(event);
    if (state.target === 'panel') {
      onPanelPositionChange(next);
    } else {
      onIconPositionChange(next);
    }
  }, [getPositionFromPointer, onIconPositionChange, onPanelPositionChange]);

  const handlePointerUp = useCallback((event: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state) return;

    const viewport = resolveViewport();
    const clamped = getPositionFromPointer(event);
    const snapped = snapFloatingPosition(clamped, viewport, state.element);

    if (state.target === 'panel') {
      onPanelPositionChange(snapped);
    } else {
      onIconPositionChange(snapped);
      if (!state.moved) {
        onMinimizedChange(false);
      }
    }

    dragStateRef.current = null;
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);
  }, [getPositionFromPointer, handlePointerMove, onIconPositionChange, onMinimizedChange, onPanelPositionChange]);

  const beginDrag = useCallback(
    (target: DragTarget, event: ReactMouseEvent<HTMLElement>) => {
      if (typeof event.button === 'number' && event.button !== 0) return;

      const element = target === 'panel' ? panelRef.current : iconRef.current;
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      onDragStart?.();

      const rect = element.getBoundingClientRect();
      const fallback = target === 'panel' ? FALLBACK_PANEL_SIZE : FALLBACK_ICON_SIZE;
      const elementSize = {
        width: rect.width > 0 ? rect.width : fallback.width,
        height: rect.height > 0 ? rect.height : fallback.height,
      };

      dragStateRef.current = {
        target,
        pointerOffsetX: event.clientX - rect.left,
        pointerOffsetY: event.clientY - rect.top,
        element: elementSize,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };

      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, onDragStart],
  );

  useEffect(() => {
    return () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  if (!open) return null;

  if (minimized) {
    return (
      <button
        ref={iconRef}
        type="button"
        data-testid="zone-lane-panel-icon"
        className="fixed z-[9999] h-11 w-11 rounded-full border border-border bg-popover text-popover-foreground shadow-md flex items-center justify-center"
        style={{ top: iconPosition.y, left: iconPosition.x }}
        onMouseDown={(event) => beginDrag('icon', event)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onMinimizedChange(false);
          }
        }}
        aria-label="Параметры галсов"
        title="Параметры галсов"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      data-testid="zone-lane-panel"
      className="fixed z-[9999] w-[320px] bg-popover text-popover-foreground rounded-md border border-border shadow-md p-3 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: panelPosition.y, left: panelPosition.x }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        data-testid="zone-lane-panel-drag-handle"
        className="mb-2 flex items-center justify-between gap-2 cursor-move select-none"
        onMouseDown={(event) => beginDrag('panel', event)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <span>Параметры галсов</span>
        </div>
        <button
          type="button"
          data-testid="zone-lane-panel-minimize"
          className="h-7 w-7 rounded-md border border-input flex items-center justify-center hover:bg-accent"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => onMinimizedChange(true)}
          aria-label="Свернуть панель параметров галсов"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Угол (°)</div>
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              type="number"
              min={0}
              max={360}
              step={1}
              value={laneAngle}
              onChange={(event) => onLaneAngleChange(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Ширина (м)</div>
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              type="number"
              min={1}
              max={1000}
              value={laneWidth}
              onChange={(event) => onLaneWidthChange(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Ориентация</div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-xs">
              {typeof laneBearingDeg === 'number' ? `по грани (${Math.round(laneBearingDeg)}°)` : 'авто'}
            </div>
            <button
              type="button"
              className="h-8 px-2 rounded-md border border-input text-xs hover:bg-accent"
              onClick={() => onLanePickModeChange('edge')}
              disabled={drawingPointsCount < 2}
            >
              Выбрать грань
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Старт</div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-xs">
              {laneStart ? `${laneStart.lat.toFixed(6)}, ${laneStart.lon.toFixed(6)}` : 'не выбран'}
            </div>
            <button
              type="button"
              className="h-8 px-2 rounded-md border border-input text-xs hover:bg-accent"
              onClick={() => onLanePickModeChange('start')}
              disabled={drawingPointsCount < 3}
            >
              Выбрать старт
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {drawingPointsCount < 3
            ? 'Добавьте ещё точки (минимум 3) для предпросмотра галсов.'
            : `Предпросмотр: ${previewLanesCount} галсов`}
        </div>

        {lanePickMode !== 'none' && (
          <div className="text-xs text-muted-foreground">
            {lanePickMode === 'edge' && 'Кликните по ребру зоны на карте.'}
            {lanePickMode === 'start' && 'Кликните около вершины. Старт снапается к ближайшей вершине.'}
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() => onLanePickModeChange('none')}
            >
              Отмена
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-input text-sm hover:bg-accent"
            onClick={onCancelDraft}
          >
            Удалить черновик
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            onClick={onCompleteDraft}
            disabled={drawingPointsCount < 3}
          >
            Завершить зону
          </button>
        </div>
      </div>
    </div>
  );
};
