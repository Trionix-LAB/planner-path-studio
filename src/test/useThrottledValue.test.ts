import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useThrottledValue } from '@/hooks/useThrottledValue';

describe('useThrottledValue', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useThrottledValue('a', 500));
    expect(result.current).toBe('a');
  });

  it('applies first change immediately', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('b');
  });

  it('throttles rapid consecutive updates after first change', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 500), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('b');

    rerender({ value: 'c' });
    expect(result.current).toBe('b');

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('b');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });

  it('applies latest pending value after throttle interval', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 500), {
      initialProps: { value: 1 },
    });

    rerender({ value: 2 });
    expect(result.current).toBe(2);

    rerender({ value: 3 });
    rerender({ value: 4 });
    expect(result.current).toBe(2);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(4);
    vi.useRealTimers();
  });
});
