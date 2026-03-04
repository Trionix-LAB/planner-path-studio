import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type CollapsedState = {
  top: boolean;
  left: boolean;
  right: boolean;
};
type SidePanelWidthsState = {
  left: number;
  right: number;
};
export type MapPanelsCollapsedState = CollapsedState;
export type MapSidePanelWidthsState = SidePanelWidthsState;

interface MapWorkspaceFrameProps {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: ReactNode;
  collapsed?: MapPanelsCollapsedState;
  onCollapsedChange?: (next: MapPanelsCollapsedState) => void;
  initialCollapsed?: Partial<CollapsedState>;
  sideWidths?: MapSidePanelWidthsState;
  onSideWidthsChange?: (next: MapSidePanelWidthsState) => void;
  initialSideWidths?: Partial<MapSidePanelWidthsState>;
  minSideWidthPx?: number;
  maxSideWidthPx?: number;
}

type Side = 'left' | 'right';
const PANEL_CONTROL_ICON_CLASS = 'w-4 h-4';
const PANEL_CONTROL_LABEL_CLASS = 'text-[10px] uppercase tracking-wide';
const DEFAULT_SIDE_PANEL_WIDTHS: SidePanelWidthsState = {
  left: 224,
  right: 256,
};
const DEFAULT_MIN_SIDE_WIDTH_PX = 180;
const DEFAULT_MAX_SIDE_WIDTH_PX = 520;
const MIN_CENTER_WIDTH_PX = 360;
const TOP_TOGGLE_BUTTON_CLASS = [
  'h-12 w-10 shrink-0 border-b border-l border-border bg-card',
  'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'flex items-center justify-center transition-colors',
].join(' ');
const TOP_TOGGLE_BUTTON_COLLAPSED_CLASS = [
  'h-8 w-10 shrink-0 border-b border-l border-border bg-card',
  'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'flex items-center justify-center transition-colors',
].join(' ');
const SIDE_RESIZE_HANDLE_CLASS = [
  'h-full w-1.5 shrink-0 cursor-col-resize bg-border/80 hover:bg-border',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
].join(' ');

const clampWidth = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

interface SideCollapsedTabProps {
  side: Side;
  label: string;
  onExpand: () => void;
}

const SideCollapsedTab = ({ side, label, onExpand }: SideCollapsedTabProps) => (
  <button
    type="button"
    className={cn(
      'w-8 shrink-0 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'flex flex-col items-center justify-center gap-1.5 px-0.5 transition-colors',
      side === 'left' ? 'border-r' : 'border-l',
    )}
    aria-label={`Развернуть ${side === 'left' ? 'левую' : 'правую'} панель`}
    title={`Развернуть ${side === 'left' ? 'левую' : 'правую'} панель`}
    onClick={onExpand}
  >
    {side === 'left' ? (
      <ChevronRight className={PANEL_CONTROL_ICON_CLASS} />
    ) : (
      <ChevronLeft className={PANEL_CONTROL_ICON_CLASS} />
    )}
    <span className={cn(PANEL_CONTROL_LABEL_CLASS, '[writing-mode:vertical-rl] rotate-180')}>
      {label}
    </span>
  </button>
);

interface SideCollapseRailProps {
  side: Side;
  onCollapse: () => void;
}

const SideCollapseRail = ({ side, onCollapse }: SideCollapseRailProps) => (
  <button
    type="button"
    className={cn(
      'h-full w-6 shrink-0 border-sidebar-border bg-sidebar/70 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'flex items-center justify-center transition-colors',
      side === 'left' ? 'border-r' : 'border-l',
    )}
    aria-label={`Свернуть ${side === 'left' ? 'левую' : 'правую'} панель`}
    title={`Свернуть ${side === 'left' ? 'левую' : 'правую'} панель`}
    onClick={onCollapse}
  >
    {side === 'left' ? (
      <ChevronLeft className={PANEL_CONTROL_ICON_CLASS} />
    ) : (
      <ChevronRight className={PANEL_CONTROL_ICON_CLASS} />
    )}
  </button>
);

interface SideResizeHandleProps {
  side: Side;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

const SideResizeHandle = ({ side, onMouseDown }: SideResizeHandleProps) => (
  <div
    role="separator"
    aria-orientation="vertical"
    aria-label={side === 'left' ? 'Изменить ширину левой панели' : 'Изменить ширину правой панели'}
    title={side === 'left' ? 'Изменить ширину левой панели' : 'Изменить ширину правой панели'}
    className={SIDE_RESIZE_HANDLE_CLASS}
    onMouseDown={onMouseDown}
  />
);

const MapWorkspaceFrame = ({
  top,
  left,
  center,
  right,
  status,
  collapsed,
  onCollapsedChange,
  initialCollapsed,
  sideWidths,
  onSideWidthsChange,
  initialSideWidths,
  minSideWidthPx = DEFAULT_MIN_SIDE_WIDTH_PX,
  maxSideWidthPx = DEFAULT_MAX_SIDE_WIDTH_PX,
}: MapWorkspaceFrameProps) => {
  const [internalCollapsed, setInternalCollapsed] = useState<CollapsedState>({
    top: initialCollapsed?.top ?? false,
    left: initialCollapsed?.left ?? false,
    right: initialCollapsed?.right ?? false,
  });
  const [internalSideWidths, setInternalSideWidths] = useState<SidePanelWidthsState>({
    left: initialSideWidths?.left ?? DEFAULT_SIDE_PANEL_WIDTHS.left,
    right: initialSideWidths?.right ?? DEFAULT_SIDE_PANEL_WIDTHS.right,
  });
  const workspaceBodyRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const currentCollapsed = collapsed ?? internalCollapsed;
  const currentSideWidths = useMemo(
    () => ({
      left: clampWidth(sideWidths?.left ?? internalSideWidths.left, minSideWidthPx, maxSideWidthPx),
      right: clampWidth(sideWidths?.right ?? internalSideWidths.right, minSideWidthPx, maxSideWidthPx),
    }),
    [internalSideWidths.left, internalSideWidths.right, maxSideWidthPx, minSideWidthPx, sideWidths?.left, sideWidths?.right],
  );

  const updateCollapsed = (updater: (prev: MapPanelsCollapsedState) => MapPanelsCollapsedState) => {
    const next = updater(currentCollapsed);
    if (!collapsed) {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  const applySideWidths = useCallback(
    (next: SidePanelWidthsState) => {
      const normalized: SidePanelWidthsState = {
        left: clampWidth(next.left, minSideWidthPx, maxSideWidthPx),
        right: clampWidth(next.right, minSideWidthPx, maxSideWidthPx),
      };
      if (!sideWidths) {
        setInternalSideWidths(normalized);
      }
      onSideWidthsChange?.(normalized);
    },
    [maxSideWidthPx, minSideWidthPx, onSideWidthsChange, sideWidths],
  );

  const cleanupResize = useCallback(() => {
    if (resizeCleanupRef.current) {
      resizeCleanupRef.current();
      resizeCleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupResize();
    };
  }, [cleanupResize]);

  const startSideResize = useCallback(
    (side: Side, event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const container = workspaceBodyRef.current;
      if (!container) return;

      cleanupResize();
      event.preventDefault();

      const startX = event.clientX;
      const startLeft = currentSideWidths.left;
      const startRight = currentSideWidths.right;
      const containerWidth = container.getBoundingClientRect().width;
      const leftVisible = !currentCollapsed.left;
      const rightVisible = !currentCollapsed.right;
      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const getBounds = (otherVisible: boolean, otherWidth: number) => {
        const maxByCenter = containerWidth - MIN_CENTER_WIDTH_PX - (otherVisible ? otherWidth : 0);
        const upper = Math.min(maxSideWidthPx, Math.max(minSideWidthPx, Math.round(maxByCenter)));
        const lower = Math.min(minSideWidthPx, upper);
        return { lower, upper };
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === 'left') {
          const bounds = getBounds(rightVisible, startRight);
          const leftWidth = clampWidth(startLeft + delta, bounds.lower, bounds.upper);
          applySideWidths({ left: leftWidth, right: startRight });
          return;
        }
        const bounds = getBounds(leftVisible, startLeft);
        const rightWidth = clampWidth(startRight - delta, bounds.lower, bounds.upper);
        applySideWidths({ left: startLeft, right: rightWidth });
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
        resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current = handleMouseUp;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [applySideWidths, cleanupResize, currentCollapsed.left, currentCollapsed.right, currentSideWidths.left, currentSideWidths.right, maxSideWidthPx, minSideWidthPx],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {currentCollapsed.top ? (
        <div className="h-8 shrink-0 bg-card border-b border-border flex">
          <div className="flex-1" />
          <button
            type="button"
            className={TOP_TOGGLE_BUTTON_COLLAPSED_CLASS}
            aria-label="Развернуть верхнюю панель"
            onClick={() => updateCollapsed((prev) => ({ ...prev, top: false }))}
          >
            <ChevronDown className={PANEL_CONTROL_ICON_CLASS} />
          </button>
        </div>
      ) : (
        <div className="shrink-0 min-w-0 flex">
          <div className="min-w-0 flex-1">{top}</div>
          <button
            type="button"
            className={TOP_TOGGLE_BUTTON_CLASS}
            aria-label="Свернуть верхнюю панель"
            title="Свернуть верхнюю панель"
            onClick={() => updateCollapsed((prev) => ({ ...prev, top: true }))}
          >
            <ChevronUp className={PANEL_CONTROL_ICON_CLASS} />
          </button>
        </div>
      )}

      <div ref={workspaceBodyRef} className="flex-1 min-h-0 flex overflow-hidden">
        {currentCollapsed.left ? (
          <SideCollapsedTab
            side="left"
            label="Слои"
            onExpand={() => updateCollapsed((prev) => ({ ...prev, left: false }))}
          />
        ) : (
          <>
            <div className="h-full shrink-0 flex">
              <div className="h-full min-w-0" style={{ width: `${currentSideWidths.left}px` }}>
                {left}
              </div>
              <SideCollapseRail
                side="left"
                onCollapse={() => updateCollapsed((prev) => ({ ...prev, left: true }))}
              />
            </div>
            <SideResizeHandle side="left" onMouseDown={(event) => startSideResize('left', event)} />
          </>
        )}

        <div className="flex-1 min-w-0 relative">{center}</div>

        {currentCollapsed.right ? (
          <SideCollapsedTab
            side="right"
            label="Свойства"
            onExpand={() => updateCollapsed((prev) => ({ ...prev, right: false }))}
          />
        ) : (
          <>
            <SideResizeHandle side="right" onMouseDown={(event) => startSideResize('right', event)} />
            <div className="h-full shrink-0 flex">
              <SideCollapseRail
                side="right"
                onCollapse={() => updateCollapsed((prev) => ({ ...prev, right: true }))}
              />
              <div className="h-full min-w-0" style={{ width: `${currentSideWidths.right}px` }}>
                {right}
              </div>
            </div>
          </>
        )}
      </div>

      {status}
    </div>
  );
};

export default MapWorkspaceFrame;
