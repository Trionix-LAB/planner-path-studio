import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';

const mocks = vi.hoisted(() => ({
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

describe('CreateMissionDialog input UX', () => {
  beforeEach(() => {
    mocks.pickDirectory.mockReset();
    mocks.readJson.mockReset();
    mocks.writeJson.mockReset();
    mocks.readJson.mockResolvedValue(null);
    mocks.writeJson.mockResolvedValue(undefined);
  });

  it('allows typing mission name and folder path', () => {
    render(
      <CreateMissionDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const [nameInput, folderInput] = screen.getAllByRole('textbox') as HTMLInputElement[];

    fireEvent.change(nameInput, { target: { value: 'Тестовая миссия' } });
    fireEvent.change(folderInput, { target: { value: 'D:/Missions/Test' } });

    expect(nameInput).toHaveValue('Тестовая миссия');
    expect(folderInput).toHaveValue('D:/Missions/Test');
  });

  it('persists selected missions directory to shared settings', async () => {
    mocks.pickDirectory.mockResolvedValue('D:/Archive');

    render(<CreateMissionDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    const folderInput = screen.getByDisplayValue('C:/Missions');
    const pickerButton = folderInput.parentElement?.querySelector('button');
    if (!pickerButton) {
      throw new Error('Folder picker button not found');
    }
    fireEvent.click(pickerButton);

    await waitFor(() => {
      expect(mocks.pickDirectory).toHaveBeenCalledWith({
        title: 'Папка хранения миссий',
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

    render(<CreateMissionDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    const folderInput = screen.getByDisplayValue('C:/Missions') as HTMLInputElement;
    fireEvent.change(folderInput, { target: { value: 'D:/TypedByUser' } });

    resolveStored?.('D:/StoredValue');

    await waitFor(() => {
      expect(folderInput).toHaveValue('D:/TypedByUser');
    });
  });

  it('locks submit controls while async mission creation is in progress', async () => {
    let resolveConfirm: (() => void) | null = null;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    render(<CreateMissionDialog open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    const nameInput = document.getElementById('mission-name') as HTMLInputElement | null;
    if (!nameInput) {
      throw new Error('Mission name input not found');
    }
    const folderInput = screen.getAllByRole('textbox').find((input) => input !== nameInput) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test Mission' } });
    fireEvent.change(folderInput, { target: { value: 'D:/Missions' } });

    const createButton = screen.getByRole('button', { name: /Создать/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(nameInput).toBeDisabled();
    expect(folderInput).toBeDisabled();
    expect(createButton).toBeDisabled();

    resolveConfirm?.();

    await waitFor(() => {
      expect(nameInput).not.toBeDisabled();
    });
  });
});
