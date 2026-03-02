import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LeftPanel from '@/components/map/LeftPanel';
import type { DiverUiConfig } from '@/features/mission';

const diver: DiverUiConfig = {
  uid: 'agent-1',
  id: '1',
  beacon_id: '0',
  title: 'Маяк 1',
  marker_color: '#0ea5e9',
  marker_size_px: 32,
  track_color: '#a855f7',
  navigation_source: 'simulation',
};

describe('LeftPanel base station controls (T-99)', () => {
  it('dispatches start/pause/stop actions for base station track', () => {
    const onBaseStationTrackAction = vi.fn();
    const onAgentSelect = vi.fn();
    const { rerender } = render(
      <LeftPanel
        layers={{
          track: true,
          routes: true,
          markers: true,
          baseStation: true,
          grid: false,
          scaleBar: true,
          diver: true,
        }}
        onLayerToggle={vi.fn()}
        divers={[diver]}
        trackStatusByAgentId={{}}
        baseStationTrackStatus="stopped"
        selectedAgentId={null}
        pinnedAgentId={null}
        onAgentSelect={onAgentSelect}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={onBaseStationTrackAction}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Базовая станция' }));
    expect(onAgentSelect).toHaveBeenCalledWith('base-station');

    fireEvent.click(screen.getByRole('button', { name: 'Начать запись базовой станции' }));
    expect(onBaseStationTrackAction).toHaveBeenCalledWith('start');

    rerender(
      <LeftPanel
        layers={{
          track: true,
          routes: true,
          markers: true,
          baseStation: true,
          grid: false,
          scaleBar: true,
          diver: true,
        }}
        onLayerToggle={vi.fn()}
        divers={[diver]}
        trackStatusByAgentId={{}}
        baseStationTrackStatus="recording"
        selectedAgentId={null}
        pinnedAgentId={null}
        onAgentSelect={vi.fn()}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={onBaseStationTrackAction}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Пауза записи базовой станции' }));
    expect(onBaseStationTrackAction).toHaveBeenCalledWith('pause');
    fireEvent.click(screen.getByRole('button', { name: 'Завершить трек базовой станции' }));
    expect(onBaseStationTrackAction).toHaveBeenCalledWith('stop');
  });
});
