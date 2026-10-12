import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from './api';

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError | Error };

export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []): [Resource<T>, () => void] {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const loader = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loader().then(
      (data) => alive && setState({ status: 'ready', data }),
      (error: unknown) => alive && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      alive = false;
    };
  }, [loader, tick]);
  return [state, () => setTick((t) => t + 1)];
}
