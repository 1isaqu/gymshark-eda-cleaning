import type { ReactNode } from "react";

export interface SectionShellProps {
  /** Stable anchor id for nav scroll-spy. One of: overview, price,
   *  images, categories, gallery. */
  id: string;
  children: ReactNode;
  /**
   * Escape hatch for a section whose content needs to bleed edge to
   * edge (the price finding's full-bleed strip plot is the intended
   * user). When true, the section keeps its vertical rhythm but drops
   * the max-width container and horizontal padding; the section's own
   * markup is then responsible for its own internal layout entirely.
   */
  fullBleed?: boolean;
  /**
   * Extra classes for the outer <section>. Use sparingly. This shell
   * is deliberately unopinionated about internal composition: the 5
   * sections are contractually required to use 5 different layout
   * families, so nothing about columns, grids, or alignment lives here.
   */
  className?: string;
}

/**
 * Shared section wrapper: stable id for nav anchoring, consistent
 * vertical rhythm, and a max-width reading container (unless
 * `fullBleed`). Nothing else. Do not add layout opinions here, add them
 * inside the section that needs them.
 */
export function SectionShell({
  id,
  children,
  fullBleed = false,
  className = "",
}: SectionShellProps) {
  const sectionClassName = ["scroll-mt-20 py-24 md:py-32", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section id={id} className={sectionClassName}>
      {fullBleed ? (
        children
      ) : (
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8">{children}</div>
      )}
    </section>
  );
}
