/*
  Overview.tsx
  ============
  Section id "overview". Layout family: asymmetric editorial hero +
  oversized numeral column.

  Top of page. The hero (eyebrow, headline, subtext, oversized numeral
  column) is sized to fit the initial viewport: two-line headline, a
  sub-20-word subtext, and the shell's own top padding capped at pt-24
  via the className override below. Everything after the hero (the
  price snapshot, the editorial line, the category count, the ranked
  list, and the pipeline attribution) lives in normal document flow
  below the fold.

  Owns the only eyebrow allowed above the fold (of the 2 allowed on the
  whole page). Every number below is read from `findings` and formatted
  through `lib/format.ts`; nothing here is a typed-in statistic.
*/
import { motion } from "motion/react";
import { SectionShell } from "../components/SectionShell";
import { findings } from "../lib/findings";
import { formatCurrency, formatInteger } from "../lib/format";
import { useReducedMotion } from "../lib/useReducedMotion";

export function Overview() {
  const prefersReducedMotion = useReducedMotion();
  const { overview, categories, pipeline, source } = findings;

  // The ranked list below reads `categories.top10_normalized`, NOT
  // `overview.top_categories`. The latter is the raw leaderboard, whose
  // counts are split across case variants of the same label ("Mens
  // T-Shirt" and "mens T-Shirt" counted separately); section 4 exists
  // precisely to show that those raw counts are short. Printing them
  // here under a "cleaned" heading made the page assert two
  // incompatible things about the same ten rows. These are the merged
  // counts and the normalized labels, byte for byte the same rows
  // section 4 lands on, so the overview and the finding agree.
  const rankedCategories = categories.top10_normalized;
  const maxCategoryCount = rankedCategories[0].count;

  return (
    <SectionShell id="overview" className="pt-16! md:pt-24!">
      {/* Hero: fits the initial viewport. Four stack elements total
          (eyebrow, headline, subtext, oversized numeral column).

          Breakpoints here are deliberate. The two column split waits
          for lg, not md: at md the right column's content box is only
          about 224px wide, which is narrower than the 6 digit numeral,
          and the overflowing text pushed the whole document sideways
          between 768px and 975px. The text-8xl step waits for xl for
          the same reason, so the largest numeral only applies once the
          column is genuinely wider than it. Below lg the hero stacks
          into one full width column where text-7xl fits with room. */}
      <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:items-end lg:gap-x-12">
        <div className="lg:col-span-7">
          {/* EYEBROW #1 of the 2 allowed on the page. Its treatment is
              shared byte for byte with EYEBROW #2 in ImageFinding
              (font-mono text-xs uppercase tracking-[0.14em] text-accent)
              so the two read as one recurring device. If you restyle one,
              restyle both. */}
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
            The Gymshark catalog, cleaned
          </p>
          <h1 className="mt-5 text-4xl md:text-6xl font-sans tracking-tight leading-[1.05] text-ink">
            One pipeline.
            <br />
            One version of the truth.
          </h1>
          <p className="mt-6 max-w-[46ch] text-base md:text-lg leading-relaxed text-ink-muted">
            Every count, price, and category below comes from a single
            deterministic pass over the raw export, not hand editing.
          </p>
        </div>

        <div className="lg:col-span-5 lg:border-l lg:border-rule lg:pl-10">
          <motion.p
            className="numeral font-mono text-7xl xl:text-8xl leading-none text-ink"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {formatInteger(overview.total_products)}
          </motion.p>
          <p className="mt-3 max-w-[34ch] text-sm md:text-base text-ink-muted">
            cleaned product rows in the catalog, spanning{" "}
            <span className="numeral font-mono text-ink">
              {formatInteger(overview.distinct_handles)}
            </span>{" "}
            distinct product handles across every size and colorway.
          </p>
        </div>
      </div>

      {/* Price snapshot: one dominant numeral (mean) plus a mini
          label/value list, deliberately not a 4-tile KPI row. */}
      <div className="mt-20 md:mt-28 grid grid-cols-1 gap-y-8 md:grid-cols-12 md:gap-x-12">
        <div className="md:col-span-7">
          <p className="text-sm text-ink-muted">Average price across the catalog</p>
          <p className="numeral font-mono text-6xl md:text-7xl leading-none text-ink mt-2">
            {formatCurrency(overview.mean_price)}
          </p>
        </div>
        <div className="md:col-span-5 md:border-l md:border-rule md:pl-10">
          <dl className="divide-y divide-rule">
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-sm text-ink-muted">Median</dt>
              <dd className="numeral font-mono text-xl text-ink">
                {formatCurrency(overview.median_price)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-sm text-ink-muted">Lowest</dt>
              <dd className="numeral font-mono text-xl text-ink">
                {formatCurrency(overview.min_price)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-sm text-ink-muted">Highest</dt>
              <dd className="numeral font-mono text-xl text-ink">
                {formatCurrency(overview.max_price)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* One deliberate editorial serif moment. */}
      <p className="mt-16 md:mt-24 max-w-[28ch] md:max-w-[36ch] font-serif italic text-3xl md:text-5xl leading-[1.15] pb-2 text-ink">
        A product feed is only as trustworthy as the pipeline that cleaned it.
      </p>

      <p className="mt-8 max-w-[65ch] text-base md:text-lg leading-relaxed text-ink-muted">
        The raw export uses{" "}
        <span className="numeral font-mono text-ink">
          {formatInteger(overview.product_types_raw)}
        </span>{" "}
        different product-type labels. Once casing and whitespace are
        normalized, the same catalog collapses to{" "}
        <span className="numeral font-mono text-ink">
          {formatInteger(overview.product_types_normalized)}
        </span>
        .
      </p>

      {/* Ranked list of top categories, typographic, with inline
          proportional rules sharing the row's baseline. */}
      <h2 className="mt-20 md:mt-28 text-2xl md:text-4xl font-sans tracking-tight text-ink">
        Where the catalog concentrates
      </h2>
      <p className="mt-3 max-w-[60ch] text-sm md:text-base text-ink-muted">
        The ten largest product types by row count, once the case variant
        spellings of a label are merged into one category. They carry the
        normalized lowercase labels the pipeline writes, which is why they
        read the way they do.
      </p>

      <ol className="mt-8 md:mt-10 list-none">
        {rankedCategories.map((category, i) => {
          const pct = (category.count / maxCategoryCount) * 100;
          return (
            <li
              key={category.label}
              className="flex items-baseline gap-4 py-3 border-b border-rule last:border-b-0"
            >
              <span className="numeral font-mono text-xs text-ink-muted w-6 shrink-0">
                {formatInteger(i + 1)}
              </span>
              <span className="relative flex-1 text-sm md:text-base text-ink">
                {category.label}
                <motion.span
                  aria-hidden="true"
                  className="absolute left-0 -bottom-1.5 h-[3px] origin-left bg-ink-faint"
                  style={{ width: `${pct}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.7,
                    delay: prefersReducedMotion ? 0 : i * 0.03,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </span>
              <span className="numeral font-mono text-sm md:text-base text-ink-muted shrink-0">
                {formatInteger(category.count)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-16 md:mt-20 max-w-[65ch] text-sm md:text-base text-ink-muted border-t border-rule pt-8">
        The three findings that follow, on pricing, missing images, and
        category labels, all come from a single run of this repository's
        own cleaning pipeline,{" "}
        <code className="font-mono text-ink">{source.cleaner}</code>, over{" "}
        <span className="numeral font-mono text-ink">
          {formatInteger(pipeline.rows_in)}
        </span>{" "}
        raw rows, producing{" "}
        <span className="numeral font-mono text-ink">
          {formatInteger(pipeline.rows_out)}
        </span>{" "}
        cleaned ones.
      </p>
    </SectionShell>
  );
}
