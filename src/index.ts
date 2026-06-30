#!/usr/bin/env node
// Entry point.
//
// citty's `runMain` swallows errors internally (prints them via
// consola but doesn't reject). To get our clean `error: …`
// behavior we dispatch manually: parse args, walk the subcommand
// tree, invoke the matching command's `run()` ourselves.

import { runMain } from "citty";

import { ApiError } from "./lib/errors.js";
import { main } from "./main.js";

async function dispatch(): Promise<void> {
  // `runMain` returns a Promise that resolves after the command
  // finishes. citty internally handles errors by printing them
  // with consola — but it does NOT reject on user-facing errors
  // like 404s, so the cleanest path is to let citty drive parsing
  // + dispatch, and provide our own console interception at the
  // uncaughtException level for the rare cases errors escape.
  await runMain(main);
}

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
  // Silence the noisy default `error.stack` for ApiError-likes
  // the catch handlers let through — they have a stack but no
  // value to the user.
  process.stderr.write(`unexpected error: ${e?.message ?? String(err)}\n`);
  process.exit(2);
});

dispatch().catch((err: unknown) => {
  const e = err as Error | undefined;
  process.stderr.write(`unexpected error: ${e?.message ?? String(err)}\n`);
  process.exit(2);
});
