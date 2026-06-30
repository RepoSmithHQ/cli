// `formatTimestamp` shrinks raw ISO 8601 strings to "YYYY-MM-DD HH:MM"
// for list-table display. The behaviors worth pinning:
//
//   - Full ISO with millis and Z → compact form (the common case).
//   - ISO without millis → still works (regex matches the prefix).
//   - ISO with timezone offset instead of Z → still works.
//   - null / undefined / empty → dash placeholder (not "undefined").
//   - Garbage input → returned as-is (degrade, don't crash) so a
//     malformed server value doesn't kill the whole list render.
//
// The `—` placeholder matters because `printTable` will print empty
// strings as empty cells — which look like missing data in the table.
// A literal placeholder signals "no value" to the reader.

import { describe, expect, it } from "vitest";

import { formatTimestamp } from "../src/lib/format.js";

describe("formatTimestamp", () => {
  it("compacts a full ISO timestamp with millis and Z to YYYY-MM-DD HH:MM", () => {
    expect(formatTimestamp("2026-06-27T12:31:42.689Z")).toBe("2026-06-27 12:31");
  });

  it("compacts an ISO timestamp without millis", () => {
    expect(formatTimestamp("2026-06-27T12:31:42Z")).toBe("2026-06-27 12:31");
  });

  it("compacts an ISO timestamp with a numeric timezone offset", () => {
    expect(formatTimestamp("2026-06-27T12:31:42+02:00")).toBe("2026-06-27 12:31");
  });

  it("returns a dash for null / undefined so the table cell reads 'no value'", () => {
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp(undefined)).toBe("—");
  });

  it("returns the input unchanged when it doesn't look ISO-ish", () => {
    // Better to render garbage than to crash the whole list. The
    // user will see the malformed value and report it.
    expect(formatTimestamp("not a date")).toBe("not a date");
    expect(formatTimestamp("")).toBe("");
  });

  it("renders single-digit months and days with the leading zero intact", () => {
    expect(formatTimestamp("2026-01-05T09:00:00.000Z")).toBe("2026-01-05 09:00");
  });
});
