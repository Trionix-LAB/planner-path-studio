import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RightPanel from '@/components/map/RightPanel';
import type { DiverUiConfig } from '@/features/mission';

const testAgent: DiverUiConfig = {
  uid: 'agent-1',
  id: '1',
  beacon_id: '1',
  title: 'Маяк 1',
  marker_color: '#0ea5e9',
  marker_size_px: 32,
  track_color: '#a855f7',
  navigation_source: 'simulation',
};

describe('RightPanel HUD defaults', () => {
  it('shows no telemetry values and disabled connection state', () => {
    render(
      <RightPanel
        diverData={{ lat: 59.9, lon: 30.3, speed: 1.2, course: 45, depth: 10 }}
        hasTelemetryData={false}
        coordPrecision={6}
        styles={{
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
        }}
        connectionStatus="timeout"
        isConnectionEnabled={false}
        selectedAgent={null}
        selectedAgentTrackStatus="stopped"
        selectedAgentActiveTrackNumber={0}
        missionDocument={null}
        trackStatusByAgentId={{}}
        selectedObject={null}
        selectedZoneLanesOutdated={false}
        selectedZoneLaneCount={null}
        onObjectSelect={() => {}}
      />,
    );

    expect(screen.getByText('Выключено')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getAllByText('нет данных').length).toBeGreaterThan(0);
  });

  it('hides no-data label and shows connected status when telemetry arrives', () => {
    render(
      <RightPanel
        diverData={{ lat: 59.93428, lon: 30.335099, speed: 0.8, course: 45, depth: 12.5 }}
        hasTelemetryData={true}
        coordPrecision={6}
        styles={{
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
        }}
        connectionStatus="ok"
        isConnectionEnabled={true}
        selectedAgent={testAgent}
        selectedAgentTrackStatus="recording"
        selectedAgentActiveTrackNumber={1}
        missionDocument={null}
        trackStatusByAgentId={{ 'agent-1': 'recording' }}
        selectedObject={null}
        selectedZoneLanesOutdated={false}
        selectedZoneLaneCount={null}
        onObjectSelect={() => {}}
      />,
    );

    expect(screen.queryByText('нет данных')).toBeNull();
    expect(screen.getByText('Подключено • OK')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });
});
