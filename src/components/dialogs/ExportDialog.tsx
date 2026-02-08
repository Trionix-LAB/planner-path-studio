import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderOpen } from 'lucide-react';
import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature, MissionDocument, TrackPoint } from '@/features/mission';
import type {
  ExportMarkersFormat,
  ExportObjectsMode,
  ExportRequest,
  ExportRoutesFormat,
  ExportTracksFormat,
  ExportTracksMode,
} from '@/features/export';
import { platform } from '@/platform';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionRootPath: string | null;
  missionName: string | null;
  missionDocument: MissionDocument | null;
  trackPointsByTrackId: Record<string, TrackPoint[]>;
  objects: MapObject[];
  laneFeatures: LaneFeature[];
  onExport: (request: ExportRequest) => Promise<void> | void;
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

const ExportDialog = ({
  open,
  onOpenChange,
  missionRootPath,
  missionName,
  missionDocument,
  trackPointsByTrackId,
  objects,
  laneFeatures,
  onExport,
}: ExportDialogProps) => {
  const routesAndZones = useMemo(
    () => objects.filter((o) => o.type === 'route' || o.type === 'zone'),
    [objects],
  );
  const markers = useMemo(() => objects.filter((o) => o.type === 'marker'), [objects]);

  const [exportPath, setExportPath] = useState(platform.paths.defaultExportsDir());

  const [exportTracks, setExportTracks] = useState(true);
  const [exportRoutes, setExportRoutes] = useState(true);
  const [exportMarkers, setExportMarkers] = useState(true);

  const [trackFormat, setTrackFormat] = useState<ExportTracksFormat>('gpx');
  const [routeFormat, setRouteFormat] = useState<ExportRoutesFormat>('gpx');
  const [markerFormat, setMarkerFormat] = useState<ExportMarkersFormat>('csv');

  const [trackMode, setTrackMode] = useState<ExportTracksMode>('all');
  const [routeMode, setRouteMode] = useState<ExportObjectsMode>('all');
  const [markerMode, setMarkerMode] = useState<ExportObjectsMode>('all');

  const [selectedTrackIds, setSelectedTrackIds] = useState<Record<string, true>>({});
  const [selectedRouteIds, setSelectedRouteIds] = useState<Record<string, true>>({});
  const [selectedMarkerIds, setSelectedMarkerIds] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!open) return;
    const defaultPath = missionRootPath ? `${missionRootPath.replace(/\\+/g, '/').replace(/\/+$/g, '')}/exports` : platform.paths.defaultExportsDir();
    setExportPath(defaultPath);
    setExportTracks(true);
    setExportRoutes(true);
    setExportMarkers(true);
    setTrackFormat('gpx');
    setRouteFormat('gpx');
    setMarkerFormat('csv');
    setTrackMode('all');
    setRouteMode('all');
    setMarkerMode('all');
    setSelectedTrackIds({});
    setSelectedRouteIds({});
    setSelectedMarkerIds({});
  }, [missionRootPath, open]);

  const handlePickExportPath = async () => {
    const picked = await platform.fs.pickDirectory({
      title: 'Папка экспорта',
      defaultPath: exportPath,
    });
    if (picked) setExportPath(picked);
  };

  const toggleSelected = (setter: (next: Record<string, true>) => void, current: Record<string, true>, id: string) => {
    const next = { ...current };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    setter(next);
  };

  const canExport =
    (exportTracks && (trackMode !== 'selected' || Object.keys(selectedTrackIds).length > 0)) ||
    (exportRoutes && (routeMode !== 'selected' || Object.keys(selectedRouteIds).length > 0)) ||
    (exportMarkers && (markerMode !== 'selected' || Object.keys(selectedMarkerIds).length > 0));

  const handleExport = async () => {
    const request: ExportRequest = {
      exportPath: exportPath.trim(),
    };

    if (exportTracks) {
      request.tracks = {
        format: trackFormat,
        mode: trackMode,
        ...(trackMode === 'selected' ? { selectedTrackIds: Object.keys(selectedTrackIds) } : {}),
      };
    }

    if (exportRoutes) {
      request.routes = {
        format: routeFormat,
        mode: routeMode,
        ...(routeMode === 'selected' ? { selectedObjectIds: Object.keys(selectedRouteIds) } : {}),
      };
    }

    if (exportMarkers) {
      request.markers = {
        format: markerFormat,
        mode: markerMode,
        ...(markerMode === 'selected' ? { selectedObjectIds: Object.keys(selectedMarkerIds) } : {}),
      };
    }

    await onExport(request);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Экспорт данных</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Папка экспорта</Label>
            <div className="flex gap-2">
              <Input value={exportPath} onChange={(e) => setExportPath(e.target.value)} className="font-mono text-sm" />
              <Button type="button" variant="outline" size="icon" onClick={handlePickExportPath}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
            {missionRootPath && (
              <div className="text-xs text-muted-foreground">
                По умолчанию: <span className="font-mono">{`${missionRootPath}/exports`}</span>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <div className="text-sm font-medium">Что экспортировать</div>

            {/* Tracks */}
            <div className="rounded border border-border p-3 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={exportTracks} onCheckedChange={(c) => setExportTracks(c as boolean)} />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Треки</div>
                    <div className="flex items-center gap-2">
                      <Select value={trackMode} onValueChange={(v) => setTrackMode(v as ExportTracksMode)} disabled={!exportTracks}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Активный</SelectItem>
                          <SelectItem value="selected">Выбранные</SelectItem>
                          <SelectItem value="all">Все</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={trackFormat} onValueChange={(v) => setTrackFormat(v as ExportTracksFormat)} disabled={!exportTracks}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpx">GPX</SelectItem>
                          <SelectItem value="kml">KML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {missionDocument ? `${missionDocument.tracks.length} трек(ов)` : 'Нет миссии'}
                  </div>

                  {exportTracks && trackMode === 'selected' && (
                    <div className="space-y-1.5">
                      {(missionDocument?.tracks ?? []).map((t, index) => {
                        const checked = Boolean(selectedTrackIds[t.id]);
                        const points = trackPointsByTrackId[t.id]?.length ?? 0;
                        return (
                          <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSelected(setSelectedTrackIds, selectedTrackIds, t.id)}
                            />
                            <span className="text-sm">{`Трек ${index + 1}`}</span>
                            <span className="text-xs text-muted-foreground ml-auto font-mono">
                              {points} pts
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatTrackTime(t.started_at)}-{t.ended_at ? formatTrackTime(t.ended_at) : '...'}
                            </span>
                          </label>
                        );
                      })}
                      {(missionDocument?.tracks.length ?? 0) === 0 && (
                        <div className="text-xs text-muted-foreground">Треков нет.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Routes */}
            <div className="rounded border border-border p-3 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={exportRoutes} onCheckedChange={(c) => setExportRoutes(c as boolean)} />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Маршруты, зоны и галсы</div>
                    <div className="flex items-center gap-2">
                      <Select value={routeMode} onValueChange={(v) => setRouteMode(v as ExportObjectsMode)} disabled={!exportRoutes}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="selected">Выбранные</SelectItem>
                          <SelectItem value="all">Все</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={routeFormat} onValueChange={(v) => setRouteFormat(v as ExportRoutesFormat)} disabled={!exportRoutes}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpx">GPX</SelectItem>
                          <SelectItem value="kml">KML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {`${routesAndZones.length} объект(ов), ${laneFeatures.length} галс(ов)`}
                  </div>

                  {exportRoutes && routeMode === 'selected' && (
                    <div className="space-y-1.5">
                      {routesAndZones.map((o) => {
                        const checked = Boolean(selectedRouteIds[o.id]);
                        return (
                          <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSelected(setSelectedRouteIds, selectedRouteIds, o.id)}
                            />
                            <span className="text-sm truncate">{o.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{o.type}</span>
                          </label>
                        );
                      })}
                      {routesAndZones.length === 0 && (
                        <div className="text-xs text-muted-foreground">Объектов нет.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Markers */}
            <div className="rounded border border-border p-3 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={exportMarkers} onCheckedChange={(c) => setExportMarkers(c as boolean)} />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Маркеры</div>
                    <div className="flex items-center gap-2">
                      <Select value={markerMode} onValueChange={(v) => setMarkerMode(v as ExportObjectsMode)} disabled={!exportMarkers}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="selected">Выбранные</SelectItem>
                          <SelectItem value="all">Все</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={markerFormat} onValueChange={(v) => setMarkerFormat(v as ExportMarkersFormat)} disabled={!exportMarkers}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="gpx">GPX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{`${markers.length} маркер(ов)`}</div>

                  {exportMarkers && markerMode === 'selected' && (
                    <div className="space-y-1.5">
                      {markers.map((m) => {
                        const checked = Boolean(selectedMarkerIds[m.id]);
                        return (
                          <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSelected(setSelectedMarkerIds, selectedMarkerIds, m.id)}
                            />
                            <span className="text-sm truncate">{m.name}</span>
                          </label>
                        );
                      })}
                      {markers.length === 0 && (
                        <div className="text-xs text-muted-foreground">Маркеров нет.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleExport} disabled={!canExport || !missionDocument || !missionRootPath || exportPath.trim().length === 0}>
            Экспортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;

