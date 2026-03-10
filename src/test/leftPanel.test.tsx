import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LeftPanel from '@/components/map/LeftPanel';
import type { DiverUiConfig } from '@/features/mission';

const diver: DiverUiConfig = {
  uid: 'agent-1',
  id: '1',
  beacon_id: '1',
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
          basemap: true,
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
          basemap: true,
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

  it('handles raster controls: center, hide/show and basemap toggle', () => {
    const onLayerToggle = vi.fn();
    const onRasterOverlayToggle = vi.fn();
    const onRasterOverlayCenter = vi.fn();

    render(
      <LeftPanel
        layers={{
          basemap: true,
          track: true,
          routes: true,
          markers: true,
          baseStation: true,
          grid: false,
          scaleBar: true,
          diver: true,
        }}
        onLayerToggle={onLayerToggle}
        divers={[diver]}
        trackStatusByAgentId={{}}
        baseStationTrackStatus="stopped"
        selectedAgentId={null}
        pinnedAgentId={null}
        onAgentSelect={vi.fn()}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={vi.fn()}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        rasterOverlays={[
          {
            id: 'raster-1',
            name: 'Raster 1',
            visible: true,
            opacity: 1,
            zIndex: 1,
          },
        ]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
        onRasterOverlayToggle={onRasterOverlayToggle}
        onRasterOverlayCenter={onRasterOverlayCenter}
      />,
    );

    fireEvent.click(screen.getByText('Тайловая подложка'));
    expect(onLayerToggle).toHaveBeenCalledWith('basemap');

    fireEvent.click(screen.getByRole('button', { name: /Переместиться к растру Raster 1/i }));
    expect(onRasterOverlayCenter).toHaveBeenCalledWith('raster-1');

    fireEvent.click(screen.getByRole('button', { name: /Скрыть растр Raster 1/i }));
    expect(onRasterOverlayToggle).toHaveBeenCalledWith('raster-1');
  });

  it('opens vector color change on right click', () => {
    const onVectorOverlayColorChange = vi.fn();

    render(
      <LeftPanel
        layers={{
          basemap: true,
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
        onAgentSelect={vi.fn()}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={vi.fn()}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        vectorOverlays={[
          {
            id: 'vector-1',
            name: 'Vector 1',
            color: '#0f766e',
            visible: true,
            opacity: 1,
            zIndex: 1,
          },
        ]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
        onVectorOverlayColorChange={onVectorOverlayColorChange}
      />,
    );

    const vectorName = screen.getByText('Vector 1');
    fireEvent.contextMenu(vectorName.closest('div')!);
    const colorInput = screen.getByLabelText('Цвет слоя Vector 1');
    fireEvent.change(colorInput, { target: { value: '#ff0000' } });
    expect(onVectorOverlayColorChange).toHaveBeenCalledWith('vector-1', '#ff0000');
  });

  it('emits section collapsed state changes', () => {
    const onSectionsCollapsedChange = vi.fn();

    render(
      <LeftPanel
        layers={{
          basemap: true,
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
        onAgentSelect={vi.fn()}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={vi.fn()}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        vectorOverlays={[
          {
            id: 'vector-1',
            name: 'Vector 1',
            visible: true,
            opacity: 1,
            zIndex: 1,
          },
        ]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
        sectionsCollapsed={{
          layers: false,
          agents: false,
          rasters: false,
          vectors: false,
          objects: false,
        }}
        onSectionsCollapsedChange={onSectionsCollapsedChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть секцию Векторные слои' }));
    expect(onSectionsCollapsedChange).toHaveBeenCalledWith({
      layers: false,
      agents: false,
      rasters: false,
      vectors: true,
      objects: false,
    });
  });
});

describe('LeftPanel overlay sections visibility (T-117)', () => {
  const renderPanel = (options?: {
    rasterOverlays?: Array<{ id: string; name: string; visible: boolean; opacity: number; zIndex: number }>;
    vectorOverlays?: Array<{ id: string; name: string; color?: string; visible: boolean; opacity: number; zIndex: number }>;
  }) =>
    render(
      <LeftPanel
        layers={{
          basemap: true,
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
        onAgentSelect={vi.fn()}
        onAgentToggleRecording={vi.fn()}
        onBaseStationTrackAction={vi.fn()}
        isDraft={false}
        isRecordingEnabled={true}
        objects={[]}
        selectedObjectId={null}
        onObjectSelect={vi.fn()}
        rasterOverlays={options?.rasterOverlays ?? []}
        vectorOverlays={options?.vectorOverlays ?? []}
      />,
    );

  it('does not render raster section when raster overlays are empty', () => {
    renderPanel();
    expect(screen.queryByText('Растры')).not.toBeInTheDocument();
  });

  it('does not render vector section when vector overlays are empty', () => {
    renderPanel();
    expect(screen.queryByText('Векторные слои')).not.toBeInTheDocument();
  });

  it('renders raster section when there is at least one raster overlay', () => {
    renderPanel({
      rasterOverlays: [{ id: 'raster-1', name: 'Raster 1', visible: true, opacity: 1, zIndex: 1 }],
    });
    expect(screen.getByText('Растры')).toBeInTheDocument();
  });

  it('renders vector section when there is at least one vector overlay', () => {
    renderPanel({
      vectorOverlays: [{ id: 'vector-1', name: 'Vector 1', visible: true, opacity: 1, zIndex: 1, color: '#0f766e' }],
    });
    expect(screen.getByText('Векторные слои')).toBeInTheDocument();
  });

  it('does not render both overlay sections when both arrays are empty', () => {
    renderPanel({ rasterOverlays: [], vectorOverlays: [] });
    expect(screen.queryByText('Растры')).not.toBeInTheDocument();
    expect(screen.queryByText('Векторные слои')).not.toBeInTheDocument();
  });
});
