import { MapObject } from '@/pages/MapWorkspace';
import { Wifi, WifiOff, Radio, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RightPanelProps {
  diverData: {
    lat: number;
    lon: number;
    speed: number;
    course: number;
    depth: number;
  };
  connectionStatus: 'ok' | 'timeout' | 'error';
  trackStatus: 'recording' | 'paused' | 'stopped';
  trackId: number;
  objects: MapObject[];
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
}

const RightPanel = ({
  diverData,
  connectionStatus,
  trackStatus,
  trackId,
  objects,
  selectedObjectId,
  onObjectSelect,
}: RightPanelProps) => {
  return (
    <div className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col">
      {/* HUD */}
      <div className="panel-header">HUD</div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Широта</div>
            <div className="data-value text-foreground">{diverData.lat.toFixed(6)}°</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Долгота</div>
            <div className="data-value text-foreground">{diverData.lon.toFixed(6)}°</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Скорость</div>
            <div className="data-value text-foreground">{diverData.speed.toFixed(1)} м/с</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Курс</div>
            <div className="data-value text-foreground">{diverData.course}°</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Глубина</div>
            <div className="data-value text-lg text-primary font-semibold">
              {diverData.depth.toFixed(1)} м
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-sidebar-border" />

      {/* Status */}
      <div className="panel-header">Статус</div>
      <div className="p-3 space-y-2">
        {/* Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {connectionStatus === 'ok' ? (
              <Wifi className="w-4 h-4 text-success" />
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
            <span className="text-sm">Связь</span>
          </div>
          <span
            className={cn(
              'text-xs font-medium',
              connectionStatus === 'ok' ? 'text-success' : 'text-destructive'
            )}
          >
            {connectionStatus === 'ok' ? 'OK' : 'Таймаут'}
          </span>
        </div>

        {/* Track Recording */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio
              className={cn(
                'w-4 h-4',
                trackStatus === 'recording' && 'text-success',
                trackStatus === 'paused' && 'text-warning',
                trackStatus === 'stopped' && 'text-muted-foreground'
              )}
            />
            <span className="text-sm">Запись</span>
          </div>
          <span
            className={cn(
              'text-xs font-medium',
              trackStatus === 'recording' && 'text-success',
              trackStatus === 'paused' && 'text-warning',
              trackStatus === 'stopped' && 'text-muted-foreground'
            )}
          >
            {trackStatus === 'recording' && 'Идёт'}
            {trackStatus === 'paused' && 'Пауза'}
            {trackStatus === 'stopped' && 'Остановлена'}
          </span>
        </div>

        {/* Active Track */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Активный трек</span>
          <span className="text-sm font-mono">#{trackId}</span>
        </div>
      </div>

      <div className="border-t border-sidebar-border" />

      {/* Objects */}
      <div className="panel-header">Объекты</div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {objects.map((obj) => (
          <button
            key={obj.id}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded flex items-center gap-2 text-sm transition-colors',
              selectedObjectId === obj.id
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-sidebar-accent'
            )}
            onClick={() => onObjectSelect(obj.id)}
          >
            <Circle
              className={cn(
                'w-3 h-3',
                obj.type === 'route' && 'text-primary',
                obj.type === 'zone' && 'text-warning',
                obj.type === 'marker' && 'text-success'
              )}
              fill="currentColor"
            />
            <span className="truncate">{obj.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RightPanel;
