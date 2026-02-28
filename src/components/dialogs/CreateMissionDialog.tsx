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
import { Checkbox } from '@/components/ui/checkbox';
import { FolderOpen } from 'lucide-react';
import { platform } from "@/platform";
import { MISSIONS_DIR_SETTINGS_KEY } from '@/features/mission/model/constants';

interface CreateMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, path: string) => Promise<void> | void;
}

const CreateMissionDialog = ({ open, onOpenChange, onConfirm }: CreateMissionDialogProps) => {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(platform.paths.defaultMissionsDir());
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const folderEditedRef = useRef(false);

  const persistMissionsDir = async (nextFolder: string) => {
    const normalized = nextFolder.trim();
    if (!normalized) return;
    await platform.settings.writeJson(MISSIONS_DIR_SETTINGS_KEY, normalized);
  };

  useEffect(() => {
    if (!open) return;
    let isActive = true;
    folderEditedRef.current = false;
    setIsSubmitting(false);
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

  const handleConfirm = async () => {
    if (isSubmitting) return;
    const normalizedName = name.trim();
    const normalizedFolder = folder.trim();
    if (normalizedName && normalizedFolder) {
      setIsSubmitting(true);
      try {
        await persistMissionsDir(normalizedFolder);
        const finalPath = createSubfolder ? `${normalizedFolder}/${normalizedName}` : normalizedFolder;
        await Promise.resolve(onConfirm(normalizedName, finalPath));
        setName('');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handlePickFolder = async () => {
    const picked = await platform.fs.pickDirectory({
      title: "Папка хранения миссий",
      defaultPath: folder,
    });
    if (!picked) return;
    const normalized = picked.trim();
    if (!normalized) return;
    folderEditedRef.current = true;
    setFolder(normalized);
    await persistMissionsDir(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создание миссии</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mission-name">Имя миссии</Label>
            <Input
              id="mission-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              placeholder="Введите имя миссии"
            />
          </div>

          <div className="space-y-2">
            <Label>Папка хранения</Label>
            <div className="flex gap-2">
              <Input
                value={folder}
                onChange={(e) => {
                  folderEditedRef.current = true;
                  setFolder(e.target.value);
                }}
                className="font-mono text-sm"
                disabled={isSubmitting}
              />
              <Button type="button" variant="outline" size="icon" onClick={handlePickFolder} disabled={isSubmitting}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={createSubfolder}
              onCheckedChange={(checked) => setCreateSubfolder(checked as boolean)}
              disabled={isSubmitting}
            />
            <span className="text-sm">Создать подпапку с именем миссии</span>
          </label>

          {name && (
            <div className="p-3 bg-muted rounded-md">
              <div className="text-xs text-muted-foreground mb-1">Путь сохранения:</div>
              <div className="font-mono text-sm">
                {createSubfolder ? `${folder}/${name}/mission.json` : `${folder}/mission.json`}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!name.trim() || isSubmitting}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMissionDialog;
