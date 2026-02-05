import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  StopCircle,
  Crosshair,
  Home,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { Tool } from "@/features/map/model/types";
import { cn } from '@/lib/utils';

interface TopToolbarProps {
  missionName: string | null;
  isDraft: boolean;
  autoSaveStatus: 'saved' | 'saving' | 'error';
  activeTool: Tool;
  trackStatus: 'recording' | 'paused' | 'stopped';
  isFollowing: boolean;
  onToolChange: (tool: Tool) => void;
  onTrackAction: (action: 'pause' | 'resume' | 'stop') => void;
  onFollowToggle: () => void;
  onOpenCreate: () => void;
  onOpenOpen: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onBackToStart: () => void;
}

const TopToolbar = ({
  missionName,
  isDraft,
  autoSaveStatus,
  activeTool,
  trackStatus,
  isFollowing,
  onToolChange,
  onTrackAction,
  onFollowToggle,
  onOpenCreate,
  onOpenOpen,
  onOpenExport,
  onOpenSettings,
  onBackToStart,
}: TopToolbarProps) => {
  const tools = [
    { id: 'select' as Tool, icon: MousePointer2, label: 'Выбор/Редактирование' },
    { id: 'route' as Tool, icon: Route, label: 'Маршрут' },
    { id: 'zone' as Tool, icon: Square, label: 'Зона (галсы)' },
    { id: 'marker' as Tool, icon: MapPin, label: 'Маркер' },
  ];

  return (
    <div className="h-12 bg-card border-b border-border flex items-center px-2 gap-1">
      {/* Mission Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-3 gap-2">
            <span className="font-medium">
              {isDraft ? 'Черновик' : missionName || 'Миссия'}
            </span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={onOpenCreate}>
            <Save className="w-4 h-4 mr-2" />
            Новая миссия
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenOpen}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Открыть...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenExport}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onBackToStart}>
            <Home className="w-4 h-4 mr-2" />
            На главную
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
          >
            <Pause className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">Пауза</span>
          </Button>
        ) : trackStatus === 'paused' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 gap-2 text-warning"
            onClick={() => onTrackAction('resume')}
          >
            <Play className="w-4 h-4" />
            <span className="hidden lg:inline text-sm">Возобновить</span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 gap-2"
          onClick={() => onTrackAction('stop')}
          disabled={trackStatus === 'stopped'}
        >
          <StopCircle className="w-4 h-4" />
          <span className="hidden lg:inline text-sm">Завершить</span>
        </Button>
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      {/* Follow Mode */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 px-3 gap-2',
          isFollowing && 'bg-primary/20 text-primary'
        )}
        onClick={onFollowToggle}
      >
        <Crosshair className="w-4 h-4" />
        <span className="hidden lg:inline text-sm">Слежение</span>
      </Button>

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
