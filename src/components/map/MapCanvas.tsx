import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, ImageOverlay, MapContainer, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle } from "lucide-react";

import type { MapObject, MapObjectGeometry, Tool } from "@/features/map/model/types";
import {
  buildLaneTraversal,
  generateLanesForZone,
  toConvexZonePolygon,
  type LaneFeature,
  type SegmentLengthsMode,
} from "@/features/mission";
import { parseLaneAngleInput } from "@/features/mission/model/laneAngle";
import type { AppUiDefaults } from "@/features/settings";
import type { DiverUiConfig } from "@/features/mission";
import type { DxfOverlayFeatureCollection } from '@/features/map/dxfOverlay/parseDxf';
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { platform } from "@/platform";
import { MapContextMenu } from "./MapContextMenu";
import { GridLayer } from "./GridLayer";
import { ScaleBar } from "./ScaleBar";
import { computeScaleRatioLabelFromMap, haversineDistanceMeters } from './scaleUtils';
import { ZoneDraftLanePanel } from './ZoneDraftLanePanel';
import { getDefaultZoneLanePanelIconPosition, getDefaultZoneLanePanelPosition } from './zoneDraftLanePanelUtils';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import CachedTileLayer from './CachedTileLayer';
import { createBaseStationIcon, createDiverIcon } from './telemetryMarkerIcons';
import { resolveFlyToZoomFor50mGrid } from './flyToZoom';

const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

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
    basemap: boolean;
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
    course: number;
    sourceId: string | null;
  } | null;
  isBaseStationSourceAssigned: boolean;
  baseStationMarkerSizePx?: number;
  divers: DiverUiConfig[];
  diverPositionsById?: Record<
    string,
    {
      lat: number;
      lon: number;
      course?: number;
    }
  >;
  trackSegments: Array<{ trackId: string; points: Array<[number, number]>; color: string }>;
  rasterOverlays?: Array<{
    id: string;
    name: string;
    url: string;
    bounds: { north: number; south: number; east: number; west: number };
    opacity: number;
    visible: boolean;
    zIndex: number;
  }>;
  vectorOverlays?: Array<{
    id: string;
    name: string;
    color: string;
    opacity: number;
    visible: boolean;
    zIndex: number;
    features: DxfOverlayFeatureCollection['features'];
  }>;
  followAgentId: string | null;
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
  onRegenerateLanes?: (id: string, updates?: Partial<MapObject>) => void;
  onLanePickCancel?: () => void;
  onLanePickEdge?: (zoneId: string, bearingDeg: number) => void;
  onLanePickStart?: (zoneId: string, point: { lat: number; lon: number }) => void;
  onMapScaleChange?: (scale: string) => void;
  onMapViewChange?: (view: { center_lat: number; center_lon: number; zoom: number }) => void;
  onMapBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onMapDrag: () => void;
}

type RasterOverlayLayer = NonNullable<MapCanvasProps["rasterOverlays"]>[number];
type VectorOverlayLayer = NonNullable<MapCanvasProps["vectorOverlays"]>[number];
type VectorOverlayGeoJsonFeature = {
  type: "Feature";
  geometry:
    | {
        type: "LineString";
        coordinates: Array<[number, number]>;
      }
    | {
        type: "Polygon";
        coordinates: Array<Array<[number, number]>>;
      }
    | {
        type: "Point";
        coordinates: [number, number];
      };
  properties: { kind: "polyline" | "polygon" | "point" };
};
type VectorOverlayGeoJsonCollection = {
  type: "FeatureCollection";
  features: VectorOverlayGeoJsonFeature[];
};

const isClosedPolyline = (points: Array<{ lat: number; lon: number }>): boolean => {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.abs(first.lat - last.lat) < 1e-10 && Math.abs(first.lon - last.lon) < 1e-10;
};

const toVectorOverlayGeoJson = (
  features: DxfOverlayFeatureCollection["features"],
): VectorOverlayGeoJsonCollection => ({
  type: "FeatureCollection",
  features: features.map((feature) => {
    if (feature.type === "point") {
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [feature.point.lon, feature.point.lat],
        },
        properties: { kind: "point" },
      };
    }

    const coordinates = feature.points.map((point) => [point.lon, point.lat] as [number, number]);
    if (isClosedPolyline(feature.points)) {
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
        properties: { kind: "polygon" },
      };
    }

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: { kind: "polyline" },
    };
  }),
});

const OverlayLayers = memo(
  ({
    rasterOverlays,
    vectorOverlays,
  }: {
    rasterOverlays: RasterOverlayLayer[];
    vectorOverlays: VectorOverlayLayer[];
  }) => {
    const visibleRasterOverlays = useMemo(
      () =>
        rasterOverlays
          .filter((overlay) => overlay.visible && overlay.url)
          .sort((a, b) => a.zIndex - b.zIndex),
      [rasterOverlays],
    );

    const visibleVectorOverlays = useMemo(
      () =>
        vectorOverlays
          .filter((overlay) => overlay.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((overlay) => ({
            ...overlay,
            geoJson: toVectorOverlayGeoJson(overlay.features),
          })),
      [vectorOverlays],
    );

    return (
      <>
        {visibleRasterOverlays.map((overlay) => (
          <ImageOverlay
            key={`raster-overlay-${overlay.id}`}
            url={overlay.url}
            opacity={overlay.opacity}
            zIndex={overlay.zIndex}
            bounds={[
              [overlay.bounds.south, overlay.bounds.west],
              [overlay.bounds.north, overlay.bounds.east],
            ]}
          />
        ))}

        {visibleVectorOverlays.map((overlay) => (
          <Pane key={`vector-pane-${overlay.id}`} name={`vector-pane-${overlay.id}`} style={{ zIndex: 450 + overlay.zIndex }}>
            <GeoJSON
              key={`vector-geojson-${overlay.id}-${overlay.geoJson.features.length}`}
              data={overlay.geoJson as unknown as GeoJSON.GeoJsonObject}
              style={(feature) => {
                const isPolygon = feature?.geometry?.type === "Polygon";
                return {
                  color: overlay.color,
                  weight: 2,
                  opacity: overlay.opacity,
                  fillColor: overlay.color,
                  fillOpacity: isPolygon ? Math.max(0.08, overlay.opacity * 0.2) : 0,
                };
              }}
              pointToLayer={(_, latlng) =>
                L.circleMarker(latlng, {
                  radius: 3,
                  color: overlay.color,
                  fillColor: overlay.color,
                  fillOpacity: overlay.opacity,
                  opacity: overlay.opacity,
                  weight: 1,
                  interactive: false,
                })
              }
              interactive={false}
            />
          </Pane>
        ))}
      </>
    );
  },
);

OverlayLayers.displayName = "OverlayLayers";

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
  onMapBoundsChange,
}: {
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onMapClick: (e: L.LeafletMouseEvent) => void;
  onMapDrag: () => void;
  onMapContextMenu: (e: L.LeafletMouseEvent) => void;
  onMapScaleChange?: (scale: string) => void;
  onMapViewChange?: (view: { center_lat: number; center_lon: number; zoom: number }) => void;
  onMapBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
}) => {
  const map = useMap();
  const viewTimerRef = useRef<number | null>(null);
  const reportScale = useCallback(() => {
    onMapScaleChange?.(computeScaleRatioLabelFromMap(map));
  }, [map, onMapScaleChange]);

  const scheduleViewReport = useCallback(() => {
    if (!onMapViewChange && !onMapBoundsChange) return;
    if (viewTimerRef.current !== null) {
      window.clearTimeout(viewTimerRef.current);
    }

    viewTimerRef.current = window.setTimeout(() => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      onMapViewChange?.({
        center_lat: center.lat,
        center_lon: center.lng,
        zoom: map.getZoom(),
      });
      onMapBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    }, 250);
  }, [map, onMapBoundsChange, onMapViewChange]);

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
  const zoomSnap = platform.map.zoomSnap();

  useEffect(() => {
    if (!mapView) return;
    if (isFollowing) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const targetZoom = normalizeZoomLevel(mapView.zoom, zoomSnap);
    const dLat = Math.abs(center.lat - mapView.center_lat);
    const dLon = Math.abs(center.lng - mapView.center_lon);
    if (dLat < 1e-7 && dLon < 1e-7 && zoom === targetZoom) return;

    map.setView([mapView.center_lat, mapView.center_lon], targetZoom, { animate: false });
  }, [isFollowing, map, mapView, zoomSnap]);

  return null;
};

const SyncMapSizeWithLayout = () => {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize({ pan: false, debounceMoveend: true });
    };

    const rafId = window.requestAnimationFrame(invalidate);
    const timeoutId = window.setTimeout(invalidate, 120);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        window.requestAnimationFrame(invalidate);
      });
      observer.observe(map.getContainer());
    }

    const handleWindowResize = () => {
      window.requestAnimationFrame(invalidate);
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [map]);

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
  const lastHandledNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!request) return;
    if (lastHandledNonceRef.current === request.nonce) return;
    const obj = objects.find((item) => item.id === request.objectId);
    if (!obj) return;
    if (!obj.geometry) {
      onMissingGeometry(obj.name);
      lastHandledNonceRef.current = request.nonce;
      return;
    }

    if (obj.geometry.type === 'marker') {
      const targetZoom = resolveFlyToZoomFor50mGrid(obj.geometry.point.lat, {
        zoomSnap: platform.map.zoomSnap(),
        maxZoom: platform.map.maxZoom(),
        minZoom: map.getMinZoom(),
      });
      map.flyTo([obj.geometry.point.lat, obj.geometry.point.lon], targetZoom, { animate: true });
      lastHandledNonceRef.current = request.nonce;
      return;
    }

    const points = obj.geometry.points;
    if (!points || points.length === 0) {
      onMissingGeometry(obj.name);
      lastHandledNonceRef.current = request.nonce;
      return;
    }

    const bounds = L.latLngBounds(points.map((p) => L.latLng(p.lat, p.lon)));
    if (!bounds.isValid()) {
      onMissingGeometry(obj.name);
      lastHandledNonceRef.current = request.nonce;
      return;
    }
    const center = bounds.getCenter();
    const targetZoom = resolveFlyToZoomFor50mGrid(center.lat, {
      zoomSnap: platform.map.zoomSnap(),
      maxZoom: platform.map.maxZoom(),
      minZoom: map.getMinZoom(),
    });
    map.flyTo(center, targetZoom, { animate: true });
    lastHandledNonceRef.current = request.nonce;
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

const normalizeZoomLevel = (value: number, snap: number): number => {
  if (!Number.isFinite(value)) return 16;
  if (!Number.isFinite(snap) || snap <= 0) return value;
  return Math.round(value / snap) * snap;
};

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
  baseStationMarkerSizePx,
  divers,
  diverPositionsById = {},
  trackSegments,
  rasterOverlays = [],
  vectorOverlays = [],
  followAgentId,
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
  onMapBoundsChange,
  onMapDrag,
}: MapCanvasProps) => {
  const [drawingPoints, setDrawingPoints] = useState<L.LatLng[]>([]);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureCursor, setMeasureCursor] = useState<L.LatLng | null>(null);
  const [objectMenuState, setObjectMenuState] = useState<{
    position: { x: number; y: number };
    objectId?: string;
  } | null>(null);
  const [drawingMenuState, setDrawingMenuState] = useState<{ position: { x: number; y: number } } | null>(null);
  const [draftZoneLaneAngle, setDraftZoneLaneAngle] = useState('0');
  const [draftZoneLaneWidth, setDraftZoneLaneWidth] = useState('10');
  const [draftZoneBearingDeg, setDraftZoneBearingDeg] = useState<number | null>(null);
  const [draftZoneStart, setDraftZoneStart] = useState<{ lat: number; lon: number } | null>(null);
  const [draftLanePickMode, setDraftLanePickMode] = useState<'none' | 'edge' | 'start'>('none');
  const [zoneDraftPanelPosition, setZoneDraftPanelPosition] = useState(() => getDefaultZoneLanePanelPosition());
  const [zoneDraftPanelIconPosition, setZoneDraftPanelIconPosition] = useState(() => getDefaultZoneLanePanelIconPosition());
  const [zoneDraftPanelMinimized, setZoneDraftPanelMinimized] = useState(false);
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
  const normalizeCourse = (value: number): number => ((value % 360) + 360) % 360;
  const getDiverCourse = (diver: DiverUiConfig, index: number): number => {
    const diverId = diver.id.trim();
    const telemetry = diverId ? normalizedDiverPositions[diverId] : undefined;
    if (telemetry && typeof telemetry.course === 'number' && Number.isFinite(telemetry.course)) {
      return normalizeCourse(telemetry.course);
    }
    if (index === 0) {
      return normalizeCourse(diverData.course);
    }
    return 0;
  };

  const isFollowing = Boolean(followAgentId);
  const followAgentIndex = followAgentId ? divers.findIndex((diver) => diver.uid === followAgentId) : -1;
  const followAgent = followAgentIndex >= 0 ? divers[followAgentIndex] : null;
  const followPosition: [number, number] = followAgent
    ? getDiverPosition(followAgent, followAgentIndex)
    : diverPosition;

  const baseStationPosition: [number, number] | null = baseStationData
    ? [baseStationData.lat, baseStationData.lon]
    : null;
  const baseStationCourse =
    typeof baseStationData?.course === 'number' && Number.isFinite(baseStationData.course)
      ? normalizeCourse(baseStationData.course)
      : null;
  const baseStationIcon = useMemo(
    () => createBaseStationIcon(baseStationCourse, baseStationMarkerSizePx),
    [baseStationCourse, baseStationMarkerSizePx],
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

  const clearMeasureDraft = useCallback(() => {
    setMeasurePoints([]);
    setMeasureCursor(null);
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
    (clientX: number, clientY: number): { x: number; y: number } => {
      const offsetX = 0;
      const offsetY = 20;
      const width = 180;
      const height = 120;
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
              laneAngle: parseLaneAngleInput(draftZoneLaneAngle, 0),
              laneWidth: Math.max(1, Number(draftZoneLaneWidth) || 5),
              laneBearingDeg: typeof draftZoneBearingDeg === 'number' ? draftZoneBearingDeg : undefined,
              laneStart: draftZoneStart ?? undefined,
            }
          : undefined;

      const points = drawingPoints.map((point) => ({ lat: point.lat, lon: point.lng }));
      const normalizedPoints = draftType === 'zone' ? toConvexZonePolygon(points) : points;

      onObjectCreate?.(
        {
          type: draftType,
          points: normalizedPoints,
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
        if (activeTool === 'route') {
          setDrawingMenuState({
            position: getDrawingMenuPosition(e.originalEvent.clientX, e.originalEvent.clientY),
          });
        } else {
          setDrawingMenuState(null);
        }
      } else if (activeTool === "marker") {
        if (onObjectCreate) {
          onObjectCreate({ type: "marker", point: { lat: latlng.lat, lon: latlng.lng } });
        }
      } else if (activeTool === 'measure') {
        if (measurePoints.length === 0) {
          setMeasurePoints([latlng]);
          setMeasureCursor(latlng);
        } else {
          if (onObjectCreate) {
            const start = measurePoints[0];
            const end = latlng;
            onObjectCreate({
              type: 'measure',
              points: [
                { lat: start.lat, lon: start.lng },
                { lat: end.lat, lon: end.lng },
              ],
            });
          }
          clearMeasureDraft();
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
      measurePoints,
      objects,
      clearMeasureDraft,
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
        if (!pendingCursor.current) return;
        onCursorMove(pendingCursor.current);
        if (activeTool === 'measure' && measurePoints.length > 0) {
          setMeasureCursor(L.latLng(pendingCursor.current.lat, pendingCursor.current.lon));
        }
      });
    },
    [activeTool, measurePoints.length, onCursorMove],
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

    if (previousTool === 'measure' && measurePoints.length > 0) {
      clearMeasureDraft();
    }

    previousToolRef.current = activeTool;
  }, [activeTool, clearDrawing, clearMeasureDraft, completeDrawing, drawingPoints.length, measurePoints.length, toast]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }

      // Ignore shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        Boolean(target.closest('[contenteditable="true"], [role="textbox"]'))
      ) {
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
        } else if (activeTool === 'measure' && measurePoints.length > 0) {
          clearMeasureDraft();
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
    clearMeasureDraft,
    draftLanePickMode,
    drawingPoints.length,
    lanePickMode,
    measurePoints.length,
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
    const measures: Array<{
      obj: MapObject;
      points: [number, number][];
      midpoint: [number, number];
      distanceLabel: string;
    }> = [];

    for (const obj of objects) {
      if (!obj.visible || !obj.geometry) continue;

      if (obj.geometry.type === "route") {
        routes.push({ obj, points: obj.geometry.points.map(toTuple) });
      } else if (obj.geometry.type === "zone") {
        zones.push({ obj, points: obj.geometry.points.map(toTuple) });
      } else if (obj.geometry.type === "marker") {
        markers.push({ obj, point: toTuple(obj.geometry.point) });
      } else if (obj.geometry.type === 'measure') {
        const [a, b] = obj.geometry.points;
        const distance = haversineDistanceMeters(a.lat, a.lon, b.lat, b.lon);
        measures.push({
          obj,
          points: [toTuple(a), toTuple(b)],
          midpoint: [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2],
          distanceLabel: `${distance.toFixed(2)} м`,
        });
      }
    }

    return { routes, zones, markers, measures };
  }, [objects]);

  const zoneLaneColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const obj of objects) {
      if (obj.type !== 'zone') continue;
      const customLaneColor = typeof obj.laneColor === 'string' ? obj.laneColor.trim() : '';
      map.set(obj.id, customLaneColor || styles.lane.color);
    }
    return map;
  }, [objects, styles.lane.color]);

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

    const raw = drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng }));
    const pts = raw.length >= 3 ? toConvexZonePolygon(raw) : raw;
    const edges: Array<{ a: { lat: number; lon: number }; b: { lat: number; lon: number }; key: string }> = [];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      edges.push({ a: pts[i], b: pts[i + 1], key: `draft-edge-${i}` });
    }
    if (pts.length >= 3) {
      edges.push({ a: pts[pts.length - 1], b: pts[0], key: `draft-edge-close` });
    }
    return edges;
  }, [activeTool, draftLanePickMode, drawingPoints]);

  const draftZonePolygonPoints = useMemo(() => {
    if (activeTool !== 'zone') return [] as Array<[number, number]>;
    if (drawingPoints.length < 3) return drawingPoints.map((p) => [p.lat, p.lng] as [number, number]);
    return toConvexZonePolygon(drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng }))).map(
      (point) => [point.lat, point.lon] as [number, number],
    );
  }, [activeTool, drawingPoints]);

  const draftZonePreviewLanes = useMemo(() => {
    if (activeTool !== 'zone') return [];
    if (drawingPoints.length < 3) return [];

    const points = toConvexZonePolygon(drawingPoints.map((p) => ({ lat: p.lat, lon: p.lng })));
    if (points.length < 3) return [];

    const laneWidthM = Math.max(1, Number(draftZoneLaneWidth) || 5);
    const laneAngleDeg = parseLaneAngleInput(draftZoneLaneAngle, 0);

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
    } else if (geo.type === 'measure') {
      return;
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

  const tileSubdomains = platform.map.tileSubdomains();
  const tileSize = platform.map.tileSize();
  const baseMaxNativeZoom = platform.map.maxNativeZoom();
  const overlayTileLayerUrl = platform.map.overlayTileLayerUrl();
  const overlayTileLayerAttribution = platform.map.overlayTileLayerAttribution();
  const overlayMaxNativeZoom = platform.map.overlayMaxNativeZoom();
  const overlayMaxZoom = platform.map.overlayMaxZoom();
  const overlayTileSubdomains = platform.map.overlayTileSubdomains();
  const overlayTileSize = platform.map.overlayTileSize();
  const overlayDetectRetina = platform.map.overlayDetectRetina();
  const zoomSnap = platform.map.zoomSnap();
  const normalizedInitialZoom = normalizeZoomLevel(mapView?.zoom ?? 16, zoomSnap);

  return (
    <div className={cn(
      "w-full h-full relative",
      activeTool === 'select' && hoveredObjectId && "cursor-pointer",
      activeTool === 'select' && !hoveredObjectId && "cursor-default",
      (activeTool === 'route' || activeTool === 'zone' || activeTool === 'measure') && "cursor-crosshair",
      activeTool === 'marker' && "cursor-crosshair"
    )}>
      <MapContainer
        center={mapView ? [mapView.center_lat, mapView.center_lon] : followPosition}
        zoom={normalizedInitialZoom}
        maxZoom={platform.map.maxZoom()}
        preferCanvas={true}
        zoomSnap={zoomSnap}
        zoomDelta={platform.map.zoomDelta()}
        wheelPxPerZoomLevel={platform.map.wheelPxPerZoomLevel()}
        className="w-full h-full"
        ref={mapRef}
        doubleClickZoom={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        attributionControl={false}
      >
        {layers.basemap ? (
          <CachedTileLayer
            providerKey={platform.map.tileLayerUrl()}
            urlTemplate={platform.map.tileLayerUrl()}
            subdomains={tileSubdomains}
            tileSize={typeof tileSize === 'number' ? tileSize : 256}
            maxNativeZoom={baseMaxNativeZoom}
            zIndex={1}
          />
        ) : null}
        {layers.basemap && overlayTileLayerUrl && overlayTileLayerAttribution ? (
          <TileLayer
            url={overlayTileLayerUrl}
            attribution={overlayTileLayerAttribution}
            maxZoom={overlayMaxZoom ?? platform.map.maxZoom()}
            errorTileUrl={TRANSPARENT_TILE}
            {...(typeof overlayMaxNativeZoom === 'number' ? { maxNativeZoom: overlayMaxNativeZoom } : {})}
            {...(overlayTileSubdomains ? { subdomains: overlayTileSubdomains } : {})}
            {...(typeof overlayTileSize === 'number' ? { tileSize: overlayTileSize } : {})}
            {...(typeof overlayDetectRetina === 'boolean' ? { detectRetina: overlayDetectRetina } : {})}
          />
        ) : null}

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
          onMapBoundsChange={onMapBoundsChange}
          onMapContextMenu={() => {
            setObjectMenuState(null);
            setDrawingMenuState(null);
          }}
        />
        <SyncMapSizeWithLayout />

        <ApplyMapView mapView={mapView} isFollowing={isFollowing} />
        <CenterOnObjectRequest request={centerRequest} objects={objects} onMissingGeometry={handleMissingGeometry} />
        <FollowDiver position={followPosition} isFollowing={isFollowing} />

        {/* Track */}
        {layers.track &&
          trackSegments.map((segment, index) => (
            <Polyline
              key={`track-segment-${segment.trackId}-${index}`}
              positions={segment.points}
              pathOptions={{
                color: segment.color,
                weight: styles.track.width_px,
              }}
            />
          ))}

        <OverlayLayers rasterOverlays={rasterOverlays} vectorOverlays={vectorOverlays} />

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

        {/* Measures */}
        {layers.routes &&
          renderObjects.measures.flatMap(({ obj, points, midpoint, distanceLabel }) => [
            <Polyline
              key={`measure-line-${obj.id}`}
              positions={points}
              pathOptions={{
                color: getObjectColor(obj, styles),
                weight: selectedObjectId === obj.id ? 3 : 2,
                dashArray: '6 6',
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
            </Polyline>,
            <Marker
              key={`measure-label-${obj.id}`}
              position={midpoint}
              icon={segmentLengthIcon(distanceLabel)}
              interactive={false}
              zIndexOffset={850}
            />,
          ])}

        {/* Lanes (derived from zone) */}
        {layers.routes &&
          laneFeatures.map((lane) => {
            const parentAreaId = lane.properties.parent_area_id;
            const isParentSelected = selectedObjectId === parentAreaId;
            const isOutdated = Boolean(outdatedZoneIds[parentAreaId]);
            const laneColor = zoneLaneColorById.get(parentAreaId) ?? styles.lane.color;
            const lanePoints = lane.geometry.coordinates.map(
              ([lon, lat]) => [lat, lon] as [number, number],
            );

            return (
              <Polyline
                key={lane.properties.id}
                positions={lanePoints}
                pathOptions={{
                  color: laneColor,
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
                  color: zoneLaneColorById.get(overlay.zoneId) ?? styles.lane.color,
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

        {activeTool === 'measure' && measurePoints.length === 1 && measureCursor && (
          <Polyline
            positions={[
              [measurePoints[0].lat, measurePoints[0].lng],
              [measureCursor.lat, measureCursor.lng],
            ]}
            pathOptions={{
              color: '#f97316',
              weight: 2,
              dashArray: '6 6',
            }}
          />
        )}

        {drawingPoints.length > 2 && activeTool === "zone" && (
          <Polygon
            positions={draftZonePolygonPoints}
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

        {/* Measure start point marker */}
        {activeTool === 'measure' &&
          measurePoints.map((point, index) => (
            <Marker
              key={`measure-point-${index}`}
              position={[point.lat, point.lng]}
              icon={L.divIcon({
                className: 'measure-point',
                html: '<div class="w-2.5 h-2.5 bg-orange-500 rounded-full border border-background"></div>',
                iconSize: [10, 10],
                iconAnchor: [5, 5],
              })}
              interactive={false}
            />
          ))}

        {/* Diver */}
        {layers.diver &&
          showTelemetryObjects &&
          divers.map((diver, index) => {
            const position = getDiverPosition(diver, index);
            const course = getDiverCourse(diver, index);
            const isPinned = Boolean(followAgentId && diver.uid === followAgentId);
            return (
              <Marker
                key={diver.uid}
                position={position}
                icon={createDiverIcon(course, isPinned, diver.marker_color, diver.marker_size_px)}
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
            ...(contextObject && contextObject.type !== 'lane'
              ? [
                {
                  label: "Построить по координатам",
                  action: () => {
                    if (objectMenuState.objectId) {
                      onObjectDoubleClick(objectMenuState.objectId);
                    }
                  },
                },
              ]
              : []),
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
      {drawingMenuState && drawingPoints.length > 0 && (
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

      <ZoneDraftLanePanel
        open={activeTool === 'zone' && drawingPoints.length > 0}
        minimized={zoneDraftPanelMinimized}
        panelPosition={zoneDraftPanelPosition}
        iconPosition={zoneDraftPanelIconPosition}
        laneAngle={draftZoneLaneAngle}
        laneWidth={draftZoneLaneWidth}
        laneBearingDeg={draftZoneBearingDeg}
        laneStart={draftZoneStart}
        drawingPointsCount={drawingPoints.length}
        previewLanesCount={draftZonePreviewLanes.length}
        lanePickMode={draftLanePickMode}
        onDragStart={armMapClickSuppression}
        onPanelPositionChange={setZoneDraftPanelPosition}
        onIconPositionChange={setZoneDraftPanelIconPosition}
        onMinimizedChange={setZoneDraftPanelMinimized}
        onLaneAngleChange={setDraftZoneLaneAngle}
        onLaneWidthChange={setDraftZoneLaneWidth}
        onLanePickModeChange={setDraftLanePickMode}
        onCancelDraft={clearDrawing}
        onCompleteDraft={() => completeDrawing('zone')}
      />

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

      {activeTool === 'measure' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          {measurePoints.length === 0 ? 'Кликните начальную точку измерения' : 'Кликните конечную точку измерения'}
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
