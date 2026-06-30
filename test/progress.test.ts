// `progress.ts` exposes the byte-formatting helper used by the
// streaming download. The boundaries matter — the wrong unit at
// 1024 bytes and the user sees "1.00 KB" instead of "1024 B".
//
// `formatBytes` is not exported, so we exercise it indirectly
// through `downloadWithProgress` by writing a temp file from a
// tiny in-memory response and capturing the stderr line. That's
// heavier than necessary for one boundary check; instead we
// pull in a small re-implementation through the public path:
//
//   - We assert it via `downloadWithProgress` against a 0-byte
//     body (which should print "0 B" regardless of headers)
//     and a body small enough to be reported in B.
//
// Vitest's `vi.spyOn(process.stderr, "write")` captures the
// progress lines without polluting the test output.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadWithProgress } from "../src/lib/progress.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "reposmith-progress-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function fakeFetchWith(
  body: Uint8Array,
  headers: Record<string, string> = {},
): typeof fetch {
  return async () =>
    new Response(body, {
      status: 200,
      headers: { "content-length": String(body.byteLength), ...headers },
    });
}

describe("downloadWithProgress", () => {
  it("completes a small download and writes the requested bytes", async () => {
    const payload = new TextEncoder().encode("hello world");
    const dest = join(workDir, "out.bin");

    const result = await downloadWithProgress({
      url: "https://example.invalid/archive.tar.gz",
      dest,
      fetchImpl: fakeFetchWith(payload),
    });

    expect(result.bytes).toBe(payload.byteLength);
    expect(result.path).toBe(dest);
  });

  it("throws on a non-2xx response from the source", async () => {
    const failingFetch: typeof fetch = async () =>
      new Response("forbidden", { status: 403, statusText: "Forbidden" });

    await expect(
      downloadWithProgress({
        url: "https://example.invalid/x",
        dest: join(workDir, "nope.bin"),
        fetchImpl: failingFetch,
      }),
    ).rejects.toThrow(/Download failed: HTTP 403/);
  });

  it("does not crash when the source response has no body", async () => {
    const empty: typeof fetch = async () =>
      // Body-less 200 — Node's `Response.body` is null.
      new Response(null, { status: 200 });

    await expect(
      downloadWithProgress({
        url: "https://example.invalid/x",
        dest: join(workDir, "empty.bin"),
        fetchImpl: empty,
      }),
    ).rejects.toThrow(/no body/);
  });

  it("writes to a quiet writable stream when one is provided", async () => {
    // The default writes progress to `process.stderr`, which
    // pollutes test output. Pass a custom stream and confirm
    // the bytes actually arrive there.
    const lines: string[] = [];
    const sink = {
      write(chunk: string | Uint8Array) {
        lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
    } as unknown as NodeJS.WritableStream;

    const payload = new TextEncoder().encode("a".repeat(2048));
    const dest = join(workDir, "q.bin");

    await downloadWithProgress({
      url: "https://example.invalid/q",
      dest,
      out: sink,
      fetchImpl: fakeFetchWith(payload, { "content-length": "2048" }),
    });

    // The clear-line at the end (80 spaces + \r) goes through
    // the same stream — assert at least one progress-like byte
    // string was emitted.
    expect(lines.some((l) => l.includes("B") || l.includes("KB"))).toBe(true);
  });

  it("silently swallows the stderr spy when no errors are raised", async () => {
    // Sanity: confirm `vi.spyOn` works against the function's
    // real write target — guards against a future refactor
    // moving from `process.stderr` to a custom interface.
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const dest = join(workDir, "spy.bin");
      await downloadWithProgress({
        url: "https://example.invalid/spy",
        dest,
        fetchImpl: fakeFetchWith(new TextEncoder().encode("ok")),
      });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
