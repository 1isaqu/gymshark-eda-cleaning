import { createMediaQueryHook } from "./useMediaQuery";

/**
 * Tracks the user's OS/browser `prefers-reduced-motion` setting.
 *
 * Every tilt, parallax, scroll-scrub, or ambient loop in a section MUST
 * check this hook and render a static or instant equivalent when it
 * returns true. Reacts live if the user flips the setting mid-session
 * (does not require a reload).
 *
 * Falls back to false where matchMedia is unavailable, which keeps the
 * animated path as the default rather than silently flattening the whole
 * page on an older browser.
 *
 * All callers share a single MediaQueryList and a single `change`
 * listener, so mounting many animated components costs one subscription
 * rather than one each.
 */
export const useReducedMotion = createMediaQueryHook(
  "(prefers-reduced-motion: reduce)",
  false,
);
