import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StartScreen from '@/pages/StartScreen';
import { ALL_MISSIONS_LIMIT } from '@/features/mission/model/recentMissions';

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
      maxNativeZoom: () => 19,
      maxZoom: () => 22,
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
      missions: [{ name: 'Mission A', rootPath: 'C:/Missions/A', dateLabel: '1 янв. 2026, 10:00', updatedAtMs: 1_735_721_600_000 }],
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

  it('uses shared missions source with full fetch and shows renamed section title', async () => {
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText('Миссии')).toBeInTheDocument();
    expect(mocks.recentMissionsHook).toHaveBeenCalledWith({
      missionsDir: 'C:/Missions',
      limit: ALL_MISSIONS_LIMIT,
    });
  });

  it('shows empty placeholder when there are no missions', async () => {
    mocks.recentMissionsHook.mockReturnValue({
      missions: [],
      reload: mocks.reload,
    });

    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    expect(screen.getByText('Нет доступных миссий')).toBeInTheDocument();
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

  it('opens a new empty draft from the draft button (R-016)', async () => {
    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Черновик/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/map?mode=new-draft');
  });

  it('shows and opens recover action only when recoverable draft exists (R-016)', async () => {
    mocks.exists.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <StartScreen />
      </MemoryRouter>,
    );

    const recoverButton = await screen.findByRole('button', { name: /Восстановить/i });
    fireEvent.click(recoverButton);
    expect(mocks.navigate).toHaveBeenCalledWith('/map?mode=recover');
  });
});
