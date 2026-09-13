import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

type Listener = () => void;

/**
 * One process-wide MediaQueryList, created lazily on first use and shared by
 * every caller of the hook. Without this, each mounted component built its
 * own MediaQueryList plus its own `change` listener, so a page with dozens of
 * animated cards churned dozens of subscriptions on every mount/unmount.
 */
let mediaQuery: MediaQueryList | null = null;
let mediaQueryResolved = false;

function getMediaQuery(): MediaQueryList | null {
  if (mediaQueryResolved) return mediaQuery;
  mediaQueryResolved = true;
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    mediaQuery = null;
  } else {
    mediaQuery = window.matchMedia(QUERY);
  }
  return mediaQuery;
}

const listeners = new Set<Listener>();

function handleChange() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Attaches the single `change` listener when the first component subscribes
 * and detaches it when the last one leaves, so the browser only ever sees one
 * subscription no matter how many components are reading the preference.
 */
function subscribe(onStoreChange: Listener): () => void {
  const query = getMediaQuery();
  if (query === null) return () => {};

  if (listeners.size === 0) {
    query.addEventListener("change", handleChange);
  }
  listeners.add(onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      query.removeEventListener("change", handleChange);
    }
  };
}

function getSnapshot(): boolean {
  const query = getMediaQuery();
  return query === null ? false : query.matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks the user's OS/browser `prefers-reduced-motion` setting.
 *
 * Every tilt, parallax, scroll-scrub, or ambient loop in a section MUST
 * check this hook and render a static or instant equivalent when it
 * returns true. Reacts live if the user flips the setting mid-session
 * (does not require a reload).
 *
 * All callers share a single MediaQueryList and a single `change` listener,
 * so mounting many animated components costs one subscription, not one each.
 *
 * This is the project's own hook, independent of any animation
 * library's built-in equivalent, so it keeps working the same way
 * regardless of what drives a given animation (Motion, raw CSS,
 * IntersectionObserver, ...).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
