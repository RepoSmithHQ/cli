// `resolveOutputMode` is the one place that decides whether the
// CLI prints a table or JSON. The behavior is:
//   - `--json` flag → "json"
//   - otherwise → "table"
//
// Table is the unconditional default — there's no TTY check.
// Scripts that want the full row should pass `--json` explicitly.

import { describe, expect, it } from "vitest";

import { resolveOutputMode } from "../src/lib/output-mode.js";

describe("resolveOutputMode", () => {
  it("returns 'json' when --json is explicitly true", () => {
    expect(resolveOutputMode(true)).toBe("json");
  });

  it("returns 'table' when flagValue is undefined", () => {
    expect(resolveOutputMode(undefined)).toBe("table");
  });

  it("returns 'table' when flagValue is false", () => {
    expect(resolveOutputMode(false)).toBe("table");
  });
});
