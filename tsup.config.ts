// Build configuration for the CLI.
//
// We bundle `src/index.ts` into a single ESM file. The point is
// not to ship fast code — it's to ship ONE file the package
// consumer can resolve: `bin: { reposmith: "dist/index.js" }`.
// Bundling pulls in the command tree (`main.ts`), every command
// under `commands/*`, every helper under `lib/*`, and the two
// runtime deps (`citty`, `@clack/prompts`, `open`) into one
// artifact the user can `npm install -g` and run immediately.
//
// We KEEP the `tsc --noEmit` step in `package.json:scripts.build`
// because tsup does not typecheck — it just strips types. Catching
// type errors is the slowest loop of any TS project, and we want
// it before we hand the bundle to anyone.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  // Node 20 is the floor (see `engines.node` in package.json).
  // `node20` is the smallest set of syntax tsup will accept —
  // newer syntax (e.g. `using`) only kicks in for `node22`+.
  target: "node20",
  clean: true,
  shims: false,
  minify: false,
  sourcemap: false,
  // We want ONE file the consumer can resolve, not a tree of
  // chunk-*.js files. ESM's default is to split shared modules
  // into separate chunks so browsers can share them across
  // entry points — irrelevant for a CLI. `auth.ts:243` uses
  // `await import("./config.js")` (to break a perceived init
  // cycle) which is what triggers the split here; with
  // `splitting: false` everything ends up in `dist/index.js`.
  splitting: false,
  // `src/index.ts` already has `#!/usr/bin/env node` in its
  // first line. tsup preserves that. We don't use `banner` —
  // it would prepend a second shebang and produce two adjacent
  // `#!/usr/bin/env node` lines at the top of the output.
});
