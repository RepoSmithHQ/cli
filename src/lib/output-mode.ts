// Output mode resolution — `--json` opts in to JSON, otherwise
// always default to the human-readable table.
//
// Table is the unconditional default so a casual `repos list | less`
// reads sensibly without needing a flag, and so the table-vs-JSON
// behavior is stable regardless of whether stdout is a TTY.
// JSON is strictly opt-in (via `--json` / `-j`) — that's the path
// scripts and pipes should take when they want the full row.
//
// `NO_COLOR` is about ANSI escapes, not JSON-vs-table, and is
// handled in `output.ts`.

export type OutputMode = "table" | "json";

export function resolveOutputMode(flagValue: boolean | undefined): OutputMode {
  if (flagValue === true) return "json";
  return "table";
}
