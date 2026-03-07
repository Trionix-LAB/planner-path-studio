import { useEffect, useRef, useState } from 'react';

export const useThrottledValue = <T,>(value: T, intervalMs: number): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const previousValueRef = useRef<T>(value);
  const pendingValueRef = useRef<T>(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateAtRef = useRef<number>(0);
  const isFirstChangeRef = useRef<boolean>(true);

  useEffect(() => {
    if (Object.is(previousValueRef.current, value)) return;
    previousValueRef.current = value;
    pendingValueRef.current = value;

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      lastUpdateAtRef.current = Date.now();
      setThrottledValue(value);
      return;
    }

    const emit = () => {
      timeoutRef.current = null;
      lastUpdateAtRef.current = Date.now();
      setThrottledValue(pendingValueRef.current);
    };

    if (isFirstChangeRef.current) {
      isFirstChangeRef.current = false;
      emit();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdateAtRef.current;
    if (elapsed >= intervalMs) {
      emit();
      return;
    }

    if (timeoutRef.current !== null) {
      return;
    }

    timeoutRef.current = setTimeout(emit, intervalMs - elapsed);
  }, [intervalMs, value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledValue;
};
