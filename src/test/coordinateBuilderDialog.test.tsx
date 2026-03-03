import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CoordinateBuilderDialog from '@/components/dialogs/CoordinateBuilderDialog';
import { convertPoint } from '@/features/geo/crs';

describe('CoordinateBuilderDialog', () => {
  it('builds route geometry in WGS84 from selected CRS input', () => {
    const onBuild = vi.fn();
    const onOpenChange = vi.fn();

    const wgsPoint1 = { lat: 59.93428, lon: 30.33509 };
    const wgsPoint2 = { lat: 59.935, lon: 30.336 };
    const sk42Point1 = convertPoint(wgsPoint1, 'wgs84', 'sk42');
    const sk42Point2 = convertPoint(wgsPoint2, 'wgs84', 'sk42');

    render(
      <CoordinateBuilderDialog
        open
        objectType="route"
        inputCrs="sk42"
        onOpenChange={onOpenChange}
        onBuild={onBuild}
      />,
    );

    fireEvent.change(screen.getByLabelText('Широта 1'), { target: { value: sk42Point1.lat.toFixed(6) } });
    fireEvent.change(screen.getByLabelText('Долгота 1'), { target: { value: sk42Point1.lon.toFixed(6) } });
    fireEvent.change(screen.getByLabelText('Широта 2'), { target: { value: sk42Point2.lat.toFixed(6) } });
    fireEvent.change(screen.getByLabelText('Долгота 2'), { target: { value: sk42Point2.lon.toFixed(6) } });

    fireEvent.click(screen.getByRole('button', { name: 'Построить' }));

    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const geometry = onBuild.mock.calls[0][0] as { type: 'route'; points: Array<{ lat: number; lon: number }> };
    expect(geometry.type).toBe('route');
    expect(geometry.points).toHaveLength(2);
    expect(geometry.points[0].lat).toBeCloseTo(wgsPoint1.lat, 4);
    expect(geometry.points[0].lon).toBeCloseTo(wgsPoint1.lon, 4);
    expect(geometry.points[1].lat).toBeCloseTo(wgsPoint2.lat, 4);
    expect(geometry.points[1].lon).toBeCloseTo(wgsPoint2.lon, 4);
  });
});
