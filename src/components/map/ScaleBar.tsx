import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { DEFAULT_MAP_SCALE, computeScaleFromMap } from './scaleUtils';

export const ScaleBar = () => {
  const map = useMap();
  const [scale, setScale] = useState(DEFAULT_MAP_SCALE);

  useEffect(() => {
    const updateScale = () => {
      setScale(computeScaleFromMap(map));
    };

    updateScale();

    map.on('zoomend', updateScale);
    map.on('moveend', updateScale);

    return () => {
      map.off('zoomend', updateScale);
      map.off('moveend', updateScale);
    };
  }, [map]);

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-card/80 backdrop-blur-sm border border-border rounded px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="h-1 bg-foreground" style={{ width: `${scale.widthPx}px` }} />
        <span className="text-xs font-mono whitespace-nowrap">{scale.label}</span>
      </div>
    </div>
  );
};
