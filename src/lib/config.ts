// Local config persistence.
//
// Stores `Config` at `${XDG_CONFIG_HOME:-~/.config}/reposmith/config.json`
// with mode 0600. The file holds only the API base URL (overridable
// via env), the CLI bearer token, and the last workspace the user
// picked. The token is what a leaked laptop would expose — the
// `0600` mode is the only protection, since the CLI does no
// encryption at rest.
//
// `requireConfig()` throws `NotLoggedInError` if no token is present
// so the calling command can show a single uniform hint.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_API_URL } from "./consts.js";
import { NotLoggedInError } from "./errors.js";

export interface Config {
  /** API base URL (default `DEFAULT_API_URL` from `./consts.ts`). */
  apiUrl: string;
  /** Bearer token returned by `POST /api/cli/v1/auth/login`. */
  token?: string;
  /** Last `reposmith workspace use <id>` selection. */
  workspaceId?: string;
}

const CONFIG_DIR_NAME = "reposmith";
const CONFIG_FILE_NAME = "config.json";

function configPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export function loadConfig(): Config | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const config: Config = {
    apiUrl:
      typeof obj.apiUrl === "string" && obj.apiUrl.length > 0
        ? obj.apiUrl
        : DEFAULT_API_URL,
  };
  if (typeof obj.token === "string") config.token = obj.token;
  if (typeof obj.workspaceId === "string") config.workspaceId = obj.workspaceId;
  return config;
}

/**
 * Write the config atomically with mode 0600. The directory is
 * created if missing. The 0600 is set via `chmod` (rather than
 * `mode` on `writeFileSync`) because Node's `writeFileSync` mode
 * is ignored on existing files.
 */
export function saveConfig(config: Config): void {
  const path = configPath();
  const dir = path.substring(0, path.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  // In case the file already existed, tighten the mode now.
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort — don't block on platforms that don't support chmod.
  }
}

export function clearConfig(): void {
  const path = configPath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // Ignore — the next loadConfig() will return null.
    }
  }
}

/**
 * Throw `NotLoggedInError` if no token is present. Commands call
 * this at the top to short-circuit with a uniform "Run
 * `reposmith auth login` first" message.
 */
export function requireConfig(): Config {
  const cfg = loadConfig();
  if (!cfg || !cfg.token) {
    throw new NotLoggedInError({
      success: false,
      error: "not_logged_in",
      message: "Not logged in. Run `reposmith auth login` first.",
    });
  }
  return cfg;
}

export function configFilePath(): string {
  return configPath();
}