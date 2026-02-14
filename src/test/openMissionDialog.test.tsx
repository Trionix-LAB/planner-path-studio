import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OpenMissionDialog from '@/components/dialogs/OpenMissionDialog';
import { ALL_MISSIONS_LIMIT } from '@/features/mission/model/recentMissions';

const mocks = vi.hoisted(() => ({
  recentMissionsHook: vi.fn(),
  pickDirectory: vi.fn(),
}));

vi.mock('@/platform', () => ({
  platform: {
    paths: {
      defaultMissionsDir: () => 'C:/Missions',
    },
    fs: {
      pickDirectory: mocks.pickDirectory,
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
    mocks.recentMissionsHook.mockReturnValue({
      missions: Array.from({ length: 6 }, (_, index) => createMission(index + 1)),
      reload: vi.fn(),
    });
  });

  it('uses shared missions source, renders "Миссии" and supports pagination', () => {
    render(<OpenMissionDialog open={true} onOpenChange={() => undefined} onConfirm={() => undefined} />);

    expect(mocks.recentMissionsHook).toHaveBeenCalledWith({ limit: ALL_MISSIONS_LIMIT });
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
});
