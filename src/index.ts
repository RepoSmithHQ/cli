#!/usr/bin/env node
// Entry point.
//
// citty's `runMain` handles argv parsing + subcommand dispatch
// and prints errors via consola on the failure paths it owns. We
// don't intercept parsing — we let citty do its thing and add an
// `uncaughtException` listener so the rare escape (an async path
// that wasn't awaited inside the command body) still produces a
// clean line on stderr instead of a raw stack trace.

import { runMain } from "citty";

import { ApiError } from "./lib/errors.js";
import { main } from "./main.js";

runMain(main).catch((err: unknown) => {
  const e = err as Error | undefined;
  process.stderr.write(`unexpected error: ${e?.message ?? String(err)}\n`);
  process.exit(2);
});

process.on("uncaughtException", (err: unknown) => {
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
  const e = err as Error | undefined;
  // ApiError-likes the catch handlers let through carry a stack
  // but no value to the user — silence it.
  process.stderr.write(`unexpected error: ${e?.message ?? String(err)}\n`);
  process.exit(2);
});
