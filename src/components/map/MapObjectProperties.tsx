import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { X } from 'lucide-react';

interface MapObjectPropertiesProps {
  object: MapObject;
  onSave: (id: string, updates: Partial<MapObject>) => void;
  onClose: () => void;
  onRegenerateLanes?: (id: string) => void;
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

const MapObjectProperties = ({ object, onSave, onClose, onRegenerateLanes }: MapObjectPropertiesProps) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [laneAngle, setLaneAngle] = useState('0');
  const [laneWidth, setLaneWidth] = useState('5');
  const [color, setColor] = useState('#0ea5e9');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const fallbackColor = getDefaultColor(object.type);
    setName(object.name);
    setNote(object.note ?? '');
    setLaneAngle(String(object.laneAngle ?? 0));
    setLaneWidth(String(object.laneWidth ?? 5));
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
    }

    onSave(object.id, updates);
    setIsDirty(false);
  };

  const handleFieldChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-sidebar-border flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{object.name}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="obj-name">Имя</Label>
          <Input id="obj-name" value={name} onChange={(e) => handleFieldChange(setName, e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="obj-color">Цвет</Label>
          <div className="flex items-center gap-2">
            <Input
              id="obj-color"
              type="color"
              value={normalizeHexColor(color, getDefaultColor(object.type))}
              onChange={(e) => handleFieldChange(setColor, e.target.value)}
              className="h-9 w-14 p-1"
            />
            <Input value={color} onChange={(e) => handleFieldChange(setColor, e.target.value)} placeholder="#0ea5e9" />
          </div>
        </div>

        {(object.type === 'route' || object.type === 'marker') && (
          <div className="space-y-2">
            <Label htmlFor="obj-note">{object.type === 'marker' ? 'Описание' : 'Заметка'}</Label>
            <Textarea
              id="obj-note"
              value={note}
              onChange={(e) => handleFieldChange(setNote, e.target.value)}
              rows={3}
              placeholder={object.type === 'marker' ? 'Описание маркера...' : 'Заметка о маршруте...'}
            />
          </div>
        )}

        {object.type === 'route' && (
          <div className="p-3 bg-muted rounded-md">
            <div className="text-xs text-muted-foreground mb-1">Общая длина</div>
            <div className="font-mono text-lg">-- м</div>
          </div>
        )}

        {object.type === 'zone' && (
          <>
            <div className="space-y-2">
              <Label>Угол галсов</Label>
              <Select value={laneAngle} onValueChange={(value) => handleFieldChange(setLaneAngle, value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0°</SelectItem>
                  <SelectItem value="90">90°</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ширина галса (м)</Label>
              <Input
                type="number"
                value={laneWidth}
                onChange={(e) => handleFieldChange(setLaneWidth, e.target.value)}
                min="1"
                max="100"
              />
            </div>

            <Button className="w-full mt-2" variant="secondary" onClick={() => onRegenerateLanes?.(object.id)}>
              Перегенерировать галсы
            </Button>

            <div className="p-3 bg-muted rounded-md mt-2">
              <div className="text-xs text-muted-foreground mb-1">Галсов в зоне</div>
              <div className="font-mono">--</div>
            </div>
          </>
        )}
      </div>

      <div className="p-3 border-t border-sidebar-border">
        <Button className="w-full" onClick={handleSave} disabled={!isDirty}>
          Сохранить изменения
        </Button>
      </div>
    </div>
  );
};

export default MapObjectProperties;
