import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MapObject } from '@/features/map/model/types';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { haversineDistanceMeters } from './scaleUtils';

interface MapObjectPropertiesProps {
  object: MapObject;
  onSave: (id: string, updates: Partial<MapObject>) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string) => void;
  onPickLaneEdge?: (id: string) => void;
  onPickLaneStart?: (id: string) => void;
  zoneLanesOutdated?: boolean;
  zoneLaneCount?: number | null;
}

const getDefaultColor = (type: MapObject['type']): string => {
  if (type === 'zone') return '#f59e0b';
  if (type === 'marker') return '#22c55e';
  return '#0ea5e9';
};

const normalizeHexColor = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
};

const toLaneAngle = (value: string, fallback: number | undefined): 0 | 90 | undefined => {
  const numeric = Number(value);
  if (numeric === 90) return 90;
  if (numeric === 0) return 0;
  if (fallback === 90) return 90;
  if (fallback === 0) return 0;
  return undefined;
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

const MapObjectProperties = ({
  object,
  onSave,
  onClose,
  onDelete,
  onRegenerateLanes,
  onPickLaneEdge,
  onPickLaneStart,
  zoneLanesOutdated,
  zoneLaneCount,
}: MapObjectPropertiesProps) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [laneAngle, setLaneAngle] = useState('0');
  const [laneWidth, setLaneWidth] = useState('5');
  const [zoneVisible, setZoneVisible] = useState(true);
  const [color, setColor] = useState('#0ea5e9');
  const [isDirty, setIsDirty] = useState(false);
  const routeLengthLabel = useMemo(() => formatRouteLength(computeRouteLengthMeters(object)), [object]);

  useEffect(() => {
    const fallbackColor = getDefaultColor(object.type);
    setName(object.name);
    setNote(object.note ?? '');
    setLaneAngle(String(object.laneAngle ?? 0));
    setLaneWidth(String(object.laneWidth ?? 5));
    setZoneVisible(object.visible);
    setColor(normalizeHexColor(object.color ?? fallbackColor, fallbackColor));
    setIsDirty(false);
  }, [object]);

  const handleSave = () => {
    const fallbackColor = getDefaultColor(object.type);
    const updates: Partial<MapObject> = {
      name: name.trim() || object.name,
      color: normalizeHexColor(color, fallbackColor),
    };

    if (object.type === 'route' || object.type === 'marker') {
      updates.note = note;
    }

    if (object.type === 'zone') {
      updates.laneAngle = toLaneAngle(laneAngle, object.laneAngle);
      updates.laneWidth = Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth;
      updates.visible = zoneVisible;
    }

    onSave(object.id, updates);
    setIsDirty(false);
  };

  const handleFieldChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  const handleZoneVisibilityToggle = () => {
    if (object.type !== 'zone') return;
    const nextVisible = !zoneVisible;
    setZoneVisible(nextVisible);
    onSave(object.id, { visible: nextVisible });
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
              value={normalizeHexColor(color, getDefaultColor(object.type))}
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
          <div className="p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground mb-1">Общая длина</div>
            <div className="font-mono text-base leading-5">{routeLengthLabel}</div>
          </div>
        )}

        {object.type === 'zone' && (
          <>
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
                <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => onRegenerateLanes?.(object.id)}>
                  Перегенерировать
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Угол галсов</Label>
              <Select value={laneAngle} onValueChange={(value) => handleFieldChange(setLaneAngle, value)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0°</SelectItem>
                  <SelectItem value="90">90°</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ширина галса (м)</Label>
              <Input
                className="h-9 text-sm"
                type="number"
                value={laneWidth}
                onChange={(e) => handleFieldChange(setLaneWidth, e.target.value)}
                min="1"
                max="100"
              />
            </div>

            <Button className="w-full h-9 mt-1 text-sm" variant="secondary" onClick={() => onRegenerateLanes?.(object.id)}>
              Перегенерировать галсы
            </Button>

            <div className="p-2.5 bg-muted rounded-md mt-1">
              <div className="text-[11px] text-muted-foreground mb-1">Галсов в зоне</div>
              <div className="font-mono text-base leading-5">{formatLaneCount(zoneLaneCount)}</div>
            </div>
          </>
        )}
      </div>

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
