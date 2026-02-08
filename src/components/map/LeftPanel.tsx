import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Route, MapPin, Grid3X3, Ruler, Waves, Circle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapObject } from '@/features/map/model/types';
import type { MissionDocument } from '@/features/mission';

interface LeftPanelProps {
  layers: {
    track: boolean;
    routes: boolean;
    markers: boolean;
    grid: boolean;
    scaleBar: boolean;
    diver: boolean;
  };
  onLayerToggle: (layer: keyof LeftPanelProps['layers']) => void;
  objects: MapObject[];
  missionDocument: MissionDocument | null;
  trackStatus: 'recording' | 'paused' | 'stopped';
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onObjectDelete?: (id: string) => void;
  onTrackDelete?: (id: string) => void;
}

const getObjectColor = (obj: MapObject): string => {
  if (obj.color) return obj.color;
  if (obj.type === 'zone') return 'hsl(38, 92%, 50%)';
  if (obj.type === 'marker') return 'hsl(142, 71%, 45%)';
  return 'hsl(199, 89%, 48%)';
};

const formatTrackTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const LeftPanel = ({
  layers,
  onLayerToggle,
  objects,
  missionDocument,
  trackStatus,
  selectedObjectId,
  onObjectSelect,
  onObjectDelete,
  onTrackDelete,
}: LeftPanelProps) => {
  const layerItems = [
    { key: 'diver' as const, icon: Waves, label: 'Водолаз', locked: true },
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

      {/* Tracks */}
      <div className="panel-header">
        Треки миссии
      </div>
      <div className="p-1.5 space-y-1">
        {(missionDocument?.tracks ?? []).map((track, index) => {
          const isActive = missionDocument?.active_track_id === track.id && trackStatus === 'recording';
          return (
            <div
              key={track.id}
              className={`p-1.5 rounded text-[13px] ${
                isActive
                ? 'bg-primary/20 border border-primary/40'
                : 'bg-sidebar-accent'
              } group`}
            >
              <div className="flex items-center gap-1">
                <div className="font-medium leading-5 flex-1 min-w-0 truncate">{`Трек ${index + 1}`}</div>
                {onTrackDelete && (
                  <button
                    type="button"
                    className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Удалить трек ${index + 1}`}
                    title={`Удалить трек ${index + 1}`}
                    onClick={() => onTrackDelete(track.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-[11px] leading-4 text-muted-foreground font-mono">
                {`${formatTrackTime(track.started_at)} - ${track.ended_at ? formatTrackTime(track.ended_at) : '...'}`}
              </div>
              {isActive && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="status-indicator status-ok" />
                  <span className="text-[11px] leading-4 text-success">Запись</span>
                </div>
              )}
            </div>
          );
        })}
        {(missionDocument?.tracks.length ?? 0) === 0 && (
          <div className="p-1.5 text-[11px] leading-4 text-muted-foreground">
            Треки пока не записаны.
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
