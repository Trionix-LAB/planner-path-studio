import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopToolbar from '@/components/map/TopToolbar';

const openImportTifSubmenu = async () => {
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Импорт' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Импорт TIF' }));
};

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
        onOpenOfflineMaps={vi.fn()}
        onFinishMission={vi.fn()}
        onGoToStart={onGoToStart}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain('z-[11000]');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'На старт' }));

    expect(onGoToStart).toHaveBeenCalledTimes(1);
  });

  it('opens GeoTIFF import picker from mission menu', async () => {
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    const onImportRasterFiles = vi.fn();

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
        onOpenOfflineMaps={vi.fn()}
        onImportRasterFiles={onImportRasterFiles}
        onFinishMission={vi.fn()}
        onGoToStart={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });

    await openImportTifSubmenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Встроенная привязка (GeoTIFF)' }));

    const input = document.querySelector('input[accept=".tif,.tiff"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const tifFile = new File(['x'], 'test.tif', { type: 'image/tiff' });
    fireEvent.change(input!, { target: { files: [tifFile] } });

    expect(onImportRasterFiles).toHaveBeenCalledTimes(1);
    expect(onImportRasterFiles).toHaveBeenCalledWith('geotiff', expect.anything());
  });

  it('opens TIF+TFW (degrees) import picker from mission menu', async () => {
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    const onImportRasterFiles = vi.fn();

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
        onOpenOfflineMaps={vi.fn()}
        onImportRasterFiles={onImportRasterFiles}
        onFinishMission={vi.fn()}
        onGoToStart={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });

    await openImportTifSubmenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'TIF + TFW (градусы)' }));

    const input = document.querySelectorAll('input[accept=".tif,.tiff"]')[1] as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const tifFile = new File(['x'], 'test.tif', { type: 'image/tiff' });
    fireEvent.change(input!, { target: { files: [tifFile] } });

    expect(onImportRasterFiles).toHaveBeenCalledTimes(1);
    expect(onImportRasterFiles).toHaveBeenCalledWith('tif+tfw', expect.anything(), { tfwUnits: 'degrees' });
  });

  it('opens TIF+TFW (mercator) import picker from mission menu', async () => {
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    const onImportRasterFiles = vi.fn();

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
        onOpenOfflineMaps={vi.fn()}
        onImportRasterFiles={onImportRasterFiles}
        onFinishMission={vi.fn()}
        onGoToStart={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });

    await openImportTifSubmenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'TIF + TFW (Меркатор, EPSG:3857)' }));

    const input = document.querySelectorAll('input[accept=".tif,.tiff"]')[2] as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const tifFile = new File(['x'], 'test.tif', { type: 'image/tiff' });
    fireEvent.change(input!, { target: { files: [tifFile] } });

    expect(onImportRasterFiles).toHaveBeenCalledTimes(1);
    expect(onImportRasterFiles).toHaveBeenCalledWith('tif+tfw', expect.anything(), {
      tfwUnits: 'meters',
      metersProjection: 'web-mercator',
    });
  });

  it('opens TIF+TFW (UTM zone) import picker from mission menu', async () => {
    window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
    const onImportRasterFiles = vi.fn();

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
        onOpenOfflineMaps={vi.fn()}
        onImportRasterFiles={onImportRasterFiles}
        onFinishMission={vi.fn()}
        onGoToStart={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Тестовая миссия/i }), {
      button: 0,
      ctrlKey: false,
    });

    await openImportTifSubmenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'TIF + TFW (UTM зона)' }));

    const zoneInput = await screen.findByLabelText('UTM зона (1..60)');
    const chooseButton = await screen.findByRole('button', { name: 'Выбрать TIF' });

    fireEvent.change(zoneInput, { target: { value: '0' } });
    expect(await screen.findByText('Некорректная UTM зона: ожидается число от 1 до 60.')).toBeInTheDocument();
    expect(chooseButton).toBeDisabled();

    fireEvent.change(zoneInput, { target: { value: '37' } });
    expect(screen.queryByText('Некорректная UTM зона: ожидается число от 1 до 60.')).not.toBeInTheDocument();
    expect(chooseButton).not.toBeDisabled();

    fireEvent.click(chooseButton);

    const input = document.querySelectorAll('input[accept=".tif,.tiff"]')[3] as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const tifFile = new File(['x'], 'test.tif', { type: 'image/tiff' });
    fireEvent.change(input!, { target: { files: [tifFile] } });

    expect(onImportRasterFiles).toHaveBeenCalledTimes(1);
    expect(onImportRasterFiles).toHaveBeenCalledWith('tif+tfw', expect.anything(), {
      tfwUnits: 'meters',
      metersProjection: 'utm',
      utmZone: 37,
      utmHemisphere: 'north',
    });
  });
});
