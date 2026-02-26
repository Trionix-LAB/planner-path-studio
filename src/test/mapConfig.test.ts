import { resolveMapConfig } from '@/platform/mapConfig';

describe('map config provider resolution', () => {
  it('uses OSM config by default', () => {
    const config = resolveMapConfig({});
    expect(config.provider).toBe('osm');
    expect(config.maxNativeZoom).toBe(19);
    expect(config.maxZoom).toBe(22);
    expect(config.tileSize).toBe(256);
    expect(config.zoomSnap).toBe(1);
    expect(config.zoomDelta).toBe(1);
    expect(config.wheelPxPerZoomLevel).toBe(120);
  });

  it('falls back to OSM for unknown provider values', () => {
    const config = resolveMapConfig({ VITE_MAP_PROVIDER: 'legacy-provider' });
    expect(config.provider).toBe('osm');
    expect(config.tileLayerUrl).toContain('tile.openstreetmap.org');
  });

  it('uses OSM base with OpenSeaMap overlay for openmarine provider', () => {
    const config = resolveMapConfig({ VITE_MAP_PROVIDER: 'openmarine' });
    expect(config.provider).toBe('openmarine');
    expect(config.tileLayerUrl).toContain('tile.openstreetmap.org');
    expect(config.overlayTileLayerUrl).toContain('tiles.openseamap.org/seamark');
    expect(config.overlayMaxNativeZoom).toBe(18);
    expect(config.overlayMaxZoom).toBe(22);
  });

  it('accepts zoom smoothness from env', () => {
    const config = resolveMapConfig({
      VITE_MAP_ZOOM_SNAP: '0.2',
      VITE_MAP_ZOOM_DELTA: '0.2',
      VITE_MAP_WHEEL_PX_PER_ZOOM_LEVEL: '140',
    });
    expect(config.zoomSnap).toBe(0.2);
    expect(config.zoomDelta).toBe(0.2);
    expect(config.wheelPxPerZoomLevel).toBe(140);
  });

  it('falls back to safe zoom defaults for empty/invalid env values', () => {
    const config = resolveMapConfig({
      VITE_MAP_ZOOM_SNAP: '',
      VITE_MAP_ZOOM_DELTA: '0',
      VITE_MAP_WHEEL_PX_PER_ZOOM_LEVEL: '-1',
    });
    expect(config.zoomSnap).toBe(1);
    expect(config.zoomDelta).toBe(1);
    expect(config.wheelPxPerZoomLevel).toBe(120);
  });
});
