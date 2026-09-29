/** A value that changes over time; the shape React's useSyncExternalStore expects. */
export interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

/**
 * A store that runs `start` when it gets its first subscriber and runs the returned stop function
 * when the last one leaves. `start` receives `set` to publish new values (it may call it synchronously).
 */
export function createStore<T>(initial: T, start: (set: (next: T) => void) => () => void): Store<T> {
  let value = initial;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    value = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) stop = start(set);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          const running = stop;
          stop = null;
          running();
        }
      };
    },
  };
}

export function constantStore<T>(value: T): Store<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} };
}
