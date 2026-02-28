import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  const profile = base.profiles.find((item) => item.id === 'profile-zima-gnss');
  const zimaInstanceId = profile?.device_instance_ids.find(
    (instanceId) => base.device_instances[instanceId]?.schema_id === 'zima2r',
  );
  const gnssInstanceId = profile?.device_instance_ids.find(
    (instanceId) => base.device_instances[instanceId]?.schema_id === 'gnss-udp',
  );

  if (!profile || !zimaInstanceId || !gnssInstanceId) {
    throw new Error('Required default profile instances were not found');
  }

  return {
    ...base,
    selected_profile_id: profile.id,
    selected_device_instance_id: gnssInstanceId,
    device_instances: {
      ...base.device_instances,
      [zimaInstanceId]: {
        ...base.device_instances[zimaInstanceId],
        config: {
          ...base.device_instances[zimaInstanceId].config,
          ipAddress: '999.2.3.4',
        },
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

  it('adds multiple instances of same schema and persists them on save', async () => {
    const base = createDefaultEquipmentSettings(loadDeviceSchemas());
    mocks.readJson.mockResolvedValue(base);
    mocks.writeJson.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/equipment']}>
        <Routes>
          <Route path="/equipment" element={<EquipmentScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Zima2R' });

    const addSection = screen.getByText('Добавить устройство').parentElement;
    expect(addSection).toBeTruthy();

    const addGnssButton = within(addSection as HTMLElement).getByRole('button', { name: /GNSS-UDP/i });
    fireEvent.click(addGnssButton);
    fireEvent.click(addGnssButton);

    const duplicateGnssLabels = await screen.findAllByText('GNSS-UDP 2');
    expect(duplicateGnssLabels.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(mocks.writeJson).toHaveBeenCalled();
    });

    const settingsWriteCall = mocks.writeJson.mock.calls.find(
      (call: unknown[]) => call[0] === 'planner.equipmentSettings.v1',
    );
    expect(settingsWriteCall).toBeTruthy();

    const savedSettings = settingsWriteCall?.[1] as ReturnType<typeof createDefaultEquipmentSettings>;
    const selectedProfile = savedSettings.profiles.find((profile) => profile.id === savedSettings.selected_profile_id);
    expect(selectedProfile).toBeTruthy();

    const gnssInstancesInProfile =
      selectedProfile?.device_instance_ids.filter(
        (instanceId) => savedSettings.device_instances[instanceId]?.schema_id === 'gnss-udp',
      ) ?? [];

    expect(gnssInstancesInProfile.length).toBe(2);
  });
});
