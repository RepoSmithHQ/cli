// `output.ts` is the rendering surface for every list command.
// The behaviors worth pinning:
//
//   - Empty input prints "(no results)", not a blank header line.
//   - Column widths are computed from headers + every cell, so
//     the longest value wins. Headers get column-width padding.
//   - `printOutput` routes to `json` or `table` cleanly.
//
// We capture `console.log` via `vi.spyOn` because that's what
// `printTable` and `printJson` write to. `console.error` is
// left alone (that's where `logInfo`/`logSuccess` go; we don't
// want to lose TTY stderr output during a test run).

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logInfo,
  logSuccess,
  printJson,
  printOutput,
  printTable,
} from "../src/lib/output.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  logSpy.mockClear();
});

describe("printTable", () => {
  it("prints (no results) for an empty row set", () => {
    printTable(["ID", "NAME"], []);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("(no results)");
  });

  it("renders a header line and one line per row", () => {
    printTable(
      ["ID", "NAME"],
      [
        ["ws_abc", "Acme"],
        ["ws_def", "Personal"],
      ],
    );
    // 1 header + 1 separator + 2 rows = 4 lines.
    expect(logSpy).toHaveBeenCalledTimes(4);

    // Cells pad to the widest in each column. We don't pin the
    // exact spacing (it's computed from the longest cell), but
    // the column headings are always present on the first line.
    const headerLine = logSpy.mock.calls[0][0] as string;
    expect(headerLine).toContain("ID");
    expect(headerLine).toContain("NAME");

    const flatOutput = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(flatOutput).toContain("ws_abc");
    expect(flatOutput).toContain("Acme");
    expect(flatOutput).toContain("ws_def");
    expect(flatOutput).toContain("Personal");
  });

  it("pads to the widest cell so a long value widens the column", () => {
    printTable(
      ["ID", "NAME"],
      [
        ["ws_abc", "Acme"],
        ["ws_def", "A workspace with a really long name"],
      ],
    );
    const flat = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

    // The header line should be at least as wide as the longest
    // value in the NAME column. We pin it relatively because the
    // surrounding TTY-stripped output may vary.
    const headerLine = flat.split("\n")[0];
    expect(headerLine.length).toBeGreaterThanOrEqual(
      "A workspace with a really long name".length,
    );
  });
});

describe("printJson", () => {
  it("produces pretty-printed JSON on one line per object level", () => {
    printJson({ hello: "world" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0][0] as string;
    // `JSON.stringify(…, null, 2)` puts each key on its own line.
    expect(arg).toBe(JSON.stringify({ hello: "world" }, null, 2));
  });
});

describe("printOutput", () => {
  it("runs the JSON branch when mode is 'json'", () => {
    printOutput(
      "json",
      () => logSpy("json-branch"),
      () => logSpy("table-branch"),
    );
    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("json-branch");
    expect(calls).not.toContain("table-branch");
  });

  it("runs the table branch when mode is 'table'", () => {
    printOutput(
      "table",
      () => logSpy("json-branch"),
      () => logSpy("table-branch"),
    );
    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("table-branch");
    expect(calls).not.toContain("json-branch");
  });
});

describe("logInfo / logSuccess (stderr)", () => {
  // These write to `console.error`. We don't spy on it (it would
  // also catch vitest's own diagnostic output), so we just check
  // they don't throw when stdout is NOT a TTY (the test runner).
  it("logInfo does not throw in a non-TTY environment", () => {
    expect(() => logInfo("starting")).not.toThrow();
  });

  it("logSuccess does not throw in a non-TTY environment", () => {
    expect(() => logSuccess("done")).not.toThrow();
  });
});
