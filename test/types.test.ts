// `unwrapEnvelope` lets `repos list` / `jobs get` / etc. handle
// both `{ job: {...} }` / `{ repository: {...} }` envelope
// shapes and bare `{...}` payloads with the same call site.
// The behaviors that matter:
//
//   - When the envelope key is present and truthy → return the
//     inner object.
//   - When the envelope key is absent (or nullish) → return the
//     original value.
//   - When the value is null or a primitive → return as-is
//     (defensive — callers don't hit this in practice, but the
//     function shouldn't crash on bad data).

import { describe, expect, it } from "vitest";

import { unwrapEnvelope } from "../src/lib/types.js";

describe("unwrapEnvelope", () => {
  it("returns the inner object when wrapped in { job }", () => {
    const inner = { id: "j_1", status: "succeeded" };
    expect(unwrapEnvelope({ job: inner })).toBe(inner);
  });

  it("returns the inner object when wrapped in { repository }", () => {
    const inner = { id: "r_1", name: "acme" };
    expect(unwrapEnvelope({ repository: inner })).toBe(inner);
  });

  it("falls back to the value itself when no envelope key is set", () => {
    const bare = { id: "r_1", name: "acme" };
    expect(unwrapEnvelope(bare)).toBe(bare);
  });

  it("prefers .job over .repository if both are present", () => {
    // Defensive: the server only sends one envelope per endpoint
    // in practice, but if both are present we pick the first
    // match — pinning the order so any future change is a
    // deliberate decision.
    const job = { id: "j_1" };
    const repo = { id: "r_1" };
    expect(unwrapEnvelope({ job, repository: repo })).toBe(job);
  });

  it("does not crash on null / undefined / primitives", () => {
    expect(unwrapEnvelope(null as unknown as object)).toBeNull();
    expect(unwrapEnvelope(undefined as unknown as object)).toBeUndefined();
    // Primitives pass through unboxed — they're never envelopes.
    expect(unwrapEnvelope(42 as unknown as object)).toBe(42);
  });
});
