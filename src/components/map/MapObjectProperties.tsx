import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature } from '@/features/mission';
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
import { parseLaneAngleInput } from '@/features/mission/model/laneAngle';
import type { AppUiDefaults } from '@/features/settings';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { haversineDistanceMeters } from './scaleUtils';

interface MapObjectPropertiesProps {
  object: MapObject;
  styles: AppUiDefaults['styles'];
  coordinateInputCrs?: CrsId;
  coordinateInputFormat?: CoordinateInputFormat;
  onCoordinateInputCrsChange?: (crs: CrsId) => void;
  onCoordinateInputFormatChange?: (format: CoordinateInputFormat) => void;
  onSave: (id: string, updates: Partial<MapObject>) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string, updates?: Partial<MapObject>) => void;
  onPickLaneEdge?: (id: string) => void;
  onPickLaneStart?: (id: string) => void;
  zoneLanesOutdated?: boolean;
  zoneLaneCount?: number | null;
  zoneLaneFeatures?: LaneFeature[];
}

type EditablePointRow = {
  id: string;
  lat: string;
  lon: string;
};

type PointCellErrors = Record<number, { lat?: string; lon?: string }>;

type PointInputErrors = {
  lat?: string;
  lon?: string;
};

type PointPreviewRow = {
  lat: string;
  lon: string;
  error?: string;
};

type LaneVertexRow = {
  laneIndex: number;
  vertexIndex: number;
  lat: number;
  lon: number;
};

type LaneVertexDisplayRow = {
  laneIndex: number;
  vertexIndex: number;
  lat: string;
  lon: string;
};

const getDefaultColor = (type: MapObject['type'], styles: AppUiDefaults['styles']): string => {
  if (type === 'zone') return styles.survey_area.stroke_color;
  if (type === 'marker') return styles.marker.color;
  if (type === 'rwlt_buoy') return '#1d4ed8';
  if (type === 'lane') return styles.lane.color;
  if (type === 'measure') return '#f97316';
  return styles.route.color;
};

const getDefaultLaneColor = (styles: AppUiDefaults['styles']): string => styles.lane.color;

const normalizeHexColor = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
};

const clampMarkerSizePx = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(256, Math.trunc(n)));
};

const formatRouteLength = (meters: number): string => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 м';
  if (meters >= 1000) {
    const km = meters / 1000;
    const decimals = km >= 10 ? 1 : 2;
    return `${km.toFixed(decimals)} км`;
  }
  return `${meters.toFixed(1)} м`;
};

const computeRouteLengthMeters = (object: MapObject): number => {
  if (object.type !== 'route' || object.geometry?.type !== 'route') return 0;
  const points = object.geometry.points;
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    total += haversineDistanceMeters(prev.lat, prev.lon, next.lat, next.lon);
  }
  return total;
};

const computeMeasureLengthMeters = (object: MapObject): number => {
  if (object.type !== 'measure' || object.geometry?.type !== 'measure') return 0;
  const [start, end] = object.geometry.points;
  return haversineDistanceMeters(start.lat, start.lon, end.lat, end.lon);
};

const formatLaneCount = (count: number | null | undefined): string => {
  if (typeof count !== 'number' || count < 0) return '--';
  return String(count);
};

const toEditableRowsFromObject = (
  object: MapObject,
  targetCrs: CrsId,
  targetFormat: CoordinateInputFormat,
): EditablePointRow[] => {
  if (
    (object.type === 'route' && object.geometry?.type === 'route') ||
    (object.type === 'zone' && object.geometry?.type === 'zone')
  ) {
    return object.geometry.points.map((point, index) => {
      const converted = convertPoint(point, 'wgs84', targetCrs);
      return {
        id: `${object.id}-${index}-${point.lat}-${point.lon}`,
        lat: formatCoordinateForInput(converted.lat, targetFormat),
        lon: formatCoordinateForInput(converted.lon, targetFormat),
      };
    });
  }
  return [];
};

const toEditableMarkerPoint = (
  object: MapObject,
  targetCrs: CrsId,
  targetFormat: CoordinateInputFormat,
): { lat: string; lon: string } => {
  if ((object.type !== 'marker' && object.type !== 'rwlt_buoy') || object.geometry?.type !== 'marker') {
    return { lat: '', lon: '' };
  }
  const converted = convertPoint(object.geometry.point, 'wgs84', targetCrs);
  return {
    lat: formatCoordinateForInput(converted.lat, targetFormat),
    lon: formatCoordinateForInput(converted.lon, targetFormat),
  };
};

const validatePointInput = (
  latRaw: string,
  lonRaw: string,
  format: CoordinateInputFormat,
): PointInputErrors => {
  const errors: PointInputErrors = {};
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
  valueRaw: string,
  format: CoordinateInputFormat,
  axis: 'lat' | 'lon',
): number | null => {
  const parsed = parseCoordinateInput(valueRaw, format, axis);
  if (!parsed.ok) return null;
  return parsed.value;
};

const validatePointRows = (
  rows: EditablePointRow[],
  minPoints: number,
  format: CoordinateInputFormat,
): { points: Array<{ lat: number; lon: number }> | null; cellErrors: PointCellErrors; tableError: string | null } => {
  const cellErrors: PointCellErrors = {};
  const points: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const nextError = validatePointInput(row.lat, row.lon, format);
    const lat = parsePointInputValue(row.lat, format, 'lat');
    const lon = parsePointInputValue(row.lon, format, 'lon');

    if (nextError.lat || nextError.lon || lat === null || lon === null) {
      cellErrors[i] = nextError;
      continue;
    }

    points.push({ lat, lon });
  }

  if (Object.keys(cellErrors).length > 0) {
    return {
      points: null,
      cellErrors,
      tableError: 'Исправьте ошибки в координатах',
    };
  }

  if (points.length < minPoints) {
    return {
      points: null,
      cellErrors: {},
      tableError: `Минимум точек: ${minPoints}`,
    };
  }

  return {
    points,
    cellErrors: {},
    tableError: null,
  };
};

const convertRowsToWgs84 = (
  rows: EditablePointRow[],
  minPoints: number,
  sourceCrs: CrsId,
  format: CoordinateInputFormat,
): { points: Array<{ lat: number; lon: number }> | null; cellErrors: PointCellErrors; tableError: string | null } => {
  const validated = validatePointRows(rows, minPoints, format);
  if (!validated.points) return validated;
  try {
    const converted = validated.points.map((point) => convertPoint(point, sourceCrs, 'wgs84'));
    return {
      points: converted,
      cellErrors: {},
      tableError: null,
    };
  } catch (error) {
    return {
      points: null,
      cellErrors: {},
      tableError: error instanceof Error ? error.message : 'Не удалось конвертировать координаты.',
    };
  }
};

const convertMarkerToWgs84 = (
  latRaw: string,
  lonRaw: string,
  sourceCrs: CrsId,
  format: CoordinateInputFormat,
): { point: { lat: number; lon: number } | null; error: string | null } => {
  const errors = validatePointInput(latRaw, lonRaw, format);
  if (errors.lat || errors.lon) {
    return {
      point: null,
      error: errors.lat ?? errors.lon ?? 'Исправьте ошибки в координатах',
    };
  }
  const lat = parsePointInputValue(latRaw, format, 'lat');
  const lon = parsePointInputValue(lonRaw, format, 'lon');
  if (lat === null || lon === null) {
    return {
      point: null,
      error: 'Исправьте ошибки в координатах',
    };
  }
  try {
    return {
      point: convertPoint({ lat, lon }, sourceCrs, 'wgs84'),
      error: null,
    };
  } catch (error) {
    return {
      point: null,
      error: error instanceof Error ? error.message : 'Не удалось конвертировать координаты.',
    };
  }
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

const buildPointPreviewRows = (
  rows: EditablePointRow[],
  sourceCrs: CrsId,
  format: CoordinateInputFormat,
): PointPreviewRow[] =>
  rows.map((row) => {
    const lat = parsePointInputValue(row.lat, format, 'lat');
    const lon = parsePointInputValue(row.lon, format, 'lon');
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
  });

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

const getMinPointsForObject = (object: MapObject): number => {
  if (object.type === 'route') return 2;
  if (object.type === 'zone') return 3;
  return 0;
};

const formatLaneVertexRows = (laneFeatures: LaneFeature[] | undefined): LaneVertexRow[] => {
  if (!laneFeatures || laneFeatures.length === 0) return [];
  return [...laneFeatures]
    .sort((a, b) => a.properties.lane_index - b.properties.lane_index)
    .flatMap((lane) =>
      lane.geometry.coordinates.map(([lon, lat], vertexIndex) => ({
        laneIndex: lane.properties.lane_index,
        vertexIndex: vertexIndex + 1,
        lat,
        lon,
      })),
    );
};

const mapLaneVertexRowsForDisplay = (
  rows: LaneVertexRow[],
  targetCrs: CrsId,
  targetFormat: CoordinateInputFormat,
): LaneVertexDisplayRow[] =>
  rows.map((row) => {
    try {
      const converted = convertPoint({ lat: row.lat, lon: row.lon }, 'wgs84', targetCrs);
      return {
        laneIndex: row.laneIndex,
        vertexIndex: row.vertexIndex,
        lat: formatCoordinateForInput(converted.lat, targetFormat),
        lon: formatCoordinateForInput(converted.lon, targetFormat),
      };
    } catch {
      return {
        laneIndex: row.laneIndex,
        vertexIndex: row.vertexIndex,
        lat: '—',
        lon: '—',
      };
    }
  });

const MapObjectProperties = ({
  object,
  styles,
  coordinateInputCrs = 'wgs84',
  coordinateInputFormat = 'dd',
  onCoordinateInputCrsChange,
  onCoordinateInputFormatChange,
  onSave,
  onClose,
  onDelete,
  onRegenerateLanes,
  onPickLaneEdge,
  onPickLaneStart,
  zoneLanesOutdated,
  zoneLaneCount,
  zoneLaneFeatures,
}: MapObjectPropertiesProps) => {
  const isRwltBuoy = object.type === 'rwlt_buoy';
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [laneAngle, setLaneAngle] = useState('0');
  const [laneWidth, setLaneWidth] = useState('5');
  const [markerSizePx, setMarkerSizePx] = useState('24');
  const [zoneVisible, setZoneVisible] = useState(true);
  const [color, setColor] = useState('#0ea5e9');
  const [laneColor, setLaneColor] = useState('#22c55e');
  const [selectedCoordinateCrs, setSelectedCoordinateCrs] = useState<CrsId>(coordinateInputCrs);
  const [selectedCoordinateFormat, setSelectedCoordinateFormat] = useState<CoordinateInputFormat>(coordinateInputFormat);
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([]);
  const [markerPointRow, setMarkerPointRow] = useState<{ lat: string; lon: string }>({ lat: '', lon: '' });
  const [markerCoordinateError, setMarkerCoordinateError] = useState<string | null>(null);
  const [pointCellErrors, setPointCellErrors] = useState<PointCellErrors>({});
  const [pointTableError, setPointTableError] = useState<string | null>(null);
  const [isRouteVerticesDialogOpen, setIsRouteVerticesDialogOpen] = useState(false);
  const [isZoneVerticesDialogOpen, setIsZoneVerticesDialogOpen] = useState(false);
  const [isLaneVerticesDialogOpen, setIsLaneVerticesDialogOpen] = useState(false);
  const [isMarkerCoordinatesDialogOpen, setIsMarkerCoordinatesDialogOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const previousObjectRef = useRef<MapObject | null>(null);
  const previousStylesRef = useRef<AppUiDefaults['styles'] | null>(null);
  const routeLengthLabel = useMemo(() => formatRouteLength(computeRouteLengthMeters(object)), [object]);
  const measureLengthLabel = useMemo(() => {
    const meters = computeMeasureLengthMeters(object);
    return `${Number.isFinite(meters) ? meters.toFixed(2) : '0.00'} м`;
  }, [object]);
  const minPoints = useMemo(() => getMinPointsForObject(object), [object]);
  const laneVertexRows = useMemo(() => formatLaneVertexRows(zoneLaneFeatures), [zoneLaneFeatures]);
  const laneVertexDisplayRows = useMemo(
    () => mapLaneVertexRowsForDisplay(laneVertexRows, selectedCoordinateCrs, selectedCoordinateFormat),
    [laneVertexRows, selectedCoordinateCrs, selectedCoordinateFormat],
  );
  const pointRowsPreviewWgs84 = useMemo(
    () => buildPointPreviewRows(pointRows, selectedCoordinateCrs, selectedCoordinateFormat),
    [pointRows, selectedCoordinateCrs, selectedCoordinateFormat],
  );
  const markerPreviewWgs84 = useMemo(() => {
    const converted = convertMarkerToWgs84(
      markerPointRow.lat,
      markerPointRow.lon,
      selectedCoordinateCrs,
      selectedCoordinateFormat,
    );
    return {
      lat: converted.point ? converted.point.lat.toFixed(6) : '—',
      lon: converted.point ? converted.point.lon.toFixed(6) : '—',
      error: converted.error,
    };
  }, [markerPointRow.lat, markerPointRow.lon, selectedCoordinateCrs, selectedCoordinateFormat]);

  useEffect(() => {
    setSelectedCoordinateCrs(coordinateInputCrs);
  }, [coordinateInputCrs]);

  useEffect(() => {
    setSelectedCoordinateFormat(coordinateInputFormat);
  }, [coordinateInputFormat]);

  useEffect(() => {
    const previousObject = previousObjectRef.current;
    const objectChanged = previousObjectRef.current !== object;
    const stylesChanged = previousStylesRef.current !== styles;
    if (!objectChanged && !stylesChanged) return;

    const isRwltTelemetryOnlyUpdate =
      isRwltBuoy &&
      !stylesChanged &&
      isDirty &&
      previousObject?.type === 'rwlt_buoy' &&
      previousObject.id === object.id &&
      previousObject.name === object.name &&
      clampMarkerSizePx(previousObject.markerSizePx, 24) === clampMarkerSizePx(object.markerSizePx, 24);

    // Keep user-entered marker size/name while live telemetry updates the same buoy.
    if (isRwltTelemetryOnlyUpdate) {
      previousObjectRef.current = object;
      previousStylesRef.current = styles;
      return;
    }

    previousObjectRef.current = object;
    previousStylesRef.current = styles;

    const fallbackColor = getDefaultColor(object.type, styles);
    const fallbackLaneColor = getDefaultLaneColor(styles);
    setName(object.name);
    setNote(object.note ?? '');
    setLaneAngle(String(object.laneAngle ?? 0));
    setLaneWidth(String(object.laneWidth ?? 5));
    setMarkerSizePx(String(clampMarkerSizePx(object.markerSizePx, 24)));
    setZoneVisible(object.visible);
    setColor(normalizeHexColor(object.color ?? fallbackColor, fallbackColor));
    setLaneColor(normalizeHexColor(object.laneColor ?? fallbackLaneColor, fallbackLaneColor));
    setPointRows(toEditableRowsFromObject(object, coordinateInputCrs, coordinateInputFormat));
    setMarkerPointRow(toEditableMarkerPoint(object, coordinateInputCrs, coordinateInputFormat));
    setSelectedCoordinateFormat(coordinateInputFormat);
    setMarkerCoordinateError(null);
    setPointCellErrors({});
    setPointTableError(null);
    setIsRouteVerticesDialogOpen(false);
    setIsZoneVerticesDialogOpen(false);
    setIsLaneVerticesDialogOpen(false);
    setIsMarkerCoordinatesDialogOpen(false);
    setIsDirty(false);
  }, [object, styles, coordinateInputCrs, coordinateInputFormat, isRwltBuoy, isDirty]);

  const handleSave = () => {
    const fallbackColor = getDefaultColor(object.type, styles);
    const fallbackLaneColor = getDefaultLaneColor(styles);
    const updates: Partial<MapObject> = {
      name: name.trim() || object.name,
      color: normalizeHexColor(color, fallbackColor),
    };

    if (object.type === 'route' || object.type === 'marker' || object.type === 'measure') {
      updates.note = note;
    }

    if (isRwltBuoy) {
      updates.markerSizePx = clampMarkerSizePx(markerSizePx, clampMarkerSizePx(object.markerSizePx, 24));
    }

    if (object.type === 'route' && object.geometry?.type === 'route') {
      const validation = convertRowsToWgs84(pointRows, minPoints, selectedCoordinateCrs, selectedCoordinateFormat);
      if (!validation.points) {
        setPointCellErrors(validation.cellErrors);
        setPointTableError(validation.tableError);
        return;
      }
      updates.geometry = {
        type: 'route',
        points: validation.points,
      };
    }

    if (object.type === 'zone') {
      const normalizedLaneColor = normalizeHexColor(laneColor, fallbackLaneColor);
      updates.laneAngle = parseLaneAngleInput(laneAngle, object.laneAngle ?? 0);
      updates.laneWidth = Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth;
      updates.visible = zoneVisible;
      if (typeof object.laneColor === 'string') {
        updates.laneColor = normalizedLaneColor;
      } else if (normalizedLaneColor !== fallbackLaneColor) {
        updates.laneColor = normalizedLaneColor;
      } else {
        updates.laneColor = undefined;
      }

      if (object.geometry?.type === 'zone') {
        const validation = convertRowsToWgs84(pointRows, minPoints, selectedCoordinateCrs, selectedCoordinateFormat);
        if (!validation.points) {
          setPointCellErrors(validation.cellErrors);
          setPointTableError(validation.tableError);
          return;
        }
        updates.geometry = {
          type: 'zone',
          points: validation.points,
        };
      }
    }

    if (object.type === 'marker' && object.geometry?.type === 'marker') {
      const converted = convertMarkerToWgs84(
        markerPointRow.lat,
        markerPointRow.lon,
        selectedCoordinateCrs,
        selectedCoordinateFormat,
      );
      if (!converted.point) {
        setMarkerCoordinateError(converted.error);
        return;
      }
      setMarkerCoordinateError(null);
      updates.geometry = {
        type: 'marker',
        point: converted.point,
      };
    }

    onSave(object.id, updates);
    setPointCellErrors({});
    setPointTableError(null);
    setIsDirty(false);
  };

  const handleFieldChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  const handlePointFieldChange = (index: number, field: 'lat' | 'lon', value: string) => {
    const masked = sanitizeCoordinateInput(value, selectedCoordinateFormat, field);
    setPointRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: masked } : row)));
    setPointCellErrors((prev) => {
      if (!prev[index]?.[field]) return prev;
      const nextRowError = { ...prev[index] };
      delete nextRowError[field];
      const next = { ...prev };
      if (!nextRowError.lat && !nextRowError.lon) {
        delete next[index];
      } else {
        next[index] = nextRowError;
      }
      return next;
    });
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleMarkerPointFieldChange = (field: 'lat' | 'lon', value: string) => {
    const masked = sanitizeCoordinateInput(value, selectedCoordinateFormat, field);
    setMarkerPointRow((prev) => ({ ...prev, [field]: masked }));
    setMarkerCoordinateError(null);
    setIsDirty(true);
  };

  const handleCoordinateCrsChange = (nextCrs: CrsId) => {
    setPointRows((prev) => mapRowsBetweenCrs(prev, selectedCoordinateCrs, nextCrs, selectedCoordinateFormat));
    setMarkerPointRow((prev) => {
      const lat = parsePointInputValue(prev.lat, selectedCoordinateFormat, 'lat');
      const lon = parsePointInputValue(prev.lon, selectedCoordinateFormat, 'lon');
      if (lat === null || lon === null) return prev;
      try {
        const converted = convertPoint({ lat, lon }, selectedCoordinateCrs, nextCrs);
        return {
          lat: formatCoordinateForInput(converted.lat, selectedCoordinateFormat),
          lon: formatCoordinateForInput(converted.lon, selectedCoordinateFormat),
        };
      } catch {
        return prev;
      }
    });
    setSelectedCoordinateCrs(nextCrs);
    onCoordinateInputCrsChange?.(nextCrs);
    setPointTableError(null);
    setMarkerCoordinateError(null);
  };

  const handleCoordinateFormatChange = (nextFormat: CoordinateInputFormat) => {
    if (nextFormat === selectedCoordinateFormat) return;
    setPointRows((prev) => mapRowsBetweenFormat(prev, selectedCoordinateFormat, nextFormat));
    setMarkerPointRow((prev) => mapMarkerBetweenFormat(prev, selectedCoordinateFormat, nextFormat));
    setSelectedCoordinateFormat(nextFormat);
    onCoordinateInputFormatChange?.(nextFormat);
    setPointTableError(null);
    setMarkerCoordinateError(null);
  };

  const handleAddPoint = () => {
    const lastPoint = pointRows[pointRows.length - 1];
    const baseLat = parsePointInputValue(lastPoint?.lat ?? '', selectedCoordinateFormat, 'lat');
    const baseLon = parsePointInputValue(lastPoint?.lon ?? '', selectedCoordinateFormat, 'lon');
    const nextLat = baseLat !== null ? formatCoordinateForInput(baseLat + 0.0001, selectedCoordinateFormat) : '';
    const nextLon = baseLon !== null ? formatCoordinateForInput(baseLon + 0.0001, selectedCoordinateFormat) : '';
    setPointRows((prev) => [...prev, { id: crypto.randomUUID(), lat: nextLat, lon: nextLon }]);
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleDeletePoint = (index: number) => {
    if (pointRows.length <= minPoints) {
      setPointTableError(`Минимум точек: ${minPoints}`);
      return;
    }

    setPointRows((prev) => prev.filter((_, i) => i !== index));
    setPointCellErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: PointCellErrors = {};
      for (const [rowIndexRaw, rowErr] of Object.entries(prev)) {
        const rowIndex = Number(rowIndexRaw);
        if (rowIndex < index) next[rowIndex] = rowErr;
        if (rowIndex > index) next[rowIndex - 1] = rowErr;
      }
      return next;
    });
    setPointTableError(null);
    setIsDirty(true);
  };

  const handleZoneVisibilityToggle = () => {
    if (object.type !== 'zone') return;
    const nextVisible = !zoneVisible;
    setZoneVisible(nextVisible);
    onSave(object.id, { visible: nextVisible });
  };

  const handleRegenerateClick = () => {
    if (object.type !== 'zone') return;

    const updates: Partial<MapObject> = {
      laneAngle: parseLaneAngleInput(laneAngle, object.laneAngle ?? 0),
      laneWidth: Number.isFinite(Number(laneWidth)) ? Number(laneWidth) : object.laneWidth,
    };

    onRegenerateLanes?.(object.id, updates);
    setIsDirty(false);
  };

  return (
    <div className="h-full flex flex-col text-[13px]">
      <div className="px-2.5 py-1.5 border-b border-sidebar-border flex items-center justify-between gap-2">
        <span className="text-sm font-semibold leading-5 truncate">{object.name}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="obj-name" className="text-xs text-muted-foreground">Имя</Label>
          <Input
            id="obj-name"
            className="h-9 text-sm"
            value={name}
            onChange={(e) => handleFieldChange(setName, e.target.value)}
          />
        </div>

        {object.type !== 'zone' && (
          <div className="space-y-1.5">
            <Label htmlFor="obj-color" className="text-xs text-muted-foreground">Цвет</Label>
            <div className="flex items-center gap-2">
              <Input
                id="obj-color"
                type="color"
                value={normalizeHexColor(color, getDefaultColor(object.type, styles))}
                onChange={(e) => handleFieldChange(setColor, e.target.value)}
                className="h-9 w-14 p-1"
              />
              <Input
                className="h-9 text-sm font-mono"
                value={color}
                onChange={(e) => handleFieldChange(setColor, e.target.value)}
                placeholder="#0ea5e9"
              />
            </div>
          </div>
        )}

        {object.type === 'zone' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="obj-zone-color" className="text-xs text-muted-foreground">Цвет зоны</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="obj-zone-color"
                  type="color"
                  value={normalizeHexColor(color, styles.survey_area.stroke_color)}
                  onChange={(e) => handleFieldChange(setColor, e.target.value)}
                  className="h-9 w-14 p-1"
                />
                <Input
                  className="h-9 text-sm font-mono"
                  value={color}
                  onChange={(e) => handleFieldChange(setColor, e.target.value)}
                  placeholder="#0ea5e9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obj-zone-lane-color" className="text-xs text-muted-foreground">Цвет галсов</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="obj-zone-lane-color"
                  type="color"
                  value={normalizeHexColor(laneColor, styles.lane.color)}
                  onChange={(e) => handleFieldChange(setLaneColor, e.target.value)}
                  className="h-9 w-14 p-1"
                />
                <Input
                  className="h-9 text-sm font-mono"
                  value={laneColor}
                  onChange={(e) => handleFieldChange(setLaneColor, e.target.value)}
                  placeholder="#22c55e"
                />
              </div>
            </div>
          </div>
        )}

        {(object.type === 'route' || object.type === 'marker' || object.type === 'measure') && (
          <div className="space-y-1.5">
            <Label htmlFor="obj-note" className="text-xs text-muted-foreground">
              {object.type === 'marker' || object.type === 'measure' ? 'Описание' : 'Заметка'}
            </Label>
            <Textarea
              id="obj-note"
              className="min-h-[68px] text-sm leading-5"
              value={note}
              onChange={(e) => handleFieldChange(setNote, e.target.value)}
              rows={3}
              placeholder={
                object.type === 'marker'
                  ? 'Описание маркера...'
                  : object.type === 'measure'
                    ? 'Описание измерения...'
                    : 'Заметка о маршруте...'
              }
            />
          </div>
        )}

        {isRwltBuoy && (
          <div className="space-y-1.5">
            <Label htmlFor="obj-rwlt-size" className="text-xs text-muted-foreground">Размер маркера (px)</Label>
            <Input
              id="obj-rwlt-size"
              className="h-9 text-sm"
              type="number"
              min="1"
              max="256"
              value={markerSizePx}
              onChange={(e) => handleFieldChange(setMarkerSizePx, e.target.value)}
            />
          </div>
        )}

        {object.type === 'marker' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Координаты маркера</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsMarkerCoordinatesDialogOpen(true)}
                aria-label="Открыть координаты маркера"
              >
                Открыть координаты
              </Button>
            </div>
            <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
              CRS ввода: {getCrsLabel(selectedCoordinateCrs)}
            </div>
            {markerCoordinateError && <div className="text-xs text-destructive">{markerCoordinateError}</div>}
          </div>
        )}

        {object.type === 'route' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Точки маршрута</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsRouteVerticesDialogOpen(true)}
                aria-label="Открыть точки маршрута"
              >
                Открыть точки маршрута
              </Button>
            </div>
            <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
              Точек: {pointRows.length}
            </div>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
          </div>
        )}

        {object.type === 'route' && (
          <div className="p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground mb-1">Общая длина</div>
            <div className="font-mono text-base leading-5">{routeLengthLabel}</div>
          </div>
        )}

        {object.type === 'measure' && (
          <div className="p-2.5 bg-muted rounded-md">
            <div className="text-[11px] text-muted-foreground mb-1">Расстояние</div>
            <div className="font-mono text-base leading-5">{measureLengthLabel}</div>
          </div>
        )}

        {object.type === 'zone' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Вершины зоны</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsZoneVerticesDialogOpen(true)}
                  aria-label="Открыть вершины зоны"
                >
                  Открыть вершины зоны
                </Button>
              </div>
              <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                Точек: {pointRows.length}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Вершины галсов</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsLaneVerticesDialogOpen(true)}
                  aria-label="Открыть вершины галсов"
                >
                  Открыть вершины галсов
                </Button>
              </div>
              <div className="rounded-md border border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                Вершин: {laneVertexRows.length}
              </div>
            </div>

            <div className="p-2.5 bg-muted rounded-md space-y-1.5">
              <label className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={zoneVisible}
                  onCheckedChange={handleZoneVisibilityToggle}
                />
                <span className="text-[13px] leading-5">Показывать зону</span>
              </label>
              <div className="text-[11px] text-muted-foreground">Ориентация</div>
              <div className="font-mono text-sm leading-5 break-words">
                {typeof object.laneBearingDeg === 'number' ? `по грани (${Math.round(object.laneBearingDeg)}°)` : 'авто'}
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">Старт</div>
              <div className="font-mono text-xs leading-4 break-all">
                {object.laneStart ? `${object.laneStart.lat.toFixed(6)}, ${object.laneStart.lon.toFixed(6)}` : 'не выбран'}
              </div>
            </div>

            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                className="w-full h-auto min-h-9 py-1.5 leading-snug whitespace-normal text-left justify-start text-[13px]"
                onClick={() => onPickLaneEdge?.(object.id)}
              >
                Выбрать грань на карте
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-auto min-h-9 py-1.5 leading-snug whitespace-normal text-left justify-start text-[13px]"
                onClick={() => onPickLaneStart?.(object.id)}
              >
                Выбрать старт на карте
              </Button>
            </div>

            {zoneLanesOutdated && (
              <div className="flex items-center gap-2 p-2.5 bg-warning/10 border border-warning/30 rounded-md">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                <span className="text-[13px] flex-1 leading-5">Галсы неактуальны</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Угол галсов</Label>
              <Input
                className="h-9 text-sm"
                type="number"
                min="0"
                max="360"
                step="1"
                value={laneAngle}
                onChange={(e) => handleFieldChange(setLaneAngle, e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lane-width" className="text-xs text-muted-foreground">Ширина галса (м)</Label>
              <Input
                id="lane-width"
                className="h-9 text-sm"
                type="number"
                value={laneWidth}
                onChange={(e) => handleFieldChange(setLaneWidth, e.target.value)}
                min="1"
                max="100"
              />
            </div>

            <Button className="w-full h-9 mt-1 text-sm" variant="secondary" onClick={handleRegenerateClick}>
              Перегенерировать галсы
            </Button>

            <div className="p-2.5 bg-muted rounded-md mt-1">
              <div className="text-[11px] text-muted-foreground mb-1">Галсов в зоне</div>
              <div className="font-mono text-base leading-5">{formatLaneCount(zoneLaneCount)}</div>
            </div>
          </>
        )}
      </div>

      <Dialog open={isRouteVerticesDialogOpen} onOpenChange={setIsRouteVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Точки маршрута</DialogTitle>
            <DialogDescription className="sr-only">
              Редактирование координат точек маршрута
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Система координат ввода</Label>
            <Select value={selectedCoordinateCrs} onValueChange={(value) => handleCoordinateCrsChange(value as CrsId)}>
              <SelectTrigger className="h-9 w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCoordinateCrs.map((crs) => (
                  <SelectItem key={`route-crs-${crs}`} value={crs}>
                    {getCrsLabel(crs)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Формат координат</Label>
            <RadioGroup
              value={selectedCoordinateFormat}
              onValueChange={(value) => handleCoordinateFormatChange(value as CoordinateInputFormat)}
              className="gap-2"
            >
              {coordinateInputFormats.map((format) => (
                <label
                  key={`route-format-${format}`}
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
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_28px] gap-2 text-[11px] text-muted-foreground">
              <span>#</span>
              <span>{`Широта (${getCrsLabel(selectedCoordinateCrs)})`}</span>
              <span>{`Долгота (${getCrsLabel(selectedCoordinateCrs)})`}</span>
              <span>Широта (WGS84)</span>
              <span>Долгота (WGS84)</span>
              <span />
            </div>
            {pointRows.map((row, index) => (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_28px] gap-2 items-start">
                  <div className="h-10 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {index + 1}
                  </div>
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lat}
                    onChange={(e) => handlePointFieldChange(index, 'lat', e.target.value)}
                    placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lat')}
                    aria-label={`Широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lon}
                    onChange={(e) => handlePointFieldChange(index, 'lon', e.target.value)}
                    placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lon')}
                    aria-label={`Долгота точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={pointRowsPreviewWgs84[index]?.lat ?? '—'}
                    readOnly
                    tabIndex={-1}
                    aria-label={`WGS84 широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={pointRowsPreviewWgs84[index]?.lon ?? '—'}
                    readOnly
                    tabIndex={-1}
                    aria-label={`WGS84 долгота точки ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeletePoint(index)}
                    aria-label={`Удалить точку ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {(pointCellErrors[index]?.lat || pointCellErrors[index]?.lon) && (
                  <div className="text-xs text-destructive leading-4">
                    {pointCellErrors[index]?.lat ?? pointCellErrors[index]?.lon}
                  </div>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full h-10 text-sm" onClick={handleAddPoint}>
              Добавить точку
            </Button>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
            <Button
              type="button"
              className="w-full h-10 text-sm"
              onClick={() => setIsRouteVerticesDialogOpen(false)}
            >
              Ок
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isZoneVerticesDialogOpen} onOpenChange={setIsZoneVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Вершины зоны</DialogTitle>
            <DialogDescription className="sr-only">
              Редактирование координат вершин зоны
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Система координат ввода</Label>
            <Select value={selectedCoordinateCrs} onValueChange={(value) => handleCoordinateCrsChange(value as CrsId)}>
              <SelectTrigger className="h-9 w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCoordinateCrs.map((crs) => (
                  <SelectItem key={`zone-crs-${crs}`} value={crs}>
                    {getCrsLabel(crs)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Формат координат</Label>
            <RadioGroup
              value={selectedCoordinateFormat}
              onValueChange={(value) => handleCoordinateFormatChange(value as CoordinateInputFormat)}
              className="gap-2"
            >
              {coordinateInputFormats.map((format) => (
                <label
                  key={`zone-format-${format}`}
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
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_28px] gap-2 text-[11px] text-muted-foreground">
              <span>#</span>
              <span>{`Широта (${getCrsLabel(selectedCoordinateCrs)})`}</span>
              <span>{`Долгота (${getCrsLabel(selectedCoordinateCrs)})`}</span>
              <span>Широта (WGS84)</span>
              <span>Долгота (WGS84)</span>
              <span />
            </div>
            {pointRows.map((row, index) => (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_28px] gap-2 items-start">
                  <div className="h-10 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {index + 1}
                  </div>
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lat}
                    onChange={(e) => handlePointFieldChange(index, 'lat', e.target.value)}
                    placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lat')}
                    aria-label={`Широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={row.lon}
                    onChange={(e) => handlePointFieldChange(index, 'lon', e.target.value)}
                    placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lon')}
                    aria-label={`Долгота точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={pointRowsPreviewWgs84[index]?.lat ?? '—'}
                    readOnly
                    tabIndex={-1}
                    aria-label={`WGS84 широта точки ${index + 1}`}
                  />
                  <Input
                    className="h-10 text-sm font-mono"
                    value={pointRowsPreviewWgs84[index]?.lon ?? '—'}
                    readOnly
                    tabIndex={-1}
                    aria-label={`WGS84 долгота точки ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeletePoint(index)}
                    aria-label={`Удалить точку ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {(pointCellErrors[index]?.lat || pointCellErrors[index]?.lon) && (
                  <div className="text-xs text-destructive leading-4">
                    {pointCellErrors[index]?.lat ?? pointCellErrors[index]?.lon}
                  </div>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full h-10 text-sm" onClick={handleAddPoint}>
              Добавить точку
            </Button>
            {pointTableError && <div className="text-xs text-destructive">{pointTableError}</div>}
            <Button
              type="button"
              className="w-full h-10 text-sm"
              onClick={() => setIsZoneVerticesDialogOpen(false)}
            >
              Ок
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMarkerCoordinatesDialogOpen} onOpenChange={setIsMarkerCoordinatesDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Координаты маркера</DialogTitle>
            <DialogDescription className="sr-only">Ввод координат маркера с конвертацией в WGS84</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Система координат ввода</Label>
              <Select value={selectedCoordinateCrs} onValueChange={(value) => handleCoordinateCrsChange(value as CrsId)}>
                <SelectTrigger className="h-9 w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedCoordinateCrs.map((crs) => (
                    <SelectItem key={`marker-crs-${crs}`} value={crs}>
                      {getCrsLabel(crs)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Формат координат</Label>
              <RadioGroup
                value={selectedCoordinateFormat}
                onValueChange={(value) => handleCoordinateFormatChange(value as CoordinateInputFormat)}
                className="gap-2"
              >
                {coordinateInputFormats.map((format) => (
                  <label
                    key={`marker-format-${format}`}
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="marker-lat-input" className="text-xs text-muted-foreground">{`Широта (${getCrsLabel(selectedCoordinateCrs)})`}</Label>
                <Input
                  id="marker-lat-input"
                  className="h-10 text-sm font-mono"
                  value={markerPointRow.lat}
                  onChange={(e) => handleMarkerPointFieldChange('lat', e.target.value)}
                  placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lat')}
                  aria-label="Широта маркера"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="marker-lon-input" className="text-xs text-muted-foreground">{`Долгота (${getCrsLabel(selectedCoordinateCrs)})`}</Label>
                <Input
                  id="marker-lon-input"
                  className="h-10 text-sm font-mono"
                  value={markerPointRow.lon}
                  onChange={(e) => handleMarkerPointFieldChange('lon', e.target.value)}
                  placeholder={getCoordinatePlaceholder(selectedCoordinateFormat, 'lon')}
                  aria-label="Долгота маркера"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Широта (WGS84)</Label>
                <Input className="h-10 text-sm font-mono" value={markerPreviewWgs84.lat} readOnly tabIndex={-1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Долгота (WGS84)</Label>
                <Input className="h-10 text-sm font-mono" value={markerPreviewWgs84.lon} readOnly tabIndex={-1} />
              </div>
            </div>
            {markerPreviewWgs84.error && (
              <div className="text-xs text-destructive">{markerPreviewWgs84.error}</div>
            )}
            {markerCoordinateError && <div className="text-xs text-destructive">{markerCoordinateError}</div>}
            <Button
              type="button"
              className="w-full h-10 text-sm"
              onClick={() => setIsMarkerCoordinatesDialogOpen(false)}
            >
              Ок
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLaneVerticesDialogOpen} onOpenChange={setIsLaneVerticesDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Вершины галсов</DialogTitle>
            <DialogDescription className="sr-only">
              Просмотр координат вершин галсов
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Система координат отображения</Label>
              <Select value={selectedCoordinateCrs} onValueChange={(value) => handleCoordinateCrsChange(value as CrsId)}>
                <SelectTrigger className="h-9 w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedCoordinateCrs.map((crs) => (
                    <SelectItem key={`lane-crs-${crs}`} value={crs}>
                      {getCrsLabel(crs)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Формат координат</Label>
              <RadioGroup
                value={selectedCoordinateFormat}
                onValueChange={(value) => handleCoordinateFormatChange(value as CoordinateInputFormat)}
                className="gap-2"
              >
                {coordinateInputFormats.map((format) => (
                  <label
                    key={`lane-format-${format}`}
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
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {laneVertexDisplayRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">Галсы не сгенерированы</div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[48px_48px_1fr_1fr] gap-2 text-[11px] text-muted-foreground">
                  <span>Галс</span>
                  <span>Верш.</span>
                  <span>{`Широта (${getCrsLabel(selectedCoordinateCrs)})`}</span>
                  <span>{`Долгота (${getCrsLabel(selectedCoordinateCrs)})`}</span>
                </div>
                {laneVertexDisplayRows.map((row) => (
                  <div
                    key={`lane-dialog-${row.laneIndex}-vertex-${row.vertexIndex}-${row.lat}-${row.lon}`}
                    className="grid grid-cols-[48px_48px_1fr_1fr] gap-2 text-sm font-mono"
                  >
                    <span>{row.laneIndex}</span>
                    <span>{row.vertexIndex}</span>
                    <span>{row.lat}</span>
                    <span>{row.lon}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-2.5 border-t border-sidebar-border">
        <Button className="w-full h-10 text-sm" onClick={handleSave} disabled={!isDirty}>
          Сохранить изменения
        </Button>
        {onDelete && (
          <Button
            className="w-full h-10 mt-2 text-sm"
            variant="destructive"
            onClick={() => onDelete(object.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить объект
          </Button>
        )}
      </div>
    </div>
  );
};

export default MapObjectProperties;
