/*
  SiteNav.tsx
  ===========
  Single-line, scroll-spy site navigation. Owned by Agent E.

  Active-section tracking uses IntersectionObserver (never a scroll
  listener recomputing offsets, per the project's motion rules). Anchor
  links are plain <a href="#id"> so the smooth-scroll / reduced-motion
  behaviour already declared once in global.css (`html { scroll-behavior:
  smooth }`, disabled under `prefers-reduced-motion: reduce`) applies
  automatically, no extra JS scrolling logic needed here.
*/
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "price", label: "Price" },
  { id: "images", label: "Images" },
  { id: "categories", label: "Categories" },
  { id: "gallery", label: "Gallery" },
] as const;

/**
 * Tracks which section id is currently "active" for nav highlighting.
 * Uses a single IntersectionObserver watching all five section
 * elements, with a thin trigger band near the top of the viewport
 * rather than the true top edge, so a section is marked active once
 * it has meaningfully entered view, not the instant its bottom pixel
 * appears.
 */
function useActiveSection(): string {
  const [active, setActive] = useState<string>(NAV_ITEMS[0].id);

  useEffect(() => {
    const elements = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActive(topmost.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return active;
}

export function SiteNav() {
  const active = useActiveSection();

  return (
    <>
      {/* Skip link: visually hidden until keyboard-focused. */}
      <a
        href="#overview"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-paper"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 h-16 border-b border-rule bg-paper/90 backdrop-blur">
        <nav
          aria-label="Section navigation"
          className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 md:px-8"
        >
          <span className="hidden shrink-0 font-mono text-xs uppercase tracking-[0.14em] text-ink-muted sm:block">
            Gymshark EDA
          </span>

          {/* flex-nowrap + overflow-x-auto: the nav condenses into a
              scrollable single line on narrow screens instead of ever
              wrapping to a second row. */}
          <ul className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? "location" : undefined}
                    className={[
                      "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                      isActive ? "bg-accent-soft text-ink" : "text-ink-muted hover:text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
    </>
  );
}
