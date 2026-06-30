// Vitest config — keeps the runner scoped to the `test/` dir.
// We intentionally don't put tests next to source (e.g. `.test.ts`
// co-located in `src/lib/`) — that would mean every consumer
// of the source code would need a vitest install path resolved
// at tsup time. Keeping `test/` separate also gives us a clean
// boundary for what's "shipped" vs "covered".
//
// `environment: "node"` is the default for vitest 1.x but
// became opt-in in 2.x; we set it explicitly so the test runner
// doesn't try to provide `window`/`document` (it would error on
// the `node:fs` imports we use).

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
