/*
  format.ts
  =========
  Every number-to-string conversion in the app goes through here.
  Section components must never call `.toFixed()`, `.toLocaleString()`,
  template-literal interpolate a raw number, or otherwise hand-format a
  statistic. Import the formatter you need instead.

  Pair every formatted number in JSX with the `.numeral` utility class
  (or `font-mono tabular-nums` directly) from global.css, so digits stay
  monospaced and column-aligned. Formatting the string and styling the
  glyphs are two different jobs; this file only does the first one.
*/

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "$27.76", "$1,000.00" */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** "44,830" */
export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

/** Expects a number already on a 0-100 scale (per findings.d.ts doc
 *  comments), e.g. 0.03 -> "0.0%", 94.5 -> "94.5%". Appends "%" itself,
 *  do not concatenate one on the call site. */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

/** "44.8K", "1.2M". For large counts in tight spaces (axis ticks,
 *  dense labels). Prefer formatInteger when there is room. */
export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

/** "36x" style multiplier, e.g. for price.multiple_of_mean. */
export function formatMultiple(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}x`;
}
