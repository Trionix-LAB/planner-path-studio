import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreateMissionDialog from '@/components/dialogs/CreateMissionDialog';

describe('CreateMissionDialog input UX', () => {
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
});
