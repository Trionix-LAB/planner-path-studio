import type { ReactNode } from 'react';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type CollapsedState = {
  top: boolean;
  left: boolean;
  right: boolean;
};
export type MapPanelsCollapsedState = CollapsedState;

interface MapWorkspaceFrameProps {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  status: ReactNode;
  collapsed?: MapPanelsCollapsedState;
  onCollapsedChange?: (next: MapPanelsCollapsedState) => void;
  initialCollapsed?: Partial<CollapsedState>;
}

type Side = 'left' | 'right';
const PANEL_CONTROL_ICON_CLASS = 'w-4 h-4';
const PANEL_CONTROL_LABEL_CLASS = 'text-[10px] uppercase tracking-wide';
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

const MapWorkspaceFrame = ({
  top,
  left,
  center,
  right,
  status,
  collapsed,
  onCollapsedChange,
  initialCollapsed,
}: MapWorkspaceFrameProps) => {
  const [internalCollapsed, setInternalCollapsed] = useState<CollapsedState>({
    top: initialCollapsed?.top ?? false,
    left: initialCollapsed?.left ?? false,
    right: initialCollapsed?.right ?? false,
  });
  const currentCollapsed = collapsed ?? internalCollapsed;
  const updateCollapsed = (updater: (prev: MapPanelsCollapsedState) => MapPanelsCollapsedState) => {
    const next = updater(currentCollapsed);
    if (!collapsed) {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

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

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {currentCollapsed.left ? (
          <SideCollapsedTab
            side="left"
            label="Слои"
            onExpand={() => updateCollapsed((prev) => ({ ...prev, left: false }))}
          />
        ) : (
          <div className="h-full shrink-0 flex">
            {left}
            <SideCollapseRail
              side="left"
              onCollapse={() => updateCollapsed((prev) => ({ ...prev, left: true }))}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 relative">{center}</div>

        {currentCollapsed.right ? (
          <SideCollapsedTab
            side="right"
            label="Свойства"
            onExpand={() => updateCollapsed((prev) => ({ ...prev, right: false }))}
          />
        ) : (
          <div className="h-full shrink-0 flex">
            <SideCollapseRail
              side="right"
              onCollapse={() => updateCollapsed((prev) => ({ ...prev, right: true }))}
            />
            {right}
          </div>
        )}
      </div>

      {status}
    </div>
  );
};

export default MapWorkspaceFrame;
