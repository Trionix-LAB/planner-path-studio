import type { MapObject } from "@/features/map/model/types";
import { Wifi, WifiOff, Radio, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import MapObjectProperties from './MapObjectProperties';
import type { AppUiDefaults } from '@/features/settings';
import type { DiverUiConfig, MissionDocument, TrackRecorderStatus } from '@/features/mission';

interface RightPanelProps {
  /** HUD data for the selected agent (or primary if none selected) */
  diverData: {
    lat: number;
    lon: number;
    speed: number;
    course: number;
    depth: number;
  };
  hasTelemetryData: boolean;
  coordPrecision: number;
  styles: AppUiDefaults['styles'];
  connectionStatus: 'ok' | 'timeout' | 'error';
  isConnectionEnabled: boolean;
  /** Selected agent info */
  selectedAgent: DiverUiConfig | null;
  selectedAgentTrackStatus: TrackRecorderStatus;
  selectedAgentActiveTrackNumber: number;
  /** Mission for filtering tracks */
  missionDocument: MissionDocument | null;
  trackStatusByAgentId: Record<string, TrackRecorderStatus>;
  selectedObject: MapObject | null;
  selectedZoneLanesOutdated: boolean;
  selectedZoneLaneCount: number | null;
  onObjectSelect: (id: string | null) => void;
  onObjectUpdate?: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string) => void;
  onPickLaneEdge?: (id: string) => void;
  onPickLaneStart?: (id: string) => void;
  onTrackDelete?: (trackId: string) => void;
}

const formatTrackTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const RightPanel = ({
  diverData,
  hasTelemetryData,
  coordPrecision,
  styles,
  connectionStatus,
  isConnectionEnabled,
  selectedAgent,
  selectedAgentTrackStatus,
  selectedAgentActiveTrackNumber,
  missionDocument,
  trackStatusByAgentId,
  selectedObject,
  selectedZoneLanesOutdated,
  selectedZoneLaneCount,
  onObjectSelect,
  onObjectUpdate,
  onObjectDelete,
  onRegenerateLanes,
  onPickLaneEdge,
  onPickLaneStart,
  onTrackDelete,
}: RightPanelProps) => {
  const noTelemetry = !hasTelemetryData;
  const connectionLabel = !isConnectionEnabled
    ? 'Выключено'
    : connectionStatus === 'ok'
      ? 'Подключено • OK'
      : connectionStatus === 'error'
        ? 'Ошибка'
        : 'Нет данных';

  // Filter tracks for selected agent
  const agentTracks = selectedAgent && missionDocument
    ? missionDocument.tracks.filter((t) => t.agent_id === selectedAgent.uid)
    : [];

  const trackStatus = selectedAgentTrackStatus;
  const trackId = selectedAgentActiveTrackNumber;

  return (
    <div className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col h-full text-[13px]">
      {/* HUD */}
      <div className="panel-header">
        HUD
        {selectedAgent && (
          <span className="ml-1 text-muted-foreground font-normal">
            — {selectedAgent.title}
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-2">
        {noTelemetry ? (
          <div className="text-xs text-muted-foreground">нет данных</div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Широта</div>
            <div className="data-value text-foreground">
              {noTelemetry ? 'нет данных' : `${diverData.lat.toFixed(coordPrecision)}°`}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Долгота</div>
            <div className="data-value text-foreground">
              {noTelemetry ? 'нет данных' : `${diverData.lon.toFixed(coordPrecision)}°`}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Скорость</div>
            <div className="data-value text-foreground">
              {noTelemetry ? 'нет данных' : `${diverData.speed.toFixed(1)} м/с`}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Курс</div>
            <div className="data-value text-foreground">
              {noTelemetry ? 'нет данных' : `${diverData.course}°`}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Глубина</div>
            <div className="data-value text-base text-primary font-semibold leading-5">
              {noTelemetry ? 'нет данных' : `${diverData.depth.toFixed(1)} м`}
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
            {isConnectionEnabled && connectionStatus === 'ok' ? (
              <Wifi className="w-4 h-4 text-success" />
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
            <span className="text-[13px] leading-5">Связь</span>
          </div>
          <span
            className={cn(
              'text-xs font-medium',
              isConnectionEnabled && connectionStatus === 'ok' ? 'text-success' : 'text-destructive'
            )}
          >
            {connectionLabel}
          </span>
        </div>

        {/* Track Recording for selected agent */}
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
          <span className="text-[13px] font-mono leading-5">{trackId > 0 ? `#${trackId}` : '—'}</span>
        </div>

        {/* Count of agents recording */}
        {missionDocument && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground leading-5">Агентов пишут</span>
            <span className="text-[13px] font-mono leading-5">
              {Object.values(trackStatusByAgentId).filter((s) => s === 'recording').length}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border" />

      {/* Agent Tracks */}
      {selectedAgent && (
        <>
          <div className="panel-header">
            Треки: {selectedAgent.title}
          </div>
          <div className="p-1.5 space-y-1 max-h-48 overflow-y-auto">
            {agentTracks.map((track, index) => {
              const isActive =
                missionDocument?.active_tracks[selectedAgent.uid] === track.id &&
                trackStatusByAgentId[selectedAgent.uid] === 'recording';
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
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: selectedAgent.track_color }}
                      aria-hidden
                    />
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
            {agentTracks.length === 0 && (
              <div className="p-1.5 text-[11px] leading-4 text-muted-foreground">
                Треки пока не записаны.
              </div>
            )}
          </div>
          <div className="border-t border-sidebar-border" />
        </>
      )}

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
