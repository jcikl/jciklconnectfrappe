import { describe, expect, it, vi } from 'vitest';
import { constantStore, createStore } from './store';

describe('createStore', () => {
  it('starts on the first subscriber and stops after the last', () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const store = createStore(0, start);
    expect(start).not.toHaveBeenCalled();
    const a = store.subscribe(() => {});
    const b = store.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    a();
    expect(stop).not.toHaveBeenCalled();
    b();
    expect(stop).toHaveBeenCalledTimes(1);
    store.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('notifies listeners and keeps the snapshot stable between updates', () => {
    let set: (n: number) => void = () => {};
    const store = createStore(1, (s) => {
      set = s;
      return () => {};
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    set(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(2);
  });

  it('lets a start function publish synchronously', () => {
    const store = createStore('loading', (set) => {
      set('ready');
      return () => {};
    });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot()).toBe('ready');
  });
});

describe('constantStore', () => {
  it('always returns the same value', () => {
    const store = constantStore({ status: 'loading' });
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    unsubscribe();
  });
});
