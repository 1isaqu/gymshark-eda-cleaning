/*
  A media query read as React state, with one browser subscription per
  query no matter how many components read it.

  The naive version of this hook builds a MediaQueryList and attaches a
  `change` listener inside every component instance. The gallery mounts
  48 cards, each of which asks about motion preference and pointer
  capability, so that shape costs 96 subscriptions and 96 teardowns on
  every mount. Here each distinct query gets one module-level store, and
  components subscribe to that instead of to the browser.

  The listener itself is only attached while at least one component is
  subscribed, and is removed when the last one unmounts, so nothing is
  left running for a query nothing reads.
*/
import { useSyncExternalStore } from "react";

type Listener = () => void;

interface QueryStore {
  subscribe: (onStoreChange: Listener) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
}

const stores = new Map<string, QueryStore>();

function createStore(query: string, fallback: boolean): QueryStore {
  const listeners = new Set<Listener>();
  let mediaQuery: MediaQueryList | null = null;
  let resolved = false;

  // Resolved lazily rather than at module load: matchMedia does not exist
  // during server rendering, and touching it at import time would make
  // this module unsafe to import there at all.
  const get = (): MediaQueryList | null => {
    if (resolved) return mediaQuery;
    resolved = true;
    mediaQuery =
      typeof window === "undefined" || !("matchMedia" in window)
        ? null
        : window.matchMedia(query);
    return mediaQuery;
  };

  const handleChange = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(onStoreChange) {
      const mql = get();
      if (mql === null) return () => {};

      if (listeners.size === 0) mql.addEventListener("change", handleChange);
      listeners.add(onStoreChange);

      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) mql.removeEventListener("change", handleChange);
      };
    },
    getSnapshot() {
      const mql = get();
      return mql === null ? fallback : mql.matches;
    },
    getServerSnapshot() {
      return fallback;
    },
  };
}

/**
 * Build a hook for one media query.
 *
 * `fallback` is the answer when matchMedia is unavailable (server render,
 * or a browser old enough to lack it). Choose it so the fallback is the
 * safe behaviour for that specific query, not simply `false`.
 *
 * Call this at module scope, not inside a component: the returned hook is
 * a normal hook, but building a new one per render would defeat the
 * shared store.
 */
export function createMediaQueryHook(query: string, fallback: boolean) {
  let store = stores.get(query);
  if (!store) {
    store = createStore(query, fallback);
    stores.set(query, store);
  }
  const shared = store;

  return function useMediaQuery(): boolean {
    return useSyncExternalStore(
      shared.subscribe,
      shared.getSnapshot,
      shared.getServerSnapshot,
    );
  };
}
