import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceSchemaForm from '@/components/devices/DeviceSchemaForm';
import { loadDeviceSchemas, type DeviceConfig } from '@/features/devices';

const gnssComSchema = loadDeviceSchemas().find((schema) => schema.id === 'gnss-com');
const rwltComSchema = loadDeviceSchemas().find((schema) => schema.id === 'rwlt-com');

if (!gnssComSchema) {
  throw new Error('GNSS-COM schema is required for DeviceSchemaForm tests');
}
if (!rwltComSchema) {
  throw new Error('RWLT-COM schema is required for DeviceSchemaForm tests');
}

const defaultConfig: DeviceConfig = {
  autoDetectPort: false,
  comPort: '',
  baudRate: 115200,
};

const electronWindow = window as unknown as {
  electronAPI?: {
    gnssCom?: {
      listPorts?: () => Promise<Array<{ path?: string } | string>>;
    };
    rwltCom?: {
      listPorts?: () => Promise<Array<{ path?: string } | string>>;
    };
  };
};

describe('DeviceSchemaForm GNSS-COM combobox', () => {
  const listPortsMock = vi.fn<() => Promise<Array<{ path?: string } | string>>>();

  beforeEach(() => {
    listPortsMock.mockReset();
    listPortsMock.mockResolvedValue(['COM3', '/dev/ttyUSB0']);
    electronWindow.electronAPI = {
      gnssCom: {
        listPorts: listPortsMock,
      },
    };
  });

  afterEach(() => {
    delete electronWindow.electronAPI;
  });

  it('opens and closes COM list and applies selected port', async () => {
    const onChange = vi.fn();

    render(
      <DeviceSchemaForm
        schema={gnssComSchema}
        value={defaultConfig}
        errors={{}}
        onChange={(key, value) => onChange(key, value)}
      />,
    );

    const combobox = screen.getByRole('combobox');
    fireEvent.click(combobox);

    expect(await screen.findByPlaceholderText('Введите или найдите COM-порт')).toBeInTheDocument();
    expect(await screen.findByText('COM3')).toBeInTheDocument();
    expect(await screen.findByText('/dev/ttyUSB0')).toBeInTheDocument();
    const listNode = document.querySelector('[cmdk-list]');
    expect(listNode).toHaveClass('overflow-y-auto');

    fireEvent.click(combobox);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Введите или найдите COM-порт')).not.toBeInTheDocument();
    });

    fireEvent.click(combobox);
    fireEvent.click(await screen.findByText('/dev/ttyUSB0'));

    expect(onChange).toHaveBeenCalledWith('comPort', '/dev/ttyUSB0');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Введите или найдите COM-порт')).not.toBeInTheDocument();
    });
  });

  it('supports manual COM port value from combobox input', async () => {
    const onChange = vi.fn();

    render(
      <DeviceSchemaForm
        schema={gnssComSchema}
        value={defaultConfig}
        errors={{}}
        onChange={(key, value) => onChange(key, value)}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = await screen.findByPlaceholderText('Введите или найдите COM-порт');
    fireEvent.change(searchInput, { target: { value: '/tmp/vcom0' } });

    fireEvent.click(await screen.findByText('Использовать "/tmp/vcom0"'));
    expect(onChange).toHaveBeenCalledWith('comPort', '/tmp/vcom0');
  });

  it('disables and collapses COM combobox when autoDetectPort is enabled', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DeviceSchemaForm
        schema={gnssComSchema}
        value={defaultConfig}
        errors={{}}
        onChange={(key, value) => onChange(key, value)}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByPlaceholderText('Введите или найдите COM-порт')).toBeInTheDocument();

    rerender(
      <DeviceSchemaForm
        schema={gnssComSchema}
        value={{ ...defaultConfig, autoDetectPort: true }}
        errors={{}}
        onChange={(key, value) => onChange(key, value)}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Введите или найдите COM-порт')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

describe('DeviceSchemaForm RWLT-COM combobox', () => {
  const listPortsMock = vi.fn<() => Promise<Array<{ path?: string } | string>>>();

  beforeEach(() => {
    listPortsMock.mockReset();
    listPortsMock.mockResolvedValue(['COM7', '/dev/ttyUSB1']);
    electronWindow.electronAPI = {
      rwltCom: {
        listPorts: listPortsMock,
      },
    };
  });

  afterEach(() => {
    delete electronWindow.electronAPI;
  });

  it('opens COM list and applies selected port', async () => {
    const onChange = vi.fn();

    render(
      <DeviceSchemaForm
        schema={rwltComSchema}
        value={{ ...defaultConfig, baudRate: 38400, mode: 'pinger' }}
        errors={{}}
        onChange={(key, value) => onChange(key, value)}
      />,
    );

    const comPortField = document.querySelector('[data-field-key="comPort"]');
    expect(comPortField).toBeTruthy();
    const comPortCombobox = within(comPortField as HTMLElement).getByRole('combobox');
    fireEvent.click(comPortCombobox);
    expect(await screen.findByPlaceholderText('Введите или найдите COM-порт')).toBeInTheDocument();
    expect(await screen.findByText('COM7')).toBeInTheDocument();

    fireEvent.click(await screen.findByText('/dev/ttyUSB1'));
    expect(onChange).toHaveBeenCalledWith('comPort', '/dev/ttyUSB1');
  });
});
