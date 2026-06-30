import { resolve as resolvePath } from "node:path";

import { defineCommand } from "citty";

import { resolveContext, runCommand } from "../../lib/command-context.js";
import { downloadWithProgress } from "../../lib/progress.js";
import { logInfo, logSuccess } from "../../lib/output.js";

/**
 * `reposmith archives download <job-id> [--out path]`
 *
 * Flow:
 *   1. Call `GET /api/cli/v1/jobs/:id/archive`.
 *      - `mode === "stream"`            → server returned a
 *                                          presigned URL, we
 *                                          download from there.
 *      - `mode === "restore-pending"`   → server queued a GLACIER
 *                                          restore; the user will
 *                                          be emailed when it's
 *                                          ready. Print a friendly
 *                                          message; exit 0 (this
 *                                          isn't an error — the
 *                                          user can't act further
 *                                          here).
 *      - `mode === "stream"`            → stream the bytes
 *                                          ourselves with
 *                                          progress logging.
 *   2. The CLI NEVER proxies the file through Nitro (same as the
 *      web UI does) — better-auth stays off the bandwidth path.
 *
 * The download URL has 5-minute validity — long enough for large
 * archives to complete over a typical broadband connection.
 *
 * For archive-mode jobs (per-backup password), the password was
 * emailed to the user by the server on the first download click.
 * Subsequent clicks don't re-email — the user already has it.
 */
export const archivesDownloadCommand = defineCommand({
  meta: {
    name: "download",
    description: "Download a backup archive for a completed job.",
  },
  args: {
    id: {
      type: "positional",
      description: "Job id (from `reposmith jobs list`).",
      required: true,
    },
    out: {
      type: "string",
      alias: "o",
      description:
        "Destination path. Defaults to ./<repoSlug>-<jobPrefix>.<ext> in the current directory.",
    },
  },
  async run({ args }) {
    await runCommand(async () => {
      const ctx = resolveContext();
      const jobId = args.id as string;
      const response = await ctx.client.getArchiveDownload(jobId);

      if (response.mode === "restore-pending") {
        logInfo(
          `Restoring ${response.repositoryName} from archive storage — ` +
            `this can take up to an hour. We'll email you the download link (and ` +
            `per-backup password, if applicable) when it's ready.`,
        );
        return;
      }

      const dest = resolveOutPath(args.out as string | undefined, response.filename);
      logInfo(`Downloading ${response.repositoryName} archive to ${dest} …`);
      const result = await downloadWithProgress({ url: response.url, dest });
      logSuccess(
        `Downloaded ${(result.bytes / (1024 * 1024)).toFixed(2)} MB to ${dest}.`,
      );
    });
  },
});

function resolveOutPath(
  explicit: string | undefined,
  defaultFilename: string,
): string {
  if (explicit && explicit.length > 0) {
    return resolvePath(process.cwd(), explicit);
  }
  return resolvePath(process.cwd(), defaultFilename);
}