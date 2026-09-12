/*
  PriceFinding.tsx
  ================
  Section id "price". Layout family: full-bleed data plot with anchored
  annotation.

  WHY THIS PLOT HAS NO viewBox
  ----------------------------
  The first version drew the whole figure inside a 1200x300 viewBox and
  let it scale to the container. That is fine for marks and fatal for
  type: at 375px the SVG scales by about 0.29, so an 11px axis label
  renders at roughly 3 CSS pixels. Uniformly scaled text is not
  readable text.

  The fix, chosen over "vector-effect" tricks and over shipping two
  separate figures:

    1. The SVG has no viewBox. It is sized by CSS (a fixed height, 100%
       width) and every mark is positioned in PERCENTAGE coordinates
       (cx/cy/x1/y1 accept percentages, which resolve against the SVG's
       own viewport). Percentages keep the composition responsive while
       radii, stroke widths and offsets stay in real CSS pixels, so
       nothing shrinks with the viewport.
    2. Every piece of text is HTML, not <text>, rendered in an absolutely
       positioned overlay layer that shares the plot's percentage
       coordinate space. Labels therefore sit on the project type scale
       (text-xs = 12px at 375px, text-sm = 14px from md up), pick up the
       real font stack and token colours, and can be measured and read
       like any other text on the page.

  Because HTML labels and SVG marks are driven by the same PLOT
  constants, they cannot drift apart.

  The x-axis is deliberately broken: a linear axis across the whole
  domain would flatten the cloud into an unreadable smear against
  $1,000. The break is drawn and labeled, so it is a broken axis rather
  than a lie about scale. `price.histogram` is skipped per the build
  contract, since its final bin is a $900-wide overflow bin next to
  seventeen uniform $5 bins.

  HONEST SAMPLING
  ---------------
  The cloud is a 700 row sample of the 44,818 rows priced under the
  threshold, while all 12 outlier rows are drawn. One dark dot is
  therefore worth about 64 rows and one red dot is worth exactly one,
  which makes the red cluster look roughly 64 times heavier than its
  real rate. That ratio is stated in the caption and in the accessible
  description instead of being left silently distorted.

  Below the plot: a bare divide-y ledger of the 12 outlier rows (no
  cards), grouped by product so the identical, size-independent $1,000
  price is obvious at a glance, then the recommendation.

  No eyebrow in this section (the page's two eyebrows belong to
  Overview and Image Finding).
*/
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { SectionShell } from "../components/SectionShell";
import { Figure } from "../components/Figure";
import { findings } from "../lib/findings";
import { formatCurrency, formatInteger, formatMultiple } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";

type Outlier = (typeof findings)["price"]["outliers"][number];

// Deterministic pseudo-random jitter (no Math.random, so the plot is
// stable across re-renders and StrictMode's double-invoke in dev).
function hashJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function groupByHandle(rows: Outlier[]): Outlier[][] {
  const order: string[] = [];
  const groups = new Map<string, Outlier[]>();
  for (const row of rows) {
    if (!groups.has(row.handle)) {
      order.push(row.handle);
      groups.set(row.handle, []);
    }
    groups.get(row.handle)!.push(row);
  }
  return order.map((handle) => groups.get(handle)!);
}

/* --------------------------------------------------------------------
   Plot geometry. Every number here is a PERCENTAGE of the plot box,
   except the handful explicitly suffixed Px. Two linear segments share
   one y band, separated by an explicit visual break.
   -------------------------------------------------------------------- */
const LEFT = 6;
const MAIN_END = 58;
const BREAK_END = 65;
const RIGHT = 94;
const BREAK_CENTER = (MAIN_END + BREAK_END) / 2;
const OUTLIER_CENTER = (BREAK_END + RIGHT) / 2;
const AXIS_Y = 80;
const BAND_Y = 55;
const CLOUD_JITTER_Y = 19;
const OUTLIER_JITTER_X = 3.6;
const OUTLIER_JITTER_Y = 13;

// Vertical extents stay in percent so nothing needs calc() inside an
// SVG geometry attribute (x1/y1/x2/y2 are plain attributes, not CSS
// properties, so calc() would not parse there). The plot box only
// varies between 340px and 380px tall, so a percent reads as a stable
// pixel size at every width.
const TICK_MARK_LEN = 1.8;
const BREAK_MARK_HALF = 2.8;
const BREAK_MARK_GAP_PX = 3.5;

// HTML label offsets, in real CSS pixels, applied with calc() on the
// overlay (which is HTML, where calc() is valid).
const TICK_LABEL_OFFSET_PX = 9;
const BREAK_LABEL_OFFSET_PX = 32;

const pct = (value: number) => `${value}%`;

const price = findings.price;
const sample = price.strip_sample;

const sampleMin = Math.min(...sample);
const sampleMax = Math.max(...sample);
const domainMax = Math.ceil(sampleMax / 25) * 25;

function priceToPct(value: number): number {
  return LEFT + (value / domainMax) * (MAIN_END - LEFT);
}

const cloudPoints = sample.map((value, i) => ({
  key: i,
  x: pct(priceToPct(value)),
  y: pct(BAND_Y + hashJitter(i + 1) * CLOUD_JITTER_Y),
}));

const outlierPoints = price.outliers.map((row, i) => ({
  sku: row.sku,
  x: pct(OUTLIER_CENTER + hashJitter(i * 7 + 3) * OUTLIER_JITTER_X),
  y: pct(BAND_Y + hashJitter(i * 13 + 5) * OUTLIER_JITTER_Y),
}));

const desktopTicks = [0, domainMax / 3, (domainMax / 3) * 2, domainMax];
const mobileTicks = [0, domainMax / 2, domainMax];

const outlierGroups = groupByHandle(price.outliers);

// Sampling honesty, derived rather than asserted. The cloud is a sample
// of the non outlier rows; the outliers are drawn in full.
const sampledRows = findings.overview.total_products - price.outlier_count;
const rowsPerCloudDot = sampledRows / sample.length;
const rowsPerOutlierRow = findings.overview.total_products / price.outlier_count;

const chartDescription =
  `Strip plot of catalog prices. A random sample of ${formatInteger(sample.length)} prices ` +
  `between ${formatCurrency(sampleMin)} and ${formatCurrency(sampleMax)} forms a dense cloud on ` +
  `an axis that runs to ${formatCurrency(domainMax)}. Past a labeled axis break sit all ` +
  `${formatInteger(price.outlier_count)} rows priced at ${formatCurrency(price.outlier_price)}, ` +
  `about ${formatMultiple(price.multiple_of_mean)} the mean price of ` +
  `${formatCurrency(findings.overview.mean_price)}. One sampled dot stands for about ` +
  `${formatInteger(rowsPerCloudDot)} rows while each outlier dot is a single row, so the outlier ` +
  `cluster is drawn far heavier than its real rate of about one row in ` +
  `${formatInteger(rowsPerOutlierRow)}.`;

// Axis labels are HTML, so the first and last of a tick row can be
// aligned inward the way a real axis is: the first flush with the plot
// margin instead of hanging off the left edge, the last ending at the
// axis end instead of running into the break glyph.
const ALIGNMENT = {
  start: "translate-x-0",
  center: "-translate-x-1/2",
  end: "-translate-x-full",
} as const;

function TickLabel({
  value,
  align,
}: {
  value: number;
  align: keyof typeof ALIGNMENT;
}) {
  return (
    <span
      className={`numeral absolute whitespace-nowrap text-xs text-ink-muted md:text-sm ${ALIGNMENT[align]}`}
      style={{
        left: pct(priceToPct(value)),
        top: `calc(${pct(AXIS_Y)} + ${TICK_LABEL_OFFSET_PX}px)`,
      }}
    >
      {formatCurrency(value)}
    </span>
  );
}

function tickAlign(index: number, total: number): keyof typeof ALIGNMENT {
  if (index === 0) return "start";
  if (index === total - 1) return "end";
  return "center";
}

export function PriceFinding() {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.9", "start 0.25"],
  });
  const cloudOpacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const outlierOpacity = useTransform(scrollYProgress, [0.4, 1], [0, 1]);
  const annotationY = useTransform(scrollYProgress, [0.4, 1], [16, 0]);

  const cloudStyle = prefersReducedMotion ? { opacity: 1 } : { opacity: cloudOpacity };
  const outlierStyle = prefersReducedMotion ? { opacity: 1 } : { opacity: outlierOpacity };
  const annotationStyle = prefersReducedMotion
    ? { opacity: 1, y: 0 }
    : { opacity: outlierOpacity, y: annotationY };

  return (
    <SectionShell id="price" fullBleed>
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="max-w-[20ch] text-4xl md:text-6xl font-sans tracking-tight text-ink">
          A handful of prices that do not belong on the same chart as the rest.
        </h2>
        <p className="mt-6 max-w-[65ch] text-base md:text-lg leading-relaxed text-ink-muted">
          Every price above{" "}
          <span className="numeral font-mono text-ink">
            {formatCurrency(price.outlier_threshold)}
          </span>{" "}
          in this dataset turns out to be exactly{" "}
          <span className="numeral font-mono text-ink">
            {formatCurrency(price.outlier_price)}
          </span>
          , carried by{" "}
          <span className="numeral font-mono text-ink">
            {formatInteger(price.outlier_count)}
          </span>{" "}
          rows out of the whole catalog.
        </p>
      </div>

      <Figure
        className="mt-10 md:mt-14"
        caption={
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <span className="block max-w-[70ch]">
              Each dark dot is one of{" "}
              <span className="numeral">{formatInteger(sample.length)}</span> prices sampled at
              random from the{" "}
              <span className="numeral">{formatInteger(sampledRows)}</span> rows priced under{" "}
              <span className="numeral">{formatCurrency(price.outlier_threshold)}</span>, so one
              dark dot stands for about{" "}
              <span className="numeral">{formatInteger(rowsPerCloudDot)}</span> rows. All{" "}
              <span className="numeral">{formatInteger(price.outlier_count)}</span> rows at{" "}
              <span className="numeral">{formatCurrency(price.outlier_price)}</span> are drawn
              individually, past a deliberate break in the x-axis. Read the red cluster as a
              position, not a volume: the real rate is about one row in{" "}
              <span className="numeral">{formatInteger(rowsPerOutlierRow)}</span>.
            </span>
          </div>
        }
      >
        <div ref={containerRef} className="relative w-full py-10 md:py-16">
          {/* The plot box. The SVG carries the marks, the overlay
              carries every label, both in the same percentage space. */}
          <div className="relative w-full">
            <svg
              width="100%"
              className="block h-[340px] w-full md:h-[380px]"
              role="img"
              aria-label={chartDescription}
            >
              {/* Axis, in two segments with the break between them. */}
              <line
                x1={pct(LEFT)}
                y1={pct(AXIS_Y)}
                x2={pct(MAIN_END)}
                y2={pct(AXIS_Y)}
                stroke="var(--ink-muted)"
                strokeWidth={1}
              />
              <line
                x1={pct(BREAK_END)}
                y1={pct(AXIS_Y)}
                x2={pct(RIGHT)}
                y2={pct(AXIS_Y)}
                stroke="var(--ink-muted)"
                strokeWidth={1}
              />

              {/* Explicit axis break marks: a double bar straddling the
                  axis, the conventional "scale interrupted here" glyph. */}
              {[-BREAK_MARK_GAP_PX, BREAK_MARK_GAP_PX].map((offset) => (
                <line
                  key={`break-${offset}`}
                  x1={pct(BREAK_CENTER)}
                  y1={pct(AXIS_Y - BREAK_MARK_HALF)}
                  x2={pct(BREAK_CENTER)}
                  y2={pct(AXIS_Y + BREAK_MARK_HALF)}
                  transform={`translate(${offset}, 0)`}
                  stroke="var(--ink-muted)"
                  strokeWidth={2}
                />
              ))}

              {/* Tick marks. Labels live in the HTML overlay below. */}
              {desktopTicks.map((tick) => (
                <line
                  key={`tick-md-${tick}`}
                  className="hidden md:block"
                  x1={pct(priceToPct(tick))}
                  y1={pct(AXIS_Y)}
                  x2={pct(priceToPct(tick))}
                  y2={pct(AXIS_Y + TICK_MARK_LEN)}
                  stroke="var(--ink-muted)"
                  strokeWidth={1}
                />
              ))}
              {mobileTicks.map((tick) => (
                <line
                  key={`tick-sm-${tick}`}
                  className="md:hidden"
                  x1={pct(priceToPct(tick))}
                  y1={pct(AXIS_Y)}
                  x2={pct(priceToPct(tick))}
                  y2={pct(AXIS_Y + TICK_MARK_LEN)}
                  stroke="var(--ink-muted)"
                  strokeWidth={1}
                />
              ))}
              <line
                x1={pct(OUTLIER_CENTER)}
                y1={pct(AXIS_Y)}
                x2={pct(OUTLIER_CENTER)}
                y2={pct(AXIS_Y + TICK_MARK_LEN)}
                stroke="var(--alert)"
                strokeWidth={1}
              />

              <motion.g style={cloudStyle}>
                {cloudPoints.map((p) => (
                  <circle
                    key={p.key}
                    cx={p.x}
                    cy={p.y}
                    r={2.4}
                    fillOpacity={0.3}
                    className="[fill-opacity:0.22] [r:1.6px] md:[fill-opacity:0.32] md:[r:2.4px]"
                    fill="var(--ink)"
                  />
                ))}
              </motion.g>

              <motion.g style={outlierStyle}>
                {outlierPoints.map((p) => (
                  <circle
                    key={p.sku}
                    cx={p.x}
                    cy={p.y}
                    r={3.4}
                    className="[r:2.8px] md:[r:3.4px]"
                    fill="var(--alert)"
                  />
                ))}
              </motion.g>
            </svg>

            {/* Label layer. Real HTML type, on the project type scale,
                positioned in the plot's percentage coordinate space. */}
            <div className="pointer-events-none absolute inset-0">
              <div className="hidden md:block">
                {desktopTicks.map((tick, i) => (
                  <TickLabel
                    key={`label-md-${tick}`}
                    value={tick}
                    align={tickAlign(i, desktopTicks.length)}
                  />
                ))}
              </div>
              <div className="md:hidden">
                {mobileTicks.map((tick, i) => (
                  <TickLabel
                    key={`label-sm-${tick}`}
                    value={tick}
                    align={tickAlign(i, mobileTicks.length)}
                  />
                ))}
              </div>

              <span
                className="numeral absolute -translate-x-1/2 whitespace-nowrap text-xs text-alert md:text-sm"
                style={{
                  left: pct(OUTLIER_CENTER),
                  top: `calc(${pct(AXIS_Y)} + ${TICK_LABEL_OFFSET_PX}px)`,
                }}
              >
                {formatCurrency(price.outlier_price)}
              </span>

              <span
                className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-xs text-ink-faint md:text-sm"
                style={{
                  left: pct(BREAK_CENTER),
                  top: `calc(${pct(AXIS_Y)} + ${BREAK_LABEL_OFFSET_PX}px)`,
                }}
              >
                axis break
              </span>

              {/* Anchored annotation. It sits in the plot's empty upper
                  band and points DOWN at the cluster with a leader line,
                  so it never covers the dots it is describing. */}
              <motion.div
                style={{ ...annotationStyle, right: pct(100 - RIGHT) }}
                className="absolute top-0 w-[10.5rem] text-right md:w-[17rem]"
              >
                <p className="numeral font-mono text-4xl md:text-5xl leading-none text-alert">
                  {formatMultiple(price.multiple_of_mean)}
                </p>
                <p className="mt-2 text-xs leading-snug text-ink-muted md:text-sm">
                  the mean price, in{" "}
                  <span className="numeral font-mono text-ink">
                    {formatInteger(price.outlier_count)}
                  </span>{" "}
                  rows at{" "}
                  <span className="numeral font-mono text-ink">
                    {formatCurrency(price.outlier_price)}
                  </span>
                  .
                </p>
              </motion.div>

              {/* Leader line from the annotation down to the cluster. */}
              <motion.div
                style={{ ...annotationStyle, left: pct(OUTLIER_CENTER) }}
                className="absolute top-[29%] h-[11%] w-px bg-alert"
                aria-hidden="true"
              >
                <span className="absolute bottom-0 left-1/2 h-[6px] w-[6px] -translate-x-1/2 translate-y-1/2 rotate-[-45deg] border-b border-l border-alert" />
              </motion.div>
            </div>
          </div>
        </div>
      </Figure>

      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mt-16 md:mt-24 border-t border-rule pt-10 md:pt-14">
          <h3 className="text-2xl md:text-3xl font-sans tracking-tight text-ink">
            Every size, every colorway, the same flat price.
          </h3>
          <p className="mt-3 max-w-[65ch] text-base md:text-lg leading-relaxed text-ink-muted">
            <span className="numeral font-mono text-ink">
              {formatInteger(price.distinct_products)}
            </span>{" "}
            products, each carrying{" "}
            <span className="numeral font-mono text-ink">
              {formatInteger(price.sizes_per_product)}
            </span>{" "}
            size variants, and every one of the resulting{" "}
            <span className="numeral font-mono text-ink">
              {formatInteger(price.outlier_count)}
            </span>{" "}
            rows priced at exactly{" "}
            <span className="numeral font-mono text-ink">
              {formatCurrency(price.outlier_price)}
            </span>
            .
          </p>

          <div className="mt-10 space-y-10">
            {outlierGroups.map((group) => (
              <div key={group[0].handle}>
                <p className="text-sm md:text-base text-ink-muted">{group[0].title}</p>
                <ul className="mt-2 divide-y divide-rule border-y border-rule">
                  {group.map((row) => (
                    <li
                      key={row.sku}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="text-sm md:text-base text-ink">
                        {row.variant_title}
                      </span>
                      <span className="font-mono text-xs text-ink-muted">{row.sku}</span>
                      <span className="numeral font-mono text-sm md:text-base text-ink shrink-0">
                        {formatCurrency(row.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 md:mt-20 max-w-[65ch] pb-4">
          <p className="text-base md:text-lg leading-relaxed text-ink-muted">
            A flat price that does not change by size is not how apparel
            pricing works. At{" "}
            <span className="numeral font-mono text-ink">
              {formatCurrency(price.outlier_price)}
            </span>
            , about{" "}
            <span className="numeral font-mono text-alert">
              {formatMultiple(price.multiple_of_mean)}
            </span>{" "}
            the dataset's mean price of{" "}
            <span className="numeral font-mono text-ink">
              {formatCurrency(findings.overview.mean_price)}
            </span>
            , this reads as a probable price data-entry error rather than a
            legitimate premium line. The recommendation is to flag it back
            to the source catalogue, not to quietly drop it as a modelling
            outlier.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}
