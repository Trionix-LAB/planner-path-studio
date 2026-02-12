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
import { FolderOpen, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import { platform } from "@/platform";
import { useRecentMissions } from '@/hooks/useRecentMissions';

interface OpenMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (path: string) => void;
}

const OpenMissionDialog = ({ open, onOpenChange, onConfirm }: OpenMissionDialogProps) => {
  const [folder, setFolder] = useState(platform.paths.defaultMissionsDir());
  const [error, setError] = useState<string | null>(null);
  const { missions: recentMissions } = useRecentMissions();

  const handleConfirm = () => {
    if (folder.trim()) {
      onConfirm(folder);
      setFolder('');
      setError(null);
    }
  };

  const handleRecentClick = (path: string) => {
    onConfirm(path);
    setFolder('');
    setError(null);
  };

  const handlePickFolder = async () => {
    const picked = await platform.fs.pickDirectory({
      title: "Папка миссии",
      defaultPath: folder,
    });
    if (picked) {
      setFolder(picked);
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Clock className="w-4 h-4" />
              Недавние миссии
            </div>
            <div className="space-y-1">
              {recentMissions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Нет доступных миссий</div>
              ) : (
                recentMissions.map((mission) => (
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
