import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapObjectProperties from '@/components/map/MapObjectProperties';
import type { MapObject } from '@/features/map/model/types';
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

describe('MapObjectProperties regeneration logic (T-61)', () => {
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
});
