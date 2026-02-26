import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type { MapObject } from "@/features/map/model/types";
import { parseLaneAngleInput } from '@/features/mission/model/laneAngle';
import { AlertTriangle } from 'lucide-react';

interface ObjectPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object?: MapObject;
  onSave: (updates: Partial<MapObject> & { note?: string; laneAngle?: number; laneWidth?: number }) => void;
}

const ObjectPropertiesDialog = ({ open, onOpenChange, object, onSave }: ObjectPropertiesDialogProps) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [laneAngle, setLaneAngle] = useState('0');
  const [laneWidth, setLaneWidth] = useState('5');
  const [lanesOutdated, setLanesOutdated] = useState(false);

  useEffect(() => {
    if (object) {
      setName(object.name);
      setNote(object.note ?? '');
      setLaneAngle(String(object.laneAngle ?? 0));
      setLaneWidth(String(object.laneWidth ?? 5));
      setLanesOutdated(false);
    }
  }, [object]);

  if (!object) return null;

  const handleSave = () => {
    onSave({
      name,
      note,
      laneAngle: parseLaneAngleInput(laneAngle, object.laneAngle ?? 0),
      laneWidth: Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth,
    });
  };

  const handleRegenerate = () => {
    setLanesOutdated(false);
    // Mock regeneration
    console.log('Regenerating lanes...');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Свойства: {object.type === 'route' && 'Маршрут'}
            {object.type === 'zone' && 'Зона обследования'}
            {object.type === 'marker' && 'Маркер'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="obj-name">Имя</Label>
            <Input
              id="obj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {(object.type === 'route' || object.type === 'marker') && (
            <div className="space-y-2">
              <Label htmlFor="obj-note">
                {object.type === 'marker' ? 'Описание' : 'Заметка'}
              </Label>
              <Textarea
                id="obj-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={object.type === 'marker' ? 'Описание маркера...' : 'Заметка о маршруте...'}
              />
            </div>
          )}

          {object.type === 'route' && (
            <div className="p-3 bg-muted rounded-md">
              <div className="text-xs text-muted-foreground mb-1">Общая длина</div>
              <div className="font-mono text-lg">245.3 м</div>
            </div>
          )}

          {object.type === 'zone' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Угол галсов</Label>
                  <Input
                    type="number"
                    min="0"
                    max="360"
                    step="1"
                    value={laneAngle}
                    onChange={(e) => {
                      setLaneAngle(e.target.value);
                      setLanesOutdated(true);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ширина галса (м)</Label>
                  <Input
                    type="number"
                    value={laneWidth}
                    onChange={(e) => {
                      setLaneWidth(e.target.value);
                      setLanesOutdated(true);
                    }}
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              {lanesOutdated && (
                <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span className="text-sm flex-1">Галсы неактуальны</span>
                  <Button size="sm" variant="outline" onClick={handleRegenerate}>
                    Перегенерировать
                  </Button>
                </div>
              )}

              <div className="p-3 bg-muted rounded-md">
                <div className="text-xs text-muted-foreground mb-1">Галсов в зоне</div>
                <div className="font-mono">4 галса</div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ObjectPropertiesDialog;
