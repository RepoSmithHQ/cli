// `client.ts` is the HTTP layer. The behaviors worth pinning:
//
//   - baseUrl trailing slash is stripped.
//   - 204 returns `undefined` (callers do `.then(...)` on it).
//   - 401 maps to `NotLoggedInError`, not a generic `ApiError`,
//     so `runCommand` can branch on it.
//   - Non-JSON 4xx bodies don't crash JSON.parse — we degrade to
//     an `ApiError` whose message includes the truncated body.
//   - `rawRequest` doesn't inject the bearer token (used by
//     device-flow login); `request` does.
//   - Query strings are URL-encoded correctly for unicode ids.
//   - Device-flow error codes (`authorization_pending`,
//     `slow_down`, `access_denied`, `expired_token`) become
//     `DeviceFlowError` variants.
//
// Every test injects `fetchImpl` via the existing option on
// `ApiClient`'s constructor (see `client.ts:71-75`). No real
// network — these run in milliseconds.

import { describe, expect, it } from "vitest";

import { ApiClient } from "../src/lib/client.js";
import { ApiError, NotLoggedInError } from "../src/lib/errors.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("ApiClient construction", () => {
  it("strips trailing slashes from baseUrl", async () => {
    let seenUrl = "";
    const fetchImpl: typeof fetch = async (url) => {
      seenUrl = String(url);
      return jsonResponse({ ok: true });
    };
    const client = new ApiClient({
      baseUrl: "https://api.example.com///",
      fetchImpl,
    });
    await client.me();
    expect(seenUrl).toBe("https://api.example.com/api/cli/v1/me");
  });

  it("throws when no fetch implementation is available", () => {
    // Vitest always provides globalThis.fetch, so simulate
    // its absence by handing the constructor an undefined fetchImpl
    // and stripping the global one for the duration of the test.
    const original = globalThis.fetch;
    // @ts-expect-error: intentionally clobbering for the assertion.
    delete globalThis.fetch;
    try {
      expect(() => new ApiClient({ baseUrl: "https://x" })).toThrow(
        /No fetch implementation/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("setToken + Authorization header", () => {
  it("does not send Authorization when no token is set", async () => {
    const seen: { url: string; headers: Headers } = { url: "", headers: new Headers() };
    const fetchImpl: typeof fetch = async (url, init) => {
      seen.url = String(url);
      seen.headers = new Headers((init?.headers ?? {}) as HeadersInit);
      return jsonResponse({ success: true, user: { id: "u" }, workspaces: [] });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await client.me();
    expect(seen.headers.get("Authorization")).toBeNull();
  });

  it("sends Bearer <token> once setToken is called", async () => {
    const seen: { headers: Headers } = { headers: new Headers() };
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen.headers = new Headers((init?.headers ?? {}) as HeadersInit);
      return jsonResponse({ success: true, user: { id: "u" }, workspaces: [] });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    client.setToken("tok_abc123");
    await client.me();
    expect(seen.headers.get("Authorization")).toBe("Bearer tok_abc123");
  });
});

describe("401 → NotLoggedInError", () => {
  it("maps a 401 with a JSON body to NotLoggedInError", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "no_token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await expect(client.me()).rejects.toBeInstanceOf(NotLoggedInError);
  });
});

describe("other 4xx → ApiError with parsed `message`", () => {
  it("uses server-provided message field for 400", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("invalid input");
  });

  it("falls back to HTTP <status> when no message field exists", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("HTTP 500");
  });

  it("survives a non-JSON error body", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("upstream is on fire", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    const err = await client.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    // Message should include the truncated body so the user
    // can see what went wrong upstream.
    expect((err as ApiError).message).toContain("upstream is on fire");
  });
});

describe("204 → undefined", () => {
  it("returns undefined for 204 No Content responses", async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 204 });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    const result = await client.logout();
    expect(result).toBeUndefined();
  });
});

describe("URL query-string building", () => {
  it("encodes unicode workspace ids and search terms", async () => {
    const seenUrls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      seenUrls.push(String(url));
      return jsonResponse({
        success: true,
        items: [],
        totalReturned: 0,
        hasMore: false,
        nextOffset: null,
      });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await client.listRepositories("ws/with spaces & ñ", { q: "my repo?", limit: 5 });
    const url = seenUrls[0];
    // `encodeURIComponent` should produce `ws%2Fwith%20spaces%20%26%20%C3%B1`
    // (or at least have the `%` escapes for the meaningful chars).
    expect(url).toContain("%2F"); // `/`
    expect(url).toContain("%20"); // space
    expect(url).toContain("%3F"); // `?` (search value's `?`, not the query sep)
    expect(url).toContain("limit=5");
  });

  it("omits params that are undefined or empty strings", async () => {
    const seenUrls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      seenUrls.push(String(url));
      return jsonResponse({
        success: true,
        items: [],
        totalReturned: 0,
        hasMore: false,
        nextOffset: null,
      });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await client.listRepositories("ws_abc", { limit: 10 });
    expect(seenUrls[0]).toBe(
      "https://x/api/cli/v1/workspaces/ws_abc/repositories?limit=10",
    );

    // When there's nothing to send, the URL has no `?...`.
    await client.listRepositories("ws_abc");
    expect(seenUrls[1]).toBe("https://x/api/cli/v1/workspaces/ws_abc/repositories");
  });
});

describe("rawRequest vs request", () => {
  it("rawRequest does NOT inject the CLI bearer token", async () => {
    const seen: { headers: Headers } = { headers: new Headers() };
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen.headers = new Headers((init?.headers ?? {}) as HeadersInit);
      return jsonResponse({
        device_code: "dev",
        user_code: "USER",
        verification_uri: "https://example/verify",
        verification_uri_complete: "https://example/verify?code=USER",
        expires_in: 600,
        interval: 5,
      });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl, token: "tok_real" });
    await client.requestDeviceCode("reposmith-cli");
    expect(seen.headers.get("Authorization")).toBeNull();
  });

  it("rawRequest allows callers to supply their own Authorization header", async () => {
    const seen: { headers: Headers } = { headers: new Headers() };
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen.headers = new Headers((init?.headers ?? {}) as HeadersInit);
      return jsonResponse({
        success: true,
        token: "new_key",
        expiresAt: null,
        user: { id: "u", email: "e", name: "n" },
      });
    };
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await client.exchangeSessionForCliKey("session_tok");
    // The session token header is what wins — NOT any stale
    // client token (this path doesn't carry one).
    expect(seen.headers.get("Authorization")).toBe("Bearer session_tok");
  });
});

describe("device-flow polling → DeviceFlowError", () => {
  it("authorization_pending maps to `pending`", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: "authorization_pending",
          error_description: "still waiting",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await expect(client.pollDeviceToken("dev", "reposmith-cli")).rejects.toMatchObject({
      name: "DeviceFlowError",
      kind: "pending",
    });
  });

  it("slow_down maps to `slow_down`", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "slow_down", error_description: "ease up" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await expect(client.pollDeviceToken("dev", "reposmith-cli")).rejects.toMatchObject({
      kind: "slow_down",
    });
  });

  it("access_denied maps to `denied`", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: "access_denied",
          error_description: "user clicked deny",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await expect(client.pollDeviceToken("dev", "reposmith-cli")).rejects.toMatchObject({
      kind: "denied",
    });
  });

  it("expired_token maps to `expired`", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: "expired_token", error_description: "too late" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    await expect(client.pollDeviceToken("dev", "reposmith-cli")).rejects.toMatchObject({
      kind: "expired",
    });
  });

  it("resolves to a session token on a 2xx response", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        access_token: "sess_xyz",
        token_type: "Bearer",
        expires_in: 3600,
      });
    const client = new ApiClient({ baseUrl: "https://x", fetchImpl });
    const res = await client.pollDeviceToken("dev", "reposmith-cli");
    expect(res.access_token).toBe("sess_xyz");
    expect(res.token_type).toBe("Bearer");
  });
});
