import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Route, MapPin, Grid3X3, Ruler, Waves, Circle, LocateFixed, Trash2, Anchor, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapObject } from '@/features/map/model/types';
import type { DiverUiConfig, TrackRecorderStatus } from '@/features/mission';

interface LeftPanelProps {
  layers: {
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
  selectedAgentId: string | null;
  pinnedAgentId: string | null;
  onAgentSelect: (agentUid: string) => void;
  onAgentCenter?: (agentUid: string) => void;
  onAgentToggleRecording?: (agentUid: string) => void;
  onAgentPin?: (agentUid: string) => void;
  isDraft: boolean;
  isRecordingEnabled: boolean;
  objects: MapObject[];
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onObjectCenter?: (id: string) => void;
  onObjectDelete?: (id: string) => void;
}

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
  selectedAgentId,
  pinnedAgentId,
  onAgentSelect,
  onAgentCenter,
  onAgentToggleRecording,
  onAgentPin,
  isDraft,
  isRecordingEnabled,
  objects,
  selectedObjectId,
  onObjectSelect,
  onObjectCenter,
  onObjectDelete,
}: LeftPanelProps) => {
  const layerItems = [
    { key: 'diver' as const, icon: Waves, label: 'Водолаз', locked: true },
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
      <div className="panel-header">
        <Eye className="w-4 h-4 inline mr-2" />
        Слои
      </div>
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

      <div className="border-t border-sidebar-border mt-1.5" />

      {/* Agents */}
      <div className="panel-header">
        <Waves className="w-4 h-4 inline mr-2" />
        Агенты
      </div>
      <div className="p-1.5 space-y-1">
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

      <div className="border-t border-sidebar-border mt-1" />

      <div className="panel-header">Объекты</div>
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
    </div>
  );
};

export default LeftPanel;
