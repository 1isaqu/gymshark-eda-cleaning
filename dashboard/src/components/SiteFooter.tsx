/*
  SiteFooter.tsx
  ==============
  Restrained closing credit. Owned by Agent E.

  Every fact here is pulled from `findings` (source data + pipeline
  metrics), never hardcoded. No invented company, person, social link,
  newsletter signup, or copyright holder: none of that exists for this
  project, so none of it appears here.
*/
import { findings } from "../lib/findings";
import { formatInteger } from "../lib/format";

function ExternalLinkIcon({ className }: { className?: string }) {
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
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function SiteFooter() {
  const { pipeline, source, generated_at } = findings;

  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 text-sm text-ink-muted md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-1.5">
          <p>
            Data: Gymshark product catalogue,{" "}
            <span className="numeral text-ink">{formatInteger(pipeline.rows_in)}</span> rows in,{" "}
            <span className="numeral text-ink">{formatInteger(pipeline.rows_out)}</span> rows after
            cleaning.
          </p>
          <p>
            Cleaned with <code className="font-mono text-ink">{source.cleaner}</code>. Generated{" "}
            <span className="numeral text-ink">{generated_at}</span>.
          </p>
        </div>

        <a
          href="https://github.com/1isaqu/gymshark-eda-cleaning"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rule px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          View the repository
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </footer>
  );
}
