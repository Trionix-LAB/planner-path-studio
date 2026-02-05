import { Tool } from '@/pages/MapWorkspace';

interface StatusBarProps {
  cursorPosition: { lat: number; lon: number };
  scale: string;
  activeTool: Tool;
}

const toolNames: Record<Tool, string> = {
  select: 'Выбор/Редактирование',
  route: 'Маршрут',
  zone: 'Зона (галсы)',
  marker: 'Маркер',
};

const StatusBar = ({ cursorPosition, scale, activeTool }: StatusBarProps) => {
  return (
    <div className="h-7 bg-card border-t border-border flex items-center px-3 gap-6 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Курсор:</span>
        <span className="font-mono text-foreground">
          {cursorPosition.lat.toFixed(6)}°, {cursorPosition.lon.toFixed(6)}°
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Масштаб:</span>
        <span className="font-mono text-foreground">{scale}</span>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Инструмент:</span>
        <span className="text-primary font-medium">{toolNames[activeTool]}</span>
      </div>
      
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Esc - отмена</span>
        <span>•</span>
        <span>Delete - удалить</span>
      </div>
    </div>
  );
};

export default StatusBar;
