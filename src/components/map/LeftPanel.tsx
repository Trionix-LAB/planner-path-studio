import { useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Eye,
  EyeOff,
  Route,
  MapPin,
  Grid3X3,
  Ruler,
  Waves,
  Circle,
  LocateFixed,
  Trash2,
  Anchor,
  Pin,
  Square,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapObject } from '@/features/map/model/types';
import type { DiverUiConfig, TrackRecorderStatus } from '@/features/mission';

export type LeftPanelSectionsCollapsedState = {
  layers: boolean;
  agents: boolean;
  rasters: boolean;
  vectors: boolean;
  objects: boolean;
};

const DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED: LeftPanelSectionsCollapsedState = {
  layers: false,
  agents: false,
  rasters: false,
  vectors: false,
  objects: false,
};

interface LeftPanelProps {
  layers: {
    basemap: boolean;
    track: boolean;
    routes: boolean;
    markers: boolean;
    baseStation: boolean;
    grid: boolean;
    scaleBar: boolean;
    diver: boolean;
  };
  onLayerToggle: (layer: keyof LeftPanelProps['layers']) => void;
  divers: DiverUiConfig[];
  trackStatusByAgentId: Record<string, TrackRecorderStatus>;
  baseStationTrackStatus: TrackRecorderStatus;
  selectedAgentId: string | null;
  pinnedAgentId: string | null;
  onAgentSelect: (agentUid: string) => void;
  onAgentCenter?: (agentUid: string) => void;
  onAgentToggleRecording?: (agentUid: string) => void;
  onBaseStationTrackAction?: (action: 'start' | 'pause' | 'stop') => void;
  onAgentPin?: (agentUid: string) => void;
  isDraft: boolean;
  isRecordingEnabled: boolean;
  objects: MapObject[];
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onObjectCenter?: (id: string) => void;
  onObjectDelete?: (id: string) => void;
  rasterOverlays?: Array<{
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    zIndex: number;
  }>;
  onRasterOverlayToggle?: (id: string) => void;
  onRasterOverlayOpacityChange?: (id: string, opacity: number) => void;
  onRasterOverlayMove?: (id: string, delta: -1 | 1) => void;
  onRasterOverlayDelete?: (id: string) => void;
  onRasterOverlayCenter?: (id: string) => void;
  onRasterOverlayToggleAll?: () => void;
  vectorOverlays?: Array<{
    id: string;
    name: string;
    color?: string;
    visible: boolean;
    opacity: number;
    zIndex: number;
  }>;
  onVectorOverlayToggle?: (id: string) => void;
  onVectorOverlayOpacityChange?: (id: string, opacity: number) => void;
  onVectorOverlayColorChange?: (id: string, color: string) => void;
  onVectorOverlayMove?: (id: string, delta: -1 | 1) => void;
  onVectorOverlayDelete?: (id: string) => void;
  onVectorOverlayCenter?: (id: string) => void;
  onVectorOverlayToggleAll?: () => void;
  sectionsCollapsed?: LeftPanelSectionsCollapsedState;
  onSectionsCollapsedChange?: (next: LeftPanelSectionsCollapsedState) => void;
}

const BASE_STATION_AGENT_ID = 'base-station';

const getObjectColor = (obj: MapObject): string => {
  if (obj.color) return obj.color;
  if (obj.type === 'zone') return 'hsl(38, 92%, 50%)';
  if (obj.type === 'marker') return 'hsl(142, 71%, 45%)';
  return 'hsl(199, 89%, 48%)';
};

const LeftPanel = ({
  layers,
  onLayerToggle,
  divers,
  trackStatusByAgentId,
  baseStationTrackStatus,
  selectedAgentId,
  pinnedAgentId,
  onAgentSelect,
  onAgentCenter,
  onAgentToggleRecording,
  onBaseStationTrackAction,
  onAgentPin,
  isDraft,
  isRecordingEnabled,
  objects,
  selectedObjectId,
  onObjectSelect,
  onObjectCenter,
  onObjectDelete,
  rasterOverlays = [],
  onRasterOverlayToggle,
  onRasterOverlayOpacityChange,
  onRasterOverlayMove,
  onRasterOverlayDelete,
  onRasterOverlayCenter,
  onRasterOverlayToggleAll,
  vectorOverlays = [],
  onVectorOverlayToggle,
  onVectorOverlayOpacityChange,
  onVectorOverlayColorChange,
  onVectorOverlayMove,
  onVectorOverlayDelete,
  onVectorOverlayCenter,
  onVectorOverlayToggleAll,
  sectionsCollapsed,
  onSectionsCollapsedChange,
}: LeftPanelProps) => {
  const vectorColorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [localSectionCollapsed, setLocalSectionCollapsed] = useState<LeftPanelSectionsCollapsedState>(
    DEFAULT_LEFT_PANEL_SECTIONS_COLLAPSED,
  );
  const sectionCollapsed = sectionsCollapsed ?? localSectionCollapsed;

  const toggleSection = (section: keyof LeftPanelSectionsCollapsedState) => {
    const next: LeftPanelSectionsCollapsedState = {
      ...sectionCollapsed,
      [section]: !sectionCollapsed[section],
    };
    if (onSectionsCollapsedChange) {
      onSectionsCollapsedChange(next);
      return;
    }
    setLocalSectionCollapsed(next);
  };

  const isBaseStationSelected = selectedAgentId === BASE_STATION_AGENT_ID;
  const isAllRastersHidden = rasterOverlays.length > 0 && rasterOverlays.every((o) => !o.visible);
  const isAllVectorsHidden = vectorOverlays.length > 0 && vectorOverlays.every((o) => !o.visible);
  const layerItems = [
    { key: 'diver' as const, icon: Waves, label: 'Водолаз', locked: true },
    { key: 'basemap' as const, icon: Circle, label: 'Тайловая подложка', locked: false },
    { key: 'baseStation' as const, icon: Anchor, label: 'Базовая станция', locked: false },
    { key: 'track' as const, icon: Route, label: 'Треки', locked: false },
    { key: 'routes' as const, icon: Route, label: 'Маршруты/Галсы', locked: false },
    { key: 'markers' as const, icon: MapPin, label: 'Маркеры', locked: false },
    { key: 'grid' as const, icon: Grid3X3, label: 'Сетка', locked: false },
    { key: 'scaleBar' as const, icon: Ruler, label: 'Линейка масштаба', locked: false },
  ];

  return (
    <div className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col text-[13px]">
      {/* Layers */}
      <div className="panel-header flex items-center gap-2">
        <Eye className="w-4 h-4 inline mr-2" />
        <span className="flex-1">Слои</span>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
          aria-label={sectionCollapsed.layers ? 'Развернуть секцию Слои' : 'Свернуть секцию Слои'}
          title={sectionCollapsed.layers ? 'Развернуть' : 'Свернуть'}
          onClick={() => toggleSection('layers')}
        >
          {sectionCollapsed.layers ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!sectionCollapsed.layers ? (
        <div className="p-1.5 space-y-0.5">
          {layerItems.map((item) => (
            <label
              key={item.key}
              className={`flex items-center gap-2.5 px-1.5 py-1 rounded hover:bg-sidebar-accent cursor-pointer ${
                item.locked ? 'opacity-75' : ''
              }`}
            >
              <Checkbox
                checked={layers[item.key]}
                disabled={item.locked}
                onCheckedChange={() => onLayerToggle(item.key)}
              />
              <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[13px] leading-5">{item.label}</span>
              {item.locked && (
                <span className="text-[11px] leading-4 text-muted-foreground ml-auto">(фикс.)</span>
              )}
            </label>
          ))}
        </div>
      ) : null}

      <div className="border-t border-sidebar-border mt-1.5" />

      {/* Agents */}
      <div className="panel-header flex items-center gap-2">
        <Waves className="w-4 h-4 inline mr-2" />
        <span className="flex-1">Агенты</span>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
          aria-label={sectionCollapsed.agents ? 'Развернуть секцию Агенты' : 'Свернуть секцию Агенты'}
          title={sectionCollapsed.agents ? 'Развернуть' : 'Свернуть'}
          onClick={() => toggleSection('agents')}
        >
          {sectionCollapsed.agents ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!sectionCollapsed.agents ? (
        <div className="p-1.5 space-y-1">
        <div
          className={cn(
            'p-1.5 rounded border group cursor-pointer transition-colors',
            isBaseStationSelected
              ? 'bg-primary/20 border-primary/40'
              : 'bg-sidebar-accent border-sidebar-border/80 hover:bg-sidebar-accent/80',
          )}
          role="button"
          tabIndex={0}
          aria-label="Базовая станция"
          aria-pressed={isBaseStationSelected}
          onClick={() => onAgentSelect(BASE_STATION_AGENT_ID)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAgentSelect(BASE_STATION_AGENT_ID);
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="font-medium leading-5 flex-1 min-w-0 truncate">Базовая станция</div>
            {baseStationTrackStatus === 'recording' && (
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0 animate-pulse" aria-label="Запись идёт" />
            )}
            {baseStationTrackStatus === 'paused' && (
              <span className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" aria-label="Запись на паузе" />
            )}
          </div>
          {!isDraft && onBaseStationTrackAction ? (
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-opacity',
                  baseStationTrackStatus === 'recording'
                    ? 'opacity-40 text-muted-foreground cursor-not-allowed'
                    : 'text-muted-foreground hover:text-success hover:bg-success/10 opacity-0 group-hover:opacity-100',
                  !isRecordingEnabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground hover:bg-transparent',
                  baseStationTrackStatus === 'paused' && 'opacity-100',
                )}
                disabled={!isRecordingEnabled || baseStationTrackStatus === 'recording'}
                aria-label="Начать запись базовой станции"
                title={baseStationTrackStatus === 'paused' ? 'Продолжить запись' : 'Начать запись'}
                onClick={(e) => {
                  e.stopPropagation();
                  onBaseStationTrackAction('start');
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </button>
              <button
                type="button"
                className={cn(
                  'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-opacity',
                  baseStationTrackStatus === 'recording'
                    ? 'text-red-500 hover:text-red-600 hover:bg-red-500/10 opacity-100'
                    : 'text-muted-foreground opacity-40 cursor-not-allowed',
                  !isRecordingEnabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground hover:bg-transparent',
                )}
                disabled={!isRecordingEnabled || baseStationTrackStatus !== 'recording'}
                aria-label="Пауза записи базовой станции"
                title="Пауза записи"
                onClick={(e) => {
                  e.stopPropagation();
                  onBaseStationTrackAction('pause');
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                className={cn(
                  'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-opacity',
                  baseStationTrackStatus !== 'stopped'
                    ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100'
                    : 'text-muted-foreground opacity-40 cursor-not-allowed',
                  !isRecordingEnabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground hover:bg-transparent',
                )}
                disabled={!isRecordingEnabled || baseStationTrackStatus === 'stopped'}
                aria-label="Завершить трек базовой станции"
                title="Завершить трек"
                onClick={(e) => {
                  e.stopPropagation();
                  onBaseStationTrackAction('stop');
                }}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          ) : null}
        </div>
        {divers.map((diver) => {
          const agentStatus = trackStatusByAgentId[diver.uid] ?? 'stopped';
          const isRecording = agentStatus === 'recording';
          const isPaused = agentStatus === 'paused';
          const isSelected = selectedAgentId === diver.uid;
          const isPinned = pinnedAgentId === diver.uid;

          return (
            <div
              key={diver.uid}
              className={cn(
                'p-1.5 rounded text-[13px] cursor-pointer transition-colors group',
                isSelected
                  ? 'bg-primary/20 border border-primary/40'
                  : 'bg-sidebar-accent hover:bg-sidebar-accent/80',
              )}
              role="button"
              tabIndex={0}
              aria-label={`Агент ${diver.title}`}
              aria-pressed={isSelected}
              onClick={() => onAgentSelect(diver.uid)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAgentSelect(diver.uid);
                }
              }}
            >
              <div className="flex items-center gap-1.5">
                {/* Color indicator */}
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: diver.marker_color }}
                  aria-hidden
                />
                {/* Title */}
                <div className="font-medium leading-5 flex-1 min-w-0 truncate">
                  {diver.title}
                </div>
                {/* Recording status indicator */}
                {isRecording && (
                  <span
                    className="h-2 w-2 rounded-full bg-red-500 shrink-0 animate-pulse"
                    title="Запись"
                    aria-label="Запись идёт"
                  />
                )}
                {isPaused && (
                  <span
                    className="h-2 w-2 rounded-full bg-yellow-500 shrink-0"
                    title="Пауза"
                    aria-label="Запись на паузе"
                  />
                )}
                {/* Record/Pause toggle */}
                {onAgentToggleRecording && !isDraft && (
                  <button
                    type="button"
                    disabled={!isRecordingEnabled}
                    className={cn(
                      'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-opacity',
                      isRecording
                        ? 'text-red-500 hover:text-red-600 hover:bg-red-500/10'
                        : 'text-muted-foreground hover:text-success hover:bg-success/10 opacity-0 group-hover:opacity-100',
                      isRecording && 'opacity-100',
                      !isRecordingEnabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground hover:bg-transparent',
                    )}
                    aria-label={isRecording ? `Пауза записи ${diver.title}` : `Начать запись ${diver.title}`}
                    title={isRecording ? 'Пауза записи' : 'Начать запись'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRecordingEnabled) return;
                      onAgentToggleRecording(diver.uid);
                    }}
                  >
                    {isRecording ? (
                      /* Pause icon */
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      /* Record icon (filled circle) */
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    )}
                  </button>
                )}
                {/* Pin follow */}
                {onAgentPin && (
                  <button
                    type="button"
                    className={cn(
                      'h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm transition-opacity',
                      isPinned
                        ? 'text-primary bg-primary/10 opacity-100'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100',
                    )}
                    aria-label={isPinned ? `Открепить слежение ${diver.title}` : `Закрепить слежение ${diver.title}`}
                    title={isPinned ? 'Открепить слежение' : 'Закрепить слежение'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgentPin(diver.uid);
                    }}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Center on agent */}
                {onAgentCenter && (
                  <button
                    type="button"
                    className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Переместиться к ${diver.title}`}
                    title={`Переместиться к ${diver.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgentCenter(diver.uid);
                    }}
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Sub-info: beacon/source */}
              <div className="text-[11px] leading-4 text-muted-foreground mt-0.5">
                {`Beacon #${diver.beacon_id}`}
                {isRecording && (
                  <span className="ml-2 text-success font-medium">● Запись</span>
                )}
                {isPaused && (
                  <span className="ml-2 text-warning font-medium">⏸ Пауза</span>
                )}
              </div>
            </div>
          );
        })}
        {divers.length === 0 && (
          <div className="p-1.5 text-[11px] leading-4 text-muted-foreground">
            Нет агентов. Добавьте их в настройках.
          </div>
        )}
        </div>
      ) : null}

      <div className="border-t border-sidebar-border mt-1" />

      <div className="panel-header flex items-center gap-1">
        <span className="flex-1">Растры</span>
        {rasterOverlays.length > 0 && onRasterOverlayToggleAll ? (
          <button
            type="button"
            className="h-6 w-6 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            aria-label={isAllRastersHidden ? 'Показать все растры' : 'Скрыть все растры'}
            title={isAllRastersHidden ? 'Показать все растры' : 'Скрыть все растры'}
            onClick={onRasterOverlayToggleAll}
          >
            {isAllRastersHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
          aria-label={sectionCollapsed.rasters ? 'Развернуть секцию Растры' : 'Свернуть секцию Растры'}
          title={sectionCollapsed.rasters ? 'Развернуть' : 'Свернуть'}
          onClick={() => toggleSection('rasters')}
        >
          {sectionCollapsed.rasters ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!sectionCollapsed.rasters ? (
        <div className="p-1.5 space-y-1.5">
        {rasterOverlays.length > 0 ? (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {rasterOverlays
              .slice()
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((overlay) => (
                <div key={overlay.id} className="p-1 rounded bg-sidebar-accent/70 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="truncate flex-1">{overlay.name}</span>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onRasterOverlayCenter?.(overlay.id)}
                      title="Переместиться к растру"
                      aria-label={`Переместиться к растру ${overlay.name}`}
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onRasterOverlayToggle?.(overlay.id)}
                      title={overlay.visible ? 'Скрыть растр' : 'Показать растр'}
                      aria-label={overlay.visible ? `Скрыть растр ${overlay.name}` : `Показать растр ${overlay.name}`}
                    >
                      {overlay.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onRasterOverlayMove?.(overlay.id, 1)}
                      title="Выше"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onRasterOverlayMove?.(overlay.id, -1)}
                      title="Ниже"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-destructive/20"
                      onClick={() => onRasterOverlayDelete?.(overlay.id)}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(overlay.opacity * 100)}
                    className="w-full"
                    onChange={(event) =>
                      onRasterOverlayOpacityChange?.(
                        overlay.id,
                        Math.max(0, Math.min(1, Number(event.target.value) / 100)),
                      )
                    }
                  />
                </div>
              ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">Нет импортированных растров</div>
        )}
        </div>
      ) : null}

      <div className="border-t border-sidebar-border mt-1" />

      <div className="panel-header flex items-center gap-1">
        <span className="flex-1">Векторные слои</span>
        {vectorOverlays.length > 0 && onVectorOverlayToggleAll ? (
          <button
            type="button"
            className="h-6 w-6 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            aria-label={isAllVectorsHidden ? 'Показать все векторные слои' : 'Скрыть все векторные слои'}
            title={isAllVectorsHidden ? 'Показать все векторные слои' : 'Скрыть все векторные слои'}
            onClick={onVectorOverlayToggleAll}
          >
            {isAllVectorsHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
          aria-label={sectionCollapsed.vectors ? 'Развернуть секцию Векторные слои' : 'Свернуть секцию Векторные слои'}
          title={sectionCollapsed.vectors ? 'Развернуть' : 'Свернуть'}
          onClick={() => toggleSection('vectors')}
        >
          {sectionCollapsed.vectors ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!sectionCollapsed.vectors ? (
        <div className="p-1.5 space-y-1.5">
        {vectorOverlays.length > 0 ? (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {vectorOverlays
              .slice()
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((overlay) => (
                <div
                  key={overlay.id}
                  className="p-1 rounded bg-sidebar-accent/70 text-[11px]"
                  onContextMenu={(event) => {
                    if (!onVectorOverlayColorChange) return;
                    event.preventDefault();
                    vectorColorInputRefs.current[overlay.id]?.click();
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: overlay.color ?? '#0f766e' }}
                      aria-hidden
                    />
                    <span className="truncate flex-1">{overlay.name}</span>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onVectorOverlayCenter?.(overlay.id)}
                      title="Переместиться к слою"
                      aria-label={`Переместиться к слою ${overlay.name}`}
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onVectorOverlayToggle?.(overlay.id)}
                      title={overlay.visible ? 'Скрыть слой' : 'Показать слой'}
                      aria-label={overlay.visible ? `Скрыть слой ${overlay.name}` : `Показать слой ${overlay.name}`}
                    >
                      {overlay.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onVectorOverlayMove?.(overlay.id, 1)}
                      title="Выше"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-sidebar-accent"
                      onClick={() => onVectorOverlayMove?.(overlay.id, -1)}
                      title="Ниже"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="h-5 w-5 rounded hover:bg-destructive/20"
                      onClick={() => onVectorOverlayDelete?.(overlay.id)}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(overlay.opacity * 100)}
                    className="w-full"
                    onChange={(event) =>
                      onVectorOverlayOpacityChange?.(
                        overlay.id,
                        Math.max(0, Math.min(1, Number(event.target.value) / 100)),
                      )
                    }
                  />
                  {onVectorOverlayColorChange ? (
                    <input
                      ref={(node) => {
                        vectorColorInputRefs.current[overlay.id] = node;
                      }}
                      type="color"
                      value={overlay.color ?? '#0f766e'}
                      className="sr-only"
                      aria-label={`Цвет слоя ${overlay.name}`}
                      onChange={(event) => onVectorOverlayColorChange(overlay.id, event.target.value)}
                    />
                  ) : null}
                </div>
              ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">Нет импортированных векторных слоев</div>
        )}
        </div>
      ) : null}

      <div className="border-t border-sidebar-border mt-1" />

      <div className="panel-header flex items-center gap-2">
        <span className="flex-1">Объекты</span>
        <button
          type="button"
          className="h-5 w-5 inline-flex items-center justify-center rounded-sm hover:bg-sidebar-accent"
          aria-label={sectionCollapsed.objects ? 'Развернуть секцию Объекты' : 'Свернуть секцию Объекты'}
          title={sectionCollapsed.objects ? 'Развернуть' : 'Свернуть'}
          onClick={() => toggleSection('objects')}
        >
          {sectionCollapsed.objects ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!sectionCollapsed.objects ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5">
        {objects.map((obj) => (
          <div
            key={obj.id}
            className={cn(
              'w-full px-1.5 py-1 rounded flex items-center gap-1.5 text-[13px] transition-colors group',
              selectedObjectId === obj.id ? 'bg-primary/20 text-primary' : 'hover:bg-sidebar-accent text-foreground',
            )}
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-left flex items-center gap-1.5"
              onClick={() => onObjectSelect(obj.id)}
            >
              <Circle className="w-3 h-3 shrink-0" style={{ color: getObjectColor(obj) }} fill="currentColor" />
              <span className="truncate leading-5">{obj.name}</span>
            </button>
            {onObjectCenter && (
              <button
                type="button"
                className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Переместиться к ${obj.name}`}
                title={`Переместиться к ${obj.name}`}
                onClick={() => onObjectCenter(obj.id)}
              >
                <LocateFixed className="w-3.5 h-3.5" />
              </button>
            )}
            {onObjectDelete && (
              <button
                type="button"
                className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Удалить ${obj.name}`}
                title={`Удалить ${obj.name}`}
                onClick={() => onObjectDelete(obj.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {objects.length === 0 && (
          <div className="p-1.5 text-center text-[11px] leading-4 text-muted-foreground">
            Нет объектов. Создайте их инструментами на карте.
          </div>
        )}
        </div>
      ) : null}
    </div>
  );
};

export default LeftPanel;
