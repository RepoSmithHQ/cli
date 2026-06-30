// ESLint flat config (ESLint 9+).
//
// Goal: catch real bugs (unused vars, inconsistent type imports,
// obviously dead code) and enforce import ordering so the diff
// for any PR doesn't churn on import ordering. We deliberately
// do NOT enable stylistic rules (indent, quotes, etc.) — those
// are Prettier's job, and we don't want the two tools fighting.
//
// `no-console: off` because the CLI legitimately uses
// `console.log` for table/JSON output and `console.error` for
// progress + error reporting. The runtime is a TTY; banning
// console would be silly.

import js from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // Sort imports so the diff for any PR is the change, not
      // a 20-line import-order shuffle.
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",

      // Catch imports used only as types — split them into
      // `import type { … }` so they get erased at build time.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],

      // Unused vars. The `_` prefix is conventionally "I know
      // this is unused" — common for callback args we have to
      // accept but don't read.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // CLI legitimately uses console.* — don't fight the runtime.
      "no-console": "off",
    },
  },
];
