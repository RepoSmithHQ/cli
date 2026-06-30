// Display formatting helpers — keep presentation concerns out of
// the list command bodies (which should only care about data
// shaping, not how it reads in a table).

/**
 * Compact an ISO 8601 timestamp to `YYYY-MM-DD HH:MM` in UTC.
 *
 * Raw timestamps like `2026-06-27T12:31:42.689Z` waste a lot of
 * horizontal space in list tables — the user scanning `jobs list`
 * cares about "when", not "to the millisecond". UTC keeps the
 * output deterministic across timezones; the full ISO string is
 * still available via `--json` for scripts.
 *
 * Returns the input unchanged when it doesn't match the ISO shape
 * we expect (instead of throwing) so a malformed server value
 * degrades to "show whatever you got" rather than blowing up the
 * whole list render.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (iso == null) return "—";
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[1]} ${match[2]}`;
}
