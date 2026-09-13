/*
  GalleryCard.tsx
  ===============
  The cursor-tracked 3D tilt product card. Owned by Agent E.

  Consumes `useTilt()` from `lib/useTilt.ts` (owned by the supervising
  agent) exactly as documented there: this file does not edit, does not
  reimplement, and does not copy the tilt response curve. `rotateX` /
  `rotateY` are currently pinned flat while a human tunes the curve in
  parallel; every wiring below is written so the card tilts correctly
  the moment that curve starts returning real degrees.

  ----------------------------------------------------------------------
  THE 3D CONTEXT (read before touching the class lists)
  ----------------------------------------------------------------------
  `transform-style: preserve-3d` is destroyed by ANY `overflow` value
  other than `visible` on the same element. The CSS spec forces such an
  element to establish a flattened stacking context, so every
  `translateZ` on its children collapses to zero and the card renders as
  a flat rotating rectangle with no parallax at all.

  So the two jobs are deliberately split across two different elements:

    outer  motion.div  -> rotation + `preserve-3d`. NEVER give this
                          element `overflow-hidden`. Its rounded corners
                          come from `rounded-card` + `border`, which clip
                          nothing and therefore cost nothing.
    inner  photo frame -> `overflow-hidden` + `rounded-t-card`, so the
                          photo (and its hover scale, and the specular
                          wash) are clipped to the card's top corners.
                          Flattening here is harmless: nothing inside the
                          frame needs depth of its own, and the frame is
                          still positioned in 3D by its parent.

  Depth beyond a flat rotation comes from three things layered on top of
  the hook's outputs, all driven by transform/opacity/box-shadow motion
  values, never by useState:
    1. A parent `perspective` (so rotateX/rotateY read as depth).
    2. Two internal layers (photo, text) each pinned to a different
       translateZ inside the rotated `preserve-3d` card, so they
       separate from one another as the card tilts (parallax).
    3. A depth shadow and a specular highlight, both derived from
       `hoverProgress` (and, for the shadow's offset, from the tilt
       angle itself), using the project's own `--shadow` and `--accent`
       tokens as the only colour inputs (no raw hex/rgb/hsl anywhere).

  ----------------------------------------------------------------------
  HONESTY OF THE IMAGE (findings.json `image_is_borrowed`)
  ----------------------------------------------------------------------
  Two gallery products have no photo of their own, so the image filler
  documented in the image finding gave them a photo taken from a
  different product. Those rows carry `image_is_borrowed: true` and the
  card labels itself. The label claims only what the flag actually
  proves: the photo is borrowed, and this variant had none of its own.
  It does not claim to know which product lent it.

  ----------------------------------------------------------------------
  ACCESSIBILITY
  ----------------------------------------------------------------------
  The photo sits directly beside an `<h3>` holding the same product
  title, so a non-empty `alt` would make every card announce its name
  twice. The photo is therefore marked decorative (`alt=""`) and the
  heading is the single accessible name. The borrowed-photo label is
  real text in the DOM, so it reaches assistive tech on its own.
*/
import { useCallback, useState } from "react";
import { motion, useMotionTemplate, useTransform } from "motion/react";
import { useTilt } from "../lib/useTilt";
import { formatCurrency } from "../lib/format";
import type { GalleryItem } from "../data/findings";

/** Alias kept so the card's prop type reads locally. `image_is_borrowed`
 * now lives in the shared `GalleryItem` declaration. */
export type GalleryCardItem = GalleryItem;

function ImageOffIcon({ className }: { className?: string }) {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="M4 17l5-5 3 3 4-4 4 4" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

function AlertGlyph({ className }: { className?: string }) {
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
      <path d="M12 3.5l9 16h-18l9-16z" />
      <line x1="12" y1="10" x2="12" y2="13.5" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Two frames, one lending to the other: the borrowed-photo mark. */
function BorrowedGlyph({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="13" height="13" />
      <path d="M8 21h13V8" />
    </svg>
  );
}

interface GalleryCardProps {
  item: GalleryCardItem;
}

export function GalleryCard({ item }: GalleryCardProps) {
  const tilt = useTilt();
  const { reducedMotion } = tilt;
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  // A cached photo can finish decoding BEFORE React attaches onLoad, in
  // which case the `load` event has already fired and the card would sit
  // at opacity-0 forever on a warm second visit. Settle from the
  // element's own `complete` / `naturalWidth` on mount as well, so the
  // state never depends on winning that race.
  const settleFromElement = useCallback((node: HTMLImageElement | null) => {
    if (!node || !node.complete) return;
    setStatus(node.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  // Specular highlight: a small radial wash of the page's one signal
  // colour, positioned at the raw (unsprung) pointer position so the
  // glint tracks the cursor tightly, faded in with hoverProgress.
  const glareOpacity = useTransform(tilt.hoverProgress, [0, 1], [0, 0.5]);
  const glareBackground = useMotionTemplate`radial-gradient(220px circle at ${tilt.glareX} ${tilt.glareY}, var(--accent) 0%, transparent 60%)`;

  // Depth shadow: grows and softens with hoverProgress, and drifts
  // opposite the tilt direction, as if a single light source sits
  // above the grid and the card is lifting toward it.
  const shadowDriftX = useTransform(tilt.rotateY, (value) => value * -1.6);
  const shadowDriftY = useTransform(tilt.rotateX, (value) => value * 1.6);
  const shadowLift = useTransform(tilt.hoverProgress, [0, 1], [6, 22]);
  const shadowOffsetY = useTransform(
    [shadowDriftY, shadowLift],
    ([drift, lift]: number[]) => drift + lift,
  );
  const shadowBlur = useTransform(tilt.hoverProgress, [0, 1], [16, 44]);
  const shadowSpread = useTransform(tilt.hoverProgress, [0, 1], [-6, -10]);
  const boxShadow = useMotionTemplate`${shadowDriftX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px var(--shadow)`;

  // `will-change` is a compositor hint, not a style: a permanent one on
  // all 48 cards would hold 48 layer backing stores for the whole
  // session, for cards the pointer may never reach. So it is driven off
  // the same hover spring as everything else and is a MotionValue, which
  // means the promotion is written straight to the node with no React
  // re-render. It goes up as soon as the hover spring leaves rest and
  // comes back down only after the spring has settled home, so the layer
  // exists for the whole tilt, including the return journey.
  const willChange = useTransform(tilt.hoverProgress, (value) =>
    Math.abs(value) > 0.001 ? "transform" : "auto",
  );

  return (
    <div style={reducedMotion ? undefined : { perspective: "1200px" }} className="h-full">
      <motion.div
        ref={tilt.ref}
        {...tilt.handlers}
        data-tilt-card=""
        style={
          reducedMotion
            ? undefined
            : {
                rotateX: tilt.rotateX,
                rotateY: tilt.rotateY,
                transformStyle: "preserve-3d",
                boxShadow,
                willChange,
              }
        }
        // No `overflow-hidden` here on purpose. See the 3D context note
        // at the top of this file: it would flatten `preserve-3d` and
        // kill both translateZ layers below.
        className={[
          "group relative flex h-full flex-col rounded-card border bg-paper-raised transition-colors",
          item.is_outlier ? "border-alert/50" : "border-rule hover:border-accent/60",
          reducedMotion ? "shadow-[0_10px_30px_-14px_var(--shadow)]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Photo layer: clipping lives HERE, not on the 3D parent.
            Pinned closer to the viewer than the text layer below, so
            the two visibly separate as the card tilts. */}
        <div
          data-tilt-layer="photo"
          className="relative aspect-[4/5] w-full overflow-hidden rounded-t-card bg-surface"
          style={reducedMotion ? undefined : { transform: "translateZ(22px)" }}
        >
          {status !== "error" ? (
            <img
              ref={settleFromElement}
              src={item.image}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
              className={[
                "h-full w-full object-cover transition-[opacity,transform] duration-500",
                status === "loaded" ? "opacity-100" : "opacity-0",
                reducedMotion ? "" : "group-hover:scale-[1.045]",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <ImageOffIcon className="h-7 w-7 text-ink-muted" />
              {/* text-ink-muted, not text-ink-faint: ink-faint measures
                  2.86:1 on --surface in light mode, and tokens.css
                  documents it as large-text and icon use only. */}
              <p className="text-xs text-ink-muted">Image unavailable</p>
            </div>
          )}

          {/* The frame's own bg-surface is the loading placeholder. No
              pulse: 48 cards mount at once and the project contract
              allows at most one infinite ambient loop on the page. The
              image's opacity transition is the arrival cue instead. */}

          {item.image_is_borrowed && status !== "error" ? (
            <p className="absolute bottom-2 left-2 flex items-center gap-1.5 border border-rule bg-paper-raised px-2 py-1 text-xs text-ink-muted">
              <BorrowedGlyph className="h-3 w-3 shrink-0" />
              Borrowed photo
            </p>
          ) : null}

          {!reducedMotion && status === "loaded" && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ opacity: glareOpacity, background: glareBackground, mixBlendMode: "soft-light" }}
            />
          )}
        </div>

        {/* Text layer: pinned further forward than the photo, the
            strongest part of the parallax read. */}
        <div
          data-tilt-layer="text"
          className="flex flex-1 flex-col gap-1.5 p-4"
          style={reducedMotion ? undefined : { transform: "translateZ(38px)" }}
        >
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{item.title}</h3>
          <p className="text-xs text-ink-muted">{item.product_type}</p>
          <p className="numeral mt-1 text-sm text-ink">{formatCurrency(item.price)}</p>

          {item.image_is_borrowed ? (
            <p className="mt-1 text-xs leading-snug text-ink-muted">
              No photo of its own, so the image filler borrowed one.
            </p>
          ) : null}

          {item.is_outlier && item.note ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-alert">
              <AlertGlyph className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{item.note}</span>
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
