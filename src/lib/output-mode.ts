// Output mode resolution — `--json` wins, otherwise default to
// table when stdout is a TTY, JSON when piped.
//
// Used by the root command's `--json` flag (citty reads it) and
// each list-style command's argument parser. The TTY check happens
// here (and only here) so commands don't have to import
// `process.stdout.isTTY` themselves.

export type OutputMode = "table" | "json";

export function resolveOutputMode(flagValue: boolean | undefined): OutputMode {
  if (flagValue === true) return "json";
  // Smart default: when stdout is piped, prefer JSON because the
  // user is probably redirecting to a file or piping to `jq`.
  // Skipped when `NO_COLOR` or similar env vars want plain output
  // (the user can always pass --json explicitly).
  if (process.stdout.isTTY !== true) return "json";
  return "table";
}