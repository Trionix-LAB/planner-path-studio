import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilePlus, FolderOpen, FileText, RotateCcw, Clock, ChevronRight, Cpu, Trash2 } from 'lucide-react';
import { platform } from '@/platform';
import { useRecentMissions } from '@/hooks/useRecentMissions';
import { ALL_MISSIONS_LIMIT } from '@/features/mission/model/recentMissions';
import { MISSIONS_DIR_SETTINGS_KEY } from '@/features/mission/model/constants';
import { useDelayedMissionDeletion } from '@/hooks/useDelayedMissionDeletion';
import { useMissionListView, type MissionSortMode } from '@/hooks/useMissionListView';
const MISSION_DELETE_UNDO_DELAY_MS = 7000;
const SORT_OPTIONS: ReadonlyArray<{ value: MissionSortMode; label: string }> = [
  { value: 'date-desc', label: 'Дата: новые сначала' },
  { value: 'date-asc', label: 'Дата: старые сначала' },
  { value: 'name', label: 'Имя: А-Я' },
];

const StartScreen = () => {
  const navigate = useNavigate();
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const [missionsDir, setMissionsDir] = useState(() => platform.paths.defaultMissionsDir());
  const { missions: recentMissions, reload } = useRecentMissions({
    missionsDir,
    limit: ALL_MISSIONS_LIMIT,
  });
  const { pagedMissions, page, setPage, totalPages, sortMode, setSortMode } = useMissionListView(recentMissions);
  const { pendingMissions, scheduleDelete, undoDelete } = useDelayedMissionDeletion({
    platform,
    delayMs: MISSION_DELETE_UNDO_DELAY_MS,
    onAfterDelete: reload,
  });
  const pendingByRootPath = new Map(pendingMissions.map((item) => [item.rootPath, item]));

  useEffect(() => {
    const checkDraft = async () => {
      const exists = await platform.fileStore.exists('draft/current/mission.json');
      setHasRecoverableDraft(exists);
    };

    void checkDraft();
  }, []);

  useEffect(() => {
    const readStoredMissionsDir = async () => {
      const stored = await platform.settings.readJson<unknown>(MISSIONS_DIR_SETTINGS_KEY);
      if (typeof stored === 'string' && stored.trim().length > 0) {
        setMissionsDir(stored.trim());
      }
    };

    void readStoredMissionsDir();
  }, []);

  const handlePickMissionsDirectory = async () => {
    const picked = await platform.fs.pickDirectory({
      title: 'Папка хранения миссий',
      defaultPath: missionsDir,
    });
    if (!picked) return;
    const normalized = picked.trim();
    if (!normalized) return;
    setMissionsDir(normalized);
    await platform.settings.writeJson(MISSIONS_DIR_SETTINGS_KEY, normalized);
    await reload();
  };

  const handleOpenMission = (rootPath: string) => {
    navigate('/map?mission=' + encodeURIComponent(rootPath));
  };

  const handleDeleteMission = async (rootPath: string, name: string) => {
    if (!window.confirm(`Удалить миссию "${name}"?`)) {
      return;
    }
    await scheduleDelete({ rootPath, name });
  };

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
            onClick={() => navigate('/map?mode=new-draft')}
          >
            <FileText className="w-8 h-8 text-muted-foreground" />
            <div>
              <div className="font-medium text-foreground">Черновик</div>
              <div className="text-xs text-muted-foreground">Новая пустая сессия</div>
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
          <div className="panel-header flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Миссии</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePickMissionsDirectory}>
                Папка миссий
              </Button>
              <Select value={sortMode} onValueChange={(value) => setSortMode(value as MissionSortMode)}>
                <SelectTrigger className="h-8 w-52" aria-label="Сортировка миссий">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
            Путь: <span className="font-mono">{missionsDir}</span> · Страница {page} из {totalPages} · По 5 на странице
          </div>
          <div className="divide-y divide-border">
            {pagedMissions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">Нет доступных миссий</div>
            ) : (
              pagedMissions.map((mission) => (
                <div key={mission.rootPath} className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-secondary/50 transition-colors">
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => handleOpenMission(mission.rootPath)}
                    disabled={pendingByRootPath.has(mission.rootPath)}
                  >
                    <div className="font-medium text-foreground text-sm">{mission.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{mission.rootPath}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{mission.dateLabel}</span>
                    {pendingByRootPath.has(mission.rootPath) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => undoDelete(mission.rootPath)}
                      >
                        Undo
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDeleteMission(mission.rootPath, mission.name)}
                        title="Удалить миссию"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))
            )}
            {recentMissions.length > 0 ? (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Назад
                </Button>
                <span className="text-xs text-muted-foreground">Страница {page} из {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Вперед
                </Button>
              </div>
            ) : null}
            {pendingMissions.length > 0 ? (
              <div className="px-4 py-2 text-xs text-muted-foreground">
                {pendingMissions.length === 1
                  ? `Удаление отложено на ${Math.round(MISSION_DELETE_UNDO_DELAY_MS / 1000)} сек. Нажмите Undo для отмены.`
                  : `Отложено удалений: ${pendingMissions.length}. Можно отменить через Undo.`}
              </div>
            ) : null}
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
