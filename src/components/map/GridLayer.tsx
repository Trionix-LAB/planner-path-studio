import { useEffect, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import { computeScaleFromMap } from './scaleUtils';

interface GridLayerProps {
  visible: boolean;
  step?: number;
  color?: string;
  widthPx?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

const EARTH_RADIUS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function metersToDegrees(meters: number, lat: number): { dLat: number; dLon: number } {
  const dLat = meters / EARTH_RADIUS * RAD_TO_DEG;
  const dLon = meters / (EARTH_RADIUS * Math.cos(lat * DEG_TO_RAD)) * RAD_TO_DEG;
  return { dLat, dLon };
}

function snapToGrid(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

export const GridLayer = ({ visible, step, color, widthPx, lineStyle }: GridLayerProps) => {
  const map = useMap();
  const [gridLines, setGridLines] = useState<Array<[[number, number], [number, number]]>>([]);

  useEffect(() => {
    if (!visible) {
      setGridLines([]);
      return;
    }

    const updateGrid = () => {
      const bounds = map.getBounds();
      const center = bounds.getCenter();
      const currentStep = step ?? computeScaleFromMap(map).distanceM;

      const { dLat, dLon } = metersToDegrees(currentStep, center.lat);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLon) || dLat <= 0 || dLon <= 0) {
        setGridLines([]);
        return;
      }

      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const paddingLat = dLat * 2;
      const paddingLon = dLon * 2;

      const startLat = snapToGrid(south - paddingLat, dLat);
      const endLat = north + paddingLat;
      const startLon = snapToGrid(west - paddingLon, dLon);
      const endLon = east + paddingLon;

      const lines: Array<[[number, number], [number, number]]> = [];

      for (let lat = startLat; lat <= endLat; lat += dLat) {
        lines.push([[lat, west], [lat, east]]);
      }

      for (let lon = startLon; lon <= endLon; lon += dLon) {
        lines.push([[south, lon], [north, lon]]);
      }

      setGridLines(lines);
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
