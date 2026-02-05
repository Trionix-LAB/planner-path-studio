import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle } from "lucide-react";

import type { MapObject, Tool } from "@/features/map/model/types";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { platform } from "@/platform";

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
  layers: {
    track: boolean;
    routes: boolean;
    markers: boolean;
    grid: boolean;
    scaleBar: boolean;
    diver: boolean;
  };
  objects: MapObject[];
  selectedObjectId: string | null;
  diverData: {
    lat: number;
    lon: number;
    speed: number;
    course: number;
    depth: number;
  };
  trackSegments: Array<Array<[number, number]>>;
  isFollowing: boolean;
  connectionStatus: 'ok' | 'timeout' | 'error';
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onObjectSelect: (id: string | null) => void;
  onObjectDoubleClick: (id: string) => void;
  onMapDrag: () => void;
}

// Custom diver icon
const createDiverIcon = (course: number, isFollowing: boolean) => {
  return L.divIcon({
    className: "diver-marker",
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-8 h-8 rounded-full bg-primary border-2 border-white flex items-center justify-center ${isFollowing ? "animate-pulse" : ""}">
          <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor" transform="rotate(${course} 12 12)">
            <path d="M12 2L8 12H16L12 2Z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Custom base station icon
const baseStationIcon = L.divIcon({
  className: "base-station-marker",
  html: `
    <div class="w-6 h-6 bg-muted border border-white flex items-center justify-center text-white text-xs font-bold">
      B
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Custom marker icon
const createMarkerIcon = (isSelected: boolean) => {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="w-4 h-4 rounded-full ${isSelected ? "bg-green-400 scale-125" : "bg-green-500"} border-2 border-background"></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

// Map events handler component
const MapEvents = ({
  onCursorMove,
  onMapClick,
  onMapDrag,
}: {
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onMapClick: (latlng: L.LatLng) => void;
  onMapDrag: () => void;
}) => {
  useMapEvents({
    mousemove: (e) => {
      onCursorMove({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
    click: (e) => {
      onMapClick(e.latlng);
    },
    dragstart: () => {
      onMapDrag();
    },
  });
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

const toTuple = (p: { lat: number; lon: number }): [number, number] => [p.lat, p.lon];

const MapCanvas = ({
  activeTool,
  layers,
  objects,
  selectedObjectId,
  diverData,
  trackSegments,
  isFollowing,
  connectionStatus,
  onCursorMove,
  onObjectSelect,
  onObjectDoubleClick,
  onMapDrag,
}: MapCanvasProps) => {
  const [drawingPoints, setDrawingPoints] = useState<L.LatLng[]>([]);
  const mapRef = useRef<L.Map | null>(null);

  const pendingCursor = useRef<{ lat: number; lon: number } | null>(null);
  const cursorRaf = useRef<number | null>(null);

  const diverPosition: [number, number] = [diverData.lat, diverData.lon];
  const baseStationPosition: [number, number] = [59.935, 30.333];

  const handleMapClick = useCallback(
    (latlng: L.LatLng) => {
      if (activeTool === "route" || activeTool === "zone") {
        setDrawingPoints((prev) => [...prev, latlng]);
      } else if (activeTool === "marker") {
      setDrawingPoints([latlng]);
      } else if (activeTool === "select") {
        onObjectSelect(null);
      }
    },
    [activeTool, onObjectSelect],
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
    };
  }, []);

  // Escape to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawingPoints([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Double click to finish drawing
  useEffect(() => {
    const handleDoubleClick = () => {
      if ((activeTool === "route" || activeTool === "zone") && drawingPoints.length > 1) {
        // Here you would save the object
        setDrawingPoints([]);
      }
    };

    const map = mapRef.current;
    if (map) {
      map.on("dblclick", handleDoubleClick);
      return () => {
        map.off("dblclick", handleDoubleClick);
      };
    }
  }, [activeTool, drawingPoints]);

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

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={diverPosition}
        zoom={16}
        className="w-full h-full"
        ref={mapRef}
        doubleClickZoom={false}
      >
        <TileLayer
          attribution={platform.map.tileLayerAttribution()}
          url={platform.map.tileLayerUrl()}
        />

        <MapEvents
          onCursorMove={onCursorMoveThrottled}
          onMapClick={handleMapClick}
          onMapDrag={onMapDrag}
        />

        <FollowDiver position={diverPosition} isFollowing={isFollowing} />

        {/* Track */}
        {layers.track &&
          trackSegments.map((segment, index) => (
            <Polyline
              key={`track-segment-${index}`}
              positions={segment}
              pathOptions={{
                color: 'hsl(280, 70%, 60%)',
                weight: 3,
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
                color: selectedObjectId === obj.id ? "hsl(199, 89%, 60%)" : "hsl(199, 89%, 48%)",
                weight: selectedObjectId === obj.id ? 4 : 3,
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
              }}
            />
          ))}

        {/* Zone */}
        {layers.routes &&
          renderObjects.zones.map(({ obj, points }) => (
            <Polygon
              key={obj.id}
              positions={points}
              pathOptions={{
                color: selectedObjectId === obj.id ? "hsl(38, 92%, 60%)" : "hsl(38, 92%, 50%)",
                fillColor: "hsl(38, 92%, 50%)",
                fillOpacity: selectedObjectId === obj.id ? 0.3 : 0.15,
                weight: selectedObjectId === obj.id ? 3 : 2,
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
              }}
            />
          ))}

        {/* Markers */}
        {layers.markers &&
          renderObjects.markers.map(({ obj, point }) => (
            <Marker
              key={obj.id}
              position={point}
              icon={createMarkerIcon(selectedObjectId === obj.id)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectSelect(obj.id);
                },
                dblclick: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onObjectDoubleClick(obj.id);
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
        {layers.diver && (
          <Marker
            position={diverPosition}
            icon={createDiverIcon(diverData.course, isFollowing)}
          />
        )}

        {/* Base station */}
        <Marker
          position={baseStationPosition}
          icon={baseStationIcon}
        />
      </MapContainer>

      {/* Connection timeout warning */}
      {connectionStatus !== 'ok' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          Нет данных от УКБ
        </div>
      )}

      {/* Scale bar */}
      {layers.scaleBar && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-card/80 backdrop-blur-sm border border-border rounded px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-foreground" />
            <span className="text-xs font-mono">100 м</span>
          </div>
        </div>
      )}

      {/* Drawing hint */}
      {(activeTool === 'route' || activeTool === 'zone') && drawingPoints.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          {activeTool === 'route' && 'Двойной клик для завершения маршрута'}
          {activeTool === 'zone' && 'Двойной клик для завершения зоны'}
        </div>
      )}

      {activeTool === 'marker' && drawingPoints.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          Кликните для установки маркера
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
