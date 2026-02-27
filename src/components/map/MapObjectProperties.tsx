import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature } from '@/features/mission';
import { parseLaneAngleInput } from '@/features/mission/model/laneAngle';
import type { AppUiDefaults } from '@/features/settings';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { haversineDistanceMeters } from './scaleUtils';

interface MapObjectPropertiesProps {
  object: MapObject;
  styles: AppUiDefaults['styles'];
  onSave: (id: string, updates: Partial<MapObject>) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string, updates?: Partial<MapObject>) => void;
  onPickLaneEdge?: (id: string) => void;
  onPickLaneStart?: (id: string) => void;
  zoneLanesOutdated?: boolean;
  zoneLaneCount?: number | null;
  zoneLaneFeatures?: LaneFeature[];
}

type EditablePointRow = {
  id: string;
  lat: string;
  lon: string;
};

type PointCellErrors = Record<number, { lat?: string; lon?: string }>;

type PointInputErrors = {
  lat?: string;
  lon?: string;
};

const getDefaultColor = (type: MapObject['type'], styles: AppUiDefaults['styles']): string => {
  if (type === 'zone') return styles.survey_area.stroke_color;
  if (type === 'marker') return styles.marker.color;
  if (type === 'lane') return styles.lane.color;
  return styles.route.color;
};

const normalizeHexColor = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
};

const formatRouteLength = (meters: number): string => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 м';
  if (meters >= 1000) {
    const km = meters / 1000;
    const decimals = km >= 10 ? 1 : 2;
    return `${km.toFixed(decimals)} км`;
  }
  return `${meters.toFixed(1)} м`;
};

const computeRouteLengthMeters = (object: MapObject): number => {
  if (object.type !== 'route' || object.geometry?.type !== 'route') return 0;
  const points = object.geometry.points;
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    total += haversineDistanceMeters(prev.lat, prev.lon, next.lat, next.lon);
  }
  return total;
};

const formatLaneCount = (count: number | null | undefined): string => {
  if (typeof count !== 'number' || count < 0) return '--';
  return String(count);
};

const toEditableRowsFromObject = (object: MapObject): EditablePointRow[] => {
  if (
    (object.type === 'route' && object.geometry?.type === 'route') ||
    (object.type === 'zone' && object.geometry?.type === 'zone')
  ) {
    return object.geometry.points.map((point, index) => ({
      id: `${object.id}-${index}-${point.lat}-${point.lon}`,
      lat: point.lat.toFixed(6),
      lon: point.lon.toFixed(6),
    }));
  }
  return [];
};

const validatePointInput = (latRaw: string, lonRaw: string): PointInputErrors => {
  const errors: PointInputErrors = {};
  const lat = Number(latRaw.trim());
  const lon = Number(lonRaw.trim());

  if (!Number.isFinite(lat)) {
    errors.lat = 'Некорректная широта';
  } else if (lat < -90 || lat > 90) {
    errors.lat = 'Широта должна быть от -90 до 90';
  }

  if (!Number.isFinite(lon)) {
    errors.lon = 'Некорректная долгота';
  } else if (lon < -180 || lon > 180) {
    errors.lon = 'Долгота должна быть от -180 до 180';
  }

  return errors;
};

const validatePointRows = (
  rows: EditablePointRow[],
  minPoints: number,
): { points: Array<{ lat: number; lon: number }> | null; cellErrors: PointCellErrors; tableError: string | null } => {
  const cellErrors: PointCellErrors = {};
  const points: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const nextError = validatePointInput(row.lat, row.lon);
    const lat = Number(row.lat.trim());
    const lon = Number(row.lon.trim());

    if (nextError.lat || nextError.lon) {
      cellErrors[i] = nextError;
      continue;
    }

    points.push({ lat, lon });
  }

  if (Object.keys(cellErrors).length > 0) {
    return {
      points: null,
      cellErrors,
      tableError: 'Исправьте ошибки в координатах',
    };
  }

  if (points.length < minPoints) {
    return {
      points: null,
      cellErrors: {},
      tableError: `Минимум точек: ${minPoints}`,
    };
  }

  return {
    points,
    cellErrors: {},
    tableError: null,
  };
};

const getMinPointsForObject = (object: MapObject): number => {
  if (object.type === 'route') return 2;
  if (object.type === 'zone') return 3;
  return 0;
};

const formatLaneVertexRows = (laneFeatures: LaneFeature[] | undefined) => {
  if (!laneFeatures || laneFeatures.length === 0) return [];
  return [...laneFeatures]
    .sort((a, b) => a.properties.lane_index - b.properties.lane_index)
    .flatMap((lane) =>
      lane.geometry.coordinates.map(([lon, lat], vertexIndex) => ({
        laneIndex: lane.properties.lane_index,
        vertexIndex: vertexIndex + 1,
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
      })),
    );
};

const MapObjectProperties = ({
  object,
  styles,
  onSave,
  onClose,
  onDelete,
  onRegenerateLanes,
  onPickLaneEdge,
  onPickLaneStart,
  zoneLanesOutdated,
  zoneLaneCount,
  zoneLaneFeatures,
}: MapObjectPropertiesProps) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [laneAngle, setLaneAngle] = useState('0');
  const [laneWidth, setLaneWidth] = useState('5');
  const [zoneVisible, setZoneVisible] = useState(true);
  const [color, setColor] = useState('#0ea5e9');
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([]);
  const [pointCellErrors, setPointCellErrors] = useState<PointCellErrors>({});
  const [pointTableError, setPointTableError] = useState<string | null>(null);
  const [isRouteVerticesDialogOpen, setIsRouteVerticesDialogOpen] = useState(false);
  const [isZoneVerticesDialogOpen, setIsZoneVerticesDialogOpen] = useState(false);
  const [isLaneVerticesDialogOpen, setIsLaneVerticesDialogOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const routeLengthLabel = useMemo(() => formatRouteLength(computeRouteLengthMeters(object)), [object]);
  const minPoints = useMemo(() => getMinPointsForObject(object), [object]);
  const laneVertexRows = useMemo(() => formatLaneVertexRows(zoneLaneFeatures), [zoneLaneFeatures]);

  useEffect(() => {
    const fallbackColor = getDefaultColor(object.type, styles);
    setName(object.name);
    setNote(object.note ?? '');
    setLaneAngle(String(object.laneAngle ?? 0));
    setLaneWidth(String(object.laneWidth ?? 5));
    setZoneVisible(object.visible);
    setColor(normalizeHexColor(object.color ?? fallbackColor, fallbackColor));
    setPointRows(toEditableRowsFromObject(object));
    setPointCellErrors({});
    setPointTableError(null);
    setIsRouteVerticesDialogOpen(false);
    setIsZoneVerticesDialogOpen(false);
    setIsLaneVerticesDialogOpen(false);
    setIsDirty(false);
  }, [object, styles]);

  const handleSave = () => {
    const fallbackColor = getDefaultColor(object.type, styles);
    const updates: Partial<MapObject> = {
      name: name.trim() || object.name,
      color: normalizeHexColor(color, fallbackColor),
    };

    if (object.type === 'route' || object.type === 'marker') {
      updates.note = note;
    }

    if (object.type === 'route' && object.geometry?.type === 'route') {
      const validation = validatePointRows(pointRows, minPoints);
      if (!validation.points) {
        setPointCellErrors(validation.cellErrors);
        setPointTableError(validation.tableError);
        return;
      }
      updates.geometry = {
        type: 'route',
        points: validation.points,
      };
    }

    if (object.type === 'zone') {
      updates.laneAngle = parseLaneAngleInput(laneAngle, object.laneAngle ?? 0);
      updates.laneWidth = Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth;
      updates.visible = zoneVisible;

      if (object.geometry?.type === 'zone') {
        const validation = validatePointRows(pointRows, minPoints);
        if (!validation.points) {
          setPointCellErrors(validation.cellErrors);
          setPointTableError(validation.tableError);
          return;
        }
        updates.geometry = {
          type: 'zone',
          points: validation.points,
        };
      }
    }

    onSave(object.id, updates);
    setPointCellErrors({});
    setPointTableError(null);
    setIsDirty(false);
  };

  const handleFieldChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  const handlePointFieldChange = (index: number, field: 'lat' | 'lon', value: string) => {
    setPointRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setPointCellErrors((prev) => {
      if (!prev[index]?.[field]) return prev;
      const nextRowError = { ...prev[index] };
      delete nextRowError[field];
      const next = { ...prev };
      if (!nextRowError.lat && !nextRowError.lon) {
        delete next[index];
      } else {
        next[index] = nextRowError;
      }
      return next;
    });
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleAddPoint = () => {
    const lastPoint = pointRows[pointRows.length - 1];
    const baseLat = Number(lastPoint?.lat);
    const baseLon = Number(lastPoint?.lon);
    const nextLat = Number.isFinite(baseLat) ? (baseLat + 0.0001).toFixed(6) : '0.000000';
    const nextLon = Number.isFinite(baseLon) ? (baseLon + 0.0001).toFixed(6) : '0.000000';
    setPointRows((prev) => [...prev, { id: crypto.randomUUID(), lat: nextLat, lon: nextLon }]);
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleDeletePoint = (index: number) => {
    if (pointRows.length <= minPoints) {
      setPointTableError(`Минимум точек: ${minPoints}`);
      return;
    }

    setPointRows((prev) => prev.filter((_, i) => i !== index));
    setPointCellErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: PointCellErrors = {};
      for (const [rowIndexRaw, rowErr] of Object.entries(prev)) {
        const rowIndex = Number(rowIndexRaw);
        if (rowIndex < index) next[rowIndex] = rowErr;
        if (rowIndex > index) next[rowIndex - 1] = rowErr;
      }
      return next;
    });
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleZoneVisibilityToggle = () => {
    if (object.type !== 'zone') return;
    const nextVisible = !zoneVisible;
    setZoneVisible(nextVisible);
    onSave(object.id, { visible: nextVisible });
  };

  const handleRegenerateClick = () => {
    if (object.type !== 'zone') return;

    const updates: Partial<MapObject> = {
      laneAngle: parseLaneAngleInput(laneAngle, object.laneAngle ?? 0),
      laneWidth: Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth,
    };

    onRegenerateLanes?.(object.id, updates);
    setIsDirty(false);
  };

  return (
    <div className="h-full flex flex-col text-[13px]">
      <div className="px-2.5 py-1.5 border-b border-sidebar-border flex items-center justify-between gap-2">
        <span className="text-sm font-semibold leading-5 truncate">{object.name}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="obj-name" className="text-xs text-muted-foreground">Имя</Label>
          <Input
            id="obj-name"
            className="h-9 text-sm"
            value={name}
            onChange={(e) => handleFieldChange(setName, e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="obj-color" className="text-xs text-muted-foreground">Цвет</Label>
          <div className="flex items-center gap-2">
            <Input
              id="obj-color"
              type="color"
              value={normalizeHexColor(color, getDefaultColor(object.type, styles))}
              onChange={(e) => handleFieldChange(setColor, e.target.value)}
              className="h-9 w-14 p-1"
            />
            <Input
              className="h-9 text-sm font-mono"
              value={color}
              onChange={(e) => handleFieldChange(setColor, e.target.value)}
              placeholder="#0ea5e9"
            />
          </div>
        </div>

        {(object.type === 'route' || object.type === 'marker') && (
          <div className="space-y-1.5">
            <Label htmlFor="obj-note" className="text-xs text-muted-foreground">
              {object.type === 'marker' ? 'Описание' : 'Заметка'}
            </Label>
            <Textarea
              id="obj-note"
              className="min-h-[68px] text-sm leading-5"
              value={note}
              onChange={(e) => handleFieldChange(setNote, e.target.value)}
              rows={3}
              placeholder={object.type === 'marker' ? 'Описание маркера...' : 'Заметка о маршруте...'}
            />
          </div>
        )}

        {object.type === 'route' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Точки маршрута</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsRouteVerticesDialogOpen(true)}
                aria-label="Открыть точки маршрута"
              >
                Открыть точки маршрута
              </Button>
            </div>
            <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
              Точек: {pointRows.length}
            </div>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
          </div>
        )}

        {object.type === 'route' && (
          <div className="p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground mb-1">Общая длина</div>
            <div className="font-mono text-base leading-5">{routeLengthLabel}</div>
          </div>
        )}

        {object.type === 'zone' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Вершины зоны</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsZoneVerticesDialogOpen(true)}
                  aria-label="Открыть вершины зоны"
                >
                  Открыть вершины зоны
                </Button>
              </div>
              <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                Точек: {pointRows.length}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Вершины галсов</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsLaneVerticesDialogOpen(true)}
                  aria-label="Открыть вершины галсов"
                >
                  Открыть вершины галсов
                </Button>
              </div>
              <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                Вершин: {laneVertexRows.length}
              </div>
            </div>

            <div className="p-2.5 bg-muted rounded-md space-y-1.5">
              <label className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={zoneVisible}
                  onCheckedChange={handleZoneVisibilityToggle}
                />
                <span className="text-[13px] leading-5">Показывать зону</span>
              </label>
              <div className="text-[11px] text-muted-foreground">Ориентация</div>
              <div className="font-mono text-sm leading-5 break-words">
                {typeof object.laneBearingDeg === 'number' ? `по грани (${Math.round(object.laneBearingDeg)}°)` : 'авто'}
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">Старт</div>
              <div className="font-mono text-xs leading-4 break-all">
                {object.laneStart ? `${object.laneStart.lat.toFixed(6)}, ${object.laneStart.lon.toFixed(6)}` : 'не выбран'}
              </div>
            </div>

            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                className="w-full h-auto min-h-9 py-1.5 leading-snug whitespace-normal text-left justify-start text-[13px]"
                onClick={() => onPickLaneEdge?.(object.id)}
              >
                Выбрать грань на карте
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-auto min-h-9 py-1.5 leading-snug whitespace-normal text-left justify-start text-[13px]"
                onClick={() => onPickLaneStart?.(object.id)}
              >
                Выбрать старт на карте
              </Button>
            </div>

            {zoneLanesOutdated && (
              <div className="flex items-center gap-2 p-2.5 bg-warning/10 border border-warning/30 rounded-md">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                <span className="text-[13px] flex-1 leading-5">Галсы неактуальны</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Угол галсов</Label>
              <Input
                className="h-9 text-sm"
                type="number"
                min="0"
                max="360"
                step="1"
                value={laneAngle}
                onChange={(e) => handleFieldChange(setLaneAngle, e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lane-width" className="text-xs text-muted-foreground">Ширина галса (м)</Label>
              <Input
                id="lane-width"
                className="h-9 text-sm"
                type="number"
                value={laneWidth}
                onChange={(e) => handleFieldChange(setLaneWidth, e.target.value)}
                min="1"
                max="100"
              />
            </div>

            <Button className="w-full h-9 mt-1 text-sm" variant="secondary" onClick={handleRegenerateClick}>
              Перегенерировать галсы
            </Button>

            <div className="p-2.5 bg-muted rounded-md mt-1">
              <div className="text-[11px] text-muted-foreground mb-1">Галсов в зоне</div>
              <div className="font-mono text-base leading-5">{formatLaneCount(zoneLaneCount)}</div>
            </div>
          </>
        )}
      </div>

      <Dialog open={isRouteVerticesDialogOpen} onOpenChange={setIsRouteVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Точки маршрута</DialogTitle>
            <DialogDescription className="sr-only">
              Редактирование координат точек маршрута
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 text-[11px] text-muted-foreground">
              <span>#</span>
              <span>Широта</span>
              <span>Долгота</span>
              <span />
            </div>
            {pointRows.map((row, index) => (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-start">
                  <div className="h-10 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {index + 1}
                  </div>
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lat}
                    onChange={(e) => handlePointFieldChange(index, 'lat', e.target.value)}
                    aria-label={`Широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lon}
                    onChange={(e) => handlePointFieldChange(index, 'lon', e.target.value)}
                    aria-label={`Долгота точки ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeletePoint(index)}
                    aria-label={`Удалить точку ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {(pointCellErrors[index]?.lat || pointCellErrors[index]?.lon) && (
                  <div className="text-xs text-destructive leading-4">
                    {pointCellErrors[index]?.lat ?? pointCellErrors[index]?.lon}
                  </div>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full h-10 text-sm" onClick={handleAddPoint}>
              Добавить точку
            </Button>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isZoneVerticesDialogOpen} onOpenChange={setIsZoneVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Вершины зоны</DialogTitle>
            <DialogDescription className="sr-only">
              Редактирование координат вершин зоны
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 text-[11px] text-muted-foreground">
              <span>#</span>
              <span>Широта</span>
              <span>Долгота</span>
              <span />
            </div>
            {pointRows.map((row, index) => (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-start">
                  <div className="h-10 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {index + 1}
                  </div>
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lat}
                    onChange={(e) => handlePointFieldChange(index, 'lat', e.target.value)}
                    aria-label={`Широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lon}
                    onChange={(e) => handlePointFieldChange(index, 'lon', e.target.value)}
                    aria-label={`Долгота точки ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeletePoint(index)}
                    aria-label={`Удалить точку ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {(pointCellErrors[index]?.lat || pointCellErrors[index]?.lon) && (
                  <div className="text-xs text-destructive leading-4">
                    {pointCellErrors[index]?.lat ?? pointCellErrors[index]?.lon}
                  </div>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full h-10 text-sm" onClick={handleAddPoint}>
              Добавить точку
            </Button>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLaneVerticesDialogOpen} onOpenChange={setIsLaneVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Вершины галсов</DialogTitle>
            <DialogDescription className="sr-only">
              Просмотр координат вершин галсов
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {laneVertexRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">Галсы не сгенерированы</div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[48px_48px_1fr_1fr] gap-2 text-[11px] text-muted-foreground">
                  <span>Галс</span>
                  <span>Верш.</span>
                  <span>Широта</span>
                  <span>Долгота</span>
                </div>
                {laneVertexRows.map((row) => (
                  <div
                    key={`lane-dialog-${row.laneIndex}-vertex-${row.vertexIndex}-${row.lat}-${row.lon}`}
                    className="grid grid-cols-[48px_48px_1fr_1fr] gap-2 text-sm font-mono"
                  >
                    <span>{row.laneIndex}</span>
                    <span>{row.vertexIndex}</span>
                    <span>{row.lat}</span>
                    <span>{row.lon}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-2.5 border-t border-sidebar-border">
        <Button className="w-full h-10 text-sm" onClick={handleSave} disabled={!isDirty}>
          Сохранить изменения
        </Button>
        {onDelete && (
          <Button
            className="w-full h-10 mt-2 text-sm"
            variant="destructive"
            onClick={() => onDelete(object.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить объект
          </Button>
        )}
      </div>
    </div>
  );
};

export default MapObjectProperties;
