import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getInitialPreference(): boolean {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

/**
 * Tracks the user's OS/browser `prefers-reduced-motion` setting.
 *
 * Every tilt, parallax, scroll-scrub, or ambient loop in a section MUST
 * check this hook and render a static or instant equivalent when it
 * returns true. Reacts live if the user flips the setting mid-session
 * (does not require a reload).
 *
 * This is the project's own hook, independent of any animation
 * library's built-in equivalent, so it keeps working the same way
 * regardless of what drives a given animation (Motion, raw CSS,
 * IntersectionObserver, ...).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitialPreference);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mediaQuery = window.matchMedia(QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}
