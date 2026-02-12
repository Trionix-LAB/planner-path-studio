import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FilePlus, FolderOpen, FileText, RotateCcw, Clock, ChevronRight, Cpu } from 'lucide-react';
import { platform } from '@/platform';
import { useRecentMissions } from '@/hooks/useRecentMissions';

const StartScreen = () => {
  const navigate = useNavigate();
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const { missions: recentMissions } = useRecentMissions();

  useEffect(() => {
    const checkDraft = async () => {
      const exists = await platform.fileStore.exists('draft/current/mission.json');
      setHasRecoverableDraft(exists);
    };

    void checkDraft();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-primary/10 border border-primary/30 mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-primary" fill="currentColor">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.09 5.1 7.63 12 4.18zM4 8.82l7 3.5v7.68l-7-3.5V8.82zm9 11.18v-7.68l7-3.5v7.68l-7 3.5z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Trionix planner path studio</h1>
          <p className="text-muted-foreground">Приложение планирования и записи миссий</p>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button
            variant="outline"
            className="h-auto py-6 px-6 flex flex-col items-center gap-3 bg-card hover:bg-secondary border-border hover:border-primary/50 transition-all"
            onClick={() => navigate('/create-mission')}
          >
            <FilePlus className="w-8 h-8 text-primary" />
            <div>
              <div className="font-medium text-foreground">Новая миссия</div>
              <div className="text-xs text-muted-foreground">Создать с нуля</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-6 px-6 flex flex-col items-center gap-3 bg-card hover:bg-secondary border-border hover:border-primary/50 transition-all"
            onClick={() => navigate('/open-mission')}
          >
            <FolderOpen className="w-8 h-8 text-primary" />
            <div>
              <div className="font-medium text-foreground">Открыть миссию</div>
              <div className="text-xs text-muted-foreground">Загрузить существующую</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-6 px-6 flex flex-col items-center gap-3 bg-card hover:bg-secondary border-border hover:border-primary/50 transition-all"
            onClick={() => navigate('/map?mode=draft')}
          >
            <FileText className="w-8 h-8 text-muted-foreground" />
            <div>
              <div className="font-medium text-foreground">Черновик</div>
              <div className="text-xs text-muted-foreground">Продолжить работу</div>
            </div>
          </Button>

          {hasRecoverableDraft && (
            <Button
              variant="outline"
              className="h-auto py-6 px-6 flex flex-col items-center gap-3 bg-card hover:bg-secondary border-border hover:border-warning/50 transition-all"
              onClick={() => navigate('/map?mode=recover')}
            >
              <RotateCcw className="w-8 h-8 text-warning" />
              <div>
                <div className="font-medium text-foreground">Восстановить</div>
                <div className="text-xs text-muted-foreground">Автосохраненный черновик</div>
              </div>
            </Button>
          )}

          <Button
            variant="outline"
            className="h-auto py-6 px-6 flex flex-col items-center gap-3 bg-card hover:bg-secondary border-border hover:border-primary/50 transition-all"
            onClick={() => navigate('/equipment')}
          >
            <Cpu className="w-8 h-8 text-primary" />
            <div>
              <div className="font-medium text-foreground">Оборудование</div>
              <div className="text-xs text-muted-foreground">Настройка устройств</div>
            </div>
          </Button>
        </div>

        {/* Recent Missions */}
        <div className="panel">
          <div className="panel-header flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Недавние миссии
          </div>
          <div className="divide-y divide-border">
            {recentMissions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">Нет доступных миссий</div>
            ) : (
              recentMissions.map((mission) => (
                <button
                  key={mission.rootPath}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/50 transition-colors text-left"
                  onClick={() => navigate('/map?mission=' + encodeURIComponent(mission.rootPath))}
                >
                  <div>
                    <div className="font-medium text-foreground text-sm">{mission.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{mission.rootPath}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{mission.dateLabel}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Version */}
        <div className="text-center mt-8 text-xs text-muted-foreground font-mono">
          v1.0.0-mvp
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
