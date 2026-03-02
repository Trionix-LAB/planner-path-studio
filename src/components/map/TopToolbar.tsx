import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ChevronDown,
  Save,
  FolderOpen,
  Download,
  Settings,
  MousePointer2,
  Route,
  Square,
  MapPin,
  Pause,
  Play,
  Flag,
  Check,
  Loader2,
  AlertCircle,
  Home,
  CloudDownload,
  ImagePlus,
} from 'lucide-react';
import type { Tool } from "@/features/map/model/types";
import { cn } from '@/lib/utils';

interface TopToolbarProps {
  missionName: string | null;
  isDraft: boolean;
  autoSaveStatus: 'saved' | 'saving' | 'error';
  activeTool: Tool;
  trackStatus: 'recording' | 'paused' | 'stopped';
  showSimulationControls: boolean;
  isRecordingEnabled: boolean;
  simulationEnabled?: boolean;
  simulateConnectionError?: boolean;
  onToolChange: (tool: Tool) => void;
  onTrackAction: (action: 'pause' | 'resume') => void;
  onSimulationToggle?: () => void;
  onSimulationErrorToggle?: () => void;
  onOpenCreate: () => void;
  onOpenOpen: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onOpenOfflineMaps: () => void;
  onImportRasterFiles?: (
    mode: 'geotiff' | 'tif+tfw',
    files: FileList | File[],
    options?: {
      tfwUnits?: 'degrees' | 'meters';
      metersProjection?: 'web-mercator' | 'utm';
      utmZone?: number;
      utmHemisphere?: 'north' | 'south';
    },
  ) => void;
  onFinishMission: () => void;
  onGoToStart: () => void;
}

const TopToolbar = ({
  missionName,
  isDraft,
  autoSaveStatus,
  activeTool,
  trackStatus,
  showSimulationControls,
  isRecordingEnabled,
  simulationEnabled = false,
  simulateConnectionError = false,
  onToolChange,
  onTrackAction,
  onSimulationToggle,
  onSimulationErrorToggle,
  onOpenCreate,
  onOpenOpen,
  onOpenExport,
  onOpenSettings,
  onOpenOfflineMaps,
  onImportRasterFiles,
  onFinishMission,
  onGoToStart,
}: TopToolbarProps) => {
  const geotiffInputRef = useRef<HTMLInputElement | null>(null);
  const tifTfwDegreesInputRef = useRef<HTMLInputElement | null>(null);
  const tifTfwMercatorInputRef = useRef<HTMLInputElement | null>(null);
  const tifTfwUtmInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUtmConfigRef = useRef<{ zone: number; hemisphere: 'north' | 'south' } | null>(null);
  const [utmDialogOpen, setUtmDialogOpen] = useState(false);
  const [utmZoneText, setUtmZoneText] = useState('37');
  const [utmHemisphere, setUtmHemisphere] = useState<'north' | 'south'>('north');
  const [utmError, setUtmError] = useState<string | null>(null);
  const UTM_ZONE_ERROR = 'Некорректная UTM зона: ожидается число от 1 до 60.';

  const parseUtmZone = (value: string): number | null => {
    const zone = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(zone) || zone < 1 || zone > 60) return null;
    return zone;
  };

  const validateUtmConfig = (): { zone: number; hemisphere: 'north' | 'south' } | null => {
    const zone = parseUtmZone(utmZoneText);
    if (zone === null) {
      setUtmError(UTM_ZONE_ERROR);
      return null;
    }
    setUtmError(null);
    return { zone, hemisphere: utmHemisphere };
  };
  const tools = [
    { id: 'select' as Tool, icon: MousePointer2, label: 'Выбор/Редактирование' },
    { id: 'route' as Tool, icon: Route, label: 'Маршрут' },
    { id: 'zone' as Tool, icon: Square, label: 'Зона (галсы)' },
    { id: 'marker' as Tool, icon: MapPin, label: 'Маркер' },
  ];

  return (
    <div className="h-12 bg-card border-b border-border flex items-center px-2 gap-1">
      {/* Mission Menu */}
      <DropdownMenu modal={false}>
        <input
          ref={geotiffInputRef}
          type="file"
          className="hidden"
          accept=".tif,.tiff"
          multiple
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              onImportRasterFiles?.('geotiff', files);
            }
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={tifTfwDegreesInputRef}
          type="file"
          className="hidden"
          accept=".tif,.tiff"
          multiple
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              onImportRasterFiles?.('tif+tfw', files, { tfwUnits: 'degrees' });
            }
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={tifTfwMercatorInputRef}
          type="file"
          className="hidden"
          accept=".tif,.tiff"
          multiple
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              onImportRasterFiles?.('tif+tfw', files, {
                tfwUnits: 'meters',
                metersProjection: 'web-mercator',
              });
            }
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={tifTfwUtmInputRef}
          type="file"
          className="hidden"
          accept=".tif,.tiff"
          multiple
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) {
              const utm = pendingUtmConfigRef.current;
              if (!utm) {
                event.currentTarget.value = '';
                return;
              }
              onImportRasterFiles?.('tif+tfw', files, {
                tfwUnits: 'meters',
                metersProjection: 'utm',
                utmZone: utm.zone,
                utmHemisphere: utm.hemisphere,
              });
            }
            pendingUtmConfigRef.current = null;
            event.currentTarget.value = '';
          }}
        />
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-3 gap-2">
            <span className="font-medium">
              {isDraft ? 'Черновик' : missionName || 'Миссия'}
            </span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={onOpenCreate}>
            <Save className="w-4 h-4 mr-2" />
            Новая миссия
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenOpen}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Открыть...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onGoToStart}>
            <Home className="w-4 h-4 mr-2" />
            На старт
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenExport}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenOfflineMaps}>
            <CloudDownload className="w-4 h-4 mr-2" />
            Скачать карты...
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ImagePlus className="w-4 h-4 mr-2" />
              Импорт
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ImagePlus className="w-4 h-4 mr-2" />
                  Импорт TIF
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      geotiffInputRef.current?.click();
                    }}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    Встроенная привязка (GeoTIFF)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      tifTfwDegreesInputRef.current?.click();
                    }}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    TIF + TFW (градусы)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      tifTfwMercatorInputRef.current?.click();
                    }}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    TIF + TFW (Меркатор, EPSG:3857)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setUtmError(null);
                      setUtmDialogOpen(true);
                    }}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    TIF + TFW (UTM зона)
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onFinishMission} disabled={isDraft}>
            <Flag className="w-4 h-4 mr-2" />
            Завершить миссию
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={utmDialogOpen} onOpenChange={setUtmDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Импорт TIF + TFW (UTM)</DialogTitle>
            <DialogDescription>Укажите UTM зону и полушарие перед выбором TIF.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="utm-zone">UTM зона (1..60)</Label>
              <Input
                id="utm-zone"
                value={utmZoneText}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setUtmZoneText(nextValue);
                  if (nextValue.trim().length === 0) {
                    setUtmError(UTM_ZONE_ERROR);
                    return;
                  }
                  setUtmError(parseUtmZone(nextValue) === null ? UTM_ZONE_ERROR : null);
                }}
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                step={1}
                placeholder="37"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="utm-hemisphere">Полушарие</Label>
              <select
                id="utm-hemisphere"
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={utmHemisphere}
                onChange={(event) => setUtmHemisphere(event.target.value === 'south' ? 'south' : 'north')}
              >
                <option value="north">Северное (N)</option>
                <option value="south">Южное (S)</option>
              </select>
            </div>
            {utmError ? <p className="text-xs text-destructive">{utmError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={parseUtmZone(utmZoneText) === null}
              onClick={() => {
                const utm = validateUtmConfig();
                if (!utm) return;
                pendingUtmConfigRef.current = utm;
                setUtmDialogOpen(false);
                tifTfwUtmInputRef.current?.click();
              }}
            >
              Выбрать TIF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-save indicator */}
      <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
        {autoSaveStatus === 'saved' && <Check className="w-3 h-3 text-success" />}
        {autoSaveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
        {autoSaveStatus === 'error' && <AlertCircle className="w-3 h-3 text-destructive" />}
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <Button
            key={tool.id}
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-3 gap-2',
              activeTool === tool.id && 'bg-primary/20 text-primary'
            )}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
          >
            <tool.icon className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">{tool.label}</span>
          </Button>
        ))}
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      {/* Track Controls */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-2">Трек:</span>
        {trackStatus === 'recording' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 gap-2"
            onClick={() => onTrackAction('pause')}
            disabled={!isRecordingEnabled}
          >
            <Pause className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">Пауза</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 gap-2 text-warning"
            onClick={() => onTrackAction('resume')}
            disabled={!isRecordingEnabled}
          >
            <Play className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">Начать запись</span>
          </Button>
        )}
      </div>

      {showSimulationControls ? (
        <>
          <Button
            variant={simulationEnabled ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 px-3"
            onClick={onSimulationToggle}
          >
            <span className="hidden lg:inline text-sm">
              {simulationEnabled ? 'Стоп симуляции' : 'Старт симуляции'}
            </span>
            <span className="lg:hidden text-sm">{simulationEnabled ? 'Стоп' : 'Старт'}</span>
          </Button>

          <Button
            variant={simulateConnectionError ? 'destructive' : 'outline'}
            size="sm"
            className="h-8 px-3"
            onClick={onSimulationErrorToggle}
          >
            <span className="hidden lg:inline text-sm">
              {simulateConnectionError ? 'Ошибка: ВКЛ' : 'Ошибка: ВЫКЛ'}
            </span>
            <span className="lg:hidden text-sm">Ошибка</span>
          </Button>
        </>
      ) : null}

      <div className="flex-1" />

      {/* Settings */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-3"
        onClick={onOpenSettings}
      >
        <Settings className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default TopToolbar;
