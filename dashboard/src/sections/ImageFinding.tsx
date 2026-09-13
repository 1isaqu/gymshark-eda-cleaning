/*
  ImageFinding.tsx
  ================
  Section id "images". Layout family: sticky-pinned stepped funnel.

  The left column pins in place (position: sticky) while the right
  column steps through what the fill loop actually did, as you scroll.
  The hand-authored SVG in the left column is a propagation chain, not a
  tier funnel: clean donor rows seed token guesses, those guesses
  propagate across handles, and a residue is never reached. It is driven
  by useScroll/useTransform against one shared container ref (never
  useState for the scroll value itself).

  On screens under 768px the sticky column releases into normal flow and
  everything stacks top to bottom, per the mobile fallback rule.

  Owns EYEBROW #2, the last eyebrow allowed on the page.

  NARRATIVE NOTE (read before editing the copy):
  An earlier version of this section claimed that most missing photos
  were "one join away" and were borrowed from a sibling variant of the
  same product. That claim is false, and the section is deliberately
  written against it. `findings.images.provenance` records the real
  shape: zero of the filled rows found a genuine same-handle sibling
  that already carried a photo. The 101 / 20 split between tier 1 and
  tier 3 is an artifact of row order, because the filler mutates the
  dataframe while iterating over it: tier 1 is inheriting tier 3's
  guesses, not the other way round. Tier 2's zero is NOT an ordering
  artifact and must not be explained as one. No missing row has a same
  title and type donor at any point in the pass, so that rule has
  nothing to match in any row order. Do not write that tier 1 got
  there first. Do not reintroduce the sibling framing, and do not
  inflate this into more than it is: a data-quality observation about a
  heuristic.
*/
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { SectionShell } from "../components/SectionShell";
import { Figure } from "../components/Figure";
import { findings } from "../lib/findings";
import { formatCurrency, formatInteger, formatPercent } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";

/*
  `findings.d.ts` is owned by another agent and does not yet describe the
  regenerated `images.provenance` object, so read it through a local
  structural type. The bridge is type level only: the generator writes
  these five fields, and the cast stays correct if the shared type is
  later widened to include them.
*/
const STICKY_QUERY = "(min-width: 768px)";

/**
 * Discrete boolean for "the left column is actually pinned right now".
 * Below 768px the sticky column releases into normal flow, so the chain
 * scrolls out of view long before the scroll container finishes, and a
 * scrubbed reveal would leave the reader looking at empty bars. This is
 * a breakpoint flag, not a continuous scroll value, so useState is the
 * right tool for it.
 */
function useStickyColumn(): boolean {
  const [sticky, setSticky] = useState(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return true;
    return window.matchMedia(STICKY_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mediaQuery = window.matchMedia(STICKY_QUERY);
    setSticky(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => setSticky(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return sticky;
}

/*
  TWO POPULATIONS, TWO ENCODINGS, TWO SCALES.
  The donor row counts rows that already had a photo. The three rows under
  it are a partition of the rows that shipped with none (20 + 101 + 7 =
  128). Those are different populations, so drawing all four as bars on one
  shared max invites a reader to add them up and get a number that means
  nothing. The donors are therefore drawn as one square per row, a unit
  chart on its own scale, separated by a rule; the three bars below are all
  measured against the missing total, so they fill exactly one track
  between them.
*/
const CHAIN_BAR_MAX = 196;
const CHAIN_BAR_HEIGHT = 14;
const CHAIN_VALUE_X = CHAIN_BAR_MAX + 8;
const CHAIN_UNIT_SIZE = 10;
const CHAIN_UNIT_PITCH = 16;
const CHAIN_DONOR_LABEL_Y = 16;
const CHAIN_DONOR_UNIT_Y = 24;
const CHAIN_DIVIDER_Y = 56;
const CHAIN_GROUP_LABEL_Y = 78;
const CHAIN_ROW_TOP = 94;
const CHAIN_ROW_PITCH = 76;

/** Top edge of the bar drawn for partition row `index`. */
function chainBarTop(index: number): number {
  return CHAIN_ROW_TOP + index * CHAIN_ROW_PITCH + 14;
}

interface ChainUnitRowProps {
  label: string;
  value: number;
  opacity: number | MotionValue<number>;
}

/**
 * The donor population. One square per row, never a bar, so it cannot be
 * read as a slice of the partition below it.
 */
function ChainUnitRow({ label, value, opacity }: ChainUnitRowProps) {
  const units = Array.from({ length: value }, (_, unit) => unit);

  return (
    <g>
      <text x={0} y={CHAIN_DONOR_LABEL_Y} fontSize={9} fill="var(--ink-muted)">
        {label}
      </text>
      <motion.g style={{ opacity }}>
        {units.map((unit) => (
          <rect
            key={unit}
            x={unit * CHAIN_UNIT_PITCH}
            y={CHAIN_DONOR_UNIT_Y}
            width={CHAIN_UNIT_SIZE}
            height={CHAIN_UNIT_SIZE}
            fill="var(--ink)"
          />
        ))}
      </motion.g>
      <text
        x={CHAIN_VALUE_X}
        y={CHAIN_DONOR_UNIT_Y + 9}
        fontSize={12}
        className="numeral"
        fill="var(--ink)"
      >
        {formatInteger(value)}
      </text>
    </g>
  );
}

interface ChainRowProps {
  index: number;
  label: string;
  value: number;
  /** Shared denominator for the partition: the initial missing count. */
  denominator: number;
  scale: number | MotionValue<number>;
  tone: "guess" | "residue";
}

/** One share of the missing rows, measured against the missing total. */
function ChainRow({ index, label, value, denominator, scale, tone }: ChainRowProps) {
  const top = CHAIN_ROW_TOP + index * CHAIN_ROW_PITCH;
  const barTop = top + 14;
  const barWidth = Math.max(6, (value / denominator) * CHAIN_BAR_MAX);

  return (
    <g>
      <text x={0} y={top + 6} fontSize={9} fill="var(--ink-muted)">
        {label}
      </text>
      <rect
        x={0}
        y={barTop}
        width={CHAIN_BAR_MAX}
        height={CHAIN_BAR_HEIGHT}
        fill="var(--surface)"
      />
      {tone === "residue" ? (
        <motion.rect
          x={0}
          y={barTop}
          width={barWidth}
          height={CHAIN_BAR_HEIGHT}
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          style={{ scaleX: scale, originX: 0 }}
        />
      ) : (
        <motion.rect
          x={0}
          y={barTop}
          width={barWidth}
          height={CHAIN_BAR_HEIGHT}
          fill="var(--accent)"
          style={{ scaleX: scale, originX: 0 }}
        />
      )}
      <text
        x={CHAIN_VALUE_X}
        y={barTop + 11}
        fontSize={12}
        className="numeral"
        fill="var(--ink)"
      >
        {formatInteger(value)}
      </text>
    </g>
  );
}

interface ChainLinkProps {
  /** Bottom edge of the mark this link leaves. */
  from: number;
  /** Top edge of the mark this link arrives at. */
  to: number;
  progress: number | MotionValue<number>;
  dashed: boolean;
}

/** The connector drawn between one stage of the chain and the next. */
function ChainLink({ from, to, progress, dashed }: ChainLinkProps) {
  const d = `M18 ${from + 6} L18 ${to} M13 ${to - 6} L18 ${to} L23 ${to - 6}`;

  if (dashed) {
    return (
      <motion.path
        d={d}
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        style={{ opacity: progress }}
      />
    );
  }

  return (
    <motion.path
      d={d}
      fill="none"
      stroke="var(--ink-faint)"
      strokeWidth={1.5}
      style={{ pathLength: progress }}
    />
  );
}

export function ImageFinding() {
  const { images } = findings;
  const provenance = images.provenance;
  const [tierHandle, tierType, tierToken, tierClosing] = images.tiers;

  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const stickyColumn = useStickyColumn();
  /* Scrub only where the diagram stays pinned next to the steps. */
  const scrub = stickyColumn && !reducedMotion;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const donorScale = useTransform(scrollYProgress, [0, 0.1], [0, 1]);
  const link0 = useTransform(scrollYProgress, [0.1, 0.16], [0, 1]);
  const seedScale = useTransform(scrollYProgress, [0.16, 0.26], [0, 1]);
  const link1 = useTransform(scrollYProgress, [0.26, 0.32], [0, 1]);
  const spreadScale = useTransform(scrollYProgress, [0.32, 0.44], [0, 1]);
  const link2 = useTransform(scrollYProgress, [0.44, 0.5], [0, 1]);
  const residueScale = useTransform(scrollYProgress, [0.5, 0.6], [0, 1]);

  /*
    The closing paragraph used to hand-write what the unresolved rows are.
    Read it off the rows instead, so a regenerated export cannot leave the
    prose describing products that are no longer in the list.
  */
  const unresolvedTypes = Array.from(
    new Set(images.unresolved_rows.map((row) => row.product_type)),
  );
  const soleUnresolvedType =
    unresolvedTypes.length === 1 ? unresolvedTypes[0] : null;
  const unresolvedPrices = images.unresolved_rows.map((row) => row.price);
  const unresolvedMinPrice = Math.min(...unresolvedPrices);
  const unresolvedMaxPrice = Math.max(...unresolvedPrices);

  const easeOut = [0.16, 1, 0.3, 1] as const;
  const stepClassName = "md:flex md:min-h-[50vh] md:flex-col md:justify-center";
  const stepMotion = {
    initial: reducedMotion ? undefined : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: 0.6, ease: easeOut },
  } as const;

  return (
    <SectionShell id="images">
      {/* Opening. The other findings open headline then prose; this one
          puts the evidence between them, so the reader meets the two
          numbers before the explanation of them, and the prose opens by
          handing off from the price finding rather than restarting. */}
      <div className="max-w-[68ch]">
        {/* EYEBROW #2, the last one allowed on the page. Its treatment is
            shared byte for byte with EYEBROW #1 in Overview
            (font-mono text-xs uppercase tracking-[0.14em] text-accent)
            so the two read as one recurring device. If you restyle one,
            restyle both. */}
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
          Missing images
        </p>
        <h2 className="mt-4 text-4xl tracking-tight text-ink md:text-6xl">
          <span className="numeral">{formatInteger(images.resolved)}</span> photos
          resolved.{" "}
          <span className="numeral">
            {formatInteger(provenance.genuine_sibling_resolutions)}
          </span>{" "}
          of them from a real sibling.
        </h2>
      </div>

      <div className="mt-10 flex flex-col gap-6 border-t border-rule pt-8 sm:flex-row sm:items-end sm:gap-14 md:mt-12">
        <div>
          <span className="numeral block text-7xl leading-none text-accent md:text-8xl">
            {formatInteger(provenance.genuine_sibling_resolutions)}
          </span>
          <p className="mt-3 max-w-[34ch] text-sm text-ink-muted">
            of the filled rows borrowed from a genuine variant of their own
            product
          </p>
        </div>
        <div>
          <span className="numeral block text-3xl leading-none text-ink md:text-4xl">
            {formatPercent(images.resolved_pct)}
          </span>
          <p className="mt-3 max-w-[34ch] text-sm text-ink-muted">
            of the gaps were closed, every one of them with a photo of a
            different product
          </p>
        </div>
      </div>

      <p className="mt-10 max-w-[68ch] text-base leading-relaxed text-ink-muted md:mt-12 md:text-lg">
        The price error announced itself: one value, nowhere near the others,
        visible in any plot of the column. This one arrives reported as a
        success.{" "}
        <span className="numeral text-ink">
          {formatInteger(images.initial_missing)}
        </span>{" "}
        rows shipped with no photo, and the cleaner reports that a three tier
        fallback chain filled{" "}
        <span className="numeral text-ink">{formatInteger(images.resolved)}</span>{" "}
        of them. Tracing where each borrowed photo actually came from tells a
        different story. At the moment the fill loop started, not one of those
        rows had a same handle sibling that already carried a photo.
      </p>

      <div ref={containerRef} className="relative mt-16 md:mt-24">
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-16">
          {/* Left: sticky propagation chain. Releases to normal flow below md. */}
          <div className="md:sticky md:top-24 md:h-fit md:self-start">
            <Figure
              caption={
                <>
                  <span className="numeral">
                    {formatInteger(provenance.distinct_clean_donor_rows)}
                  </span>{" "}
                  clean donor rows, one square each, seeded{" "}
                  <span className="numeral">
                    {formatInteger(provenance.token_guess_seeds)}
                  </span>{" "}
                  token guesses, which propagated to{" "}
                  <span className="numeral">
                    {formatInteger(provenance.propagated_from_guesses)}
                  </span>{" "}
                  more rows. The three bars under the rule are the{" "}
                  <span className="numeral">
                    {formatInteger(images.initial_missing)}
                  </span>{" "}
                  rows that shipped with no photo, split three ways and drawn
                  against that total. The squares above the rule are a
                  different population on a different scale, so the two do not
                  add up.
                </>
              }
            >
              <div className="border border-rule bg-paper-raised p-5 md:p-6">
                <svg
                  viewBox="0 0 252 290"
                  className="h-auto w-full"
                  role="presentation"
                  aria-hidden="true"
                >
                  <ChainLink
                    from={CHAIN_DONOR_UNIT_Y + CHAIN_UNIT_SIZE}
                    to={chainBarTop(0)}
                    progress={scrub ? link0 : 1}
                    dashed={false}
                  />
                  <ChainLink
                    from={chainBarTop(0) + CHAIN_BAR_HEIGHT}
                    to={chainBarTop(1)}
                    progress={scrub ? link1 : 1}
                    dashed={false}
                  />
                  <ChainLink
                    from={chainBarTop(1) + CHAIN_BAR_HEIGHT}
                    to={chainBarTop(2)}
                    progress={scrub ? link2 : 1}
                    dashed
                  />
                  <ChainUnitRow
                    label="Rows with a real photo, used as donors"
                    value={provenance.distinct_clean_donor_rows}
                    opacity={scrub ? donorScale : 1}
                  />
                  {/* The rule splits the two populations. It breaks around
                      x=18 so the causal link can pass through it. */}
                  <line
                    x1={0}
                    y1={CHAIN_DIVIDER_Y}
                    x2={10}
                    y2={CHAIN_DIVIDER_Y}
                    stroke="var(--rule)"
                    strokeWidth={1}
                  />
                  <line
                    x1={26}
                    y1={CHAIN_DIVIDER_Y}
                    x2={CHAIN_BAR_MAX}
                    y2={CHAIN_DIVIDER_Y}
                    stroke="var(--rule)"
                    strokeWidth={1}
                  />
                  <text
                    x={32}
                    y={CHAIN_GROUP_LABEL_Y}
                    fontSize={9}
                    fill="var(--ink-muted)"
                  >
                    Of the{" "}
                    <tspan className="numeral">
                      {formatInteger(images.initial_missing)}
                    </tspan>{" "}
                    rows with no photo:
                  </text>
                  <ChainRow
                    index={0}
                    label="Token guesses written during the loop"
                    value={provenance.token_guess_seeds}
                    denominator={images.initial_missing}
                    scale={scrub ? seedScale : 1}
                    tone="guess"
                  />
                  <ChainRow
                    index={1}
                    label="Rows that copied a guess forward"
                    value={provenance.propagated_from_guesses}
                    denominator={images.initial_missing}
                    scale={scrub ? spreadScale : 1}
                    tone="guess"
                  />
                  <ChainRow
                    index={2}
                    label="Never reached, still missing"
                    value={images.unresolved}
                    denominator={images.initial_missing}
                    scale={scrub ? residueScale : 1}
                    tone="residue"
                  />
                </svg>
              </div>
            </Figure>
          </div>

          {/* Right: steps. Each one reveals as it enters the viewport. */}
          <div className="flex flex-col gap-20 py-4 md:gap-32 md:py-12">
            <motion.div {...stepMotion} className={stepClassName}>
              <h3 className="text-2xl text-ink md:text-3xl">
                What the tier counts reported
              </h3>
              <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                The metrics dict comes out of the cleaner looking like a ranking
                of match quality: most of the work done by the strictest rule,
                none by the middle one, a tail by the loosest, a handful left
                over. Read top to bottom it says the gaps were mostly one join
                away. That reading does not survive contact with the loop.
              </p>
              <ul className="mt-6 divide-y divide-rule border-y border-rule">
                {images.tiers.map((tier) => (
                  <li
                    key={tier.key}
                    className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 py-3"
                  >
                    <span className="text-sm text-ink">{tier.label}</span>
                    <span className="numeral text-sm text-ink-muted">
                      {formatInteger(tier.products)}
                    </span>
                    <span className="numeral w-14 text-right text-sm text-ink-faint">
                      {formatInteger(tier.remaining_after)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-faint">
                Rows filled by the rule, then rows still missing after it.
              </p>
            </motion.div>

            <motion.div {...stepMotion} className={stepClassName}>
              <h3 className="text-2xl text-ink md:text-3xl">
                What the fill loop actually did
              </h3>
              <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                The filler walks the rows and writes into the same dataframe it
                is iterating over. The first row of any handle has no sibling
                image to borrow, so it falls through to the loosest rule and
                takes a photo from a different product that happens to share the
                first word of its title. That guess is now sitting in the frame.
                Every later row with the same handle matches the strictest rule
                against it and copies it forward.
              </p>
              <p className="mt-4 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                So the{" "}
                <span className="numeral text-ink">
                  {formatInteger(tierHandle.products)}
                </span>{" "}
                rows credited to {tierHandle.label.toLowerCase()} are not
                evidence of a good match. They are copies of the{" "}
                <span className="numeral text-ink">
                  {formatInteger(tierToken.products)}
                </span>{" "}
                guesses made by {tierToken.label.toLowerCase()}, one step
                earlier in the same pass.
              </p>
            </motion.div>

            <motion.div {...stepMotion} className={stepClassName}>
              <h3 className="text-2xl text-ink md:text-3xl">
                Why the split is order dependent
              </h3>
              <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                Which rule gets the credit depends on which row of a handle the
                loop happens to reach first. Re-sort the input CSV and the same{" "}
                <span className="numeral text-ink">
                  {formatInteger(images.initial_missing)}
                </span>{" "}
                gaps resolve to a different split, with the same photos, from
                the same data. The counts are output, not measurement.
              </p>
              <p className="mt-4 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                The middle rule is the one exception, and it fails for a
                different reason. {tierType.label} fires on{" "}
                <span className="numeral text-ink">
                  {formatInteger(tierType.products)}
                </span>{" "}
                rows, not because a stricter rule reached them first. No row
                that shipped without a photo has an exact title and type twin
                that carries one, at the start of the pass or at the end of it.
                The test never had anything to match, in any row order, which is
                worth knowing before shipping it as a tier.
              </p>
            </motion.div>

            <motion.div {...stepMotion} className={stepClassName}>
              <h3 className="text-2xl text-ink md:text-3xl">
                What is actually true
              </h3>
              <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                Strip the ordering artifact out and the chain is short.{" "}
                <span className="numeral text-ink">
                  {formatInteger(provenance.distinct_clean_donor_rows)}
                </span>{" "}
                rows with genuine photos acted as donors. They seeded{" "}
                <span className="numeral text-ink">
                  {formatInteger(provenance.token_guess_seeds)}
                </span>{" "}
                token guesses, which propagated to{" "}
                <span className="numeral text-ink">
                  {formatInteger(provenance.propagated_from_guesses)}
                </span>{" "}
                further rows. All{" "}
                <span className="numeral text-ink">
                  {formatInteger(images.resolved)}
                </span>{" "}
                filled rows now display a photo of a product that is not the
                product in the row.
              </p>
              <p className="mt-4 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                No data was lost and nothing was corrupted. The photos are real
                photos, the join that chose them was the wrong join, and the
                tier counts hid that rather than showing it. Worth saying
                plainly: this was found by tracing provenance, not by reading
                the summary, because the summary looked fine.
              </p>
            </motion.div>

            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: easeOut }}
            >
              <h3 className="text-2xl text-ink md:text-3xl">
                {tierClosing.label}
              </h3>
              <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-ink-muted">
                <span className="numeral text-ink">
                  {formatInteger(images.unresolved)}
                </span>{" "}
                rows reach the end of the chain with nothing to borrow, not even
                a bad guess.{" "}
                {soleUnresolvedType ? (
                  <>
                    Every one of them carries the same product type,{" "}
                    <span className="text-ink">
                      &ldquo;{soleUnresolvedType}&rdquo;
                    </span>
                    , and{" "}
                  </>
                ) : (
                  <>They span{" "}
                    <span className="numeral text-ink">
                      {formatInteger(unresolvedTypes.length)}
                    </span>{" "}
                    product types, and{" "}
                  </>
                )}
                {unresolvedMinPrice === unresolvedMaxPrice ? (
                  <>
                    every one is priced at{" "}
                    <span className="numeral text-ink">
                      {formatCurrency(unresolvedMinPrice)}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    every one is priced between{" "}
                    <span className="numeral text-ink">
                      {formatCurrency(unresolvedMinPrice)}
                    </span>{" "}
                    and{" "}
                    <span className="numeral text-ink">
                      {formatCurrency(unresolvedMaxPrice)}
                    </span>
                    .
                  </>
                )}{" "}
                The whole list fits here.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {images.unresolved_rows.map((row) => (
                  <div key={row.handle}>
                    <p className="text-sm text-ink">{row.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {row.product_type},{" "}
                      <span className="numeral">{formatCurrency(row.price)}</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* RECOMMENDATION BLOCK. One of three on the page (price,
                  images, categories). The device is shared byte for byte
                  across all three sections so the judgment calls read as
                  one recurring move: a 2px ink rule above, a sans heading
                  opening with "The recommendation:", and body copy in
                  PRIMARY ink one step up the type scale from the
                  section's prose. Do not restyle one of the three on its
                  own. */}
              <div className="mt-12 max-w-[62ch] border-t-2 border-ink pt-7">
                <h3 className="font-sans text-2xl tracking-tight text-ink md:text-3xl">
                  The recommendation: fix these by hand, do not build a fourth tier.
                </h3>
                <p className="mt-5 text-lg leading-relaxed text-ink md:text-xl">
                  A fourth matching tier would be built to chase this last
                  sliver, and it would not be worth maintaining. Fixing these{" "}
                  <span className="numeral">
                    {formatInteger(images.unresolved)}
                  </span>{" "}
                  products by hand, with real photos, costs less than designing
                  and maintaining a rule that fires this rarely. The larger fix
                  sits one level up: fill in a single pass over a frozen copy of
                  the frame, and flag every borrowed image as borrowed, so nobody
                  downstream reads one as the product&rsquo;s own photo.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
