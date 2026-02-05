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
import { FolderOpen } from 'lucide-react';

interface CreateMissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, path: string) => void;
}

const CreateMissionDialog = ({ open, onOpenChange, onConfirm }: CreateMissionDialogProps) => {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('C:/Missions');
  const [createSubfolder, setCreateSubfolder] = useState(true);

  const handleConfirm = () => {
    if (name.trim()) {
      const finalPath = createSubfolder ? `${folder}/${name}` : folder;
      onConfirm(name, finalPath);
      setName('');
    }
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
              placeholder="Введите имя миссии"
            />
          </div>

          <div className="space-y-2">
            <Label>Папка хранения</Label>
            <div className="flex gap-2">
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} className="font-mono text-sm" />
              <Button variant="outline" size="icon">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={createSubfolder}
              onCheckedChange={(checked) => setCreateSubfolder(checked as boolean)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMissionDialog;
