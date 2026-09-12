/*
  CategoryFinding.tsx
  ====================
  Section id "categories". Layout family: paired-bar comparison paired
  with a connected rank-shift diagram. Deliberately not a ranked list
  (that is Overview's layout) and not a sticky funnel (that is
  ImageFinding's layout, directly above this one).

  Part one mirrors each fragmented category's two raw spellings as a
  pair of bars either side of a center line, scaled to that pair's own
  larger count so every row stays legible regardless of how big the
  category is in absolute terms.

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
     bar is explicitly labelled as off scale where it is not to scale.
     Do not remove the label and keep the clamp.
*/
import { motion } from "motion/react";
import { SectionShell } from "../components/SectionShell";
import { findings } from "../lib/findings";
import { formatInteger, formatPercent } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";
import type { CategoryPair, CategoryRankNormalized } from "../data/findings";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* Fraction of the 200-unit bar track below which a minority bar stops
   being visible at every viewport this page supports. 0.06 of a track
   that is ~104px wide at md and ~76px at 375px lands at ~6px and
   ~4.5px, both readable as a mark. Rows clamped to it are labelled. */
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
  dominantRaw: string;
  dominantCount: number;
  minorRaw: string;
  minorCount: number;
  /** Honest minor/dominant ratio, used for the percentage readout. */
  trueScale: number;
  /** Ratio actually drawn, clamped up to MIN_MINOR_SCALE when needed. */
  drawnScale: number;
  isClamped: boolean;
}

function readPair(pair: CategoryPair): PairReading {
  const sorted = [...pair.variants].sort((a, b) => b.count - a.count);
  const dominant = sorted[0];
  const minor = sorted[1];
  const trueScale = minor.count / dominant.count;
  const drawnScale = Math.max(trueScale, MIN_MINOR_SCALE);
  return {
    dominantRaw: dominant.raw,
    dominantCount: dominant.count,
    minorRaw: minor.raw,
    minorCount: minor.count,
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
  pair: CategoryPair;
  reading: PairReading;
  reducedMotion: boolean;
}

function PairRow({ pair, reading, reducedMotion }: PairRowProps) {
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
          <p className="text-sm text-ink md:text-base">{reading.minorRaw}</p>
          <p className="numeral text-xs text-ink-muted">{formatInteger(reading.minorCount)}</p>
          <p className="text-xs text-ink-muted">
            <span className="numeral">{formatPercent(reading.trueScale * 100)}</span> of the
            larger spelling
            {reading.isClamped ? ", bar off scale" : null}
          </p>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        one category, "{pair.norm}": <span className="numeral">{formatInteger(pair.total)}</span>{" "}
        total once merged
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

  const readings = categories.pairs.map(readPair);
  const clampedCount = readings.filter((reading) => reading.isClamped).length;

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
      <div className="max-w-[65ch]">
        <h2 className="text-4xl tracking-tight text-ink md:text-6xl">
          Some categories were counted twice, just spelled differently.
        </h2>
        <p className="mt-6 text-base leading-relaxed text-ink-muted md:text-lg">
          The catalogue lists{" "}
          <span className="numeral text-ink">{formatInteger(categories.raw_unique)}</span> raw
          category names. Normalize case and whitespace and only{" "}
          <span className="numeral text-ink">{formatInteger(categories.normalized_unique)}</span>{" "}
          remain, through{" "}
          <span className="numeral text-ink">{formatInteger(categories.collapsed_groups)}</span>{" "}
          fragmented groups like these.
        </p>
      </div>

      <div className="mt-14 md:mt-20">
        <h3 className="text-2xl text-ink md:text-3xl">Same category, two spellings</h3>
        <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-ink-muted md:text-base">
          Each pair is drawn against its own larger spelling, so the long bar is always full
          width. In{" "}
          <span className="numeral text-ink">{formatInteger(clampedCount)}</span> of these{" "}
          <span className="numeral text-ink">{formatInteger(readings.length)}</span> pairs the
          smaller spelling is a fraction of one pixel at that scale. Those bars are held at a
          fixed minimum length so the mark still exists, and every one of them is labelled off
          scale. In those rows the percentage is the measurement, not the bar.
        </p>
        <div className="mt-8 flex flex-col">
          {categories.pairs.map((pair, index) => (
            <PairRow
              key={pair.norm}
              pair={pair}
              reading={readings[index]}
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

      <div className="mt-20 max-w-[65ch] md:mt-28">
        <p className="text-base leading-relaxed text-ink-muted md:text-lg">
          The fix that actually holds is not another cleaning rule. It belongs upstream,
          as a constrained field or a normalization step at the point of data entry or
          in the ETL job. A downstream rule only treats the symptom, and it gets
          reintroduced the next time this catalogue is exported.
        </p>
      </div>
    </SectionShell>
  );
}
