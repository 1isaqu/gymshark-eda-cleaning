/*
  Gallery.tsx
  ===========
  The payoff section: a product grid of cursor-tilted cards. Owned by
  Agent E. Layout family: product grid of 3D tilt cards, distinct from
  every other section's composition (asymmetric hero, full-bleed strip
  plot, sticky-pinned funnel, paired-bar diagram).

  No eyebrow (per the section brief). Every number here (item counts,
  borrowed-photo count) is derived at runtime from `findings.gallery`
  and formatted through `lib/format.ts`, never hardcoded.

  COPY HONESTY: an earlier draft of this headline claimed every photo in
  the grid was real, while two cards showed a photo lent to them by a
  different product (`image_is_borrowed`). The copy below states the
  borrowed case instead of glossing it, and the cards label themselves.
  It is meant to read as a callback to the image finding above, not as
  an apology.

  DONOR COUNT: the borrowed cards currently resolve to ONE donor photo,
  so a reader filtering to that category sees two different titles over
  the same frame. That is the filler working as documented, not a
  rendering bug, so the lead paragraph says it. The claim is derived
  (`new Set(borrowed.map(item => item.image)).size`), never typed: if a
  future export lends from several donors the sentence switches to the
  counted variant on its own, and with fewer than two borrowed rows it
  disappears entirely.

  COUNTER: the visible count and the aria-live announcement both read
  `renderedItems.length`, which is the exact array the grid maps over,
  so the two can never drift from what is on screen under any filter.
*/
import { useMemo, useState } from "react";
import { findings } from "../lib/findings";
import { formatInteger } from "../lib/format";
import { SectionShell } from "../components/SectionShell";
import { GalleryCard } from "./GalleryCard";
import type { GalleryCardItem } from "./GalleryCard";

const ALL_LABEL = "All";

const galleryItems: GalleryCardItem[] = findings.gallery;

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}

export function Gallery() {
  const productTypes = useMemo(
    () => Array.from(new Set(galleryItems.map((item) => item.product_type))).sort(),
    [],
  );
  const pillOptions = useMemo(() => [ALL_LABEL, ...productTypes], [productTypes]);
  const [activeFilter, setActiveFilter] = useState<string>(ALL_LABEL);

  const renderedItems = useMemo(
    () =>
      activeFilter === ALL_LABEL
        ? galleryItems
        : galleryItems.filter((item) => item.product_type === activeFilter),
    [activeFilter],
  );

  const borrowedItems = useMemo(
    () => galleryItems.filter((item) => item.image_is_borrowed),
    [],
  );
  const borrowedCount = borrowedItems.length;
  /** How many distinct photographs the borrowed cards resolve to. 1 means
   *  every borrowed card is showing the same frame as the others. */
  const borrowedSourceCount = useMemo(
    () => new Set(borrowedItems.map((item) => item.image)).size,
    [borrowedItems],
  );

  const shownCount = renderedItems.length;
  const totalCount = galleryItems.length;

  return (
    <SectionShell id="gallery">
      <div className="max-w-2xl">
        <h2 className="text-4xl tracking-tight text-ink md:text-6xl">
          The photos are real, some of them borrowed. Only the depth is invented.
        </h2>
        <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-ink-muted md:text-lg">
          Hover a card for a cursor tracked tilt, and filter by category below.{" "}
          <span className="numeral text-ink">{formatInteger(borrowedCount)}</span> of these{" "}
          <span className="numeral text-ink">{formatInteger(totalCount)}</span> photos belong to a
          different product: those variants had none of their own, so the image filler from earlier
          on this page lent them one, and the cards say so.{" "}
          {borrowedCount > 1 && borrowedSourceCount === 1 ? (
            <>
              One donor photo covers all of them, so those cards repeat a single frame rather than
              showing two garments that happen to look alike.{" "}
            </>
          ) : null}
          {borrowedCount > 1 && borrowedSourceCount > 1 ? (
            <>
              They were lent by{" "}
              <span className="numeral text-ink">{formatInteger(borrowedSourceCount)}</span> different
              donor photos.{" "}
            </>
          ) : null}
          Flagged products also carry a note on the pricing anomaly.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by product type" className="flex flex-wrap gap-2">
          {pillOptions.map((option) => {
            const isActive = option === activeFilter;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveFilter(option)}
                // min-h-11 (44px) with the label centred inside: the old
                // px-4 py-1.5 pill measured 30px tall, under the 44px
                // touch-target guidance, with only the 8px gap-2 between
                // the wrapped rows on a 375px phone.
                className={[
                  "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                  isActive
                    ? "border-accent bg-accent text-paper"
                    : "border-rule bg-surface text-ink-muted hover:border-accent/60 hover:text-ink",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>

        {/* aria-atomic so the whole sentence is re-announced on a filter
            change, not just the digits that happened to mutate. The
            sr-only clause names the active category, which the visible
            pills already communicate visually. */}
        <p
          data-gallery-counter=""
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-ink-muted"
        >
          <span className="numeral text-ink">{formatInteger(shownCount)}</span> of{" "}
          <span className="numeral text-ink">{formatInteger(totalCount)}</span> products shown
          <span className="sr-only">
            {activeFilter === ALL_LABEL ? ", no category filter" : `, filtered to ${activeFilter}`}
          </span>
        </p>
      </div>

      {shownCount > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {renderedItems.map((item) => (
            <GalleryCard key={item.handle} item={item} />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 border border-dashed border-rule bg-surface/60 px-6 py-16 text-center">
          <EmptyIcon className="h-9 w-9 text-ink-muted" />
          <p className="text-base text-ink-muted">No products match this filter.</p>
          <button
            type="button"
            onClick={() => setActiveFilter(ALL_LABEL)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Show all products
          </button>
        </div>
      )}
    </SectionShell>
  );
}
