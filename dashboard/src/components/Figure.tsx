import type { ReactNode } from "react";

export interface FigureProps {
  children: ReactNode;
  /**
   * Caption content, rendered as a real <figcaption>. Keep it to one
   * short line: this is a data citation under a chart, not a
   * paragraph. For a numeric caption, wrap the number in the
   * `.numeral` class (see global.css) so it renders in font-mono with
   * tabular figures like every other number on the page.
   */
  caption?: ReactNode;
  className?: string;
}

/**
 * Shared figure + caption primitive. No border, background, or shadow
 * of its own on purpose: the price/image/category sections each need a
 * different visual treatment for their chart, and this stays out of
 * the way of that.
 */
export function Figure({ children, caption, className = "" }: FigureProps) {
  return (
    <figure className={className}>
      {children}
      {caption ? (
        <figcaption className="mt-3 text-sm text-ink-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
