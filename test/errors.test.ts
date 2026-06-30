// `errors.ts` is the smallest, most depended-on file in the
// runtime. Every HTTP failure goes through one of two
// constructors here. The two behaviors that matter:
//
//   - `ApiError` carries `status` + `body` so callers can
//     branch on them without re-parsing.
//   - `NotLoggedInError` is always status 401 with the message
//     "not logged in", which is what every command's
//     `runCommand` wrapper looks for to print a single
//     uniform hint.

import { describe, expect, it } from "vitest";

import { ApiError, NotLoggedInError } from "../src/lib/errors.js";

describe("ApiError", () => {
  it("uses status in the default message when no message is provided", () => {
    const err = new ApiError(503, { error: "down" });
    expect(err.message).toBe("API request failed with status 503");
    expect(err.status).toBe(503);
    expect(err.body).toEqual({ error: "down" });
    expect(err).toBeInstanceOf(Error);
  });

  it("prefers an explicit message over the default", () => {
    const err = new ApiError(503, null, "storage temporarily unavailable");
    expect(err.message).toBe("storage temporarily unavailable");
  });

  it("sets name so logs distinguish it from generic Error", () => {
    expect(new ApiError(500, null).name).toBe("ApiError");
  });
});

describe("NotLoggedInError", () => {
  it("inherits from ApiError with status 401", () => {
    const err = new NotLoggedInError({ success: false, error: "no_token" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("not logged in");
    expect(err.name).toBe("NotLoggedInError");
  });
});
