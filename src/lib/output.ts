// Output helpers — table (TTY default) and JSON (piped / --json).
//
// Each `print*` function picks the right one based on the
// `OutputMode` passed in from the command (which is derived from
// `--json` and `process.stdout.isTTY`). Commands don't branch on
// TTY themselves; they always call `printOutput(mode, …)`.

import type { OutputMode } from "./output-mode.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";

/**
 * Per https://no-color.org/: any non-empty value in `NO_COLOR`
 * disables ANSI escapes. Honored in addition to the stdout-TTY
 * check so users with `NO_COLOR=1` in their shell rc can pipe
 * `repos …` to a file without escape codes leaking in.
 */
function shouldColor(): boolean {
  if (process.env.NO_COLOR && process.env.NO_COLOR.length > 0) return false;
  return process.stdout.isTTY === true;
}

function color(s: string, code: string): string {
  if (!shouldColor()) return s;
  return `${code}${s}${RESET}`;
}

/**
 * Print a table where every row's cells are stringified identically.
 * `headers` is an array of header strings; `rows` is an array of
 * arrays of cell strings (each row has the same length as `headers`).
 *
 * Auto-computes column widths from the headers + every cell. Long
 * cells (>40 chars) are not truncated — wrapping makes the output
 * unreadable in terminals; the user can pipe to `less` for paginated
 * reading or pass `--json` to redirect to a file.
 */
export function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }

  const widths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = row[i] ?? "";
      if (cell.length > max) max = cell.length;
    }
    return max;
  });

  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");

  const headerLine = fmt(headers.map((h) => color(h.toUpperCase(), BOLD)));
  const separator = fmt(widths.map((w) => "─".repeat(w)));

  console.log(headerLine);
  console.log(color(separator, DIM));
  for (const row of rows) {
    console.log(fmt(row));
  }
}

/**
 * Print `value` as pretty JSON on stdout. Use `--json` (which the
 * root command parses to `OutputMode.Json`) for scripts that pipe
 * the output.
 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Print a colored message to stderr. Used by progress + errors
 * without polluting the JSON / table on stdout.
 */
export function logInfo(message: string): void {
  console.error(color(message, DIM));
}

export function logSuccess(message: string): void {
  console.error(color(message, `${BOLD}${CYAN}`));
}

/**
 * Convenience used by every list-style command:
 *
 *   const mode = resolveMode(opts); // from main.ts
 *   if (mode === "json") printJson(data);
 *   else printTable(headers, rows);
 */
export function printOutput(mode: OutputMode, json: () => void, table: () => void): void {
  if (mode === "json") json();
  else table();
}
