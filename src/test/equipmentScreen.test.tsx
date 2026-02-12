import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createDefaultEquipmentSettings, loadDeviceSchemas } from '@/features/devices';
import EquipmentScreen from '@/pages/EquipmentScreen';

const mocks = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/platform', () => ({
  platform: {
    settings: {
      readJson: mocks.readJson,
      writeJson: mocks.writeJson,
      remove: mocks.remove,
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: mocks.toast,
}));

const buildStoredSettingsWithInvalidZimaIp = () => {
  const schemas = loadDeviceSchemas();
  const base = createDefaultEquipmentSettings(schemas);
  return {
    ...base,
    selected_profile_id: 'profile-zima-gnss',
    selected_device_id: 'gnss-udp',
    devices: {
      ...base.devices,
      zima2r: {
        ...base.devices.zima2r,
        ipAddress: '999.2.3.4',
      },
    },
  };
};

describe('EquipmentScreen validation UX', () => {
  beforeEach(() => {
    mocks.readJson.mockReset();
    mocks.writeJson.mockReset();
    mocks.remove.mockReset();
    mocks.toast.mockReset();
  });

  it('switches to invalid device and shows contextual error summary on save', async () => {
    mocks.readJson.mockResolvedValue(buildStoredSettingsWithInvalidZimaIp());
    mocks.writeJson.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/equipment']}>
        <Routes>
          <Route path="/equipment" element={<EquipmentScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'GNSS-UDP' })).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Сохранить' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Zima2R' })).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Zima2R: IP-адрес');
    expect(screen.getByText('Введите корректный IPv4 адрес (например 127.0.0.1)')).toBeInTheDocument();
    expect(mocks.writeJson).not.toHaveBeenCalled();

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Проверьте значения',
        description: expect.stringContaining('Zima2R: IP-адрес'),
      }),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('999.2.3.4')).toHaveFocus();
    });
  });
});
