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
import { FolderOpen } from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExportDialog = ({ open, onOpenChange }: ExportDialogProps) => {
  const [exportTracks, setExportTracks] = useState(true);
  const [exportRoutes, setExportRoutes] = useState(true);
  const [exportMarkers, setExportMarkers] = useState(true);
  const [trackFormat, setTrackFormat] = useState('gpx');
  const [routeFormat, setRouteFormat] = useState('gpx');
  const [markerFormat, setMarkerFormat] = useState('csv');
  const [exportPath, setExportPath] = useState('C:/Exports');

  const handleExport = () => {
    // Mock export
    console.log('Exporting...');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Экспорт данных</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Tracks */}
          <div className="flex items-start gap-4">
            <Checkbox
              checked={exportTracks}
              onCheckedChange={(checked) => setExportTracks(checked as boolean)}
            />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Треки</Label>
                <Select value={trackFormat} onValueChange={setTrackFormat} disabled={!exportTracks}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpx">GPX</SelectItem>
                    <SelectItem value="kml">KML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">
                Все треки миссии (2 трека)
              </div>
            </div>
          </div>

          {/* Routes */}
          <div className="flex items-start gap-4">
            <Checkbox
              checked={exportRoutes}
              onCheckedChange={(checked) => setExportRoutes(checked as boolean)}
            />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Маршруты и галсы</Label>
                <Select value={routeFormat} onValueChange={setRouteFormat} disabled={!exportRoutes}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpx">GPX</SelectItem>
                    <SelectItem value="kml">KML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">
                1 маршрут, 1 зона обследования
              </div>
            </div>
          </div>

          {/* Markers */}
          <div className="flex items-start gap-4">
            <Checkbox
              checked={exportMarkers}
              onCheckedChange={(checked) => setExportMarkers(checked as boolean)}
            />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Маркеры</Label>
                <Select value={markerFormat} onValueChange={setMarkerFormat} disabled={!exportMarkers}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="gpx">GPX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">
                1 маркер
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <Label>Папка экспорта</Label>
            <div className="flex gap-2">
              <Input value={exportPath} onChange={(e) => setExportPath(e.target.value)} className="font-mono text-sm" />
              <Button variant="outline" size="icon">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleExport} disabled={!exportTracks && !exportRoutes && !exportMarkers}>
            Экспортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
