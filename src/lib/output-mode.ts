// Output mode resolution — `--json` wins, otherwise default to
// table when stdout is a TTY, JSON when piped.
//
// Used by the root command's `--json` flag (citty reads it) and
// each list-style command's argument parser. The TTY check happens
// here (and only here) so commands don't have to import
// `process.stdout.isTTY` themselves. `NO_COLOR` is about ANSI
// escapes, not JSON-vs-table, and is handled in `output.ts`.

export type OutputMode = "table" | "json";

export function resolveOutputMode(flagValue: boolean | undefined): OutputMode {
  if (flagValue === true) return "json";
  // Smart default: when stdout is piped, prefer JSON because the
  // user is probably redirecting to a file or piping to `jq`.
  if (process.stdout.isTTY !== true) return "json";
  return "table";
}
