import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle } from "lucide-react";

import type { MapObject, MapObjectGeometry, Tool } from "@/features/map/model/types";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { platform } from "@/platform";
import { MapContextMenu } from "./MapContextMenu";
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
  onObjectCreate?: (geometry: MapObjectGeometry, options?: { preserveActiveTool?: boolean }) => void;
  onObjectUpdate?: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete?: (id: string) => void;
  onRegenerateLanes?: (id: string) => void;
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
  html: '<div class="w-3 h-3 bg-white border border-primary rounded-full cursor-grab hover:bg-primary/20"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Virtual vertex handle icon (ghost)
const virtualHandleIcon = L.divIcon({
  className: "virtual-handle",
  html: '<div class="w-2 h-2 bg-primary/50 border border-white rounded-full cursor-pointer hover:bg-primary"></div>',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

// Map events handler component
const MapEvents = ({
  onCursorMove,
  onMapClick,
  onMapDrag,
  onMapContextMenu,
}: {
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onMapClick: (e: L.LeafletMouseEvent) => void;
  onMapDrag: () => void;
  onMapContextMenu: (e: L.LeafletMouseEvent) => void;
}) => {
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
const getObjectColor = (obj: MapObject): string => {
  if (obj.color) return obj.color;
  if (obj.type === 'zone') return 'hsl(38, 92%, 50%)';
  if (obj.type === 'marker') return 'hsl(142, 71%, 45%)';
  return 'hsl(199, 89%, 48%)';
};

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
  onObjectCreate,
  onObjectUpdate,
  onObjectDelete,
  onRegenerateLanes,
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

  const mapRef = useRef<L.Map | null>(null);
  const previousToolRef = useRef<Tool>(activeTool);

  const pendingCursor = useRef<{ lat: number; lon: number } | null>(null);
  const cursorRaf = useRef<number | null>(null);

  const diverPosition: [number, number] = [diverData.lat, diverData.lon];
  const baseStationPosition: [number, number] = [59.935, 30.333];
  const { toast } = useToast();

  const clearDrawing = useCallback(() => {
    setDrawingPoints([]);
    setDrawingMenuState(null);
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

      onObjectCreate?.(
        {
          type: draftType,
          points: drawingPoints.map((point) => ({ lat: point.lat, lon: point.lng })),
        },
        { preserveActiveTool: options?.preserveActiveTool },
      );
      clearDrawing();
      return true;
    },
    [clearDrawing, drawingPoints, onObjectCreate, toast],
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      setObjectMenuState(null);
      const latlng = e.latlng;
      if (activeTool === "route" || activeTool === "zone") {
        setDrawingPoints((prev) => [...prev, latlng]);
        setDrawingMenuState({
          position: { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
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
    [activeTool, onObjectSelect, onObjectCreate],
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
  }, [clearDrawing, drawingPoints.length, selectedObjectId, onObjectSelect, onObjectDelete]);

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
      (activeTool === 'route' || activeTool === 'zone') && "cursor-crosshair",
      activeTool === 'marker' && "cursor-crosshair"
    )}>
      <MapContainer
        center={diverPosition}
        zoom={16}
        className="w-full h-full"
        ref={mapRef}
        doubleClickZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url={platform.map.tileLayerUrl()}
        />

        <MapEvents
          onCursorMove={onCursorMoveThrottled}
          onMapClick={handleMapClick}
          onMapDrag={onMapDrag}
          onMapContextMenu={() => {
            setObjectMenuState(null);
            setDrawingMenuState(null);
          }}
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
                color: getObjectColor(obj),
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
                contextmenu: (e) => handleObjectContextMenu(e, obj.id),
              }}
            >
              <Tooltip sticky>{obj.name}</Tooltip>
            </Polyline>
          ))}

        {/* Zone */}
        {layers.routes &&
          renderObjects.zones.map(({ obj, points }) => (
            <Polygon
              key={obj.id}
              positions={points}
              pathOptions={{
                color: getObjectColor(obj),
                fillColor: getObjectColor(obj),
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
                contextmenu: (e) => handleObjectContextMenu(e, obj.id),
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
              icon={createMarkerIcon(getObjectColor(obj), selectedObjectId === obj.id)}
              draggable={activeTool === 'select' && selectedObjectId === obj.id}
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
                dragend: (e) => {
                  if (onObjectUpdate) {
                    const m = e.target;
                    const pos = m.getLatLng();
                    onObjectUpdate(obj.id, {
                      geometry: { type: 'marker', point: { lat: pos.lat, lon: pos.lng } },
                    });
                  }
                }
              }}
            >
              <Tooltip sticky>{obj.name}</Tooltip>
            </Marker>
          ))}

        {/* Editing Handles */}
        {renderEditingHandles()}

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
            ...(objects.find((o) => o.id === objectMenuState.objectId)?.type === 'zone'
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
              label: drawingMenuState.draftType === 'route' ? 'Завершить маршрут' : 'Завершить галс',
              action: () => {
                completeDrawing(drawingMenuState.draftType);
              },
            },
            {
              label: drawingMenuState.draftType === 'route' ? 'Удалить маршрут' : 'Удалить галс',
              action: () => {
                clearDrawing();
              },
              variant: 'destructive',
            },
          ]}
        />
      )}

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
          {activeTool === 'route' && 'Кликайте по карте и завершайте через меню у последней точки'}
          {activeTool === 'zone' && 'Кликайте по карте и завершайте через меню у последней точки'}
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
