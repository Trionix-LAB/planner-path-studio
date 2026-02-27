import { bboxToTileRange, enumerateTiles, latToTileY, lonToTileX } from '@/features/map/offlineTiles/tileMath';

describe('tile math', () => {
  it('converts lon/lat to tile indices with clamping', () => {
    expect(lonToTileX(-180, 2)).toBe(0);
    expect(lonToTileX(180, 2)).toBe(3);
    expect(latToTileY(85, 2)).toBeGreaterThanOrEqual(0);
    expect(latToTileY(-85, 2)).toBeLessThanOrEqual(3);
  });

  it('builds tile range and enumerates tiles', () => {
    const range = bboxToTileRange(
      {
        north: 10,
        south: -10,
        west: -10,
        east: 10,
      },
      3,
    );

    expect(range.zoom).toBe(3);
    expect(range.tilesCount).toBeGreaterThan(0);

    const tiles = enumerateTiles(range);
    expect(tiles.length).toBe(range.tilesCount);
    expect(tiles.every((tile) => tile.z === 3)).toBe(true);
  });
});
