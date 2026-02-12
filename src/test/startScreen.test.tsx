import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StartScreen from '@/pages/StartScreen';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pickDirectory: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
  reload: vi.fn(),
  scheduleDelete: vi.fn(),
  recentMissionsHook: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/platform', () => ({
  platform: {
    runtime: { isElectron: true },
    paths: {
      defaultMissionsDir: () => 'C:/Missions',
      defaultExportsDir: () => 'C:/Exports',
    },
    map: {
      tileLayerUrl: () => '',
      tileLayerAttribution: () => '',
    },
    fs: {
      pickDirectory: mocks.pickDirectory,
    },
    settings: {
      readJson: vi.fn().mockResolvedValue(null),
      writeJson: mocks.writeJson,
      remove: vi.fn(),
    },
    fileStore: {
      exists: mocks.exists,
      readText: vi.fn(),
      writeText: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
      stat: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/useRecentMissions', () => ({
  useRecentMissions: (...args: unknown[]) => mocks.recentMissionsHook(...args),
}));

vi.mock('@/hooks/useDelayedMissionDeletion', () => ({
  useDelayedMissionDeletion: vi.fn(() => ({
    pendingMissions: [],
    scheduleDelete: mocks.scheduleDelete,
    undoDelete: vi.fn(),
  })),
}));

describe('StartScreen missions actions', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.pickDirectory.mockReset();
    mocks.writeJson.mockReset();
    mocks.exists.mockReset();
    mocks.reload.mockReset();
    mocks.scheduleDelete.mockReset();
    mocks.recentMissionsHook.mockReset();
    mocks.exists.mockResolvedValue(false);
    mocks.writeJson.mockResolvedValue(undefined);
    mocks.reload.mockResolvedValue(undefined);
    mocks.scheduleDelete.mockResolvedValue(undefined);
    mocks.recentMissionsHook.mockReturnValue({
      missions: [{ name: 'Mission A', rootPath: 'C:/Missions/A', dateLabel: '1 янв. 2026, 10:00' }],
      reload: mocks.reload,
    });
  });

  it('updates missions directory and reloads missions after picking folder', async () => {
    mocks.pickDirectory.mockResolvedValue('D:/Archive');

    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Папка миссий' }));

    await waitFor(() => {
      expect(mocks.pickDirectory).toHaveBeenCalledWith({
        title: 'Папка хранения миссий',
        defaultPath: 'C:/Missions',
      });
    });
    expect(mocks.writeJson).toHaveBeenCalledWith('planner.missionsDir', 'D:/Archive');
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it('changes missions limit via combobox options', async () => {
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    expect(mocks.recentMissionsHook).toHaveBeenCalledWith({
      missionsDir: 'C:/Missions',
      limit: 5,
    });

    const selectMissionLimit = async (label: string) => {
      const trigger = screen.getByRole('combobox');
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
      fireEvent.mouseDown(trigger, { button: 0 });
      fireEvent.click(trigger);

      const option =
        (await screen.queryByRole('option', { name: label })) ??
        (await screen.findByText(label));
      fireEvent.click(option);
    };

    await selectMissionLimit('20');

    await waitFor(() => {
      expect(mocks.recentMissionsHook).toHaveBeenLastCalledWith({
        missionsDir: 'C:/Missions',
        limit: 20,
      });
    });

    await selectMissionLimit('все');

    await waitFor(() => {
      expect(mocks.recentMissionsHook).toHaveBeenLastCalledWith({
        missionsDir: 'C:/Missions',
        limit: Number.POSITIVE_INFINITY,
      });
    });
  });

  it('asks confirmation before deleting mission and schedules delete only on confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTitle('Удалить миссию'));

    expect(confirmSpy).toHaveBeenCalledWith('Удалить миссию "Mission A"?');
    expect(mocks.scheduleDelete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTitle('Удалить миссию'));

    await waitFor(() => {
      expect(mocks.scheduleDelete).toHaveBeenCalledWith({
        rootPath: 'C:/Missions/A',
        name: 'Mission A',
      });
    });

    confirmSpy.mockRestore();
  });
});
