// `auth.ts` runs the device-flow login and is the only place that
// writes the CLI's local config during a fresh auth. The
// behavior worth pinning is the workspace-selection step at the
// end:
//
//   - 1 workspace available → auto-select it, persist the id, and
//     return it on `LoginResult.activeWorkspaceId`. The user can
//     immediately run `reposmith repos list` etc. without a
//     separate `workspace use` call.
//   - 2+ workspaces available → do NOT auto-select. Tell the user
//     to run `workspace use <id>`.
//   - 0 workspaces → save the token (login still succeeded) but no
//     workspace to pick.
//
// `open` (the npm package that launches the user's default
// browser) is mocked — without that, every test would actually
// pop a browser window on a dev machine. The network layer is
// stubbed via `fetchImpl` injection, same pattern as
// `client.test.ts`.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock `open` before importing the module under test so the
// `import open from "open"` inside `auth.ts` resolves to our stub.
vi.mock("open", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

import { loginFlow } from "../src/lib/auth.js";
import { clearConfig, loadConfig, saveConfig } from "../src/lib/config.js";
import type {
  DeviceCodeResponse,
  DeviceTokenSuccess,
  LoginResponse,
  MeResponse,
  WorkspaceSummary,
} from "../src/lib/types.js";

let workDir: string;
const originalHome = process.env.HOME;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "reposmith-auth-"));
  process.env.HOME = workDir;
  // Pin REPOSMITH_API so `resolveApiUrl()` returns a stable value
  // regardless of the env in which vitest runs.
  process.env.REPOSMITH_API = "https://api.example.com";
});

afterEach(() => {
  clearConfig();
  rmSync(workDir, { recursive: true, force: true });
  delete process.env.REPOSMITH_API;
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  vi.restoreAllMocks();
});

function makeWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws_default",
    name: "Default",
    role: "owner",
    plan: { productId: "personal", status: "active" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeMe(workspaces: WorkspaceSummary[]): MeResponse {
  return {
    success: true,
    user: {
      id: "u_1",
      email: "user@example.com",
      name: "User",
      emailVerified: true,
    },
    workspaces,
  };
}

/**
 * Build a fetch stub that replays a fixed sequence of responses.
 * Every call to `requestDeviceCode`, `pollDeviceToken`,
 * `exchangeSessionForCliKey`, and `me()` is one tick on the queue.
 * Extra calls (e.g. retries) fall through to a 500 — a test
 * failure surfaces as an unexpected-fetch error rather than a
 * silently-wrong result.
 */
function queueFetch(
  responses: Array<{
    match: (url: string, init?: RequestInit) => boolean;
    body: unknown;
    status?: number;
  }>,
): typeof fetch {
  const calls: Array<{ url: string; method: string }> = [];
  let i = 0;
  return async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    const step = responses[i] ?? responses[responses.length - 1];
    i += 1;
    if (!step || !step.match(url, init)) {
      throw new Error(`Unexpected fetch call #${i}: ${method} ${url} (queue exhausted)`);
    }
    return new Response(JSON.stringify(step.body), {
      status: step.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const DEVICE_CODE: DeviceCodeResponse = {
  device_code: "dev_123",
  user_code: "ABCD-EFGH",
  verification_uri: "https://app.example.com/cli/authorize",
  verification_uri_complete: "https://app.example.com/cli/authorize?code=ABCD-EFGH",
  expires_in: 600,
  interval: 1,
};

const DEVICE_TOKEN: DeviceTokenSuccess = {
  access_token: "sess_xyz",
  token_type: "Bearer",
  expires_in: 3600,
};

const LOGIN_RESPONSE: LoginResponse = {
  success: true,
  token: "cli_key_abc",
  expiresAt: null,
  user: { id: "u_1", email: "user@example.com", name: "User" },
};

describe("loginFlow — workspace selection", () => {
  it("auto-selects the only workspace and persists its id", async () => {
    const only = makeWorkspace({ id: "ws_solo", name: "Solo" });
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([only]) },
    ]);

    const result = await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });

    expect(result.activeWorkspaceId).toBe("ws_solo");
    const cfg = loadConfig();
    expect(cfg?.token).toBe("cli_key_abc");
    expect(cfg?.workspaceId).toBe("ws_solo");
  });

  it("does NOT auto-select when there are multiple workspaces", async () => {
    const ws1 = makeWorkspace({ id: "ws_a", name: "A" });
    const ws2 = makeWorkspace({ id: "ws_b", name: "B" });
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([ws1, ws2]) },
    ]);

    const result = await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });

    expect(result.activeWorkspaceId).toBeUndefined();
    const cfg = loadConfig();
    expect(cfg?.workspaceId).toBeUndefined();
  });

  it("preserves a previously-selected workspaceId on re-login when there are multiple workspaces", async () => {
    // Simulate an existing config from a prior login.
    saveConfig({
      apiUrl: "https://api.example.com",
      token: "old_tok",
      workspaceId: "ws_a",
    });

    const ws1 = makeWorkspace({ id: "ws_a", name: "A" });
    const ws2 = makeWorkspace({ id: "ws_b", name: "B" });
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([ws1, ws2]) },
    ]);

    const result = await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });

    expect(result.activeWorkspaceId).toBeUndefined();
    const cfg = loadConfig();
    expect(cfg?.token).toBe("cli_key_abc");
    expect(cfg?.workspaceId).toBe("ws_a");
  });

  it("overwrites a stale workspaceId when only one workspace is available", async () => {
    // Existing config references a workspace the user no longer
    // belongs to (deleted, or different account). With only one
    // workspace available it is unambiguously the right one — so
    // the auto-set should fix the broken state.
    saveConfig({
      apiUrl: "https://api.example.com",
      token: "old_tok",
      workspaceId: "ws_old_deleted",
    });

    const only = makeWorkspace({ id: "ws_new", name: "New" });
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([only]) },
    ]);

    const result = await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });

    expect(result.activeWorkspaceId).toBe("ws_new");
    const cfg = loadConfig();
    expect(cfg?.workspaceId).toBe("ws_new");
  });

  it("saves the token but no workspaceId when the user has zero workspaces", async () => {
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([]) },
    ]);

    const result = await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });

    expect(result.activeWorkspaceId).toBeUndefined();
    const cfg = loadConfig();
    expect(cfg?.token).toBe("cli_key_abc");
    expect(cfg?.workspaceId).toBeUndefined();
  });
});

describe("loginFlow — confirmation code UX", () => {
  // The whole point of RFC 8628 is that the user sees the same
  // code on the device (CLI) as in the browser — that's how they
  // know they're approving the right request. If the CLI prints
  // the URL but not the code, the user has nothing to compare.

  it("prints the user_code so the user can verify it against the browser", async () => {
    const ws = makeWorkspace({ id: "ws_solo" });
    const fetchImpl = queueFetch([
      { match: (u) => u.includes("/api/auth/device/code"), body: DEVICE_CODE },
      { match: (u) => u.includes("/api/auth/device/token"), body: DEVICE_TOKEN },
      {
        match: (u) => u.includes("/api/cli/v1/auth/device-exchange"),
        body: LOGIN_RESPONSE,
      },
      { match: (u) => u.endsWith("/api/cli/v1/me"), body: makeMe([ws]) },
    ]);

    // loginFlow writes the prompt block via process.stderr.write —
    // spy on it (same pattern as progress.test.ts) to capture
    // everything written during the flow.
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
    try {
      await loginFlow({ apiUrl: "https://api.example.com", fetchImpl });
    } finally {
      spy.mockRestore();
    }

    const combined = writes.join("");
    // The code itself is in the output, on its own labelled line.
    expect(combined).toMatch(/Confirmation code:\s*\n\s*ABCD-EFGH/);
    // The complete URL is also printed — the user can copy/paste it
    // and the code is already in the query string.
    expect(combined).toContain("https://app.example.com/cli/authorize?code=ABCD-EFGH");
  });
});
