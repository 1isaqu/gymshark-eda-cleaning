/*
  The only module that imports `data/findings.json` directly. Everything
  else imports `findings` from here. Keeping the JSON to TypeScript
  boundary in one place means that if the generator's output shape ever
  needs a shim, it goes here instead of into six components.

  `findings.json` is generated, not hand-written. Regenerate it with:
    PYTHONPATH=src python dashboard/prepare_dashboard_data.py
*/
import raw from "../data/findings.json";
import type { Findings } from "../data/findings";

// A JSON import infers its own literal shape, which is structurally
// close to `Findings` but not assignable to it in one step: for example
// `ImageTier["key"]` is a 4-value union here, while the import widens it
// to `string`. The hop through `unknown` is deliberate rather than lazy.
// The generator asserts this shape before it writes the file, so the
// risk lives there, at the point the data is produced, not at runtime.
export const findings = raw as unknown as Findings;
