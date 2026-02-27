import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ZoneDraftLanePanel } from '@/components/map/ZoneDraftLanePanel';

const createProps = () => ({
  open: true,
  minimized: false,
  panelPosition: { x: 80, y: 100 },
  iconPosition: { x: 90, y: 120 },
  laneAngle: '0',
  laneWidth: '10',
  laneBearingDeg: null as number | null,
  laneStart: null as { lat: number; lon: number } | null,
  drawingPointsCount: 3,
  previewLanesCount: 4,
  lanePickMode: 'none' as const,
  onDragStart: vi.fn(),
  onPanelPositionChange: vi.fn(),
  onIconPositionChange: vi.fn(),
  onMinimizedChange: vi.fn(),
  onLaneAngleChange: vi.fn(),
  onLaneWidthChange: vi.fn(),
  onLanePickModeChange: vi.fn(),
  onCancelDraft: vi.fn(),
  onCompleteDraft: vi.fn(),
});

describe('ZoneDraftLanePanel', () => {
  it('supports minimize and restore from icon click', () => {
    const props = createProps();
    const { rerender } = render(<ZoneDraftLanePanel {...props} />);

    fireEvent.click(screen.getByTestId('zone-lane-panel-minimize'));
    expect(props.onMinimizedChange).toHaveBeenCalledWith(true);

    rerender(<ZoneDraftLanePanel {...props} minimized={true} />);
    const icon = screen.getByTestId('zone-lane-panel-icon');
    fireEvent.mouseDown(icon, { button: 0, clientX: 140, clientY: 160 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 160 });

    expect(props.onMinimizedChange).toHaveBeenCalledWith(false);
  });

  it('drags expanded panel and clamps position to viewport', () => {
    const props = createProps();
    render(<ZoneDraftLanePanel {...props} />);

    const handle = screen.getByTestId('zone-lane-panel-drag-handle');
    fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 120 });
    fireEvent.mouseMove(window, { clientX: 5000, clientY: 5000 });
    fireEvent.mouseUp(window, { clientX: 5000, clientY: 5000 });

    expect(props.onPanelPositionChange).toHaveBeenCalled();
    const lastCall = props.onPanelPositionChange.mock.calls.at(-1)?.[0] as { x: number; y: number };
    expect(lastCall.x).toBeGreaterThanOrEqual(12);
    expect(lastCall.y).toBeGreaterThanOrEqual(12);
    expect(lastCall.x).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(lastCall.y).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it('drags minimized icon without triggering restore', () => {
    const props = createProps();
    render(<ZoneDraftLanePanel {...props} minimized={true} />);

    const icon = screen.getByTestId('zone-lane-panel-icon');
    fireEvent.mouseDown(icon, { button: 0, clientX: 120, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 300 });
    fireEvent.mouseUp(window, { clientX: 260, clientY: 300 });

    expect(props.onIconPositionChange).toHaveBeenCalled();
    expect(props.onMinimizedChange).not.toHaveBeenCalledWith(false);
  });
});
