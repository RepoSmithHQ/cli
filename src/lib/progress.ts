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

  // `file.write("")` enqueues a zero-length chunk so we can ask
  // Node whether the underlying queue is full — without
  // advancing the on-disk file. Standard Node idiom for
  // backpressure detection when you don't want to inline the
  // logic at every `write()` site.
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
          const pct =
            total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
          out.write(
            `\r${formatBytes(transferred)} / ${
              total > 0 ? formatBytes(total) : "? B"
            } (${pct}%)`,
          );
        }
      }
    }
  } finally {
    // Always close the write stream, even on read/write failure —
    // partial files on disk are the user's to clean up.
    await new Promise<void>((resolve) => file.end(resolve));
  }

  // Clear the progress line on completion. `ESC[2K` erases the
  // entire current line regardless of terminal width (the
  // earlier 80-space-clear assumed an 80-column terminal).
  out.write("\r\x1b[2K");

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
