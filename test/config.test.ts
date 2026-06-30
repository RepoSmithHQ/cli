// `config.ts` reads/writes the local config at
// `~/.config/reposmith/config.json`. Most of the behavior is small
// and worth pinning — the security-relevant bits (no token = throw,
// mode 0600 best-effort) especially so a future refactor doesn't
// accidentally drop them.
//
// We redirect `HOME` to a temp dir per test (which `os.homedir()`
// honors on Unix) so we never touch the developer's real
// `~/.config/reposmith/`.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearConfig,
  configFilePath,
  loadConfig,
  requireConfig,
  saveConfig,
} from "../src/lib/config.js";
import { NotLoggedInError } from "../src/lib/errors.js";

let workDir: string;
const originalHome = process.env.HOME;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "reposmith-home-"));
  process.env.HOME = workDir;
});

afterEach(() => {
  // Wipe any config we created — `clearConfig` operates on the
  // real config path, which now points into the temp dir. After
  // clearing, remove the temp dir itself.
  clearConfig();
  rmSync(workDir, { recursive: true, force: true });

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("loadConfig", () => {
  it("returns null when no config file exists", () => {
    expect(loadConfig()).toBeNull();
  });

  it("returns null when the file exists but is not valid JSON", () => {
    mkdirSync(join(workDir, ".config", "reposmith"), { recursive: true });
    writeRawConfig("{ not valid json");
    expect(loadConfig()).toBeNull();
  });

  it("returns null when the file is empty", () => {
    mkdirSync(join(workDir, ".config", "reposmith"), { recursive: true });
    writeRawConfig("");
    expect(loadConfig()).toBeNull();
  });

  it("returns null when the file parses to a non-object", () => {
    // Top-level JSON primitives — `null`, numbers, strings —
    // are not objects and should produce null.
    mkdirSync(join(workDir, ".config", "reposmith"), { recursive: true });
    writeRawConfig("42");
    expect(loadConfig()).toBeNull();

    // Arrays are technically `typeof === "object"`, so the
    // current implementation falls through and returns a config
    // with the default apiUrl. We pin that behavior here so
    // any future tightening (e.g. `Array.isArray` rejection)
    // is a deliberate choice.
    writeRawConfig("[1, 2, 3]");
    const cfg = loadConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.token).toBeUndefined();
    expect(cfg?.workspaceId).toBeUndefined();
  });

  it("returns the parsed config with required fields", () => {
    saveConfig({ apiUrl: "https://api.example.com", token: "tok_abc" });
    const cfg = loadConfig();
    expect(cfg).toEqual({
      apiUrl: "https://api.example.com",
      token: "tok_abc",
    });
  });

  it("falls back to DEFAULT_API_URL when apiUrl is missing or wrong type", () => {
    // No apiUrl field at all.
    writeRawConfig(JSON.stringify({ token: "tok" }));
    expect(loadConfig()?.apiUrl).toMatch(/^https:\/\//);

    // Empty string is also treated as missing.
    saveConfig({ apiUrl: "https://x.example", token: "tok" });
    // Overwrite with empty apiUrl:
    writeRawConfig(JSON.stringify({ apiUrl: "", token: "tok" }));
    expect(loadConfig()?.apiUrl).toMatch(/^https:\/\//);
  });

  it("ignores unknown fields", () => {
    writeRawConfig(
      JSON.stringify({
        apiUrl: "https://api.example.com",
        token: "tok",
        workspaceId: "ws_abc",
        extraField: "should be ignored",
      }),
    );
    const cfg = loadConfig();
    expect(cfg).toEqual({
      apiUrl: "https://api.example.com",
      token: "tok",
      workspaceId: "ws_abc",
    });
    expect((cfg as Record<string, unknown>).extraField).toBeUndefined();
  });
});

describe("saveConfig", () => {
  it("creates the config directory if it doesn't exist", () => {
    expect(existsSync(join(workDir, ".config", "reposmith"))).toBe(false);
    saveConfig({ apiUrl: "https://x", token: "t" });
    expect(existsSync(join(workDir, ".config", "reposmith"))).toBe(true);
    expect(existsSync(configFilePath())).toBe(true);
  });

  it("writes the requested fields as pretty-printed JSON", () => {
    saveConfig({ apiUrl: "https://x", token: "tok_xyz" });
    const text = readFileSync(configFilePath(), "utf8");
    expect(text).toBe(JSON.stringify({ apiUrl: "https://x", token: "tok_xyz" }, null, 2));
  });

  it("tightens permissions to 0600 if the file already existed with wider perms", () => {
    mkdirSync(join(workDir, ".config", "reposmith"), { recursive: true });
    writeRawConfig(JSON.stringify({ apiUrl: "https://old", token: "t" }));
    // Simulate a wider mode from a previous bug or external edit.
    chmodSync(configFilePath(), 0o644);

    saveConfig({ apiUrl: "https://new", token: "t" });

    const stat = readStat(configFilePath());
    // 0o600 in the lower 9 bits. Don't pin the upper bits
    // (setuid / file-type) — those depend on the platform.
    expect(stat & 0o777).toBe(0o600);
  });
});

describe("clearConfig", () => {
  it("removes the config file if present", () => {
    saveConfig({ apiUrl: "https://x", token: "t" });
    expect(existsSync(configFilePath())).toBe(true);
    clearConfig();
    expect(existsSync(configFilePath())).toBe(false);
  });

  it("does not throw when no config exists", () => {
    expect(clearConfig).not.toThrow();
  });
});

describe("requireConfig", () => {
  it("throws NotLoggedInError when no token is stored", () => {
    saveConfig({ apiUrl: "https://x" }); // no token
    expect(() => requireConfig()).toThrow(NotLoggedInError);
  });

  it("returns the config when a token is stored", () => {
    saveConfig({ apiUrl: "https://x", token: "tok_real" });
    const cfg = requireConfig();
    expect(cfg.token).toBe("tok_real");
    expect(cfg.apiUrl).toBe("https://x");
  });

  it("throws NotLoggedInError when the config file doesn't exist", () => {
    expect(() => requireConfig()).toThrow(NotLoggedInError);
  });
});

// ── helpers ─────────────────────────────────────────────────────

function writeRawConfig(text: string): void {
  mkdirSync(join(workDir, ".config", "reposmith"), { recursive: true });
  writeFileSync(configFilePath(), text);
}

function readStat(path: string): number {
  return statSync(path).mode;
}
