import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MapWorkspaceFrame from '@/components/map/MapWorkspaceFrame';

const renderFrame = () =>
  render(
    <div className="h-screen">
      <MapWorkspaceFrame
        top={<div>Top Toolbar Content</div>}
        left={<div>Left Panel Content</div>}
        center={<div>Map Canvas Content</div>}
        right={<div>Right Panel Content</div>}
        status={<div>Status Bar Content</div>}
      />
    </div>,
  );

describe('MapWorkspaceFrame', () => {
  it('collapses and restores left panel', () => {
    renderFrame();

    expect(screen.getByText('Left Panel Content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть левую панель' }));
    expect(screen.queryByText('Left Panel Content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Развернуть левую панель' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть левую панель' }));
    expect(screen.getByText('Left Panel Content')).toBeInTheDocument();
  });

  it('collapses and restores right panel', () => {
    renderFrame();

    expect(screen.getByText('Right Panel Content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть правую панель' }));
    expect(screen.queryByText('Right Panel Content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Развернуть правую панель' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть правую панель' }));
    expect(screen.getByText('Right Panel Content')).toBeInTheDocument();
  });

  it('shows clear labeled tabs when side panels are collapsed', () => {
    renderFrame();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть левую панель' }));
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть правую панель' }));

    expect(screen.getByText('Слои')).toBeInTheDocument();
    expect(screen.getByText('Свойства')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Развернуть левую панель' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Развернуть правую панель' })).toBeInTheDocument();
  });

  it('collapses and restores top panel without hiding map', () => {
    renderFrame();

    expect(screen.getByText('Top Toolbar Content')).toBeInTheDocument();
    expect(screen.getByText('Map Canvas Content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть верхнюю панель' }));
    expect(screen.queryByText('Top Toolbar Content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Развернуть верхнюю панель' })).toBeInTheDocument();
    expect(screen.getByText('Map Canvas Content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть верхнюю панель' }));
    expect(screen.getByText('Top Toolbar Content')).toBeInTheDocument();
  });
});
