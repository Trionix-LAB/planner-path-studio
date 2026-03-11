import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapObjectProperties from '@/components/map/MapObjectProperties';
import type { MapObject } from '@/features/map/model/types';
import type { LaneFeature } from '@/features/mission';
import type { AppUiDefaults } from '@/features/settings';

const mockStyles: AppUiDefaults['styles'] = {
  track: { color: '#22c55e', width_px: 3 },
  route: { color: '#0ea5e9', width_px: 3 },
  survey_area: {
    stroke_color: '#f59e0b',
    stroke_width_px: 2,
    fill_color: '#f59e0b',
    fill_opacity: 0.2,
  },
  lane: { color: '#22c55e', width_px: 2 },
  marker: { color: '#22c55e' },
};

const mockZone: MapObject = {
  id: 'zone-1',
  type: 'zone',
  name: 'Test Zone',
  visible: true,
  laneAngle: 0,
  laneWidth: 5,
  geometry: {
    type: 'zone',
    points: [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 0 },
    ],
  },
};

const mockRoute: MapObject = {
  id: 'route-1',
  type: 'route',
  name: 'Test Route',
  visible: true,
  note: 'Route note',
  geometry: {
    type: 'route',
    points: [
      { lat: 59.93428, lon: 30.335099 },
      { lat: 59.9355, lon: 30.3365 },
    ],
  },
};

const mockMarker: MapObject = {
  id: 'marker-1',
  type: 'marker',
  name: 'Test Marker',
  visible: true,
  note: 'Marker note',
  geometry: {
    type: 'marker',
    point: { lat: 59.93428, lon: 30.335099 },
  },
};

const mockMeasure: MapObject = {
  id: 'measure-1',
  type: 'measure',
  name: 'Test Measure',
  visible: true,
  color: '#f97316',
  note: 'Measure note',
  geometry: {
    type: 'measure',
    points: [
      { lat: 59.93428, lon: 30.335099 },
      { lat: 59.93528, lon: 30.336099 },
    ],
  },
};

const mockRwltBuoy: MapObject = {
  id: 'rwlt-buoy-1',
  type: 'rwlt_buoy',
  name: 'Буй 1',
  visible: true,
  markerSizePx: 24,
  rwltBuoyId: 1,
  rwltBatteryV: 12.4,
  rwltAntennaDepthM: 1.5,
  geometry: {
    type: 'marker',
    point: { lat: 59.9, lon: 30.3 },
  },
};

const mockZoneLanes: LaneFeature[] = [
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [30.1, 59.1],
        [30.2, 59.2],
      ],
    },
    properties: {
      id: 'lane-1',
      kind: 'lane',
      name: 'Lane 1',
      note: null,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      parent_area_id: 'zone-1',
      lane_index: 1,
    },
  },
];

describe('MapObjectProperties regeneration logic (T-61)', () => {
  it('saves edited route coordinates from table', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockRoute}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть точки маршрута' }));
    const firstLatInput = screen.getByLabelText('Широта точки 1');
    fireEvent.change(firstLatInput, { target: { value: '59.940001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(onSave).toHaveBeenCalledWith(
      'route-1',
      expect.objectContaining({
        geometry: {
          type: 'route',
          points: [
            { lat: 59.940001, lon: 30.335099 },
            { lat: 59.9355, lon: 30.3365 },
          ],
        },
      }),
    );
  });

  it('closes route coordinates dialog by "Ок" and applies changes only after "Сохранить изменения"', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockRoute}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть точки маршрута' }));
    const latInput = screen.getByLabelText('Широта точки 1') as HTMLInputElement;
    fireEvent.change(latInput, { target: { value: '60.000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ок' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onSave).toHaveBeenCalledWith(
      'route-1',
      expect.objectContaining({
        geometry: {
          type: 'route',
          points: [
            { lat: 60, lon: 30.335099 },
            { lat: 59.9355, lon: 30.3365 },
          ],
        },
      }),
    );
  });

  it('closes marker coordinates dialog by "Ок" and applies changes only after "Сохранить изменения"', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockMarker}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть координаты маркера' }));
    const lonInput = screen.getByLabelText('Долгота маркера') as HTMLInputElement;
    fireEvent.change(lonInput, { target: { value: '31.000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ок' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onSave).toHaveBeenCalledWith(
      'marker-1',
      expect.objectContaining({
        geometry: {
          type: 'marker',
          point: { lat: 59.93428, lon: 31 },
        },
      }),
    );
  });

  it('shows measure distance and saves description for measure object', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockMeasure}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Расстояние')).toBeInTheDocument();
    expect(screen.getByText((text) => text.endsWith(' м'))).toBeInTheDocument();

    const noteInput = screen.getByLabelText('Описание');
    fireEvent.change(noteInput, { target: { value: 'Новое описание' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(onSave).toHaveBeenCalledWith(
      'measure-1',
      expect.objectContaining({
        note: 'Новое описание',
      }),
    );
  });

  it('keeps "Сохранить изменения" disabled when only coordinate format changes', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockRoute}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Сохранить изменения' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть точки маршрута' }));
    fireEvent.click(screen.getByText('Градусы и десятичные минуты'));
    fireEvent.click(screen.getByRole('button', { name: 'Ок' }));

    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows validation error and does not save invalid coordinates', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockRoute}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть точки маршрута' }));
    fireEvent.change(screen.getByLabelText('Широта точки 1'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(screen.getByText('Исправьте ошибки в координатах')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves edited zone coordinates from table', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть вершины зоны' }));
    fireEvent.change(screen.getByLabelText('Долгота точки 2'), { target: { value: '1.500000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(onSave).toHaveBeenCalledWith(
      'zone-1',
      expect.objectContaining({
        geometry: {
          type: 'zone',
          points: [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 1.5 },
            { lat: 1, lon: 1 },
            { lat: 1, lon: 0 },
          ],
        },
      }),
    );
  });

  it('renders read-only zone lane vertices with CRS/format switching', () => {
    render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
        zoneLaneFeatures={mockZoneLanes}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть вершины галсов' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Вершины галсов' })).toBeInTheDocument();
    expect(screen.getByText('59.100000°')).toBeInTheDocument();
    expect(screen.getByText('30.200000°')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Градусы, минуты и секунды'));
    expect(screen.queryByText('59.100000°')).not.toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent ?? '';
        return text.includes('59°') && text.includes('′') && text.includes('″');
      }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent ?? '';
        return text.includes('30°') && text.includes('′') && text.includes('″');
      }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('СК-42 (Pulkovo 1942)'));
    expect(screen.getByText('Широта (СК-42 (Pulkovo 1942))')).toBeInTheDocument();
  });

  it('calls onRegenerateLanes with current values from inputs', () => {
    const onRegenerateLanes = vi.fn();
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
        onRegenerateLanes={onRegenerateLanes}
      />
    );

    // Change lane width input
    const widthInput = screen.getByLabelText(/Ширина галса/i);
    fireEvent.change(widthInput, { target: { value: '15' } });

    // Click regenerate button
    const regenButton = screen.getByText('Перегенерировать галсы');
    fireEvent.click(regenButton);

    // Should call onRegenerateLanes with the new width
    expect(onRegenerateLanes).toHaveBeenCalledWith('zone-1', expect.objectContaining({
      laneWidth: 15
    }));
  });

  it('resets zone lane inputs when the same zone is refreshed externally', () => {
    const { rerender } = render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    const laneAngleInput = screen.getByLabelText('Угол галсов') as HTMLInputElement;
    fireEvent.change(laneAngleInput, { target: { value: '77' } });
    expect(laneAngleInput.value).toBe('77');

    rerender(
      <MapObjectProperties
        object={{ ...mockZone }}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    expect((screen.getByLabelText('Угол галсов') as HTMLInputElement).value).toBe('0');
  });

  it('keeps displayed lane angle global when edge orientation changes', () => {
    const { rerender } = render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    expect((screen.getByLabelText('Угол галсов') as HTMLInputElement).value).toBe('0');

    rerender(
      <MapObjectProperties
        object={{ ...mockZone, laneBearingDeg: 90 }}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );

    expect((screen.getByLabelText('Угол галсов') as HTMLInputElement).value).toBe('0');
  });

  it('sends global lane angle when edge orientation is selected', () => {
    const onRegenerateLanes = vi.fn();

    render(
      <MapObjectProperties
        object={{ ...mockZone, laneAngle: 10, laneBearingDeg: 40 }}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
        onRegenerateLanes={onRegenerateLanes}
      />,
    );

    const laneAngleInput = screen.getByLabelText('Угол галсов');
    expect((laneAngleInput as HTMLInputElement).value).toBe('10');

    fireEvent.change(laneAngleInput, { target: { value: '65' } });
    fireEvent.click(screen.getByText('Перегенерировать галсы'));

    expect(onRegenerateLanes).toHaveBeenCalledWith(
      'zone-1',
      expect.objectContaining({
        laneAngle: 65,
      }),
    );
  });

  it('removes redundant regenerate button from outdated warning', () => {
    render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={() => {}}
        onClose={() => {}}
        zoneLanesOutdated={true}
      />
    );

    expect(screen.getByText('Галсы неактуальны')).toBeInTheDocument();
    // The "Перегенерировать" button (small one) should not be there
    const regenButtons = screen.queryAllByRole('button', { name: /^Перегенерировать$/ });
    expect(regenButtons.length).toBe(0);
    
    // But the main button should still be there
    expect(screen.getByText('Перегенерировать галсы')).toBeInTheDocument();
  });

  it('saves zone lane color independently from zone color', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockZone}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText('Цвет галсов'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(onSave).toHaveBeenCalledWith(
      'zone-1',
      expect.objectContaining({
        laneColor: '#ff0000',
      }),
    );
  });

  it('saves rwlt buoy name, marker color and marker size', () => {
    const onSave = vi.fn();

    render(
      <MapObjectProperties
        object={mockRwltBuoy}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Буй Север' } });
    fireEvent.change(screen.getByLabelText('Цвет'), { target: { value: '#ff5500' } });
    fireEvent.change(screen.getByLabelText('Размер маркера (px)'), { target: { value: '36' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(onSave).toHaveBeenCalledWith(
      'rwlt-buoy-1',
      expect.objectContaining({
        name: 'Буй Север',
        color: '#ff5500',
        markerSizePx: 36,
      }),
    );
  });

  it('keeps rwlt buoy marker size input while telemetry rerenders same buoy', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <MapObjectProperties
        object={mockRwltBuoy}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    const markerSizeInput = screen.getByLabelText('Размер маркера (px)') as HTMLInputElement;
    fireEvent.change(markerSizeInput, { target: { value: '42' } });
    expect(markerSizeInput.value).toBe('42');

    rerender(
      <MapObjectProperties
        object={{
          ...mockRwltBuoy,
          rwltAntennaDepthM: 2.1,
          rwltSogMps: 0.7,
          rwltCourseDeg: 135,
          rwltUpdatedAt: Date.now(),
        }}
        styles={mockStyles}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    expect((screen.getByLabelText('Размер маркера (px)') as HTMLInputElement).value).toBe('42');
  });
});
