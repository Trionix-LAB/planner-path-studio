import { describe, expect, it } from 'vitest';

/**
 * Tests for the sequential overlay decode resolver-map pattern used in MapWorkspace
 * for both raster and vector overlay flows.
 */

function createDecodeSignal() {
  const resolvers = new Map<string, () => void>();

  const waitForDecode = (overlayId: string): Promise<void> =>
    new Promise<void>((resolve) => {
      resolvers.set(overlayId, resolve);
    });

  const signalComplete = (overlayId: string) => {
    const resolve = resolvers.get(overlayId);
    if (resolve) {
      resolvers.delete(overlayId);
      resolve();
    }
  };

  const cleanup = () => {
    for (const resolve of resolvers.values()) {
      resolve();
    }
    resolvers.clear();
  };

  return { waitForDecode, signalComplete, cleanup, resolvers };
}

describe('overlay decode queue resolver map (raster)', () => {
  it('resolves when the matching overlay ID is signaled', async () => {
    const { waitForDecode, signalComplete } = createDecodeSignal();

    const promise = waitForDecode('overlay-1');
    signalComplete('overlay-1');

    await expect(promise).resolves.toBeUndefined();
  });

  it('processes items sequentially in order', async () => {
    const { waitForDecode, signalComplete } = createDecodeSignal();
    const order: string[] = [];

    const p1 = waitForDecode('overlay-1');
    const p2 = waitForDecode('overlay-2');

    signalComplete('overlay-1');
    await p1;
    order.push('overlay-1');

    signalComplete('overlay-2');
    await p2;
    order.push('overlay-2');

    expect(order).toEqual(['overlay-1', 'overlay-2']);
  });

  it('handles three chained overlays', async () => {
    const { waitForDecode, signalComplete } = createDecodeSignal();
    const order: string[] = [];

    const p1 = waitForDecode('a');
    const p2 = waitForDecode('b');
    const p3 = waitForDecode('c');

    signalComplete('a');
    await p1;
    order.push('a');

    signalComplete('b');
    await p2;
    order.push('b');

    signalComplete('c');
    await p3;
    order.push('c');

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('does not resolve promise for non-matching ID', async () => {
    const { waitForDecode, signalComplete } = createDecodeSignal();
    let resolved = false;

    const promise = waitForDecode('overlay-1');
    void promise.then(() => {
      resolved = true;
    });

    signalComplete('other-id');
    await Promise.resolve();
    await Promise.resolve();

    expect(resolved).toBe(false);

    signalComplete('overlay-1');
    await promise;
    expect(resolved).toBe(true);
  });

  it('cleanup resolves all pending promises', async () => {
    const { waitForDecode, cleanup, resolvers } = createDecodeSignal();

    const p1 = waitForDecode('overlay-1');
    const p2 = waitForDecode('overlay-2');
    const p3 = waitForDecode('overlay-3');

    expect(resolvers.size).toBe(3);
    cleanup();
    expect(resolvers.size).toBe(0);

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
    await expect(p3).resolves.toBeUndefined();
  });

  it('works correctly after cleanup + re-use', async () => {
    const { waitForDecode, signalComplete, cleanup } = createDecodeSignal();

    const p1 = waitForDecode('old');
    cleanup();
    await p1;

    const p2 = waitForDecode('new');
    signalComplete('new');
    await expect(p2).resolves.toBeUndefined();
  });

  it('signalComplete is a no-op for unknown IDs', () => {
    const { signalComplete, resolvers } = createDecodeSignal();
    signalComplete('nonexistent');
    expect(resolvers.size).toBe(0);
  });
});

describe('overlay decode queue resolver map (vector)', () => {
  it('resolves visible overlays sequentially', async () => {
    const { waitForDecode, signalComplete } = createDecodeSignal();
    const order: string[] = [];

    const p1 = waitForDecode('vector-1');
    const p2 = waitForDecode('vector-2');

    signalComplete('vector-1');
    await p1;
    order.push('vector-1');

    signalComplete('vector-2');
    await p2;
    order.push('vector-2');

    expect(order).toEqual(['vector-1', 'vector-2']);
  });

  it('cleanup resolves pending vector overlays on mission switch', async () => {
    const { waitForDecode, cleanup, resolvers } = createDecodeSignal();

    const p1 = waitForDecode('vector-a');
    const p2 = waitForDecode('vector-b');
    expect(resolvers.size).toBe(2);

    cleanup();

    expect(resolvers.size).toBe(0);
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
  });
});
