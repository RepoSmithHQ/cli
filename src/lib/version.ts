// Single source of truth for the CLI's own version.
//
// Reads `package.json` from the package root at import time. We walk
// up from `import.meta.url` until we find a `package.json` whose
// `name` matches ours — that handles both layouts:
//
//   - In dev (`tsx src/index.ts`, vitest loading from `src/`): the
//     file lives at `src/lib/version.ts`, so we walk up to the project
//     root.
//   - After `npm install -g` or `npm publish`: the bundled file lives
//     at `<pkg-root>/dist/index.js`, so we walk one level up to find
//     the package root. npm always ships `package.json` at the root
//     of a published package even when `files: ["dist", ...]` is set,
//     so the file is guaranteed to be present alongside the bundle.
//
// Matching by `name` (not just "any package.json") keeps us from
// accidentally picking up an unrelated package.json in `node_modules`
// if someone restructures the source tree in a way that adds an
// intermediate `package.json`.
//
// We deliberately do NOT use tsup `define` or a JSON import assertion:
// both would require the build pipeline to know the version ahead of
// time, which races with `semantic-release` (the version bump and the
// `dist/` rebuild happen on different steps). Reading at runtime means
// the version always matches what `npm view @reposmith/cli version`
// would report.
//
// Falls back to "0.0.0" if anything goes wrong so callers can still
// produce a non-empty `User-Agent` header — a malformed UA is more
// confusing than a versioned one with a placeholder.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@reposmith/cli";

function readPkgVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  // Cap the walk at 8 levels — more than enough for a project + a few
  // layers of monorepo tooling. Stops the loop from spinning if we
  // ever hit a filesystem that doesn't expose `..` as a parent.
  for (let i = 0; i < 8; i++) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (parsed.name === PACKAGE_NAME && typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
      // No package.json here (or unreadable / unparseable) — keep walking.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "0.0.0";
}

export const VERSION = readPkgVersion();

/**
 * The `User-Agent` every request identifies itself with. Format is
 * `<product>/<version> (<runtime>/<runtime-version>)` — the same shape
 * RFC 7231 recommends and what most API gateways log out of the box.
 * `process.versions.node` is bare digits (e.g. `24.11.0`), no `v` prefix.
 */
export const USER_AGENT = `reposmith-cli/${VERSION} (node/${process.versions.node})`;
