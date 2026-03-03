import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { convertPoint, getCrsLabel, supportedCoordinateCrs, type CrsId } from '@/features/geo/crs';
import {
  coordinateInputFormats,
  formatCoordinateForInput,
  getCoordinateInputFormatLabel,
  getCoordinateInputMaskLabel,
  getCoordinatePlaceholder,
  parseCoordinateInput,
  reformatCoordinateValue,
  sanitizeCoordinateInput,
  type CoordinateInputFormat,
} from '@/features/geo/coordinateInputFormat';
import type { MapObjectGeometry } from '@/features/map/model/types';

type CoordinateBuilderType = 'route' | 'zone' | 'marker';

type EditablePointRow = {
  id: string;
  lat: string;
  lon: string;
};

type PointCellErrors = Record<number, { lat?: string; lon?: string }>;

interface CoordinateBuilderDialogProps {
  open: boolean;
  objectType: CoordinateBuilderType | null;
  inputCrs: CrsId;
  inputFormat?: CoordinateInputFormat;
  onInputCrsChange?: (crs: CrsId) => void;
  onInputFormatChange?: (format: CoordinateInputFormat) => void;
  onOpenChange: (open: boolean) => void;
  onBuild: (geometry: MapObjectGeometry) => void;
}

const TITLE_BY_TYPE: Record<CoordinateBuilderType, string> = {
  route: 'Построение маршрута по координатам',
  zone: 'Построение зоны по координатам',
  marker: 'Построение маркера по координатам',
};

const DESCRIPTION_BY_TYPE: Record<CoordinateBuilderType, string> = {
  route: 'Введите точки в выбранной CRS. По кнопке "Построить" маршрут будет сохранен в WGS84.',
  zone: 'Введите вершины в выбранной CRS. По кнопке "Построить" зона будет сохранена в WGS84.',
  marker: 'Введите координату в выбранной CRS. По кнопке "Построить" маркер будет сохранен в WGS84.',
};

const MIN_POINTS: Record<Exclude<CoordinateBuilderType, 'marker'>, number> = {
  route: 2,
  zone: 3,
};

const createEmptyRow = (index: number): EditablePointRow => ({
  id: `coord-row-${index}-${Math.random().toString(36).slice(2, 8)}`,
  lat: '',
  lon: '',
});

const validatePointInput = (
  latRaw: string,
  lonRaw: string,
  format: CoordinateInputFormat,
): { lat?: string; lon?: string } => {
  const errors: { lat?: string; lon?: string } = {};
  const lat = parseCoordinateInput(latRaw, format, 'lat');
  const lon = parseCoordinateInput(lonRaw, format, 'lon');

  if (!lat.ok) {
    if ('reason' in lat && lat.reason === 'out_of_range') {
      errors.lat = 'Широта должна быть от -90 до 90';
    } else {
      errors.lat = 'Некорректная широта';
    }
  }

  if (!lon.ok) {
    if ('reason' in lon && lon.reason === 'out_of_range') {
      errors.lon = 'Долгота должна быть от -180 до 180';
    } else {
      errors.lon = 'Некорректная долгота';
    }
  }

  return errors;
};

const parsePointInputValue = (
  raw: string,
  format: CoordinateInputFormat,
  axis: 'lat' | 'lon',
): number | null => {
  const parsed = parseCoordinateInput(raw, format, axis);
  if (!parsed.ok) return null;
  return parsed.value;
};

const mapRowsBetweenCrs = (
  rows: EditablePointRow[],
  from: CrsId,
  to: CrsId,
  format: CoordinateInputFormat,
): EditablePointRow[] =>
  rows.map((row) => {
    const lat = parsePointInputValue(row.lat, format, 'lat');
    const lon = parsePointInputValue(row.lon, format, 'lon');
    if (lat === null || lon === null) return row;
    try {
      const next = convertPoint({ lat, lon }, from, to);
      return {
        ...row,
        lat: formatCoordinateForInput(next.lat, format),
        lon: formatCoordinateForInput(next.lon, format),
      };
    } catch {
      return row;
    }
  });

const mapMarkerBetweenCrs = (
  point: { lat: string; lon: string },
  from: CrsId,
  to: CrsId,
  format: CoordinateInputFormat,
): { lat: string; lon: string } => {
  const lat = parsePointInputValue(point.lat, format, 'lat');
  const lon = parsePointInputValue(point.lon, format, 'lon');
  if (lat === null || lon === null) return point;
  try {
    const next = convertPoint({ lat, lon }, from, to);
    return { lat: formatCoordinateForInput(next.lat, format), lon: formatCoordinateForInput(next.lon, format) };
  } catch {
    return point;
  }
};

const mapRowsBetweenFormat = (
  rows: EditablePointRow[],
  fromFormat: CoordinateInputFormat,
  toFormat: CoordinateInputFormat,
): EditablePointRow[] =>
  rows.map((row) => ({
    ...row,
    lat: reformatCoordinateValue(row.lat, fromFormat, toFormat, 'lat'),
    lon: reformatCoordinateValue(row.lon, fromFormat, toFormat, 'lon'),
  }));

const mapMarkerBetweenFormat = (
  point: { lat: string; lon: string },
  fromFormat: CoordinateInputFormat,
  toFormat: CoordinateInputFormat,
): { lat: string; lon: string } => ({
  lat: reformatCoordinateValue(point.lat, fromFormat, toFormat, 'lat'),
  lon: reformatCoordinateValue(point.lon, fromFormat, toFormat, 'lon'),
});

const toWgsPreview = (
  latRaw: string,
  lonRaw: string,
  sourceCrs: CrsId,
  format: CoordinateInputFormat,
): { lat: string; lon: string; error?: string } => {
  const lat = parsePointInputValue(latRaw, format, 'lat');
  const lon = parsePointInputValue(lonRaw, format, 'lon');
  if (lat === null || lon === null) {
    return { lat: '—', lon: '—', error: 'Некорректные координаты' };
  }
  try {
    const converted = convertPoint({ lat, lon }, sourceCrs, 'wgs84');
    return {
      lat: converted.lat.toFixed(6),
      lon: converted.lon.toFixed(6),
    };
  } catch (error) {
    return {
      lat: '—',
      lon: '—',
      error: error instanceof Error ? error.message : 'Ошибка конвертации',
    };
  }
};

const CoordinateBuilderDialog = ({
  open,
  objectType,
  inputCrs,
  inputFormat = 'dd',
  onInputCrsChange,
  onInputFormatChange,
  onOpenChange,
  onBuild,
}: CoordinateBuilderDialogProps) => {
  const [selectedCrs, setSelectedCrs] = useState<CrsId>(inputCrs);
  const [selectedFormat, setSelectedFormat] = useState<CoordinateInputFormat>(inputFormat);
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([createEmptyRow(0), createEmptyRow(1)]);
  const [markerPoint, setMarkerPoint] = useState<{ lat: string; lon: string }>({ lat: '', lon: '' });
  const [tableError, setTableError] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<PointCellErrors>({});
  const [markerError, setMarkerError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCrs(inputCrs);
  }, [inputCrs]);

  useEffect(() => {
    setSelectedFormat(inputFormat);
  }, [inputFormat]);

  useEffect(() => {
    if (!open || !objectType) return;
    if (objectType === 'marker') {
      setMarkerPoint({ lat: '', lon: '' });
    } else {
      const min = MIN_POINTS[objectType];
      setPointRows(Array.from({ length: min }, (_, index) => createEmptyRow(index)));
    }
    setTableError(null);
    setCellErrors({});
    setMarkerError(null);
  }, [open, objectType]);

  const pointPreviewRows = useMemo(
    () => pointRows.map((row) => toWgsPreview(row.lat, row.lon, selectedCrs, selectedFormat)),
    [pointRows, selectedCrs, selectedFormat],
  );
  const markerPreview = useMemo(
    () => toWgsPreview(markerPoint.lat, markerPoint.lon, selectedCrs, selectedFormat),
    [markerPoint.lat, markerPoint.lon, selectedCrs, selectedFormat],
  );

  if (!objectType) return null;

  const handleCrsChange = (nextCrs: CrsId) => {
    if (nextCrs === selectedCrs) return;
    if (objectType === 'marker') {
      setMarkerPoint((prev) => mapMarkerBetweenCrs(prev, selectedCrs, nextCrs, selectedFormat));
    } else {
      setPointRows((prev) => mapRowsBetweenCrs(prev, selectedCrs, nextCrs, selectedFormat));
    }
    setSelectedCrs(nextCrs);
    onInputCrsChange?.(nextCrs);
  };

  const handleFormatChange = (nextFormat: CoordinateInputFormat) => {
    if (nextFormat === selectedFormat) return;
    if (objectType === 'marker') {
      setMarkerPoint((prev) => mapMarkerBetweenFormat(prev, selectedFormat, nextFormat));
    } else {
      setPointRows((prev) => mapRowsBetweenFormat(prev, selectedFormat, nextFormat));
    }
    setSelectedFormat(nextFormat);
    onInputFormatChange?.(nextFormat);
  };

  const handleBuildPoints = (type: 'route' | 'zone') => {
    const nextCellErrors: PointCellErrors = {};
    const parsedPoints: Array<{ lat: number; lon: number }> = [];

    for (let i = 0; i < pointRows.length; i += 1) {
      const row = pointRows[i];
      const errors = validatePointInput(row.lat, row.lon, selectedFormat);
      if (errors.lat || errors.lon) {
        nextCellErrors[i] = errors;
        continue;
      }
      const lat = parsePointInputValue(row.lat, selectedFormat, 'lat');
      const lon = parsePointInputValue(row.lon, selectedFormat, 'lon');
      if (lat === null || lon === null) {
        nextCellErrors[i] = errors;
        continue;
      }
      parsedPoints.push({
        lat,
        lon,
      });
    }

    if (Object.keys(nextCellErrors).length > 0) {
      setCellErrors(nextCellErrors);
      setTableError('Исправьте ошибки в координатах');
      return;
    }

    if (parsedPoints.length < MIN_POINTS[type]) {
      setCellErrors({});
      setTableError(`Минимум точек: ${MIN_POINTS[type]}`);
      return;
    }

    try {
      const wgsPoints = parsedPoints.map((point) => convertPoint(point, selectedCrs, 'wgs84'));
      onBuild({ type, points: wgsPoints });
      onOpenChange(false);
    } catch (error) {
      setCellErrors({});
      setTableError(error instanceof Error ? error.message : 'Не удалось конвертировать координаты');
    }
  };

  const handleBuildMarker = () => {
    const errors = validatePointInput(markerPoint.lat, markerPoint.lon, selectedFormat);
    if (errors.lat || errors.lon) {
      setMarkerError(errors.lat ?? errors.lon ?? 'Исправьте ошибки в координатах');
      return;
    }
    const lat = parsePointInputValue(markerPoint.lat, selectedFormat, 'lat');
    const lon = parsePointInputValue(markerPoint.lon, selectedFormat, 'lon');
    if (lat === null || lon === null) {
      setMarkerError('Исправьте ошибки в координатах');
      return;
    }

    try {
      const point = convertPoint({ lat, lon }, selectedCrs, 'wgs84');
      onBuild({ type: 'marker', point });
      onOpenChange(false);
    } catch (error) {
      setMarkerError(error instanceof Error ? error.message : 'Не удалось конвертировать координаты');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{TITLE_BY_TYPE[objectType]}</DialogTitle>
          <DialogDescription>{DESCRIPTION_BY_TYPE[objectType]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Система координат ввода</Label>
            <Select value={selectedCrs} onValueChange={(value) => handleCrsChange(value as CrsId)}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCoordinateCrs.map((crs) => (
                  <SelectItem key={crs} value={crs}>
                    {getCrsLabel(crs)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Формат координат</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => handleFormatChange(value as CoordinateInputFormat)}
              className="gap-2"
            >
              {coordinateInputFormats.map((format) => (
                <label
                  key={`builder-format-${format}`}
                  className="flex items-start gap-2 rounded border border-border px-2.5 py-2 cursor-pointer"
                >
                  <RadioGroupItem value={format} />
                  <span className="flex flex-col leading-4">
                    <span className="text-xs">{getCoordinateInputFormatLabel(format)}</span>
                    <span className="text-[11px] text-muted-foreground">{getCoordinateInputMaskLabel(format)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {objectType === 'marker' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="builder-marker-lat">Широта</Label>
                <Input
                  id="builder-marker-lat"
                  value={markerPoint.lat}
                  placeholder={getCoordinatePlaceholder(selectedFormat, 'lat')}
                  onChange={(event) => {
                    const masked = sanitizeCoordinateInput(event.target.value, selectedFormat, 'lat');
                    setMarkerPoint((prev) => ({ ...prev, lat: masked }));
                    setMarkerError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="builder-marker-lon">Долгота</Label>
                <Input
                  id="builder-marker-lon"
                  value={markerPoint.lon}
                  placeholder={getCoordinatePlaceholder(selectedFormat, 'lon')}
                  onChange={(event) => {
                    const masked = sanitizeCoordinateInput(event.target.value, selectedFormat, 'lon');
                    setMarkerPoint((prev) => ({ ...prev, lon: masked }));
                    setMarkerError(null);
                  }}
                />
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <Label>WGS84 preview</Label>
                <div className="rounded border border-dashed px-2 py-2 font-mono leading-5">
                  {markerPreview.error ? (
                    <span className="text-destructive">{markerPreview.error}</span>
                  ) : (
                    <span>{`${markerPreview.lat}, ${markerPreview.lon}`}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded border">
                <div className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 border-b bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                  <span>Широта</span>
                  <span>Долгота</span>
                  <span>WGS84 preview</span>
                  <span />
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {pointRows.map((row, index) => {
                    const rowError = cellErrors[index];
                    const preview = pointPreviewRows[index];
                    return (
                      <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 border-b px-2 py-2 last:border-b-0">
                        <div className="space-y-1">
                          <Label htmlFor={`builder-lat-${row.id}`} className="sr-only">
                            {`Широта ${index + 1}`}
                          </Label>
                          <Input
                            id={`builder-lat-${row.id}`}
                            aria-label={`Широта ${index + 1}`}
                            className="h-8"
                            value={row.lat}
                            placeholder={getCoordinatePlaceholder(selectedFormat, 'lat')}
                            onChange={(event) => {
                              const value = sanitizeCoordinateInput(event.target.value, selectedFormat, 'lat');
                              setPointRows((prev) =>
                                prev.map((entry) => (entry.id === row.id ? { ...entry, lat: value } : entry)),
                              );
                              setCellErrors((prev) => ({ ...prev, [index]: { ...prev[index], lat: undefined } }));
                              setTableError(null);
                            }}
                          />
                          {rowError?.lat ? <div className="text-[11px] text-destructive">{rowError.lat}</div> : null}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`builder-lon-${row.id}`} className="sr-only">
                            {`Долгота ${index + 1}`}
                          </Label>
                          <Input
                            id={`builder-lon-${row.id}`}
                            aria-label={`Долгота ${index + 1}`}
                            className="h-8"
                            value={row.lon}
                            placeholder={getCoordinatePlaceholder(selectedFormat, 'lon')}
                            onChange={(event) => {
                              const value = sanitizeCoordinateInput(event.target.value, selectedFormat, 'lon');
                              setPointRows((prev) =>
                                prev.map((entry) => (entry.id === row.id ? { ...entry, lon: value } : entry)),
                              );
                              setCellErrors((prev) => ({ ...prev, [index]: { ...prev[index], lon: undefined } }));
                              setTableError(null);
                            }}
                          />
                          {rowError?.lon ? <div className="text-[11px] text-destructive">{rowError.lon}</div> : null}
                        </div>
                        <div className="flex items-center text-xs font-mono text-muted-foreground">
                          {preview.error ? (
                            <span className="text-destructive">{preview.error}</span>
                          ) : (
                            <span>{`${preview.lat}, ${preview.lon}`}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setPointRows((prev) => prev.filter((entry) => entry.id !== row.id))}
                            disabled={pointRows.length <= MIN_POINTS[objectType]}
                            aria-label={`Удалить точку ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPointRows((prev) => [...prev, createEmptyRow(prev.length)])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Добавить точку
                </Button>
                {tableError ? <span className="text-xs text-destructive">{tableError}</span> : null}
              </div>
            </div>
          )}

          {markerError ? <div className="text-xs text-destructive">{markerError}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (objectType === 'marker') {
                handleBuildMarker();
              } else {
                handleBuildPoints(objectType);
              }
            }}
          >
            Построить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CoordinateBuilderDialog;
