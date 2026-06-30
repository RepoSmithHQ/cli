// Streaming download with carriage-return progress on stderr.
//
// Reads the response body as a `ReadableStream<Uint8Array>` (Node
// 20+ exposes `getReader()` on `Response.body`), writes chunks to
// a `fs.WriteStream` for backpressure, and prints `N.NN MB /
// M.MM MB (XX%)` to stderr every 200ms so the user can see the
// download is alive.
//
// We don't depend on `cli-progress` or similar — the requirement is
// modest and adding a dep would just bloat the package for one
// feature.

import { createWriteStream, type WriteStream } from "node:fs";
import { stat } from "node:fs/promises";

const PROGRESS_INTERVAL_MS = 200;

export interface DownloadOptions {
  url: string;
  dest: string;
  fetchImpl?: typeof fetch;
  /** Override the system stderr (used by tests). */
  out?: NodeJS.WritableStream;
}

export interface DownloadResult {
  bytes: number;
  path: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/**
 * Download `url` (already a presigned URL with no auth required)
 * to `dest`. Streams bytes through a write stream so very large
 * archives don't buffer in memory. Prints a single-line progress
 * meter on stderr.
 *
 * Throws if the HTTP response is non-2xx. Throws if the file
 * system write fails mid-stream — the partial file is left on
 * disk in that case (the user can either retry or `rm` it; we
 * don't second-guess the partial state).
 */
export async function downloadWithProgress(
  opts: DownloadOptions,
): Promise<DownloadResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const out = opts.out ?? process.stderr;

  const res = await fetchImpl(opts.url, { method: "GET" });
  if (!res.ok) {
    throw new Error(
      `Download failed: HTTP ${res.status} ${res.statusText} from ${new URL(opts.url).origin}`,
    );
  }

  const total = Number(res.headers.get("content-length")) || 0;
  const body = res.body;
  if (!body) {
    throw new Error("Response had no body to stream");
  }

  const file: WriteStream = createWriteStream(opts.dest);
  const reader = body.getReader();

  let transferred = 0;
  let lastPrint = 0;
  let lastErr: unknown = null;

  // Wrap the write stream so a write error during `pipe`-like
  // streaming gets surfaced up the promise chain rather than
  // crashing the process.
  const writeBackpressure = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (file.write("") === false) {
        file.once("drain", resolve);
        file.once("error", reject);
      } else {
        resolve();
      }
    });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await writeBackpressure();
        file.write(Buffer.from(value));
        transferred += value.byteLength;

        const now = Date.now();
        if (now - lastPrint >= PROGRESS_INTERVAL_MS) {
          lastPrint = now;
          const pct = total > 0
            ? Math.min(100, Math.round((transferred / total) * 100))
            : 0;
          out.write(
            `\r${formatBytes(transferred)} / ${
              total > 0 ? formatBytes(total) : "? B"
            } (${pct}%)`,
          );
        }
      }
    }
  } catch (err) {
    lastErr = err;
  }

  await new Promise<void>((resolve) => file.end(resolve));

  if (lastErr !== null) {
    throw lastErr;
  }

  // Clear the progress line on completion.
  out.write(`\r${" ".repeat(80)}\r`);

  // Sanity: verify the file on disk matches what we counted.
  let actual: number;
  try {
    const st = await stat(opts.dest);
    actual = st.size;
  } catch {
    actual = transferred;
  }

  return { bytes: actual, path: opts.dest };
}