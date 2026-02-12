import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsDialog from '@/components/dialogs/SettingsDialog';
import { createDefaultAppSettings } from '@/features/settings';
import type { DiverUiConfig } from '@/features/mission';

const baseDefaults = createDefaultAppSettings().defaults;

const buildDiver = (navigationSource: DiverUiConfig['navigation_source']): DiverUiConfig => ({
  uid: 'agent-1',
  id: '1',
  beacon_id: '0',
  title: 'Маяк 1',
  marker_color: '#0ea5e9',
  marker_size_px: 32,
  track_color: '#a855f7',
  navigation_source: navigationSource,
});

const renderDialog = async ({
  isZimaAssignedInProfile,
  diver,
}: {
  isZimaAssignedInProfile: boolean;
  diver: DiverUiConfig;
}) => {
  render(
    <SettingsDialog
      open
      onOpenChange={vi.fn()}
      value={baseDefaults}
      missionDivers={[diver]}
      isZimaAssignedInProfile={isZimaAssignedInProfile}
      baseStationNavigationSource={null}
      onApply={vi.fn()}
      onApplyDivers={vi.fn()}
      onApplyBaseStationNavigationSource={vi.fn()}
      onReset={vi.fn()}
      onResetDivers={vi.fn()}
      navigationSourceOptions={[
        { id: 'zima2r', label: 'Zima2R' },
        { id: 'gnss-udp', label: 'GNSS-UDP' },
      ]}
    />,
  );

  const connectionTab = screen.getByRole('tab', { name: 'Агенты' });
  fireEvent.mouseDown(connectionTab);
  fireEvent.click(connectionTab);
  fireEvent.keyDown(connectionTab, { key: 'Enter' });

  await waitFor(() => {
    expect(screen.getByText('Водолазы')).toBeInTheDocument();
  });
};

const getBeaconIdInput = (): HTMLInputElement => {
  const rangeHint = screen.getByText('Диапазон: 0-15');
  const field = rangeHint.parentElement?.querySelector('input');
  if (!field) {
    throw new Error('Beacon input not found');
  }
  return field;
};

describe('SettingsDialog beacon id availability', () => {
  it('disables beacon id input when zima profile is not assigned', async () => {
    await renderDialog({
      isZimaAssignedInProfile: false,
      diver: buildDiver('zima2r'),
    });

    expect(getBeaconIdInput()).toBeDisabled();
  });

  it('enables beacon id input when zima profile is assigned and selected as source', async () => {
    await renderDialog({
      isZimaAssignedInProfile: true,
      diver: buildDiver('zima2r'),
    });

    expect(getBeaconIdInput()).toBeEnabled();
  });

  it('disables beacon id input for non-zima source even with assigned zima profile', async () => {
    await renderDialog({
      isZimaAssignedInProfile: true,
      diver: buildDiver('gnss-udp'),
    });

    expect(getBeaconIdInput()).toBeDisabled();
  });
});
