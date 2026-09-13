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

  Narrow viewports: the five items do not fit on a 375px phone (the list
  measures 395px of content in a 343px track), so the row is a horizontal
  scroller. A scroller with no affordance is the bug, not the scrolling:
  it used to leave the active item clipped past the right edge with no
  fade, no scrollbar and no auto-scroll. Two things fix that here, both
  driven imperatively so neither ever puts a continuous scroll value into
  React state:

    1. an edge fade (mask-image) that appears only on the side that has
       content left to reveal, so the row visibly reads as scrollable;
    2. scroll-into-view of the active item whenever scroll-spy moves it,
       honouring prefers-reduced-motion (instant instead of smooth).

  Both are no-ops the moment the row fits, so desktop is untouched.
*/
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "../lib/useReducedMotion";

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "price", label: "Price" },
  { id: "images", label: "Images" },
  { id: "categories", label: "Categories" },
  { id: "gallery", label: "Gallery" },
] as const;

/** Width of the scroll-affordance fade at each overflowing edge. */
const EDGE_FADE = "1.75rem";

/** Breathing room kept between the active item and the scroller's edge. */
const SCROLL_PADDING = 16;

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
  }, [setActive]);

  return active;
}

/**
 * The mask that tells a reader the row continues past an edge. Returns
 * "none" when nothing overflows, so a nav that fits carries no mask at
 * all and its first/last item are never dimmed.
 */
function edgeFadeMask(fadeStart: boolean, fadeEnd: boolean): string {
  if (fadeStart && fadeEnd) {
    return `linear-gradient(to right, transparent 0, black ${EDGE_FADE}, black calc(100% - ${EDGE_FADE}), transparent 100%)`;
  }
  if (fadeStart) {
    return `linear-gradient(to right, transparent 0, black ${EDGE_FADE})`;
  }
  if (fadeEnd) {
    return `linear-gradient(to right, black calc(100% - ${EDGE_FADE}), transparent 100%)`;
  }
  return "none";
}

/**
 * Keeps the edge fades in sync with the scroller. Deliberately writes
 * straight to the element's style: scroll position is a continuous
 * value, so it never becomes React state, and a scroll that does not
 * change which edges overflow writes nothing at all.
 */
function useEdgeFade(listRef: RefObject<HTMLUListElement | null>): void {
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    let applied = "";
    const update = () => {
      const maxScroll = list.scrollWidth - list.clientWidth;
      const overflows = maxScroll > 1;
      const next = edgeFadeMask(
        overflows && list.scrollLeft > 1,
        overflows && list.scrollLeft < maxScroll - 1,
      );
      if (next === applied) return;
      applied = next;
      list.style.setProperty("mask-image", next);
      list.style.setProperty("-webkit-mask-image", next);
    };

    update();
    list.addEventListener("scroll", update, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resizeObserver?.observe(list);

    return () => {
      list.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [listRef]);
}

/**
 * Scrolls the active item back into the visible part of the row when
 * scroll-spy moves the highlight onto an item that is off-screen. Uses
 * "nearest" semantics (only moves when the item is actually clipped)
 * and is a no-op on any viewport where the row already fits.
 */
function useScrollActiveIntoView(
  listRef: RefObject<HTMLUListElement | null>,
  active: string,
  reducedMotion: boolean,
): void {
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const maxScroll = list.scrollWidth - list.clientWidth;
    if (maxScroll <= 1) return;

    const link = list.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (!link) return;

    // Position of the item inside the scrollable content, measured from
    // rects so it does not depend on which ancestor is the offsetParent.
    const listRect = list.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const itemStart = linkRect.left - listRect.left + list.scrollLeft - SCROLL_PADDING;
    const itemEnd = itemStart + linkRect.width + SCROLL_PADDING * 2;

    let left = list.scrollLeft;
    if (itemStart < left) {
      left = itemStart;
    } else if (itemEnd > left + list.clientWidth) {
      left = itemEnd - list.clientWidth;
    }
    left = Math.max(0, Math.min(left, maxScroll));
    if (Math.abs(left - list.scrollLeft) < 1) return;

    list.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
  }, [listRef, active, reducedMotion]);
}

export function SiteNav() {
  const active = useActiveSection();
  const reducedMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement | null>(null);

  useEdgeFade(listRef);
  useScrollActiveIntoView(listRef, active, reducedMotion);

  /*
    A bare <section> is not focusable, so activating the skip link only
    moved the hash: focus stayed on <body> and a screen-reader user was
    never placed at the content. Giving the target tabindex="-1" is the
    standard fix, and it is applied here, on activation, because the
    section element belongs to another file. Default link behaviour is
    left intact, so the hash update and the smooth scroll still come
    from the browser.
  */
  const focusSkipTarget = useCallback(() => {
    const target = document.getElementById(NAV_ITEMS[0].id);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    target.focus({ preventScroll: true });
  }, []);

  return (
    <>
      {/* Skip link: visually hidden until keyboard-focused. */}
      <a
        href={`#${NAV_ITEMS[0].id}`}
        onClick={focusSkipTarget}
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
              wrapping to a second row. The edge fade and the
              scroll-into-view above are what make that scroller
              legible; see the file header. */}
          <ul
            ref={listRef}
            className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto"
          >
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
