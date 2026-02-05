import { useState, useEffect, useCallback } from 'react';
import { Tool, MapObject } from '@/pages/MapWorkspace';
import { cn } from '@/lib/utils';
import { User, Anchor, AlertTriangle } from 'lucide-react';

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);

  // Convert pixel to lat/lon (simplified mock)
  const pixelToLatLon = useCallback((x: number, y: number) => {
    const baseLat = 59.934;
    const baseLon = 30.335;
    return {
      lat: baseLat + (300 - y) * 0.00001,
      lon: baseLon + (x - 400) * 0.00001,
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    onCursorMove(pixelToLatLon(x, y));
  };

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'route' || activeTool === 'zone') {
      setDrawingPoints(prev => [...prev, { x, y }]);
    } else if (activeTool === 'marker') {
      // Would create marker here
      setDrawingPoints([{ x, y }]);
    } else if (activeTool === 'select') {
      onObjectSelect(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (activeTool === 'route' || activeTool === 'zone') {
      // Finish drawing
      setDrawingPoints([]);
    }
  };

  // Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawingPoints([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mock objects positions
  const mockObjects = [
    { id: '1', type: 'route', points: [{ x: 200, y: 200 }, { x: 350, y: 250 }, { x: 500, y: 180 }] },
    { id: '2', type: 'zone', points: [{ x: 450, y: 350 }, { x: 550, y: 350 }, { x: 550, y: 450 }, { x: 450, y: 450 }] },
    { id: '3', type: 'marker', points: [{ x: 300, y: 400 }] },
  ];

  return (
    <div
      className="map-container w-full h-full cursor-crosshair"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Grid */}
        {layers.grid && (
          <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 50} x2="100%" y2={i * 50} />
            ))}
            {Array.from({ length: 30 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="100%" />
            ))}
          </g>
        )}

        {/* Routes */}
        {layers.routes && mockObjects.filter(o => o.type === 'route').map(obj => (
          <g key={obj.id}>
            <polyline
              points={obj.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={selectedObjectId === obj.id ? 'hsl(199, 89%, 60%)' : 'hsl(199, 89%, 48%)'}
              strokeWidth={selectedObjectId === obj.id ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onObjectSelect(obj.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onObjectDoubleClick(obj.id);
              }}
            />
            {obj.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="hsl(199, 89%, 48%)"
                stroke="hsl(220, 15%, 13%)"
                strokeWidth={2}
              />
            ))}
          </g>
        ))}

        {/* Zones */}
        {layers.routes && mockObjects.filter(o => o.type === 'zone').map(obj => (
          <g key={obj.id}>
            <polygon
              points={obj.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill={selectedObjectId === obj.id ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.1)'}
              stroke={selectedObjectId === obj.id ? 'hsl(38, 92%, 60%)' : 'hsl(38, 92%, 50%)'}
              strokeWidth={selectedObjectId === obj.id ? 2 : 1}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onObjectSelect(obj.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onObjectDoubleClick(obj.id);
              }}
            />
            {/* Lanes */}
            {[1, 2, 3].map(i => (
              <line
                key={i}
                x1={450}
                y1={350 + i * 25}
                x2={550}
                y2={350 + i * 25}
                stroke="hsl(38, 92%, 50%)"
                strokeWidth={1}
                strokeDasharray="5,3"
              />
            ))}
          </g>
        ))}

        {/* Markers */}
        {layers.markers && mockObjects.filter(o => o.type === 'marker').map(obj => (
          <g
            key={obj.id}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onObjectSelect(obj.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onObjectDoubleClick(obj.id);
            }}
          >
            <circle
              cx={obj.points[0].x}
              cy={obj.points[0].y}
              r={selectedObjectId === obj.id ? 10 : 8}
              fill={selectedObjectId === obj.id ? 'hsl(142, 71%, 55%)' : 'hsl(142, 71%, 45%)'}
              stroke="hsl(220, 15%, 13%)"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Track */}
        {layers.track && (
          <polyline
            points="100,300 150,280 200,290 250,270 300,285 350,260 400,280"
            fill="none"
            stroke="hsl(280, 70%, 60%)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Drawing preview */}
        {drawingPoints.length > 0 && (
          <g>
            {activeTool === 'route' && (
              <polyline
                points={drawingPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="hsl(199, 89%, 48%)"
                strokeWidth={2}
                strokeDasharray="5,5"
              />
            )}
            {activeTool === 'zone' && drawingPoints.length > 2 && (
              <polygon
                points={drawingPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(251, 191, 36, 0.1)"
                stroke="hsl(38, 92%, 50%)"
                strokeWidth={1}
                strokeDasharray="5,5"
              />
            )}
            {drawingPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="white"
                stroke="hsl(220, 15%, 13%)"
                strokeWidth={2}
              />
            ))}
          </g>
        )}

        {/* Diver */}
        {layers.diver && (
          <g transform={`translate(400, 300)`}>
            <circle
              r={isFollowing ? 18 : 14}
              fill="hsl(199, 89%, 48%)"
              stroke="white"
              strokeWidth={2}
              className={isFollowing ? 'animate-pulse' : ''}
            />
            <g transform={`rotate(${diverData.course})`}>
              <polygon
                points="0,-8 5,6 -5,6"
                fill="white"
              />
            </g>
          </g>
        )}

        {/* Base station */}
        <g transform="translate(150, 150)">
          <rect x="-10" y="-10" width="20" height="20" fill="hsl(220, 15%, 25%)" stroke="white" strokeWidth={1} />
          <text x="0" y="4" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">B</text>
        </g>
      </svg>

      {/* Connection timeout warning */}
      {connectionStatus !== 'ok' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          Нет данных от УКБ
        </div>
      )}

      {/* Scale bar */}
      {layers.scaleBar && (
        <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm border border-border rounded px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-foreground" />
            <span className="text-xs font-mono">100 м</span>
          </div>
        </div>
      )}

      {/* Drawing hint */}
      {(activeTool === 'route' || activeTool === 'zone') && drawingPoints.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          {activeTool === 'route' && 'Двойной клик для завершения маршрута'}
          {activeTool === 'zone' && 'Двойной клик для завершения зоны'}
        </div>
      )}

      {activeTool === 'marker' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded px-4 py-2 text-sm">
          Кликните для установки маркера
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
