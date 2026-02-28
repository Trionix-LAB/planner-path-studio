import { useEffect, useRef, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import { platform } from "@/platform";
import { useRecentMissions } from '@/hooks/useRecentMissions';
import { MISSIONS_DIR_SETTINGS_KEY } from '@/features/mission/model/constants';
import { ALL_MISSIONS_LIMIT } from '@/features/mission/model/recentMissions';
import { useMissionListView, type MissionSortMode } from '@/hooks/useMissionListView';

interface OpenMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (path: string) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ value: MissionSortMode; label: string }> = [
  { value: 'date-desc', label: 'Дата: новые сначала' },
  { value: 'date-asc', label: 'Дата: старые сначала' },
  { value: 'name', label: 'Имя: А-Я' },
];

const OpenMissionDialog = ({ open, onOpenChange, onConfirm }: OpenMissionDialogProps) => {
  const [folder, setFolder] = useState(platform.paths.defaultMissionsDir());
  const [error, setError] = useState<string | null>(null);
  const folderEditedRef = useRef(false);
  const { missions: recentMissions } = useRecentMissions({ limit: ALL_MISSIONS_LIMIT, missionsDir: folder.trim() });
  const { pagedMissions, page, setPage, totalPages, sortMode, setSortMode } = useMissionListView(recentMissions);

  const persistMissionsDir = async (nextFolder: string) => {
    const normalized = nextFolder.trim();
    if (!normalized) return;
    await platform.settings.writeJson(MISSIONS_DIR_SETTINGS_KEY, normalized);
  };

  useEffect(() => {
    if (!open) return;
    let isActive = true;
    folderEditedRef.current = false;
    void (async () => {
      const stored = await platform.settings.readJson<unknown>(MISSIONS_DIR_SETTINGS_KEY);
      if (!isActive) return;
      if (folderEditedRef.current) return;
      if (typeof stored === 'string' && stored.trim().length > 0) {
        setFolder(stored.trim());
      }
    })();
    return () => {
      isActive = false;
    };
  }, [open]);

  const handleConfirm = () => {
    const normalized = folder.trim();
    if (normalized) {
      void persistMissionsDir(normalized);
      onConfirm(normalized);
      setError(null);
    }
  };

  const handleRecentClick = (path: string) => {
    const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/g, '');
    const separatorIndex = normalizedPath.lastIndexOf('/');
    const parentFolder = separatorIndex > 0 ? normalizedPath.slice(0, separatorIndex) : normalizedPath;
    folderEditedRef.current = true;
    void persistMissionsDir(parentFolder);
    setFolder(parentFolder);
    onConfirm(path);
    setError(null);
  };

  const handlePickFolder = async () => {
    const picked = await platform.fs.pickDirectory({
      title: "Папка миссии",
      defaultPath: folder,
    });
    if (picked) {
      const normalized = picked.trim();
      if (!normalized) return;
      folderEditedRef.current = true;
      setFolder(normalized);
      await persistMissionsDir(normalized);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Открыть миссию</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Папка миссии</Label>
            <div className="flex gap-2">
              <Input
                value={folder}
                onChange={(e) => {
                  folderEditedRef.current = true;
                  setFolder(e.target.value);
                  setError(null);
                }}
                placeholder="Выберите папку с mission.json"
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" size="icon" onClick={handlePickFolder}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Миссии
              </div>
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
            <div className="space-y-1">
              {pagedMissions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Нет доступных миссий</div>
              ) : (
                pagedMissions.map((mission) => (
                  <button
                    key={mission.rootPath}
                    className="w-full text-left px-3 py-2 rounded hover:bg-secondary flex items-center justify-between"
                    onClick={() => handleRecentClick(mission.rootPath)}
                  >
                    <div>
                      <div className="font-medium text-sm">{mission.name}</div>
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
            {recentMissions.length > 0 ? (
              <div className="pt-3 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Назад
                </Button>
                <span className="text-xs text-muted-foreground">Страница {page} из {totalPages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Вперед
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!folder.trim()}>
            Открыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpenMissionDialog;
