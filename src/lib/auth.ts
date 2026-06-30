// Device-flow login (RFC 8628).
//
// Flow:
//   1. POST /api/auth/device/code → server returns a
//      (device_code, user_code) pair and a verification URI
//      (already includes the user_code as a query param).
//   2. Open the browser to that URI. The user (already logged
//      in to the web app — 2FA enforced there, NOT here)
//      pastes/approves the request at /app/cli/authorize. Better-auth
//      stamps the device-code row with the user's id and creates
//      a fresh session for them.
//   3. Poll POST /api/auth/device/token with the device_code
//      until better-auth returns the session token as
//      `access_token`. Standard RFC 8628 error codes
//      (`authorization_pending`, `slow_down`, `access_denied`,
//      `expired_token`) keep us in the polling loop or abort.
//   4. Exchange the session token at
//      /api/cli/v1/auth/device-exchange for a scoped CLI API key.
//      The session token is single-use from the CLI's perspective
//      — once we've exchanged it, we discard it. The CLI key is
//      what gets stored on disk and used for every subsequent
//      request.
//
// UX (powered by @clack/prompts):
//
//   ┌  Repo Smith CLI
//   │
//   ◇  Open this URL in your browser
//   │  https://app.reposmith.dev/cli/authorize?code=ABCD-EFGH
//   │
//   └  Waiting for approval…
//      (press Ctrl-C to cancel)
//
//   …user clicks Approve in browser…
//
//   ┌  Repo Smith CLI
//   │
//   └  Logged in as felipe@example.com
//      1 workspace available — auto-selected:
//        • Acme (id: ws_abc123, role: owner, plan: team)
//
//   ┌  Repo Smith CLI
//   │
//   └  Logged in as felipe@example.com
//      2 workspaces available:
//        • Acme (id: ws_abc123, role: owner, plan: team)
//        • Personal (id: ws_def456, role: owner, plan: personal)
//
//      Run: reposmith workspace use ws_abc123
//
// We never see a password, 2FA "just works" because the web UI
// enforces it before the approval call, and the CLI key we keep
// on disk is scoped to /api/cli/* — it can't be replayed against
// the regular web API.

import { intro, isCancel, outro, spinner } from "@clack/prompts";
import open from "open";

import { ApiClient, DeviceFlowError } from "./client.js";
import { loadConfig, saveConfig } from "./config.js";
import { resolveApiUrl } from "./env.js";
import { logSuccess } from "./output.js";
import type { WorkspaceSummary } from "./types.js";

const CLI_CLIENT_ID = "reposmith-cli";
const CLI_SCOPE = "cli";

export interface LoginResult {
  user: { id: string; email: string; name: string };
  workspaces: WorkspaceSummary[];
  /**
   * Set when loginFlow auto-selected the only available workspace.
   * Undefined when the user has 0 or 2+ workspaces (no auto-pick
   * is possible or warranted).
   */
  activeWorkspaceId?: string;
}

export interface LoginOptions {
  apiUrl?: string;
  /** Test seam — passes through to `ApiClient`. Production callers omit it. */
  fetchImpl?: typeof fetch;
}

export async function loginFlow(opts: LoginOptions = {}): Promise<LoginResult> {
  const apiUrl = opts?.apiUrl ?? resolveApiUrl();
  const client = new ApiClient({
    baseUrl: apiUrl,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });

  intro("Repo Smith CLI");

  // ── 1. Request device + user codes ────────────────────────────
  // better-auth creates a pending `device_code` row in Postgres
  // and returns the codes + the verification URL. 10-minute
  // expiry on the codes (configured in `web/server/utils/auth.ts`).
  const codes = await client.requestDeviceCode(CLI_CLIENT_ID, CLI_SCOPE);

  // ── 2. Open the browser + tell the user what to do ─────────────
  // `open` shells out to the platform default browser. On
  // macOS this is `open`; on Linux `xdg-open`; on Windows
  // `start`. Failure here is non-fatal — if the user's machine
  // has no `xdg-open` (headless server, exotic distro) they
  // can paste the URL into a browser on another machine.
  // The user_code is already on the URL (we use
  // `verification_uri_complete`), so the browser page handles
  // the rest of the approval UI.
  let browserOpened = false;
  try {
    // `open` returns a child-process handle on some platforms;
    // we only care whether it succeeded. If `xdg-open` etc. is
    // missing or refuses, the catch keeps `browserOpened` at
    // its initial `false` and we fall through to printing the
    // URL for the user to copy.
    await open(codes.verification_uri_complete, { wait: false });
    browserOpened = true;
  } catch {
    // browserOpened stays false
  }

  process.stderr.write(
    [
      "",
      "  Open this URL in your browser:",
      `    ${codes.verification_uri}`,
      "",
      browserOpened
        ? "  (Your browser should have opened automatically. If not,"
        : "  (We could not open your browser automatically; copy the URL above",
      "   paste it into any browser on this or another machine.)",
      "",
      "  Confirm that the confirmation code printed in the browser",
      "  matches this one. If they don't match, deny the request.",
      "",
    ].join("\n"),
  );

  const wait = spinner();
  wait.start("Waiting for approval…");

  // ── 3. Poll until better-auth approves the code ────────────────
  // RFC 8628 says: respect the server-supplied `interval`. Bump
  // it by 5 s on each `slow_down`. Abort on `access_denied` /
  // `expired_token` — those are terminal failures, no point
  // retrying.
  let intervalSec = codes.interval;
  const deadline = Date.now() + codes.expires_in * 1000;
  let sessionToken: string;

  try {
    while (true) {
      if (Date.now() >= deadline) {
        wait.stop("Timed out waiting for approval.");
        outro("Code expired. Run `reposmith auth login` again.");
        process.exit(1);
      }

      await sleep(intervalSec * 1000);

      try {
        const result = await client.pollDeviceToken(codes.device_code, CLI_CLIENT_ID);
        wait.stop("Approved.");
        sessionToken = result.access_token;
        break;
      } catch (err: unknown) {
        if (err instanceof DeviceFlowError) {
          if (err.kind === "pending") {
            // Standard "still waiting" — keep polling silently.
            continue;
          }
          if (err.kind === "slow_down") {
            // We're polling too fast. Bump and keep going.
            intervalSec += 5;
            continue;
          }
          if (err.kind === "denied") {
            wait.stop("Denied.");
            outro("Authorization denied in the browser.");
            process.exit(1);
          }
          if (err.kind === "expired") {
            wait.stop("Expired.");
            outro("The code expired before approval. Run `reposmith auth login` again.");
            process.exit(1);
          }
        }
        throw err;
      }
    }
  } catch (err: unknown) {
    if (isCancel(err)) {
      // Ctrl-C mid-poll — the device-code row will expire on
      // its 10-minute TTL.
      process.exit(0);
    }
    throw err;
  }

  // ── 4. Exchange the session token for a CLI API key ───────────
  // Server identifies the user via the session cookie / Bearer
  // (better-auth's plugin accepts both), then mints a CLI key
  // scoped to `{ cli: ["read"] }`.
  const cliKey = await client.exchangeSessionForCliKey(sessionToken);

  // Persist token + apiUrl first so the post-login `me()` call is
  // already authenticated (we re-use the bearer-token path).
  // workspaceId is handled below after we know how many
  // workspaces the user has.
  const existing = loadConfig();
  saveConfig({ apiUrl, token: cliKey.token });

  // ── 5. Display the result ─────────────────────────────────────
  // Re-use the bearer-token path for the post-login `me()` call:
  // `client.setToken` makes subsequent calls authenticated.
  client.setToken(cliKey.token);
  const me = await client.me();

  logSuccess(`Logged in as ${me.user.email}`);
  if (me.workspaces.length === 0) {
    outro(
      "No workspaces found for this account. Create one in the web app before continuing.",
    );
    return {
      user: cliKey.user,
      workspaces: me.workspaces,
    };
  }

  const lines = me.workspaces.map((w: WorkspaceSummary) => {
    const planLabel = w.plan.productId
      ? `plan: ${w.plan.productId} (${w.plan.status})`
      : "no plan";
    return `  • ${w.name} (id: ${w.id}, role: ${w.role}, ${planLabel})`;
  });

  if (me.workspaces.length === 1) {
    // No choice to make — auto-select the only workspace so the
    // user can immediately run `reposmith repos list` etc. We
    // overwrite any stale `workspaceId` in the saved config: with
    // a single workspace available it is unambiguously the right
    // one, so it also fixes the case where a previously-saved id
    // points to a workspace the user no longer belongs to.
    const only = me.workspaces[0];
    saveConfig({
      apiUrl,
      token: cliKey.token,
      workspaceId: only.id,
    });
    logSuccess(`Active workspace set to ${only.name} (${only.id}).`);
    outro(`1 workspace available — auto-selected:\n${lines.join("\n")}`);
    return {
      user: cliKey.user,
      workspaces: me.workspaces,
      activeWorkspaceId: only.id,
    };
  }

  // 2+ workspaces: preserve any previous selection the user had
  // — they're already logged in, re-login shouldn't lose their
  // pick — but tell them they can switch.
  if (existing?.workspaceId) {
    saveConfig({
      apiUrl,
      token: cliKey.token,
      workspaceId: existing.workspaceId,
    });
  }
  outro(
    `${me.workspaces.length} workspaces available:\n${lines.join("\n")}\n\nRun: reposmith workspace use <id>`,
  );

  return {
    user: cliKey.user,
    workspaces: me.workspaces,
  };
}

export async function logoutFlow(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg?.token) {
    outro("Not logged in.");
    return;
  }
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });
  try {
    await client.logout();
  } catch {
    // Idempotent: a 401 just means the token was already gone.
    // Don't re-throw — we always want to clear the local file,
    // even if the server-side revocation failed.
  }
  const { clearConfig } = await import("./config.js");
  clearConfig();
  logSuccess("Logged out.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
