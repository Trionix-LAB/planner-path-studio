import { describe, expect, it } from 'vitest';
import { moveRasterOverlayByDelta } from '@/features/map/rasterOverlays/reorder';
import { describe as vitestDescribe, expect as vitestExpect, it as vitestIt } from 'vitest';

type Overlay = { id: string; z_index: number; name: string };

const base = (): Overlay[] => [
  { id: 'a', z_index: 1, name: 'A' },
  { id: 'b', z_index: 2, name: 'B' },
  { id: 'c', z_index: 3, name: 'C' },
];

vitestDescribe('moveRasterOverlayByDelta', () => {
  vitestIt('moves overlay one step up (higher z-index)', () => {
    const moved = moveRasterOverlayByDelta(base(), 'b', 1);
    vitestExpect(moved.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    vitestExpect(moved.map((item) => item.z_index)).toEqual([1, 2, 3]);
  });

  vitestIt('moves overlay one step down (lower z-index)', () => {
    const moved = moveRasterOverlayByDelta(base(), 'b', -1);
    vitestExpect(moved.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    vitestExpect(moved.map((item) => item.z_index)).toEqual([1, 2, 3]);
  });

  vitestIt('does not move beyond top/bottom bounds', () => {
    const topUp = moveRasterOverlayByDelta(base(), 'c', 1);
    const bottomDown = moveRasterOverlayByDelta(base(), 'a', -1);
    vitestExpect(topUp).toEqual(base());
    vitestExpect(bottomDown).toEqual(base());
  });
});
