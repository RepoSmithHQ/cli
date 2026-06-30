// Shared helpers used by every command.
//
// `resolveContext` is the single place that:
//   - loads the config (throwing NotLoggedInError if absent),
//   - constructs an `ApiClient` with the right base URL,
//   - returns the parsed output mode.
//
// Commands call it at the top instead of inlining the same five
// lines. `resolveActiveWorkspaceId` reads the workspace the user
// last `use`'d; commands that operate on a workspace use it as the
// default if `--workspace` isn't passed.

import { ApiClient } from "./client.js";
import type { Config } from "./config.js";
import { loadConfig, requireConfig } from "./config.js";
import { DEFAULT_API_URL } from "./consts.js";
import { ApiError, CliError, NotLoggedInError } from "./errors.js";
import { type OutputMode, resolveOutputMode } from "./output-mode.js";

export interface CommandContext {
  client: ApiClient;
  /** Resolved API base URL. */
  apiUrl: string;
  /** Config-loaded workspace id (or undefined if none set). */
  workspaceId: string | undefined;
  /** Output mode: "table" (TTY default) or "json" (piped / --json). */
  json: OutputMode;
}

export interface ResolveContextOptions {
  /** `--json` flag value (may be undefined → defaults to TTY). */
  json?: boolean;
  /**
   * If true, throw `NotLoggedInError` when no token is present
   * (default true). Login/logout commands pass `false` because
   * they're the ones that create the token.
   */
  requireLogin?: boolean;
}

/**
 * Resolve the API base URL with the standard priority:
 *   1. `REPOSMITH_API` env var (one-off override, e.g. local dev)
 *   2. `Config.apiUrl` (set by an earlier `reposmith auth login`
 *      against a custom host — the user has told us about it)
 *   3. `DEFAULT_API_URL` from `./consts.ts`
 */
function resolveApiUrl(cfg: Config | null): string {
  const fromEnv = process.env.REPOSMITH_API;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  if (cfg?.apiUrl) return cfg.apiUrl.replace(/\/+$/, "");
  return DEFAULT_API_URL;
}

export function resolveContext(opts: ResolveContextOptions = {}): CommandContext {
  const requireLogin = opts.requireLogin !== false;

  if (requireLogin) {
    const cfg = requireConfig();
    const apiUrl = resolveApiUrl(cfg);
    return {
      client: new ApiClient({ baseUrl: apiUrl, token: cfg.token }),
      apiUrl,
      workspaceId: cfg.workspaceId,
      json: resolveOutputMode(opts.json),
    };
  }

  // Login-not-required: tolerate config absence (used by
  // `auth login` / `auth logout` / `workspace use`).
  const cfg = loadConfig();
  const apiUrl = resolveApiUrl(cfg);
  const token = cfg?.token;
  return {
    client: new ApiClient({
      baseUrl: apiUrl,
      ...(token ? { token } : {}),
    }),
    apiUrl,
    workspaceId: cfg?.workspaceId,
    json: resolveOutputMode(opts.json),
  };
}

/**
 * Pick the workspace id to act on: an explicit `--workspace` flag
 * takes precedence, otherwise the active one from the local config.
 * Returns undefined if neither is set; commands then ask the user
 * to run `reposmith workspace use <id>` first.
 */
export function resolveActiveWorkspaceId(
  explicit: string | undefined,
  cfg: { workspaceId?: string },
): string | undefined {
  return explicit ?? cfg.workspaceId;
}

/**
 * Wrap a command's body so typed errors (`NotLoggedInError`,
 * `ApiError`, `CliError`) print a clean message + non-zero exit
 * WITHOUT a stack trace, and unexpected errors rethrow so the
 * top-level `uncaughtException` handler can deal with them.
 *
 * CONTRACT: This function does not return on handled errors — it
 * calls `process.exit(1)` directly. The `Promise<void>` resolves
 * only on the success path. Callers should NOT put cleanup in a
 * `finally` that needs to run on the error path (the process is
 * about to exit anyway).
 *
 * Use inside `run({ args, cmd })`:
 *
 *   async run({ args }) {
 *     await runCommand(async () => {
 *       ...
 *     });
 *   }
 */
export async function runCommand(body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err: unknown) {
    if (err instanceof NotLoggedInError) {
      process.stderr.write(`error: not logged in — run \`reposmith auth login\` first\n`);
      process.exit(1);
    }
    if (err instanceof CliError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
    if (err instanceof ApiError) {
      process.stderr.write(`error: ${err.message}\n`);
      const body = err.body;
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if (typeof b.message === "string" && b.message !== err.message) {
          process.stderr.write(`  ${b.message}\n`);
        }
      }
      process.exit(1);
    }
    throw err;
  }
}
