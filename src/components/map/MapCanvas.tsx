import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Tool, MapObject } from '@/pages/MapWorkspace';
import { AlertTriangle } from 'lucide-react';

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
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
  isFollowing: boolean;
  connectionStatus: 'ok' | 'timeout' | 'error';
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  onObjectSelect: (id: string | null) => void;
  onObjectDoubleClick: (id: string) => void;
}

// Custom diver icon
const createDiverIcon = (course: number, isFollowing: boolean) => {
  return L.divIcon({
    className: 'diver-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="w-8 h-8 rounded-full bg-primary border-2 border-white flex items-center justify-center ${isFollowing ? 'animate-pulse' : ''}">
          <svg class="w-4 h-4 text-white" style="transform: rotate(${course}deg)" viewBox="0 0 24 24" fill="currentColor">
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
  className: 'base-station-marker',
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
    className: 'custom-marker',
    html: `
      <div class="w-4 h-4 rounded-full ${isSelected ? 'bg-green-400 scale-125' : 'bg-green-500'} border-2 border-background"></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

// Map events handler component
const MapEvents = ({ 
  onCursorMove, 
  activeTool, 
  onMapClick 
}: { 
  onCursorMove: (pos: { lat: number; lon: number }) => void;
  activeTool: Tool;
  onMapClick: (latlng: L.LatLng) => void;
}) => {
  useMapEvents({
    mousemove: (e) => {
      onCursorMove({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

// Follow diver component
const FollowDiver = ({ 
  position, 
  isFollowing 
}: { 
  position: [number, number]; 
  isFollowing: boolean;
}) => {
  const map = useMap();
  
  useEffect(() => {
    if (isFollowing) {
      map.setView(position, map.getZoom());
    }
  }, [position, isFollowing, map]);
  
  return null;
};

const MapCanvas = ({
  activeTool,
  layers,
  objects,
  selectedObjectId,
  diverData,
  isFollowing,
  connectionStatus,
  onCursorMove,
  onObjectSelect,
  onObjectDoubleClick,
}: MapCanvasProps) => {
  const [drawingPoints, setDrawingPoints] = useState<L.LatLng[]>([]);
  const mapRef = useRef<L.Map | null>(null);

  const diverPosition: [number, number] = [diverData.lat, diverData.lon];
  const baseStationPosition: [number, number] = [59.935, 30.333];

  // Mock object positions (in lat/lng)
  const mockObjects = {
    route: {
      id: '1',
      positions: [[59.9345, 30.332], [59.9350, 30.336], [59.9355, 30.340]] as [number, number][],
    },
    zone: {
      id: '2',
      positions: [[59.9330, 30.337], [59.9330, 30.342], [59.9320, 30.342], [59.9320, 30.337]] as [number, number][],
    },
    marker: {
      id: '3',
      position: [59.9325, 30.334] as [number, number],
    },
  };

  // Mock track
  const trackPositions: [number, number][] = [
    [59.9340, 30.330],
    [59.9342, 30.332],
    [59.9344, 30.333],
    [59.9346, 30.334],
    [59.9345, 30.336],
    [59.9343, 30.335],
  ];

  const handleMapClick = (latlng: L.LatLng) => {
    if (activeTool === 'route' || activeTool === 'zone') {
      setDrawingPoints(prev => [...prev, latlng]);
    } else if (activeTool === 'marker') {
      setDrawingPoints([latlng]);
    } else if (activeTool === 'select') {
      onObjectSelect(null);
    }
  };

  // Escape to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawingPoints([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Double click to finish drawing
  useEffect(() => {
    const handleDoubleClick = () => {
      if ((activeTool === 'route' || activeTool === 'zone') && drawingPoints.length > 1) {
        // Here you would save the object
        setDrawingPoints([]);
      }
    };

    const map = mapRef.current;
    if (map) {
      map.on('dblclick', handleDoubleClick);
      return () => {
        map.off('dblclick', handleDoubleClick);
      };
    }
  }, [activeTool, drawingPoints]);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={diverPosition}
        zoom={16}
        className="w-full h-full"
        ref={mapRef}
        doubleClickZoom={false}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEvents 
          onCursorMove={onCursorMove} 
          activeTool={activeTool}
          onMapClick={handleMapClick}
        />
        
        <FollowDiver position={diverPosition} isFollowing={isFollowing} />

        {/* Track */}
        {layers.track && (
          <Polyline
            positions={trackPositions}
            pathOptions={{
              color: 'hsl(280, 70%, 60%)',
              weight: 3,
            }}
          />
        )}

        {/* Routes */}
        {layers.routes && (
          <Polyline
            positions={mockObjects.route.positions}
            pathOptions={{
              color: selectedObjectId === mockObjects.route.id ? 'hsl(199, 89%, 60%)' : 'hsl(199, 89%, 48%)',
              weight: selectedObjectId === mockObjects.route.id ? 4 : 3,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectSelect(mockObjects.route.id);
              },
              dblclick: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectDoubleClick(mockObjects.route.id);
              },
            }}
          />
        )}

        {/* Zone */}
        {layers.routes && (
          <Polygon
            positions={mockObjects.zone.positions}
            pathOptions={{
              color: selectedObjectId === mockObjects.zone.id ? 'hsl(38, 92%, 60%)' : 'hsl(38, 92%, 50%)',
              fillColor: 'hsl(38, 92%, 50%)',
              fillOpacity: selectedObjectId === mockObjects.zone.id ? 0.3 : 0.15,
              weight: selectedObjectId === mockObjects.zone.id ? 3 : 2,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectSelect(mockObjects.zone.id);
              },
              dblclick: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectDoubleClick(mockObjects.zone.id);
              },
            }}
          />
        )}

        {/* Markers */}
        {layers.markers && (
          <Marker
            position={mockObjects.marker.position}
            icon={createMarkerIcon(selectedObjectId === mockObjects.marker.id)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectSelect(mockObjects.marker.id);
              },
              dblclick: (e) => {
                L.DomEvent.stopPropagation(e);
                onObjectDoubleClick(mockObjects.marker.id);
              },
            }}
          />
        )}

        {/* Drawing preview */}
        {drawingPoints.length > 0 && activeTool === 'route' && (
          <Polyline
            positions={drawingPoints.map(p => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: 'hsl(199, 89%, 48%)',
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        )}

        {drawingPoints.length > 2 && activeTool === 'zone' && (
          <Polygon
            positions={drawingPoints.map(p => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: 'hsl(38, 92%, 50%)',
              fillColor: 'hsl(38, 92%, 50%)',
              fillOpacity: 0.15,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        )}

        {/* Drawing points markers */}
        {drawingPoints.map((point, i) => (
          <Marker
            key={i}
            position={[point.lat, point.lng]}
            icon={L.divIcon({
              className: 'drawing-point',
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
