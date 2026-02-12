import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle } from "lucide-react";

import type { MapObject, MapObjectGeometry, Tool } from "@/features/map/model/types";
import { buildLaneTraversal, generateLanesForZone, type LaneFeature, type SegmentLengthsMode } from "@/features/mission";
import type { AppUiDefaults } from "@/features/settings";
import type { DiverUiConfig } from "@/features/mission";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { platform } from "@/platform";
import { MapContextMenu } from "./MapContextMenu";
import { GridLayer } from "./GridLayer";
import { ScaleBar } from "./ScaleBar";
import { computeScaleRatioLabelFromMap, haversineDistanceMeters } from './scaleUtils';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Fix leaflet default marker icons (bundle local assets; don't depend on CDN).
const iconProto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
delete iconProto._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

interface MapCanvasProps {
  activeTool: Tool;
  laneFeatures?: LaneFeature[];
  outdatedZoneIds: Record<string, true>;
  lanePickMode: 'none' | 'edge' | 'start';
  lanePickZoneId: string | null;
  layers: {
    track: boolean;
    routes: boolean;
    markers: boolean;
    baseStation: boolean;
    grid: boolean;
    scaleBar: boolean;
    diver: boolean;
  };
  grid: AppUiDefaults['measurements']['grid'];
  segmentLengthsMode: SegmentLengthsMode;
  styles: AppUiDefaults['styles'];
  mapView: { center_lat: number; center_lon: number; zoom: number } | null;
  objects: MapObject[];
  selectedObjectId: string | null;
  centerRequest?: { objectId: string; nonce: number } | null;
  diverData: {
    lat: number;
    lon: number;
    speed: number;
    course: number;
    depth: number;
  };
  baseStationData: {
    lat: number;
    lon: number;
    heading: number | null;
    sourceId: string | null;
  } | null;
  isBaseStationSourceAssigned: boolean;
  divers: DiverUiConfig[];
  diverPositionsById?: Record<
    string,
    {
      lat: number;
      lon: number;
      course?: number;
    }
  >;
  trackSegments: Array<Array<[number, number]>>;
  isFollowing: boolean;
  connectionStatus: 'ok' | 'timeout' | 'error';
  connectionLostSeconds?: number;
  showTelemetryObjects: boolean;
  showNoDataWarning: boolean;
  onToolChange?: (tool: Tool) => void;
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onObjectSelect: (id: string | null) => void;
  onObjectDoubleClick: (id: string) => void;
  onObjectCreate?: (
    geometry: MapObjectGeometry,
    options?: { preserveActiveTool?: boolean; initial?: Partial<MapObject> },
  ) => void;
  onObjectUpdate?: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string) => void;
  onLanePickCancel?: () => void;
  onLanePickEdge?: (zoneId: string, bearingDeg: number) => void;
  onLanePickStart?: (zoneId: string, point: { lat: number; lon: number }) => void;
  onMapScaleChange?: (scale: string) => void;
  onMapViewChange?: (view: { center_lat: number; center_lon: number; zoom: number }) => void;
  onMapDrag: () => void;
}

// Custom diver icon
const createDiverIcon = (course: number, isFollowing: boolean, color: string, sizePx: number) => {
  const size = Math.max(12, Math.min(64, Math.trunc(sizePx)));
  const iconSize = Math.max(10, Math.round(size * 0.5));
  return L.divIcon({
    className: "diver-marker",
    html: `
      <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px;">
        <div class="rounded-full border-2 border-white flex items-center justify-center ${isFollowing ? "animate-pulse" : ""}" style="width:${size}px;height:${size}px;background:${color};">
          <svg class="text-white" style="width:${iconSize}px;height:${iconSize}px;" viewBox="0 0 24 24" fill="currentColor" transform="rotate(${course} 12 12)">
            <path d="M12 2L8 12H16L12 2Z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createBaseStationIcon = (headingDeg: number | null): L.DivIcon => {
  const normalizedHeading =
    typeof headingDeg === "number" && Number.isFinite(headingDeg)
      ? ((headingDeg % 360) + 360) % 360
      : null;
  return L.divIcon({
    className: "base-station-marker",
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        ${
          normalizedHeading === null
            ? ""
            : `<div style="position:absolute; top:-2px; left:50%; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:9px solid #0f172a; transform: translateX(-50%) rotate(${normalizedHeading}deg); transform-origin: 50% 18px; opacity:0.9;"></div>`
        }
        <div style="width: 26px; height: 26px; border-radius: 9999px; background: #f8fafc; border: 2px solid #0f172a; display:flex; align-items:center; justify-content:center; box-shadow: 0 1px 6px rgba(15,23,42,0.35);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2V9" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="10" r="2.1" stroke="#0f172a" stroke-width="2" fill="none"/>
            <path d="M5 13C5 16.3 7.7 19 11 19" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 13C19 16.3 16.3 19 13 19" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 12V22" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
            <path d="M9 19L12 22L15 19" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

// Custom marker icon
const createMarkerIcon = (color: string, isSelected: boolean) => {
  const normalized = color || '#22c55e';
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="w-4 h-4 rounded-full ${isSelected ? "scale-125" : ""} border-2 border-background" style="background:${normalized};"></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

// Vertex handle icon
const vertexHandleIcon = L.divIcon({
  className: "vertex-handle",
  html: '<div class="w-5 h-5 bg-white border-2 border-primary rounded-full cursor-grab hover:bg-primary/20 shadow-sm"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Virtual vertex handle icon (ghost)
const virtualHandleIcon = L.divIcon({
  className: "virtual-handle",
  html: '<div class="w-3.5 h-3.5 bg-primary/50 border-2 border-white rounded-full cursor-pointer hover:bg-primary shadow-sm"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Map events handler component
const MapEvents = ({
  onCursorMove,
  onMapClick,
  onMapDrag,
  onMapContextMenu,
  onMapScaleChange,
  onMapViewChange,
}: {
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onMapClick: (e: L.LeafletMouseEvent) => void;
  onMapDrag: () => void;
  onMapContextMenu: (e: L.LeafletMouseEvent) => void;
  onMapScaleChange?: (scale: string) => void;
  onMapViewChange?: (view: { center_lat: number; center_lon: number; zoom: number }) => void;
}) => {
  const map = useMap();
  const viewTimerRef = useRef<number | null>(null);
  const reportScale = useCallback(() => {
    onMapScaleChange?.(computeScaleRatioLabelFromMap(map));
  }, [map, onMapScaleChange]);

  const scheduleViewReport = useCallback(() => {
    if (!onMapViewChange) return;
    if (viewTimerRef.current !== null) {
      window.clearTimeout(viewTimerRef.current);
    }

    viewTimerRef.current = window.setTimeout(() => {
      const center = map.getCenter();
      onMapViewChange({
        center_lat: center.lat,
        center_lon: center.lng,
        zoom: map.getZoom(),
      });
    }, 250);
  }, [map, onMapViewChange]);

  useMapEvents({
    mousemove: (e) => {
      onCursorMove({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
    click: (e) => {
      onMapClick(e);
    },
    dragstart: () => {
      onMapDrag();
    },
    contextmenu: (e) => {
      onMapContextMenu(e);
    },
    zoomend: () => {
      reportScale();
      scheduleViewReport();
    },
    moveend: () => {
      reportScale();
      scheduleViewReport();
    },
  });

  useEffect(() => {
    reportScale();
    scheduleViewReport();
    return () => {
      if (viewTimerRef.current !== null) {
        window.clearTimeout(viewTimerRef.current);
      }
    };
  }, [reportScale, scheduleViewReport]);

  return null;
};

// Follow diver component
const FollowDiver = ({ position, isFollowing }: { position: [number, number]; isFollowing: boolean }) => {
  const map = useMap();

  useEffect(() => {
    if (isFollowing) {
      map.setView(position, map.getZoom());
    }
  }, [position, isFollowing, map]);

  return null;
};

const ApplyMapView = ({
  mapView,
  isFollowing,
}: {
  mapView: { center_lat: number; center_lon: number; zoom: number } | null;
  isFollowing: boolean;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!mapView) return;
    if (isFollowing) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const dLat = Math.abs(center.lat - mapView.center_lat);
    const dLon = Math.abs(center.lng - mapView.center_lon);
    if (dLat < 1e-7 && dLon < 1e-7 && zoom === mapView.zoom) return;

    map.setView([mapView.center_lat, mapView.center_lon], mapView.zoom, { animate: false });
  }, [isFollowing, map, mapView]);

  return null;
};

const CenterOnObjectRequest = ({
  request,
  objects,
  onMissingGeometry,
}: {
  request: { objectId: string; nonce: number } | null | undefined;
  objects: MapObject[];
  onMissingGeometry: (name: string) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!request) return;
    const obj = objects.find((item) => item.id === request.objectId);
    if (!obj) return;
    if (!obj.geometry) {
      onMissingGeometry(obj.name);
      return;
    }

    if (obj.geometry.type === 'marker') {
      const targetZoom = Math.max(map.getZoom(), 16);
      map.setView([obj.geometry.point.lat, obj.geometry.point.lon], targetZoom, { animate: true });
      return;
    }

    const points = obj.geometry.points;
    if (!points || points.length === 0) {
      onMissingGeometry(obj.name);
      return;
    }

    const bounds = L.latLngBounds(points.map((p) => L.latLng(p.lat, p.lon)));
    if (!bounds.isValid()) {
      onMissingGeometry(obj.name);
      return;
    }

    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: true });
  }, [map, objects, onMissingGeometry, request]);

  return null;
};

const toTuple = (p: { lat: number; lon: number }): [number, number] => [p.lat, p.lon];
const getObjectColor = (obj: MapObject, defaults: AppUiDefaults['styles']): string => {
  if (obj.color) return obj.color;
  if (obj.type === 'zone') return defaults.survey_area.stroke_color;
  if (obj.type === 'marker') return defaults.marker.color;
  if (obj.type === 'lane') return defaults.lane.color;
  return defaults.route.color;
};

const formatSegmentLength = (meters: number): string => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 м';
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} км`;
  }
  return `${Math.round(meters)} м`;
};

const segmentLengthIcon = (label: string): L.DivIcon =>
  L.divIcon({
    className: 'segment-length-label',
    html: `
      <div style="
        transform: translate(-50%, -145%);
        pointer-events: none;
        background: rgba(255, 255, 255, 0.92);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.2);
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        padding: 3px 6px;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
      ">${label}</div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

type ZoneWithGeometry = MapObject & { geometry: { type: 'zone'; points: Array<{ lat: number; lon: number }> } };
const isZoneWithGeometry = (obj: MapObject | undefined): obj is ZoneWithGeometry =>
  Boolean(obj && obj.type === 'zone' && obj.geometry?.type === 'zone');

const MapCanvas = ({
  activeTool,
  laneFeatures = [],
  outdatedZoneIds,
  lanePickMode,
  lanePickZoneId,
  layers,
  grid,
  segmentLengthsMode,
  styles,
  mapView,
  objects,
  selectedObjectId,
  centerRequest,
  diverData,
  baseStationData,
  isBaseStationSourceAssigned,
  divers,
  diverPositionsById = {},
  trackSegments,
  isFollowing,
  connectionStatus,
  connectionLostSeconds,
  showTelemetryObjects,
  showNoDataWarning,
  onToolChange,
  onCursorMove,
  onObjectSelect,
  onObjectDoubleClick,
  onObjectCreate,
  onObjectUpdate,
  onObjectDelete,
  onRegenerateLanes,
  onLanePickCancel,
  onLanePickEdge,
  onLanePickStart,
  onMapScaleChange,
  onMapViewChange,
  onMapDrag,
}: MapCanvasProps) => {
  const [drawingPoints, setDrawingPoints] = useState<L.LatLng[]>([]);
  const [objectMenuState, setObjectMenuState] = useState<{
    position: { x: number; y: number };
    objectId?: string;
  } | null>(null);
  const [drawingMenuState, setDrawingMenuState] = useState<{
    position: { x: number; y: number };
    draftType: 'route' | 'zone';
  } | null>(null);
  const [draftZoneLaneAngle, setDraftZoneLaneAngle] = useState<'0' | '90'>('0');
  const [draftZoneLaneWidth, setDraftZoneLaneWidth] = useState('10');
  const [draftZoneBearingDeg, setDraftZoneBearingDeg] = useState<number | null>(null);
  const [draftZoneStart, setDraftZoneStart] = useState<{ lat: number; lon: number } | null>(null);
  const [draftLanePickMode, setDraftLanePickMode] = useState<'none' | 'edge' | 'start'>('none');
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const previousToolRef = useRef<Tool>(activeTool);
  const suppressNextMapClickRef = useRef<boolean>(false);
  const suppressMapClickTimerRef = useRef<number | null>(null);
  const markerIconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());

  const pendingCursor = useRef<{ lat: number; lon: number } | null>(null);
  const cursorRaf = useRef<number | null>(null);

  const normalizedDiverPositions = useMemo(() => {
    const next: Record<string, { lat: number; lon: number; course?: number }> = {};
    for (const [id, value] of Object.entries(diverPositionsById)) {
      const key = id.trim();
      if (!key) continue;
      next[key] = value;
    }
    return next;
  }, [diverPositionsById]);

  const primaryDiverId = divers[0]?.id?.trim() ?? '';
  const primaryTelemetry = primaryDiverId ? normalizedDiverPositions[primaryDiverId] : undefined;
  const diverPosition: [number, number] = primaryTelemetry
    ? [primaryTelemetry.lat, primaryTelemetry.lon]
    : [diverData.lat, diverData.lon];
  const offsetStep = 0.00008;
  const getDiverPosition = (diver: DiverUiConfig, index: number): [number, number] => {
    const diverId = diver.id.trim();
    const telemetry = diverId ? normalizedDiverPositions[diverId] : undefined;
    if (telemetry) {
      return [telemetry.lat, telemetry.lon];
    }
    if (index === 0) return diverPosition;
    const ring = Math.ceil(index / 2);
    const sign = index % 2 === 0 ? -1 : 1;
    return [diverPosition[0] + ring * offsetStep * sign, diverPosition[1] + ring * offsetStep * sign];
  };
  const getDiverCourse = (diver: DiverUiConfig, index: number): number => {
    const diverId = diver.id.trim();
    const telemetry = diverId ? normalizedDiverPositions[diverId] : undefined;
    if (telemetry && typeof telemetry.course === 'number' && Number.isFinite(telemetry.course)) {
      return telemetry.course;
    }
    if (index === 0) {
      return diverData.course;
    }
    return 0;
  };
  const baseStationPosition: [number, number] | null = baseStationData
    ? [baseStationData.lat, baseStationData.lon]
    : null;
  const baseStationIcon = useMemo(
    () => createBaseStationIcon(baseStationData?.heading ?? null),
    [baseStationData?.heading],
  );
  const { toast } = useToast();

  const handleMissingGeometry = useCallback(
    (name: string) => {
      toast({
        variant: 'destructive',
        title: 'Не удалось переместиться',
        description: `У объекта «${name}» нет геометрии.`,
      });
    },
    [toast],
  );

  const clearDrawing = useCallback(() => {
    setDrawingPoints([]);
    setDrawingMenuState(null);
    setDraftZoneBearingDeg(null);
    setDraftZoneStart(null);
    setDraftLanePickMode('none');
  }, []);

  const normalizeBearing180 = (bearingDeg: number): number => {
    const normalized = ((bearingDeg % 360) + 360) % 360;
    return normalized >= 180 ? normalized - 180 : normalized;
  };

  const computeBearingDeg = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const toDeg = (v: number) => (v * 180) / Math.PI;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLon = toRad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
    return normalizeBearing180(brng);
  };

  const pickNearestVertex = (zone: MapObject, latlng: L.LatLng): { lat: number; lon: number } | null => {
    if (zone.type !== 'zone' || zone.geometry?.type !== 'zone') return null;
    const points = zone.geometry.points;
    if (!points || points.length === 0) return null;

    let best = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = L.latLng(p.lat, p.lon).distanceTo(latlng);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return { lat: best.lat, lon: best.lon };
  };

  const getDrawingMenuPosition = useCallback(
    (clientX: number, clientY: number, draftType: 'route' | 'zone'): { x: number; y: number } => {
      const offsetX = draftType === 'zone' ? 28 : 0;
      const offsetY = draftType === 'zone' ? 64 : 20;
      const width = draftType === 'zone' ? 320 : 180;
      const height = draftType === 'zone' ? 380 : 120;
      const padding = 12;

      const desiredX = clientX + offsetX;
      const desiredY = clientY + offsetY;

      const clampedX = Math.min(Math.max(padding, desiredX), Math.max(padding, window.innerWidth - width - padding));
      const clampedY = Math.min(Math.max(padding, desiredY), Math.max(padding, window.innerHeight - height - padding));

      return { x: clampedX, y: clampedY };
    },
    [],
  );

  const armMapClickSuppression = useCallback(() => {
    suppressNextMapClickRef.current = true;
    if (suppressMapClickTimerRef.current !== null) {
      window.clearTimeout(suppressMapClickTimerRef.current);
    }
    suppressMapClickTimerRef.current = window.setTimeout(() => {
      suppressNextMapClickRef.current = false;
      suppressMapClickTimerRef.current = null;
    }, 1200);
  }, []);

  const updateMarkerPosition = useCallback(
    (id: string, latlng: L.LatLng) => {
      if (!onObjectUpdate) return;
      onObjectUpdate(id, {
        geometry: { type: 'marker', point: { lat: latlng.lat, lon: latlng.lng } },
      });
    },
    [onObjectUpdate],
  );

  const getMarkerIcon = useCallback((color: string, isSelected: boolean): L.DivIcon => {
    const normalized = color || '#22c55e';
    const key = `${normalized}|${isSelected ? 1 : 0}`;
    const cached = markerIconCacheRef.current.get(key);
    if (cached) return cached;
    const icon = createMarkerIcon(normalized, isSelected);
    markerIconCacheRef.current.set(key, icon);
    return icon;
  }, []);

  const completeDrawing = useCallback(
    (
      draftType: 'route' | 'zone',
      options?: { preserveActiveTool?: boolean; silentValidationError?: boolean },
    ): boolean => {
      const minPoints = draftType === 'route' ? 2 : 3;
      if (drawingPoints.length < minPoints) {
        if (!options?.silentValidationError) {
          toast({
            variant: 'destructive',
            title: draftType === 'route' ? 'Невозможно создать маршрут' : 'Невозможно создать галс',
            description:
              draftType === 'route'
                ? 'Маршрут должен содержать минимум 2 точки.'
                : 'Галс должен содержать минимум 3 точки.',
          });
        }
        return false;
      }

      const initial =
        draftType === 'zone'
          ? {
              laneAngle: Number(draftZoneLaneAngle) === 90 ? 90 : 0,
              laneWidth: Math.max(1, Number(draftZoneLaneWidth) || 5),
              laneBearingDeg: typeof draftZoneBearingDeg === 'number' ? draftZoneBearingDeg : undefined,
              laneStart: draftZoneStart ?? undefined,
            }
          : undefined;

      onObjectCreate?.(
        {
          type: draftType,
          points: drawingPoints.map((point) => ({ lat: point.lat, lon: point.lng })),
        },
        { preserveActiveTool: options?.preserveActiveTool, initial },
      );
      clearDrawing();
      return true;
    },
    [
      clearDrawing,
      draftZoneBearingDeg,
      draftZoneLaneAngle,
      draftZoneLaneWidth,
      draftZoneStart,
      drawingPoints,
      onObjectCreate,
      toast,
    ],
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (suppressNextMapClickRef.current) {
        suppressNextMapClickRef.current = false;
        return;
      }
      setObjectMenuState(null);
      const latlng = e.latlng;

      if (activeTool === 'zone' && drawingPoints.length > 0 && draftLanePickMode !== 'none') {
        if (draftLanePickMode === 'start') {
          const snapped = pickNearestVertex(
            {
              id: 'draft',
              type: 'zone',
              name: 'draft',
              visible: true,
              geometry: { type: 'zone', points: drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng })) },
            },
            latlng,
          );
          if (snapped) {
            setDraftZoneStart(snapped);
            setDraftLanePickMode('none');
            toast({ title: 'Старт выбран', description: `${snapped.lat.toFixed(6)}, ${snapped.lon.toFixed(6)}` });
          }
        }
        return;
      }

      if (lanePickMode === 'start' && lanePickZoneId) {
        const zone = objects.find((obj) => obj.id === lanePickZoneId && obj.type === 'zone');
        if (zone) {
          const snapped = pickNearestVertex(zone, latlng);
          if (snapped) {
            onLanePickStart?.(lanePickZoneId, snapped);
            toast({ title: 'Старт выбран', description: `${snapped.lat.toFixed(6)}, ${snapped.lon.toFixed(6)}` });
          } else {
            toast({ variant: 'destructive', title: 'Не удалось выбрать старт', description: 'Проверьте геометрию зоны.' });
          }
        }
        return;
      }

      if (activeTool === "route" || activeTool === "zone") {
        if (activeTool === 'zone' && drawingPoints.length === 0) {
          // Reset per-zone picks when starting a new zone draft.
          setDraftZoneBearingDeg(null);
          setDraftZoneStart(null);
          setDraftLanePickMode('none');
        }
        setDrawingPoints((prev) => [...prev, latlng]);
        setDrawingMenuState({
          position: getDrawingMenuPosition(e.originalEvent.clientX, e.originalEvent.clientY, activeTool),
          draftType: activeTool,
        });
      } else if (activeTool === "marker") {
        if (onObjectCreate) {
          onObjectCreate({ type: "marker", point: { lat: latlng.lat, lon: latlng.lng } });
        }
      } else if (activeTool === "select") {
        onObjectSelect(null);
        setDrawingMenuState(null);
      }
    },
    [
      activeTool,
      draftLanePickMode,
      drawingPoints,
      lanePickMode,
      lanePickZoneId,
      objects,
      onLanePickStart,
      onObjectCreate,
      onObjectSelect,
      toast,
      getDrawingMenuPosition,
    ],
  );

  const onCursorMoveThrottled = useCallback(
    (pos: { lat: number; lon: number }) => {
      pendingCursor.current = pos;
      if (cursorRaf.current !== null) return;

      cursorRaf.current = window.requestAnimationFrame(() => {
        cursorRaf.current = null;
        if (pendingCursor.current) onCursorMove(pendingCursor.current);
      });
    },
    [onCursorMove],
  );

  useEffect(() => {
    return () => {
      if (cursorRaf.current !== null) {
        window.cancelAnimationFrame(cursorRaf.current);
        cursorRaf.current = null;
      }
      if (suppressMapClickTimerRef.current !== null) {
        window.clearTimeout(suppressMapClickTimerRef.current);
        suppressMapClickTimerRef.current = null;
      }
    };
  }, []);

  // Finalize current draft when user switches to another tool.
  useEffect(() => {
    const previousTool = previousToolRef.current;
    if (previousTool === activeTool) {
      return;
    }

    if ((previousTool === 'route' || previousTool === 'zone') && drawingPoints.length > 0) {
      const finalized = completeDrawing(previousTool, {
        preserveActiveTool: true,
        silentValidationError: true,
      });
      if (!finalized) {
        clearDrawing();
        toast({
          title: 'Черновик отменен',
          description: 'Для завершения не хватило точек.',
        });
      }
    }

    previousToolRef.current = activeTool;
  }, [activeTool, clearDrawing, completeDrawing, drawingPoints.length, toast]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === "Escape") {
        if (activeTool === 'zone' && draftLanePickMode !== 'none') {
          setDraftLanePickMode('none');
          return;
        }
        if (lanePickMode !== 'none') {
          onLanePickCancel?.();
          return;
        }
        if (activeTool !== 'select') {
          onToolChange?.('select');
        }
        if (drawingPoints.length > 0) {
          clearDrawing();
        } else if (selectedObjectId) {
          onObjectSelect(null);
        }
        setObjectMenuState(null);
        setDrawingMenuState(null);
      } else if (e.key === "Delete") {
        if (selectedObjectId && onObjectDelete) {
          onObjectDelete(selectedObjectId);
          onObjectSelect(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTool,
    clearDrawing,
    draftLanePickMode,
    drawingPoints.length,
    lanePickMode,
    onLanePickCancel,
    onObjectDelete,
    onObjectSelect,
    onToolChange,
    selectedObjectId,
  ]);

  // Context menu handler for map objects
  const handleObjectContextMenu = (e: L.LeafletMouseEvent, objectId: string) => {
    L.DomEvent.stopPropagation(e);
    setDrawingMenuState(null);
    setObjectMenuState({
      position: { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
      objectId,
    });
  };

  const selectedObject = useMemo(() => objects.find(o => o.id === selectedObjectId), [objects, selectedObjectId]);
  const contextObject = useMemo(
    () => objects.find((object) => object.id === objectMenuState?.objectId),
    [objectMenuState?.objectId, objects],
  );

  const renderObjects = useMemo(() => {
    const routes: Array<{ obj: MapObject; points: [number, number][] }> = [];
    const zones: Array<{ obj: MapObject; points: [number, number][] }> = [];
    const markers: Array<{ obj: MapObject; point: [number, number] }> = [];

    for (const obj of objects) {
      if (!obj.visible || !obj.geometry) continue;

      if (obj.geometry.type === "route") {
        routes.push({ obj, points: obj.geometry.points.map(toTuple) });
      } else if (obj.geometry.type === "zone") {
        zones.push({ obj, points: obj.geometry.points.map(toTuple) });
      } else if (obj.geometry.type === "marker") {
        markers.push({ obj, point: toTuple(obj.geometry.point) });
      }
    }

    return { routes, zones, markers };
  }, [objects]);

  const segmentLengthOverlays = useMemo(() => {
    if (segmentLengthsMode === 'off') return [] as Array<{ key: string; lat: number; lon: number; label: string }>;
    const overlays: Array<{ key: string; lat: number; lon: number; label: string }> = [];

    const shouldIncludeObject = (id: string) =>
      segmentLengthsMode === 'always' || (segmentLengthsMode === 'on-select' && selectedObjectId === id);

    for (const obj of objects) {
      if (!obj.visible || !obj.geometry) continue;
      if (!shouldIncludeObject(obj.id)) continue;
      if (obj.geometry.type !== 'route' && obj.geometry.type !== 'zone') continue;

      const points = obj.geometry.points.slice();
      if (points.length < 2) continue;

      if (obj.geometry.type === 'zone') {
        const first = points[0];
        const last = points[points.length - 1];
        if (first && last && first.lat === last.lat && first.lon === last.lon) {
          points.pop();
        }
      }
      if (points.length < 2) continue;

      const lastIndex = obj.geometry.type === 'zone' ? points.length : points.length - 1;
      for (let i = 0; i < lastIndex; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const len = haversineDistanceMeters(a.lat, a.lon, b.lat, b.lon);
        if (!Number.isFinite(len) || len <= 0) continue;

        overlays.push({
          key: `${obj.id}-seg-${i}`,
          lat: (a.lat + b.lat) / 2,
          lon: (a.lon + b.lon) / 2,
          label: formatSegmentLength(len),
        });
      }
    }

    return overlays;
  }, [objects, segmentLengthsMode, selectedObjectId]);

  const zoneTraversalOverlays = useMemo(() => {
    const zonesById = new Map<string, MapObject>();
    for (const obj of objects) {
      if (obj.type !== 'zone' || obj.geometry?.type !== 'zone') continue;
      zonesById.set(obj.id, obj);
    }

    const lanesByZone = new Map<string, LaneFeature[]>();
    for (const lane of laneFeatures) {
      const zoneId = lane.properties.parent_area_id;
      if (!zonesById.has(zoneId) || outdatedZoneIds[zoneId]) continue;
      const bucket = lanesByZone.get(zoneId);
      if (bucket) {
        bucket.push(lane);
      } else {
        lanesByZone.set(zoneId, [lane]);
      }
    }

    const overlays: Array<{
      zoneId: string;
      isSelected: boolean;
      traversalPath: [number, number][];
      waypoints: Array<{ lat: number; lon: number; index: number }>;
    }> = [];

    for (const [zoneId, lanes] of lanesByZone.entries()) {
      const zone = zonesById.get(zoneId);
      if (!zone) continue;

      const traversal = buildLaneTraversal(lanes, zone.laneStart ?? null, zone.laneBearingDeg);
      const fullWaypoints = traversal.waypoints;
      if (fullWaypoints.length === 0) continue;

      const isSelected = selectedObjectId === zoneId;
      const first = fullWaypoints[0];
      const last = fullWaypoints[fullWaypoints.length - 1];
      const waypoints = isSelected
        ? fullWaypoints
        : first.index === last.index
          ? [first]
          : [first, last];

      overlays.push({
        zoneId,
        isSelected,
        traversalPath: fullWaypoints.map((wp) => [wp.lat, wp.lon] as [number, number]),
        waypoints,
      });
    }

    return overlays;
  }, [laneFeatures, objects, outdatedZoneIds, selectedObjectId]);

  const waypointIcon = useCallback((label: string) => {
    return L.divIcon({
      className: 'lane-waypoint-icon',
      html: `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.85);
          color: white;
          font-size: 11px;
          line-height: 20px;
          text-align: center;
          border: 1px solid rgba(255, 255, 255, 0.7);
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        ">${label}</div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }, []);

  const lanePickZone = useMemo(() => {
    if (!lanePickZoneId) return null;
    const zone = objects.find((obj) => obj.id === lanePickZoneId);
    return isZoneWithGeometry(zone) ? zone : null;
  }, [lanePickZoneId, objects]);

  const lanePickEdges = useMemo(() => {
    if (!lanePickZone) return [];
    const points = lanePickZone.geometry!.points;
    if (points.length < 2) return [];
    const edges: Array<{ a: { lat: number; lon: number }; b: { lat: number; lon: number }; key: string }> = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a.lat === b.lat && a.lon === b.lon) continue;
      edges.push({ a, b, key: `edge-${i}` });
    }
    return edges;
  }, [lanePickZone]);

  const draftPickEdges = useMemo(() => {
    if (activeTool !== 'zone' || draftLanePickMode !== 'edge') return [];
    if (drawingPoints.length < 2) return [];

    const pts = drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng }));
    const edges: Array<{ a: { lat: number; lon: number }; b: { lat: number; lon: number }; key: string }> = [];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      edges.push({ a: pts[i], b: pts[i + 1], key: `draft-edge-${i}` });
    }
    if (pts.length >= 3) {
      edges.push({ a: pts[pts.length - 1], b: pts[0], key: `draft-edge-close` });
    }
    return edges;
  }, [activeTool, draftLanePickMode, drawingPoints]);

  const draftZonePreviewLanes = useMemo(() => {
    if (activeTool !== 'zone') return [];
    if (drawingPoints.length < 3) return [];

    const points = drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng }));
    const laneWidthM = Math.max(1, Number(draftZoneLaneWidth) || 5);
    const laneAngleDeg = Number(draftZoneLaneAngle) === 90 ? 90 : 0;

    return generateLanesForZone({
      parentAreaId: 'draft-zone',
      points,
      laneAngleDeg,
      laneWidthM,
      laneBearingDeg: typeof draftZoneBearingDeg === 'number' ? draftZoneBearingDeg : undefined,
      start: draftZoneStart ?? undefined,
    });
  }, [
    activeTool,
    draftZoneBearingDeg,
    draftZoneLaneAngle,
    draftZoneLaneWidth,
    draftZoneStart,
    drawingPoints,
  ]);

  const draftZonePreviewWaypoints = useMemo(() => {
    if (activeTool !== 'zone') return [];
    if (drawingPoints.length < 3) return [];
    const traversal = buildLaneTraversal(
      draftZonePreviewLanes,
      draftZoneStart ?? null,
      typeof draftZoneBearingDeg === 'number' ? draftZoneBearingDeg : undefined,
    );
    return traversal.waypoints;
  }, [activeTool, draftZoneBearingDeg, draftZonePreviewLanes, draftZoneStart, drawingPoints.length]);

  const handleVertexDrag = (index: number, latlng: L.LatLng) => {
    if (!selectedObject || !selectedObject.geometry || !onObjectUpdate) return;
    const geo = selectedObject.geometry;
    if (geo.type === 'marker') {
      onObjectUpdate(selectedObject.id, { geometry: { ...geo, point: { lat: latlng.lat, lon: latlng.lng } } });
    } else {
      const newPoints = [...geo.points];
      newPoints[index] = { lat: latlng.lat, lon: latlng.lng };
      onObjectUpdate(selectedObject.id, { geometry: { ...geo, points: newPoints } });
    }
  };

  const handleVirtualVertexClick = (index: number, latlng: L.LatLng) => {
    if (!selectedObject || !selectedObject.geometry || !onObjectUpdate) return;
    const geo = selectedObject.geometry;
    if (geo.type !== 'route' && geo.type !== 'zone') return;

    const newPoints = [...geo.points];
    // Insert after index (index represents the segment start vertex)
    newPoints.splice(index + 1, 0, { lat: latlng.lat, lon: latlng.lng });
    onObjectUpdate(selectedObject.id, { geometry: { ...geo, points: newPoints } });
  };

  const renderEditingHandles = () => {
    if (!selectedObject || !selectedObject.visible || !selectedObject.geometry) return null;
    if (activeTool !== 'select') return null;

    const handles = [];

    if (selectedObject.geometry.type === 'marker') {
      return null;
    }

    const points = selectedObject.geometry.points;

    // Real vertices
    points.forEach((p, i) => {
      handles.push(
        <Marker
          key={`handle-${i}`}
          position={[p.lat, p.lon]}
          icon={vertexHandleIcon}
          draggable={true}
          eventHandlers={{
            drag: (e) => {
              const marker = e.target as L.Marker;
              handleVertexDrag(i, marker.getLatLng());
            },
            dragend: (e) => {
              const marker = e.target as L.Marker;
              handleVertexDrag(i, marker.getLatLng());
            },
            click: (e) => L.DomEvent.stopPropagation(e),
            contextmenu: (e) => {
              L.DomEvent.stopPropagation(e);
              // Minimum points check: Zone needs at least 3, Route needs at least 2.
              const minPoints = selectedObject.geometry!.type === 'zone' ? 3 : 2;

              if (points.length > minPoints && onObjectUpdate) {
                const newPoints = points.filter((_, idx) => idx !== i);
                onObjectUpdate(selectedObject.id, {
                  geometry: { ...selectedObject.geometry!, points: newPoints } as MapObjectGeometry,
                });
              }
            }
          }}
          zIndexOffset={1000}
        />
      );
    });

    // Virtual handles (midpoints)
    for (let i = 0; i < points.length; i++) {
      if (selectedObject.geometry.type === 'route' && i === points.length - 1) break; // No closing segment for route

      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      const midLat = (p1.lat + p2.lat) / 2;
      const midLon = (p1.lon + p2.lon) / 2;

      handles.push(
        <Marker
          key={`virtual-${i}`}
          position={[midLat, midLon]}
          icon={virtualHandleIcon}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              handleVirtualVertexClick(i, e.latlng);
            },
          }}
          zIndexOffset={900}
          opacity={0.5}
        />
      );
    }

    return <>{handles}</>;
  };

  return (
    <div className={cn(
      "w-full h-full relative",
      activeTool === 'select' && hoveredObjectId && "cursor-pointer",
      activeTool === 'select' && !hoveredObjectId && "cursor-default",
      (activeTool === 'route' || activeTool === 'zone') && "cursor-crosshair",
      activeTool === 'marker' && "cursor-crosshair"
    )}>
      <MapContainer
        center={mapView ? [mapView.center_lat, mapView.center_lon] : diverPosition}
        zoom={mapView?.zoom ?? 16}
        className="w-full h-full"
        ref={mapRef}
        doubleClickZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url={platform.map.tileLayerUrl()}
        />

        {/* Grid */}
        {layers.grid && (
          <GridLayer
            visible={true}
            color={grid.color}
            widthPx={grid.width_px}
            lineStyle={grid.line_style}
          />
        )}

        {/* Scale bar */}
        {layers.scaleBar && <ScaleBar />}

        <MapEvents
          onCursorMove={onCursorMoveThrottled}
          onMapClick={handleMapClick}
          onMapDrag={onMapDrag}
          onMapScaleChange={onMapScaleChange}
          onMapViewChange={onMapViewChange}
          onMapContextMenu={() => {
            setObjectMenuState(null);
            setDrawingMenuState(null);
          }}
        />

        <ApplyMapView mapView={mapView} isFollowing={isFollowing} />
        <CenterOnObjectRequest request={centerRequest} objects={objects} onMissingGeometry={handleMissingGeometry} />
        <FollowDiver position={diverPosition} isFollowing={isFollowing} />

        {/* Track */}
        {layers.track &&
          trackSegments.map((segment, index) => (
            <Polyline
              key={`track-segment-${index}`}
              positions={segment}
              pathOptions={{
                color: styles.track.color,
                weight: styles.track.width_px,
              }}
            />
          ))}

        {/* Routes */}
        {layers.routes &&
          renderObjects.routes.map(({ obj, points }) => (
            <Polyline
              key={obj.id}
              positions={points}
              pathOptions={{
                color: getObjectColor(obj, styles),
                weight: (selectedObjectId === obj.id ? 1 : 0) + styles.route.width_px,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectSelect(obj.id);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectDoubleClick(obj.id);
                },
                contextmenu: (e) => handleObjectContextMenu(e, obj.id),
                mouseover: () => setHoveredObjectId(obj.id),
                mouseout: () => setHoveredObjectId(null),
              }}
            >
              <Tooltip sticky>{obj.name}</Tooltip>
            </Polyline>
          ))}

        {/* Lanes (derived from zone) */}
        {layers.routes &&
          laneFeatures.map((lane) => {
            const parentAreaId = lane.properties.parent_area_id;
            const isParentSelected = selectedObjectId === parentAreaId;
            const isOutdated = Boolean(outdatedZoneIds[parentAreaId]);
            const lanePoints = lane.geometry.coordinates.map(
              ([lon, lat]) => [lat, lon] as [number, number],
            );

            return (
              <Polyline
                key={lane.properties.id}
                positions={lanePoints}
                pathOptions={{
                  color: isOutdated ? 'hsl(215, 16%, 47%)' : styles.lane.color,
                  weight: (isParentSelected ? 1 : 0) + styles.lane.width_px,
                  opacity: isOutdated ? 0.35 : isParentSelected ? 0.95 : 0.75,
                  dashArray: isOutdated ? '3 7' : (styles.lane.dash || undefined),
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onObjectSelect(parentAreaId);
                  },
                  contextmenu: (e) => handleObjectContextMenu(e, parentAreaId),
                }}
              >
                <Tooltip sticky>{`Галс ${lane.properties.lane_index}${isOutdated ? ' (неактуален)' : ''}`}</Tooltip>
              </Polyline>
            );
          })}

        {/* Zone */}
        {layers.routes &&
          renderObjects.zones.map(({ obj, points }) => (
            <Polygon
              key={obj.id}
              positions={points}
              pathOptions={{
                color: getObjectColor(obj, styles),
                fillColor: obj.color ? obj.color : styles.survey_area.fill_color,
                fillOpacity: selectedObjectId === obj.id ? 0.3 : styles.survey_area.fill_opacity,
                weight: (selectedObjectId === obj.id ? 1 : 0) + styles.survey_area.stroke_width_px,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectSelect(obj.id);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectDoubleClick(obj.id);
                },
                contextmenu: (e) => handleObjectContextMenu(e, obj.id),
                mouseover: () => setHoveredObjectId(obj.id),
                mouseout: () => setHoveredObjectId(null),
              }}
            >
              <Tooltip sticky>{obj.name}</Tooltip>
            </Polygon>
          ))}

        {/* Markers */}
        {layers.markers &&
          renderObjects.markers.map(({ obj, point }) => (
            <Marker
              key={obj.id}
              position={point}
              icon={getMarkerIcon(getObjectColor(obj, styles), selectedObjectId === obj.id)}
              draggable={activeTool === 'select'}
              bubblingMouseEvents={false}
              eventHandlers={{
                mousedown: (e) => {
                  L.DomEvent.stopPropagation(e);
                },
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectSelect(obj.id);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectDoubleClick(obj.id);
                },
                contextmenu: (e) => handleObjectContextMenu(e, obj.id),
                dragstart: () => {
                  armMapClickSuppression();
                },
                dragend: (e) => {
                  armMapClickSuppression();
                  const m = e.target as L.Marker;
                  updateMarkerPosition(obj.id, m.getLatLng());
                  window.setTimeout(() => onObjectSelect(obj.id), 0);
                },
                mouseover: () => setHoveredObjectId(obj.id),
                mouseout: () => setHoveredObjectId(null),
              }}
            >
              <Tooltip direction="top" offset={[12, -14]}>{obj.name}</Tooltip>
            </Marker>
          ))}

        {/* Segment lengths */}
        {layers.routes &&
          segmentLengthOverlays.map((item) => (
            <Marker
              key={item.key}
              position={[item.lat, item.lon]}
              icon={segmentLengthIcon(item.label)}
              interactive={false}
              zIndexOffset={800}
            />
          ))}

        {/* Editing Handles */}
        {renderEditingHandles()}

        {/* Lane traversal + waypoints */}
        {layers.routes &&
          zoneTraversalOverlays.map((overlay) =>
            overlay.traversalPath.length > 1 ? (
              <Polyline
                key={`traversal-${overlay.zoneId}`}
                positions={overlay.traversalPath}
                pathOptions={{
                  color: 'hsl(142, 71%, 45%)',
                  weight: overlay.isSelected ? 3 : 2,
                  opacity: overlay.isSelected ? 0.9 : 0.7,
                }}
              />
            ) : null,
          )}
        {layers.routes &&
          zoneTraversalOverlays.flatMap((overlay) =>
            overlay.waypoints.map((wp) => (
              <Marker
                key={`wp-${overlay.zoneId}-${wp.index}`}
                position={[wp.lat, wp.lon]}
                icon={waypointIcon(String(wp.index))}
                interactive={false}
                zIndexOffset={1200}
              />
            )),
          )}

        {/* Lane pick edge overlay */}
        {lanePickMode === 'edge' &&
          lanePickZone &&
          lanePickEdges.map((edge) => (
            <Polyline
              key={edge.key}
              positions={[
                [edge.a.lat, edge.a.lon],
                [edge.b.lat, edge.b.lon],
              ]}
              pathOptions={{
                color: 'hsl(199, 89%, 48%)',
                weight: 10,
                opacity: 0.25,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  const bearing = computeBearingDeg(edge.a, edge.b);
                  onLanePickEdge?.(lanePickZone.id, bearing);
                  toast({ title: 'Грань выбрана', description: `bearing ${Math.round(bearing)}°` });
                },
              }}
            />
          ))}

        {/* Draft edge pick overlay */}
        {draftPickEdges.map((edge) => (
          <Polyline
            key={edge.key}
            positions={[
              [edge.a.lat, edge.a.lon],
              [edge.b.lat, edge.b.lon],
            ]}
            pathOptions={{
              color: 'hsl(142, 71%, 45%)',
              weight: 12,
              opacity: 0.25,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                const bearing = computeBearingDeg(edge.a, edge.b);
                setDraftZoneBearingDeg(bearing);
                setDraftLanePickMode('none');
                toast({ title: 'Грань выбрана', description: `bearing ${Math.round(bearing)}°` });
              },
            }}
          />
        ))}

        {/* Drawing preview */}
        {drawingPoints.length > 0 && activeTool === "route" && (
          <Polyline
            positions={drawingPoints.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: "hsl(199, 89%, 48%)",
              weight: 2,
              dashArray: "5, 5",
            }}
          />
        )}

        {drawingPoints.length > 2 && activeTool === "zone" && (
          <Polygon
            positions={drawingPoints.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: "hsl(38, 92%, 50%)",
              fillColor: "hsl(38, 92%, 50%)",
              fillOpacity: 0.15,
              weight: 2,
              dashArray: "5, 5",
            }}
          />
        )}

        {/* Draft zone live lane preview */}
        {activeTool === 'zone' &&
          drawingPoints.length > 2 &&
          draftZonePreviewLanes.map((lane) => {
            const lanePoints = lane.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
            const key = `${lane.properties.lane_index}-${lanePoints[0]?.join(',')}-${lanePoints[1]?.join(',')}`;
            return (
              <Polyline
                key={key}
                positions={lanePoints}
                pathOptions={{
                  color: 'hsl(142, 71%, 45%)',
                  weight: 2,
                  opacity: 0.8,
                  dashArray: '6 6',
                }}
              />
            );
          })}

        {/* Draft zone waypoint numbers */}
        {activeTool === 'zone' &&
          drawingPoints.length > 2 &&
          draftZonePreviewWaypoints.map((wp) => (
            <Marker
              key={`draft-wp-${wp.index}`}
              position={[wp.lat, wp.lon]}
              icon={waypointIcon(String(wp.index))}
              interactive={false}
              zIndexOffset={1200}
            />
          ))}

        {/* Drawing points markers */}
        {drawingPoints.map((point, i) => (
          <Marker
            key={i}
            position={[point.lat, point.lng]}
            icon={L.divIcon({
              className: "drawing-point",
              html: '<div class="w-2 h-2 bg-white rounded-full border border-background"></div>',
              iconSize: [8, 8],
              iconAnchor: [4, 4],
            })}
          />
        ))}

        {/* Diver */}
        {layers.diver &&
          showTelemetryObjects &&
          divers.map((diver, index) => {
            const position = getDiverPosition(diver, index);
            const course = getDiverCourse(diver, index);
            return (
              <Marker
                key={diver.uid}
                position={position}
                icon={createDiverIcon(course, index === 0 && isFollowing, diver.marker_color, diver.marker_size_px)}
              />
            );
          })}

        {/* Base station */}
        {layers.baseStation && showTelemetryObjects && isBaseStationSourceAssigned && baseStationPosition ? (
          <Marker position={baseStationPosition} icon={baseStationIcon}>
            <Tooltip direction="top" offset={[10, -10]}>
              {baseStationData?.sourceId
                ? `Базовая станция · ${baseStationData.sourceId}`
                : "Базовая станция"}
            </Tooltip>
          </Marker>
        ) : null}
      </MapContainer>

      {/* Object Context Menu */}
      {objectMenuState && (
        <MapContextMenu
          position={objectMenuState.position}
          onClose={() => setObjectMenuState(null)}
          items={[
            {
              label: "Свойства",
              action: () => {
                if (objectMenuState.objectId) {
                  onObjectDoubleClick(objectMenuState.objectId);
                }
              },
            },
            {
              label: "Переименовать",
              action: () => {
                if (!contextObject || !onObjectUpdate) return;
                const nextName = window.prompt('Новое имя объекта', contextObject.name);
                const trimmed = nextName?.trim();
                if (!trimmed || trimmed === contextObject.name) return;
                onObjectUpdate(contextObject.id, { name: trimmed });
              },
            },
            ...(contextObject?.type === 'zone'
              ? [
                {
                  label: "Перегенерировать галсы",
                  action: () => {
                    if (objectMenuState.objectId && onRegenerateLanes) {
                      onRegenerateLanes(objectMenuState.objectId);
                    }
                  },
                },
              ]
              : []),
            {
              label: "Удалить",
              action: () => {
                if (objectMenuState.objectId && onObjectDelete) {
                  onObjectDelete(objectMenuState.objectId);
                }
              },
              variant: "destructive",
            },
          ]}
        />
      )}

      {/* Drawing Context Menu */}
      {drawingMenuState && drawingPoints.length > 0 && drawingMenuState.draftType === 'route' && (
        <MapContextMenu
          position={drawingMenuState.position}
          onClose={() => setDrawingMenuState(null)}
          items={[
            {
              label: 'Завершить маршрут',
              action: () => {
                completeDrawing('route');
              },
            },
            {
              label: 'Удалить маршрут',
              action: () => {
                clearDrawing();
              },
              variant: 'destructive',
            },
          ]}
        />
      )}

      {drawingMenuState && drawingPoints.length > 0 && drawingMenuState.draftType === 'zone' && (
        <div
          className="fixed z-[9999] w-[320px] bg-popover text-popover-foreground rounded-md border border-border shadow-md p-3 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: drawingMenuState.position.y, left: drawingMenuState.position.x }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="text-sm font-medium mb-2">Параметры галсов</div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Угол</div>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={draftZoneLaneAngle}
                  onChange={(e) => setDraftZoneLaneAngle(e.target.value === '90' ? '90' : '0')}
                >
                  <option value="0">0°</option>
                  <option value="90">90°</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Ширина (м)</div>
                <input
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  type="number"
                  min={1}
                  max={1000}
                  value={draftZoneLaneWidth}
                  onChange={(e) => setDraftZoneLaneWidth(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Ориентация</div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs">
                  {typeof draftZoneBearingDeg === 'number' ? `по грани (${Math.round(draftZoneBearingDeg)}°)` : 'авто'}
                </div>
                <button
                  type="button"
                  className="h-8 px-2 rounded-md border border-input text-xs hover:bg-accent"
                  onClick={() => setDraftLanePickMode('edge')}
                  disabled={drawingPoints.length < 2}
                >
                  Выбрать грань
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Старт</div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-xs">
                  {draftZoneStart ? `${draftZoneStart.lat.toFixed(6)}, ${draftZoneStart.lon.toFixed(6)}` : 'не выбран'}
                </div>
                <button
                  type="button"
                  className="h-8 px-2 rounded-md border border-input text-xs hover:bg-accent"
                  onClick={() => setDraftLanePickMode('start')}
                  disabled={drawingPoints.length < 3}
                >
                  Выбрать старт
                </button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {drawingPoints.length < 3
                ? 'Добавьте ещё точки (минимум 3) для предпросмотра галсов.'
                : `Предпросмотр: ${draftZonePreviewLanes.length} галсов`}
            </div>

            {draftLanePickMode !== 'none' && (
              <div className="text-xs text-muted-foreground">
                {draftLanePickMode === 'edge' && 'Кликните по ребру зоны на карте.'}
                {draftLanePickMode === 'start' && 'Кликните около вершины. Старт снапается к ближайшей вершине.'}
                <button
                  type="button"
                  className="ml-2 text-primary hover:underline"
                  onClick={() => setDraftLanePickMode('none')}
                >
                  Отмена
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                className="h-9 px-3 rounded-md border border-input text-sm hover:bg-accent"
                onClick={() => clearDrawing()}
              >
                Удалить черновик
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                onClick={() => completeDrawing('zone')}
                disabled={drawingPoints.length < 3}
              >
                Завершить зону
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection timeout warning */}
      {showNoDataWarning && connectionStatus !== 'ok' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {`Нет данных ${Math.max(1, connectionLostSeconds ?? 0)} сек`}
        </div>
      )}

      {/* Drawing hint */}
      {(activeTool === 'route' || activeTool === 'zone') && drawingPoints.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          {activeTool === 'route' && 'Кликайте по карте и завершайте через меню у последней точки'}
          {activeTool === 'zone' && 'Кликайте по карте и завершайте через меню у последней точки'}
        </div>
      )}

      {activeTool === 'marker' && drawingPoints.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          Кликните для установки маркера
        </div>
      )}

      {(lanePickMode === 'edge' || lanePickMode === 'start') && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm flex items-center gap-3">
          <span className="text-muted-foreground">
            {lanePickMode === 'edge' && 'Выберите грань зоны'}
            {lanePickMode === 'start' && 'Кликните для выбора старта (снап к вершине)'}
          </span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onLanePickCancel?.()}
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
