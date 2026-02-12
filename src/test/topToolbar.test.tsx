import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopToolbar from '@/components/map/TopToolbar';

describe('top toolbar mission menu', () => {
  it('calls onGoToStart when user clicks "На старт"', async () => {
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;

    const onGoToStart = vi.fn();

    render(
      <TopToolbar
        missionName="Тестовая миссия"
        isDraft={false}
        autoSaveStatus="saved"
        activeTool="select"
        trackStatus="recording"
        showSimulationControls={false}
        isRecordingEnabled={true}
        onToolChange={vi.fn()}
        onTrackAction={vi.fn()}
        onOpenCreate={vi.fn()}
        onOpenOpen={vi.fn()}
        onOpenExport={vi.fn()}
        onOpenSettings={vi.fn()}
        onFinishMission={vi.fn()}
        onGoToStart={onGoToStart}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'На старт' }));

    expect(onGoToStart).toHaveBeenCalledTimes(1);
  });
});
