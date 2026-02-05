import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  // Measurements
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridMode, setGridMode] = useState<'auto' | 'manual'>('auto');
  const [gridStep, setGridStep] = useState('50');
  const [showLengths, setShowLengths] = useState<'off' | 'on-select' | 'always'>('on-select');

  // Connection
  const [connectionProfile, setConnectionProfile] = useState<'old' | 'new'>('new');
  const [comPort, setComPort] = useState('COM3');
  const [ipAddress, setIpAddress] = useState('192.168.1.100');

  // Coordinates
  const [coordPrecision, setCoordPrecision] = useState('6');

  // Styles
  const [trackColor, setTrackColor] = useState('#a855f7');
  const [routeColor, setRouteColor] = useState('#0ea5e9');
  const [zoneColor, setZoneColor] = useState('#fbbf24');

  // Defaults
  const [defaultFollow, setDefaultFollow] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="measurements" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="measurements">Измерения</TabsTrigger>
            <TabsTrigger value="connection">Подключение</TabsTrigger>
            <TabsTrigger value="coordinates">Координаты</TabsTrigger>
            <TabsTrigger value="styles">Стили</TabsTrigger>
            <TabsTrigger value="defaults">По умолчанию</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 overflow-auto max-h-[400px]">
            <TabsContent value="measurements" className="space-y-4">
              <label className="flex items-center gap-3">
                <Checkbox checked={showScaleBar} onCheckedChange={(c) => setShowScaleBar(c as boolean)} />
                <span>Линейка масштаба</span>
              </label>
              
              <label className="flex items-center gap-3">
                <Checkbox checked={showGrid} onCheckedChange={(c) => setShowGrid(c as boolean)} />
                <span>Сетка (метры)</span>
              </label>

              {showGrid && (
                <div className="ml-7 space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={gridMode === 'auto'}
                        onChange={() => setGridMode('auto')}
                        className="accent-primary"
                      />
                      Авто
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={gridMode === 'manual'}
                        onChange={() => setGridMode('manual')}
                        className="accent-primary"
                      />
                      Вручную
                    </label>
                  </div>
                  {gridMode === 'manual' && (
                    <div className="flex items-center gap-2">
                      <Label>Шаг:</Label>
                      <Select value={gridStep} onValueChange={setGridStep}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 м</SelectItem>
                          <SelectItem value="25">25 м</SelectItem>
                          <SelectItem value="50">50 м</SelectItem>
                          <SelectItem value="100">100 м</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Длины отрезков</Label>
                <Select value={showLengths} onValueChange={(v) => setShowLengths(v as typeof showLengths)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Выключено</SelectItem>
                    <SelectItem value="on-select">При выборе</SelectItem>
                    <SelectItem value="always">Всегда</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="connection" className="space-y-4">
              <div className="space-y-2">
                <Label>Профиль подключения</Label>
                <Select value={connectionProfile} onValueChange={(v) => setConnectionProfile(v as typeof connectionProfile)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="old">Старый протокол</SelectItem>
                    <SelectItem value="new">Новый протокол</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {connectionProfile === 'old' && (
                <div className="space-y-2">
                  <Label>COM-порт</Label>
                  <Input value={comPort} onChange={(e) => setComPort(e.target.value)} />
                </div>
              )}

              {connectionProfile === 'new' && (
                <div className="space-y-2">
                  <Label>IP-адрес</Label>
                  <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="coordinates" className="space-y-4">
              <div className="space-y-2">
                <Label>Точность вывода (знаков после запятой)</Label>
                <Select value={coordPrecision} onValueChange={setCoordPrecision}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="7">7</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="styles" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цвет трека</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={trackColor}
                      onChange={(e) => setTrackColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input value={trackColor} onChange={(e) => setTrackColor(e.target.value)} className="font-mono" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Цвет маршрута</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={routeColor}
                      onChange={(e) => setRouteColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input value={routeColor} onChange={(e) => setRouteColor(e.target.value)} className="font-mono" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Цвет зоны</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={zoneColor}
                      onChange={(e) => setZoneColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <Input value={zoneColor} onChange={(e) => setZoneColor(e.target.value)} className="font-mono" />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="defaults" className="space-y-4">
              <label className="flex items-center gap-3">
                <Checkbox checked={defaultFollow} onCheckedChange={(c) => setDefaultFollow(c as boolean)} />
                <span>Режим слежения за водолазом по умолчанию</span>
              </label>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button variant="secondary">
            Сбросить по умолчанию
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
