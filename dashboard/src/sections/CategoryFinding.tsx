/*
  CategoryFinding.tsx
  ====================
  Section id "categories". Layout family: paired-bar comparison paired
  with a connected rank-shift diagram. Deliberately not a ranked list
  (that is Overview's layout) and not a sticky funnel (that is
  ImageFinding's layout, directly above this one).

  Part one mirrors each fragmented category's raw spellings as a pair
  of bars either side of a center line, scaled to that pair's own
  larger count so every row stays legible regardless of how big the
  category is in absolute terms. Every group in the current export
  holds exactly two spellings, but the generator emits every distinct
  spelling for any normalized key with more than one, so a future
  export can carry three or more. The left bar is always the dominant
  spelling; the right bar is every other spelling combined, and each
  of those spellings is listed with its own count beside it. Nothing
  in a group is dropped, and the per-row totals keep adding up.

  Part two draws the top-10 raw ranking next to the top-10 normalized
  ranking and connects matching categories with a line. In the real
  data every rank_delta is 0, so the honest reading is: the lines run
  flat, the leaderboard barely reorders, only the counts next to it
  change. The component does not editorialize that into a dramatic
  reshuffle it is not.

  No eyebrow in this section (the page's two eyebrows both belong to
  Overview and ImageFinding).

  Two things here are load-bearing and easy to break again:

  1. ANIMATION TRIGGER. The bars must NOT own their own whileInView.
     A bar is an SVG <rect> inside its own tiny <svg> viewport. At
     scaleX(0) with originX 1 it collapses to a zero-width line sitting
     exactly on that svg's right edge, the svg clips it, and Motion's
     IntersectionObserver therefore never reports an intersection, so
     the enter animation never fires and the bar stays invisible
     forever. The fix is variant propagation: the PairRow wrapper is a
     normal block-level div that always has real layout box, it owns
     initial="hidden" / whileInView="shown", and the bars only declare
     matching variants. The trigger then never depends on the geometry
     of the element being animated.

  2. SCALE HONESTY. Minor-to-dominant ratios in this dataset run down
     to roughly 0.003, which is well under one pixel of track. A bar
     that renders at 0.3px carries no signal at all, which defeats the
     whole point of a section about the same category counted twice. So
     the minority bar is clamped to MIN_MINOR_SCALE, and every clamped
     row says so on screen and prints the true share as a percentage
     next to it. The quantitative claim is carried by the number; the
     bar is explicitly labeled as off scale where it is not to scale.
     Do not remove the label and keep the clamp.
*/
import { motion } from "motion/react";
import { SectionShell } from "../components/SectionShell";
import { findings } from "../lib/findings";
import { formatInteger, formatPercent } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";
import type { CategoryPair, CategoryRankNormalized, CategoryVariant } from "../data/findings";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* Fraction of the 200-unit bar track below which a minority bar stops
   being visible at every viewport this page supports. 0.06 of a track
   that is ~104px wide at md and ~76px at 375px lands at ~6px and
   ~4.5px, both readable as a mark. Rows clamped to it are labeled. */
const MIN_MINOR_SCALE = 0.06;

const rowVariants = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
};

function barVariants(target: number, delay: number) {
  return {
    hidden: { scaleX: 0 },
    shown: {
      scaleX: target,
      transition: { duration: 0.6, ease: EASE_OUT, delay },
    },
  };
}

interface PairReading {
  pair: CategoryPair;
  dominantRaw: string;
  dominantCount: number;
  /** Every spelling except the dominant one, count descending. Usually
   *  one, never silently truncated when the export carries more. */
  others: CategoryVariant[];
  /** Sum of `others`, which is what the right-hand bar measures. */
  othersCount: number;
  /** Honest others/dominant ratio, used for the percentage readout. */
  trueScale: number;
  /** Ratio actually drawn, clamped up to MIN_MINOR_SCALE when needed. */
  drawnScale: number;
  isClamped: boolean;
}

/* Returns null for a group that cannot be drawn as a comparison at all
   (no spellings, or a single spelling that never fragmented). The
   generator only emits keys with more than one spelling, so this is a
   guard against a malformed export rather than an expected branch. */
function readPair(pair: CategoryPair): PairReading | null {
  const sorted = [...pair.variants].sort((a, b) => b.count - a.count);
  const dominant = sorted[0];
  const others = sorted.slice(1);
  if (!dominant || others.length === 0 || dominant.count <= 0) {
    return null;
  }
  const othersCount = others.reduce((sum, variant) => sum + variant.count, 0);
  const trueScale = othersCount / dominant.count;
  const drawnScale = Math.max(trueScale, MIN_MINOR_SCALE);
  return {
    pair,
    dominantRaw: dominant.raw,
    dominantCount: dominant.count,
    others,
    othersCount,
    trueScale,
    drawnScale,
    isClamped: drawnScale > trueScale,
  };
}

interface BarProps {
  target: number;
  originX: 0 | 1;
  fill: string;
  reducedMotion: boolean;
  delay?: number;
}

/* No initial / whileInView / viewport here on purpose. See note 1 at
   the top of this file: the animate state arrives from PairRow through
   variant propagation, because this element's own bounding box is zero
   while it is hidden and cannot be observed. */
function Bar({ target, originX, fill, reducedMotion, delay = 0 }: BarProps) {
  if (reducedMotion) {
    return (
      <rect
        x={0}
        y={4}
        width={200}
        height={12}
        fill={fill}
        style={{
          transform: `scaleX(${target})`,
          transformOrigin: originX === 1 ? "100% 50%" : "0% 50%",
        }}
      />
    );
  }
  return (
    <motion.rect
      x={0}
      y={4}
      width={200}
      height={12}
      fill={fill}
      style={{ originX }}
      variants={barVariants(target, delay)}
    />
  );
}

interface PairRowProps {
  reading: PairReading;
  reducedMotion: boolean;
}

function PairRow({ reading, reducedMotion }: PairRowProps) {
  return (
    <motion.div
      initial={reducedMotion ? false : "hidden"}
      whileInView={reducedMotion ? undefined : "shown"}
      viewport={{ once: true, amount: 0.4 }}
      variants={reducedMotion ? undefined : rowVariants}
      className="py-5 first:pt-0"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-5">
        <div className="text-right">
          <p className="text-sm text-ink md:text-base">{reading.dominantRaw}</p>
          <p className="numeral text-xs text-ink-muted">
            {formatInteger(reading.dominantCount)}
          </p>
        </div>

        <div className="flex w-[9.5rem] items-center md:w-[13rem]">
          <svg
            viewBox="0 0 200 20"
            className="h-4 w-1/2"
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            <Bar target={1} originX={1} fill="var(--accent)" reducedMotion={reducedMotion} />
          </svg>
          <div className="mx-1.5 h-6 w-px shrink-0 bg-rule md:mx-2" />
          <svg
            viewBox="0 0 200 20"
            className="h-4 w-1/2"
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            <Bar
              target={reading.drawnScale}
              originX={0}
              fill="var(--ink-muted)"
              reducedMotion={reducedMotion}
              delay={0.08}
            />
          </svg>
        </div>

        <div className="text-left">
          {reading.others.map((variant) => (
            <div key={variant.raw} className="mt-1.5 first:mt-0">
              <p className="text-sm text-ink md:text-base">{variant.raw}</p>
              <p className="numeral text-xs text-ink-muted">{formatInteger(variant.count)}</p>
            </div>
          ))}
          <p className="text-xs text-ink-muted">
            <span className="numeral">{formatPercent(reading.trueScale * 100)}</span>{" "}
            {reading.others.length > 1
              ? "combined, against the largest spelling"
              : "of the larger spelling"}
            {reading.isClamped ? ", bar off scale" : null}
          </p>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        one category, "{reading.pair.norm}":{" "}
        <span className="numeral">{formatInteger(reading.pair.total)}</span> total once merged
      </p>
    </motion.div>
  );
}

interface RankLink {
  key: string;
  normalized: CategoryRankNormalized;
  yLeft: number;
  yRight: number;
  countDelta: number;
}

export function CategoryFinding() {
  const reducedMotion = useReducedMotion();
  const { categories } = findings;

  const rawByLabel = new Map(
    categories.top10_raw.map((entry) => [entry.label.toLowerCase(), entry]),
  );

  const readings = categories.pairs
    .map(readPair)
    .filter((reading): reading is PairReading => reading !== null);
  const clampedCount = readings.filter((reading) => reading.isClamped).length;
  /* Every group in the current export has exactly two spellings, so the
     heading says two. If an export ever carries a group with three, the
     heading stops claiming a number it cannot keep. */
  const everyGroupIsAPair = readings.every((reading) => reading.others.length === 1);

  /* Opening specimen: the loudest two spellings of the largest
     fragmented group, read off the export rather than typed in, so the
     section can open on the raw evidence instead of on another
     headline-then-lead-stat move. Falls back to no specimen if a future
     export ever ships without pairs. */
  const specimen = categories.pairs[0]
    ? [...categories.pairs[0].variants].sort((a, b) => b.count - a.count)
    : [];

  const rowHeight = 34;
  const diagramHeight = rowHeight * categories.top10_normalized.length;

  const links: RankLink[] = categories.top10_normalized.map((normalized, index) => {
    const raw = rawByLabel.get(normalized.label.toLowerCase());
    const rawIndex = raw ? raw.rank - 1 : index;
    return {
      key: normalized.label,
      normalized,
      yLeft: rawIndex * rowHeight + rowHeight / 2,
      yRight: index * rowHeight + rowHeight / 2,
      countDelta: raw ? normalized.count - raw.count : 0,
    };
  });

  return (
    <SectionShell id="categories">
      {/* Opening. This section leads with the evidence itself, two raw
          labels lifted straight out of the export, before it names the
          problem, so it does not repeat the headline-then-lead-stat move
          the sections above it use. */}
      <div className="max-w-[65ch]">
        {specimen.length > 1 ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-rule pl-4 font-mono text-sm text-ink-muted md:text-base">
            <span className="text-ink">{specimen[0].raw}</span>
            <span aria-hidden="true">/</span>
            <span className="text-ink">{specimen[1].raw}</span>
            <span className="font-sans">
              one category, spelled more than one way
            </span>
          </div>
        ) : null}
        <h2 className="mt-6 text-4xl tracking-tight text-ink md:text-6xl">
          Some categories were counted twice, just spelled differently.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-ink-muted md:text-lg">
          The missing photos were a join that picked the wrong row. This is the
          plainer failure sitting underneath it. The catalog lists{" "}
          <span className="numeral text-ink">{formatInteger(categories.raw_unique)}</span> raw
          category names. Normalize case and whitespace and only{" "}
          <span className="numeral text-ink">{formatInteger(categories.normalized_unique)}</span>{" "}
          remain, through{" "}
          <span className="numeral text-ink">{formatInteger(categories.collapsed_groups)}</span>{" "}
          fragmented groups like that one.
        </p>
      </div>

      <div className="mt-14 md:mt-20">
        <h3 className="text-2xl text-ink md:text-3xl">
          {everyGroupIsAPair ? "Same category, two spellings" : "Same category, several spellings"}
        </h3>
        <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-ink-muted md:text-base">
          Each pair is drawn against its own larger spelling, so the long bar is always full
          width. In{" "}
          <span className="numeral text-ink">{formatInteger(clampedCount)}</span> of these{" "}
          <span className="numeral text-ink">{formatInteger(readings.length)}</span> pairs the
          smaller spelling is a fraction of one pixel at that scale. Those bars are held at a
          fixed minimum length so the mark still exists, and every one of them is labeled off
          scale. In those rows the percentage is the measurement, not the bar.
        </p>
        <div className="mt-8 flex flex-col">
          {readings.map((reading) => (
            <PairRow
              key={reading.pair.norm}
              reading={reading}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </div>

      <div className="mt-20 md:mt-28">
        <h3 className="text-2xl text-ink md:text-3xl">The top ten barely moves</h3>
        <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-ink-muted md:text-lg">
          None of the ten biggest categories change rank once casing is fixed. The count
          next to a few of them moves, by a little. That is the real finding here: the
          numbers were wrong, not the leaderboard.
        </p>

        {/* Desktop / tablet: connected rank-shift diagram. */}
        <div className="mt-10 hidden md:grid md:grid-cols-[1fr_8.5rem_1fr] md:gap-6">
          <div className="flex flex-col" style={{ height: diagramHeight }}>
            {categories.top10_raw.map((entry) => (
              <div
                key={entry.label}
                className="flex items-center justify-end gap-3"
                style={{ height: rowHeight }}
              >
                <span className="numeral text-xs text-ink-muted">
                  {formatInteger(entry.count)}
                </span>
                <span className="text-sm text-ink">{entry.label}</span>
              </div>
            ))}
          </div>

          <svg
            viewBox={`0 0 136 ${diagramHeight}`}
            className="h-full w-full"
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            {links.map((link) => (
              <line
                key={link.key}
                x1={0}
                y1={link.yLeft}
                x2={136}
                y2={link.yRight}
                stroke="var(--rule)"
                strokeWidth={1.5}
              />
            ))}
            {links.map((link) => (
              <circle key={`${link.key}-l`} cx={0} cy={link.yLeft} r={3} fill="var(--ink-muted)" />
            ))}
            {links.map((link) => (
              <circle
                key={`${link.key}-r`}
                cx={136}
                cy={link.yRight}
                r={3}
                fill="var(--accent)"
              />
            ))}
          </svg>

          <div className="flex flex-col" style={{ height: diagramHeight }}>
            {links.map((link) => (
              <div
                key={link.key}
                className="flex items-center gap-3"
                style={{ height: rowHeight }}
              >
                <span className="text-sm text-ink">{link.normalized.label}</span>
                <span className="numeral text-xs text-ink-muted">
                  {formatInteger(link.normalized.count)}
                </span>
                {link.countDelta !== 0 ? (
                  <span className="numeral text-xs text-accent">
                    {link.countDelta > 0 ? "+" : "-"}
                    {formatInteger(Math.abs(link.countDelta))}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile fallback: the sticky two-column diagram collapses to one
            stacked list, no connecting lines, spacing instead of hairlines. */}
        <div className="mt-8 flex flex-col gap-3 md:hidden">
          {links.map((link) => (
            <div key={link.key} className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="numeral text-xs text-ink-muted">
                  {formatInteger(link.normalized.rank)}
                </span>
                <span className="text-sm text-ink">{link.normalized.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="numeral text-sm text-ink">
                  {formatInteger(link.normalized.count)}
                </span>
                {link.countDelta !== 0 ? (
                  <span className="numeral text-xs text-accent">
                    {link.countDelta > 0 ? "+" : "-"}
                    {formatInteger(Math.abs(link.countDelta))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RECOMMENDATION BLOCK. One of three on the page (price, images,
          categories). The device is shared byte for byte across all three
          sections so the judgment calls read as one recurring move: a 2px
          ink rule above, a sans heading opening with "The
          recommendation:", and body copy in PRIMARY ink one step up the
          type scale from the section's prose. Do not restyle one of the
          three on its own. */}
      <div className="mt-20 max-w-[62ch] border-t-2 border-ink pt-7 md:mt-28">
        <h3 className="font-sans text-2xl tracking-tight text-ink md:text-3xl">
          The recommendation: constrain the field, do not clean it downstream.
        </h3>
        <p className="mt-5 text-lg leading-relaxed text-ink md:text-xl">
          The fix that actually holds is not another cleaning rule. It belongs
          upstream, as a constrained field or a normalization step at the point
          of data entry or in the ETL job. A downstream rule only treats the
          symptom, and the symptom comes back the next time this catalog is
          exported.
        </p>
      </div>

      {/* Closing synthesis. This is the last of the three findings, so it
          carries the line that ties them together and hands the reader on
          to the gallery. */}
      <p className="mt-12 max-w-[62ch] text-base leading-relaxed text-ink-muted md:text-lg">
        Three findings, one shape. A price that was typed wrong, a photo that
        was joined wrong, a label that was spelled wrong. Not one of them is
        fixed by making the output look tidier, and all three point back at the
        moment the data was entered, which is the only place a fix survives the
        next export. What follows is the catalog itself, the photos and the
        prices exactly as the pipeline leaves them.
      </p>
    </SectionShell>
  );
}
