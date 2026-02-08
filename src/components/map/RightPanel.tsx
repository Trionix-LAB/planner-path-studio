import type { MapObject } from "@/features/map/model/types";
import { Wifi, WifiOff, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import MapObjectProperties from './MapObjectProperties';
import type { AppUiDefaults } from '@/features/settings';

interface RightPanelProps {
  diverData: {
    lat: number;
    lon: number;
    speed: number;
    course: number;
    depth: number;
  };
  coordPrecision: number;
  styles: AppUiDefaults['styles'];
  connectionStatus: 'ok' | 'timeout' | 'error';
  trackStatus: 'recording' | 'paused' | 'stopped';
  trackId: number;
  selectedObject: MapObject | null;
  selectedZoneLanesOutdated: boolean;
  selectedZoneLaneCount: number | null;
  onObjectSelect: (id: string | null) => void;
  onObjectUpdate?: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string) => void;
  onPickLaneEdge?: (id: string) => void;
  onPickLaneStart?: (id: string) => void;
}

const RightPanel = ({
  diverData,
  coordPrecision,
  styles,
  connectionStatus,
  trackStatus,
  trackId,
  selectedObject,
  selectedZoneLanesOutdated,
  selectedZoneLaneCount,
  onObjectSelect,
  onObjectUpdate,
  onObjectDelete,
  onRegenerateLanes,
  onPickLaneEdge,
  onPickLaneStart,
}: RightPanelProps) => {
  return (
    <div className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col h-full text-[13px]">
      {/* HUD */}
      <div className="panel-header">HUD</div>
      <div className="p-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Широта</div>
            <div className="data-value text-foreground">{diverData.lat.toFixed(coordPrecision)}°</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Долгота</div>
            <div className="data-value text-foreground">{diverData.lon.toFixed(coordPrecision)}°</div>
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
            <div className="data-value text-base text-primary font-semibold leading-5">
              {diverData.depth.toFixed(1)} м
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-sidebar-border" />

      {/* Status */}
      <div className="panel-header">Статус</div>
      <div className="p-2.5 space-y-1.5">
        {/* Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {connectionStatus === 'ok' ? (
              <Wifi className="w-4 h-4 text-success" />
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
            <span className="text-[13px] leading-5">Связь</span>
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
            <span className="text-[13px] leading-5">Запись</span>
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
          <span className="text-[13px] text-muted-foreground leading-5">Активный трек</span>
          <span className="text-[13px] font-mono leading-5">#{trackId}</span>
        </div>
      </div>

      <div className="border-t border-sidebar-border" />

      <div className="panel-header">Свойства объекта</div>
      <div className="flex-1 min-h-0">
        {selectedObject && onObjectUpdate ? (
          <MapObjectProperties
            object={selectedObject}
            styles={styles}
            onSave={onObjectUpdate}
            onClose={() => onObjectSelect(null)}
            onDelete={onObjectDelete}
            onRegenerateLanes={onRegenerateLanes}
            onPickLaneEdge={onPickLaneEdge}
            onPickLaneStart={onPickLaneStart}
            zoneLanesOutdated={selectedObject.type === 'zone' ? selectedZoneLanesOutdated : undefined}
            zoneLaneCount={selectedObject.type === 'zone' ? selectedZoneLaneCount : undefined}
          />
        ) : (
          <div className="h-full flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Выберите объект на карте или в левой панели.
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
