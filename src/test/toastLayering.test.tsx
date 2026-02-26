import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToastProvider, ToastViewport } from '@/components/ui/toast';

describe('toast layering (issue #65)', () => {
  it('renders toast viewport above map and dialog layers', () => {
    const { container } = render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    );
    const viewport = Array.from(container.querySelectorAll<HTMLElement>('*')).find((node) => {
      const classes = node.className ?? '';
      return classes.includes('max-h-screen') && classes.includes('flex-col-reverse');
    });

    expect(viewport).not.toBeNull();
    expect(viewport?.className).toContain('z-[12000]');
  });
});
