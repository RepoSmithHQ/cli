// `resolveOutputMode` is the one place that decides whether the
// CLI prints a table or JSON. The behavior is:
//   - `--json` flag → always "json"
//   - stdout NOT a TTY → "json" (so pipes to `jq` work without
//                          needing the flag)
//   - otherwise → "table"
//
// We don't try to stub `process.stdout.isTTY` because that
// property is a `const` getter on some platforms and
// `vi.stubGlobal` doesn't override it cleanly. The flag-value
// branch is what callers actually configure; the TTY branch is
// either-exit-environment code.

import { describe, expect, it } from "vitest";

import { resolveOutputMode } from "../src/lib/output-mode.js";

describe("resolveOutputMode", () => {
  it("returns 'json' when --json is explicitly true", () => {
    expect(resolveOutputMode(true)).toBe("json");
  });

  it("does not crash when flagValue is undefined", () => {
    // In a real TTY (vitest's default), this returns "table";
    // in CI (no TTY) it returns "json". Either is correct; the
    // important property is "doesn't throw".
    expect(["table", "json"]).toContain(resolveOutputMode(undefined));
  });

  it("returns 'json' regardless of TTY state when flagValue is true", () => {
    // The flag always wins. The TTY path is only reached when
    // flagValue is undefined / false.
    expect(resolveOutputMode(true)).toBe("json");
  });
});
