import { createBaseStationIcon, createDiverIcon, createRwltBuoyIcon } from '@/components/map/telemetryMarkerIcons';

const getHtml = (icon: { options: { html?: string | false | HTMLElement } }): string => {
  const html = icon.options.html;
  if (typeof html === 'string') return html;
  if (html instanceof HTMLElement) return html.outerHTML;
  return '';
};

const getAttr = (html: string, name: string): string | null => {
  const match = html.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
};

describe('telemetry marker icons', () => {
  it('scales diver course arrow with marker size and binds arrow color to marker color', () => {
    const small = createDiverIcon(45, false, '#FF0000', 24);
    const large = createDiverIcon(45, false, '#FF0000', 48);

    const smallHtml = getHtml(small);
    const largeHtml = getHtml(large);

    expect(getAttr(smallHtml, 'data-marker-color')).toBe('#ff0000');
    expect(getAttr(smallHtml, 'data-arrow-color')).toBe('#ff0000');

    const smallArrowSize = Number(getAttr(smallHtml, 'data-arrow-size'));
    const largeArrowSize = Number(getAttr(largeHtml, 'data-arrow-size'));
    expect(Number.isFinite(smallArrowSize)).toBe(true);
    expect(Number.isFinite(largeArrowSize)).toBe(true);
    expect(largeArrowSize).toBeGreaterThan(smallArrowSize);
  });

  it('normalizes course direction for diver marker arrow', () => {
    const icon = createDiverIcon(450, false, '#00AA00', 32);
    const html = getHtml(icon);
    expect(getAttr(html, 'data-marker-direction')).toBe('90.00');
    expect(getAttr(html, 'data-arrow-direction')).toBe('90.00');
  });

  it('uses fixed base station marker color and external course pointer', () => {
    const icon = createBaseStationIcon(200, 40);
    const html = getHtml(icon);

    expect(getAttr(html, 'data-marker-color')).toBe('#0f172a');
    expect(getAttr(html, 'data-marker-direction')).toBe('200.00');
    expect(getAttr(html, 'data-arrow-color')).toBe('#0f172a');
    expect(getAttr(html, 'data-arrow-format')).toBe('external-pointer');
    expect(getAttr(html, 'data-course-arrow')).toBe('1');
  });

  it('hides base station arrow when course is unavailable', () => {
    const icon = createBaseStationIcon(null, 40);
    const html = getHtml(icon);
    expect(getAttr(html, 'data-course-arrow')).toBeNull();
  });

  it('renders rwlt buoy marker with buoy number', () => {
    const icon = createRwltBuoyIcon(3);
    const html = getHtml(icon);
    expect((icon.options as { className?: string }).className).toBe('rwlt-buoy-marker');
    expect(html).toMatch(/>\s*3\s*</);
  });
});
