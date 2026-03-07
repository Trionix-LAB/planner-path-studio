import { useEffect, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import { computeScaleFromMap } from './scaleUtils';
import { boundsToUtm, buildUtmGridLines, type GridLine } from './gridUtils';

interface GridLayerProps {
  visible: boolean;
  step?: number;
  color?: string;
  widthPx?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export const GridLayer = ({ visible, step, color, widthPx, lineStyle }: GridLayerProps) => {
  const map = useMap();
  const [gridLines, setGridLines] = useState<GridLine[]>([]);

  useEffect(() => {
    if (!visible) {
      setGridLines([]);
      return;
    }

    const updateGrid = () => {
      const bounds = map.getBounds();
      const center = bounds.getCenter();
      const currentStep = step ?? computeScaleFromMap(map).distanceM;
      if (!Number.isFinite(currentStep) || currentStep <= 0) {
        setGridLines([]);
        return;
      }

      const corners = [
        { lat: bounds.getNorth(), lon: bounds.getWest() },
        { lat: bounds.getNorth(), lon: bounds.getEast() },
        { lat: bounds.getSouth(), lon: bounds.getWest() },
        { lat: bounds.getSouth(), lon: bounds.getEast() },
      ];
      const utmBounds = boundsToUtm(center.lat, center.lng, corners);
      if (!utmBounds) {
        setGridLines([]);
        return;
      }

      setGridLines(buildUtmGridLines(utmBounds, currentStep));
    };

    updateGrid();

    map.on('moveend', updateGrid);
    map.on('zoomend', updateGrid);

    return () => {
      map.off('moveend', updateGrid);
      map.off('zoomend', updateGrid);
    };
  }, [map, visible, step]);

  if (!visible || gridLines.length === 0) return null;

  const dashArray =
    lineStyle === 'solid' ? undefined :
    lineStyle === 'dotted' ? '2 6' :
    '6 6';

  return (
    <>
      {gridLines.map((line, index) => (
        <Polyline
          key={`grid-${index}`}
          positions={line}
          pathOptions={{
            color: color ?? '#64748b',
            weight: widthPx ?? 1,
            dashArray,
            opacity: 0.55,
          }}
          interactive={false}
        />
      ))}
    </>
  );
};
