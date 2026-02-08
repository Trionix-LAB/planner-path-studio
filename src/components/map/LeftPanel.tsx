import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Route, MapPin, Grid3X3, Ruler, Waves, Circle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapObject } from '@/features/map/model/types';

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
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onObjectDelete?: (id: string) => void;
}

const getObjectColor = (obj: MapObject): string => {
  if (obj.color) return obj.color;
  if (obj.type === 'zone') return 'hsl(38, 92%, 50%)';
  if (obj.type === 'marker') return 'hsl(142, 71%, 45%)';
  return 'hsl(199, 89%, 48%)';
};

const LeftPanel = ({ layers, onLayerToggle, objects, selectedObjectId, onObjectSelect, onObjectDelete }: LeftPanelProps) => {
  const layerItems = [
    { key: 'diver' as const, icon: Waves, label: 'Водолаз', locked: true },
    { key: 'track' as const, icon: Route, label: 'Треки', locked: false },
    { key: 'routes' as const, icon: Route, label: 'Маршруты/Галсы', locked: false },
    { key: 'markers' as const, icon: MapPin, label: 'Маркеры', locked: false },
    { key: 'grid' as const, icon: Grid3X3, label: 'Сетка', locked: false },
    { key: 'scaleBar' as const, icon: Ruler, label: 'Линейка масштаба', locked: false },
  ];

  const tracks = [
    { id: 1, name: 'Трек 1', time: '10:23 - 11:45', active: true },
    { id: 2, name: 'Трек 2', time: '14:00 - 15:30', active: false },
  ];

  return (
    <div className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Layers */}
      <div className="panel-header">
        <Eye className="w-4 h-4 inline mr-2" />
        Слои
      </div>
      <div className="p-2 space-y-1">
        {layerItems.map((item) => (
          <label
            key={item.key}
            className={`flex items-center gap-3 px-2 py-1.5 rounded hover:bg-sidebar-accent cursor-pointer ${
              item.locked ? 'opacity-75' : ''
            }`}
          >
            <Checkbox
              checked={layers[item.key]}
              disabled={item.locked}
              onCheckedChange={() => onLayerToggle(item.key)}
            />
            <item.icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{item.label}</span>
            {item.locked && (
              <span className="text-xs text-muted-foreground ml-auto">(фикс.)</span>
            )}
          </label>
        ))}
      </div>

      <div className="border-t border-sidebar-border mt-2" />

      {/* Tracks */}
      <div className="panel-header">
        Треки миссии
      </div>
      <div className="p-2 space-y-1">
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`p-2 rounded text-sm ${
              track.active
                ? 'bg-primary/20 border border-primary/40'
                : 'bg-sidebar-accent'
            }`}
          >
            <div className="font-medium">{track.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{track.time}</div>
            {track.active && (
              <div className="flex items-center gap-1 mt-1">
                <span className="status-indicator status-ok" />
                <span className="text-xs text-success">Запись</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-sidebar-border mt-1" />

      <div className="panel-header">Объекты</div>
      <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
        {objects.map((obj) => (
          <div
            key={obj.id}
            className={cn(
              'w-full px-2 py-1.5 rounded flex items-center gap-2 text-sm transition-colors group',
              selectedObjectId === obj.id ? 'bg-primary/20 text-primary' : 'hover:bg-sidebar-accent text-foreground',
            )}
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-left flex items-center gap-2"
              onClick={() => onObjectSelect(obj.id)}
            >
              <Circle className="w-3 h-3 shrink-0" style={{ color: getObjectColor(obj) }} fill="currentColor" />
              <span className="truncate">{obj.name}</span>
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
          <div className="p-2 text-center text-xs text-muted-foreground">
            Нет объектов. Создайте их инструментами на карте.
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
