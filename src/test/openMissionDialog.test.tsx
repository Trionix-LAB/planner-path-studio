import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import { ALL_MISSIONS_LIMIT } from '@/features/mission/model/recentMissions';

const mocks = vi.hoisted(() => ({
  recentMissionsHook: vi.fn(),
  pickDirectory: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock('@/platform', () => ({
  platform: {
    paths: {
      defaultMissionsDir: () => 'C:/Missions',
    },
    fs: {
      pickDirectory: mocks.pickDirectory,
    },
    settings: {
      readJson: mocks.readJson,
      writeJson: mocks.writeJson,
    },
  },
}));

vi.mock('@/hooks/useRecentMissions', () => ({
  useRecentMissions: (...args: unknown[]) => mocks.recentMissionsHook(...args),
}));

const createMission = (index: number) => ({
  name: `Mission ${index}`,
  rootPath: `C:/Missions/M${index}`,
  dateLabel: `2026-01-${String(index).padStart(2, '0')}`,
  updatedAtMs: index,
});

describe('OpenMissionDialog missions list', () => {
  beforeEach(() => {
    mocks.recentMissionsHook.mockReset();
    mocks.pickDirectory.mockReset();
    mocks.readJson.mockReset();
    mocks.writeJson.mockReset();
    mocks.recentMissionsHook.mockReturnValue({
      missions: Array.from({ length: 6 }, (_, index) => createMission(index + 1)),
      reload: vi.fn(),
    });
    mocks.readJson.mockResolvedValue(null);
    mocks.writeJson.mockResolvedValue(undefined);
  });

  it('uses shared missions source, renders "Миссии" and supports pagination', () => {
    render(<OpenMissionDialog open={true} onOpenChange={() => undefined} onConfirm={() => undefined} />);

    expect(mocks.recentMissionsHook).toHaveBeenCalledWith({
      limit: ALL_MISSIONS_LIMIT,
      missionsDir: 'C:/Missions',
    });
    expect(screen.getByText('Миссии')).toBeInTheDocument();
    expect(screen.getByText('Страница 1 из 2')).toBeInTheDocument();
    expect(screen.queryByText('Mission 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Вперед' }));

    expect(screen.getByText('Страница 2 из 2')).toBeInTheDocument();
    expect(screen.getByText('Mission 1')).toBeInTheDocument();
  });

  it('shows empty placeholder when missions are unavailable', () => {
    mocks.recentMissionsHook.mockReturnValue({ missions: [], reload: vi.fn() });

    render(<OpenMissionDialog open={true} onOpenChange={() => undefined} onConfirm={() => undefined} />);

    expect(screen.getByText('Нет доступных миссий')).toBeInTheDocument();
  });

  it('persists selected missions folder to shared settings', async () => {
    mocks.pickDirectory.mockResolvedValue('D:/Archive');

    render(<OpenMissionDialog open={true} onOpenChange={() => undefined} onConfirm={() => undefined} />);
    const folderInput = screen.getByPlaceholderText('Выберите папку с mission.json');
    const pickerButton = folderInput.parentElement?.querySelector('button');
    if (!pickerButton) {
      throw new Error('Folder picker button not found');
    }
    fireEvent.click(pickerButton);

    await waitFor(() => {
      expect(mocks.pickDirectory).toHaveBeenCalledWith({
        title: 'Папка миссии',
        defaultPath: 'C:/Missions',
      });
    });

    expect(mocks.writeJson).toHaveBeenCalledWith('planner.missionsDir', 'D:/Archive');
  });

  it('does not overwrite manually typed folder when stored setting resolves later', async () => {
    let resolveStored: ((value: unknown) => void) | null = null;
    mocks.readJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStored = resolve;
        }),
    );

    render(<OpenMissionDialog open={true} onOpenChange={() => undefined} onConfirm={() => undefined} />);

    const folderInput = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(folderInput, { target: { value: 'D:/TypedByUser' } });

    resolveStored?.('D:/StoredValue');

    await waitFor(() => {
      expect(folderInput).toHaveValue('D:/TypedByUser');
    });
  });
});
