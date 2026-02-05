import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopToolbar from '@/components/map/TopToolbar';
import RightPanel from '@/components/map/RightPanel';
import LeftPanel from '@/components/map/LeftPanel';
import StatusBar from '@/components/map/StatusBar';
import MapCanvas from '@/components/map/MapCanvas';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import ExportDialog from '@/components/dialogs/ExportDialog';
import SettingsDialog from '@/components/dialogs/SettingsDialog';
import ObjectPropertiesDialog from '@/components/dialogs/ObjectPropertiesDialog';

export type Tool = 'select' | 'route' | 'zone' | 'marker';
export type MapObject = {
  id: string;
  type: 'route' | 'zone' | 'marker' | 'lane';
  name: string;
  visible: boolean;
};

const MapWorkspace = () => {
  const navigate = useNavigate();
  
  // Mission state
  const [missionName, setMissionName] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  
  // Tools state
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isFollowing, setIsFollowing] = useState(true);
  
  // Track state
  const [trackStatus, setTrackStatus] = useState<'recording' | 'paused' | 'stopped'>('recording');
  const [trackId, setTrackId] = useState(1);
  
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<'ok' | 'timeout' | 'error'>('ok');
  const [lastDataTime, setLastDataTime] = useState(Date.now());
  
  // Diver data (mock)
  const [diverData, setDiverData] = useState({
    lat: 59.934280,
    lon: 30.335099,
    speed: 0.8,
    course: 45,
    depth: 12.5,
  });
  
  // Layers state
  const [layers, setLayers] = useState({
    track: true,
    routes: true,
    markers: true,
    grid: true,
    scaleBar: true,
    diver: true,
  });
  
  // Objects
  const [objects, setObjects] = useState<MapObject[]>([
    { id: '1', type: 'route', name: 'Маршрут 1', visible: true },
    { id: '2', type: 'zone', name: 'Зона обследования A', visible: true },
    { id: '3', type: 'marker', name: 'Точка интереса', visible: true },
  ]);
  
  // Selected object
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  
  // Dialogs
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [showOpenMission, setShowOpenMission] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showObjectProperties, setShowObjectProperties] = useState(false);
  
  // Cursor position
  const [cursorPosition, setCursorPosition] = useState({ lat: 59.934, lon: 30.335 });
  const [mapScale, setMapScale] = useState('1:5000');

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
  };

  const handleLayerToggle = (layer: keyof typeof layers) => {
    if (layer === 'diver') return; // Слой водолаза не отключается
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleTrackAction = (action: 'pause' | 'resume' | 'stop') => {
    if (action === 'pause') setTrackStatus('paused');
    else if (action === 'resume') setTrackStatus('recording');
    else if (action === 'stop') {
      setTrackStatus('stopped');
      setTrackId(prev => prev + 1);
    }
  };

  const handleObjectSelect = (id: string | null) => {
    setSelectedObjectId(id);
  };

  const handleObjectDoubleClick = (id: string) => {
    setSelectedObjectId(id);
    setShowObjectProperties(true);
  };

  const handleDeleteObject = () => {
    if (selectedObjectId) {
      setObjects(prev => prev.filter(obj => obj.id !== selectedObjectId));
      setSelectedObjectId(null);
    }
  };

  const handleCreateMission = (name: string, path: string) => {
    setMissionName(name);
    setIsDraft(false);
    setShowCreateMission(false);
  };

  const handleOpenMission = (path: string) => {
    setMissionName(path.split('/').pop() || 'Миссия');
    setIsDraft(false);
    setShowOpenMission(false);
  };

  const handleBackToStart = () => {
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Toolbar */}
      <TopToolbar
        missionName={missionName}
        isDraft={isDraft}
        autoSaveStatus={autoSaveStatus}
        activeTool={activeTool}
        trackStatus={trackStatus}
        isFollowing={isFollowing}
        onToolChange={handleToolChange}
        onTrackAction={handleTrackAction}
        onFollowToggle={() => setIsFollowing(!isFollowing)}
        onOpenCreate={() => setShowCreateMission(true)}
        onOpenOpen={() => setShowOpenMission(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSettings={() => setShowSettings(true)}
        onBackToStart={handleBackToStart}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Layers & Tracks */}
        <LeftPanel
          layers={layers}
          onLayerToggle={handleLayerToggle}
        />
        
        {/* Map Area */}
        <div className="flex-1 relative">
          <MapCanvas
            activeTool={activeTool}
            layers={layers}
            objects={objects}
            selectedObjectId={selectedObjectId}
            diverData={diverData}
            isFollowing={isFollowing}
            connectionStatus={connectionStatus}
            onCursorMove={setCursorPosition}
            onObjectSelect={handleObjectSelect}
            onObjectDoubleClick={handleObjectDoubleClick}
          />
        </div>
        
        {/* Right Panel - HUD & Status */}
        <RightPanel
          diverData={diverData}
          connectionStatus={connectionStatus}
          trackStatus={trackStatus}
          trackId={trackId}
          objects={objects}
          selectedObjectId={selectedObjectId}
          onObjectSelect={handleObjectSelect}
        />
      </div>
      
      {/* Status Bar */}
      <StatusBar
        cursorPosition={cursorPosition}
        scale={mapScale}
        activeTool={activeTool}
      />
      
      {/* Dialogs */}
      <CreateMissionDialog
        open={showCreateMission}
        onOpenChange={setShowCreateMission}
        onConfirm={handleCreateMission}
      />
      
      <OpenMissionDialog
        open={showOpenMission}
        onOpenChange={setShowOpenMission}
        onConfirm={handleOpenMission}
      />
      
      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
      />
      
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
      />
      
      {selectedObjectId && (
        <ObjectPropertiesDialog
          open={showObjectProperties}
          onOpenChange={setShowObjectProperties}
          object={objects.find(o => o.id === selectedObjectId)}
          onSave={(updates) => {
            setObjects(prev => prev.map(obj => 
              obj.id === selectedObjectId ? { ...obj, ...updates } : obj
            ));
            setShowObjectProperties(false);
          }}
        />
      )}
    </div>
  );
};

export default MapWorkspace;
