import { defineCommand } from "citty";

import {
  resolveActiveWorkspaceId,
  resolveContext,
  runCommand,
} from "../../lib/command-context.js";
import { loadConfig } from "../../lib/config.js";
import { CliError } from "../../lib/errors.js";
import { formatTimestamp } from "../../lib/format.js";
import { printJson, printOutput, printTable } from "../../lib/output.js";
import { JOB_STATUSES } from "./_status-filter.js";

export const jobsListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List recent backup jobs in a workspace.",
  },
  args: {
    workspace: {
      type: "string",
      alias: "w",
      description: "Workspace id (defaults to the one set by `reposmith workspace use`).",
    },
    limit: {
      type: "string",
      description: "Maximum rows to return (1..200).",
      default: "50",
    },
    offset: {
      type: "string",
      description: "Skip this many rows before returning.",
      default: "0",
    },
    status: {
      type: "string",
      description:
        "Filter by job status (pending, cloning, uploading, succeeded, failed).",
    },
    json: {
      type: "boolean",
      alias: "j",
      description: "Output JSON instead of a table.",
      default: false,
    },
  },
  async run({ args }) {
    await runCommand(async () => {
      const ctx = resolveContext({ json: args.json });
      const cfg = loadConfig();
      const wsId = resolveActiveWorkspaceId(
        args.workspace as string | undefined,
        cfg ?? {},
      );
      if (!wsId) {
        throw new CliError(
          "No active workspace. Run `reposmith workspace use <id>` first.",
        );
      }

      const status = (args.status as string | undefined)?.trim();
      if (status && !(JOB_STATUSES as readonly string[]).includes(status)) {
        throw new CliError(
          `Invalid --status "${status}". Allowed: ${JOB_STATUSES.join(", ")}`,
        );
      }

      const result = await ctx.client.listJobs(wsId, {
        limit: parseLimitOrThrow(args.limit as string, "limit"),
        offset: parseOffsetOrThrow(args.offset as string),
        ...(status ? { status: status as (typeof JOB_STATUSES)[number] } : {}),
      });

      printOutput(
        ctx.json,
        () => printJson(result),
        () => {
          // Curated columns: `updatedAt` and the full row are reachable
          // via `jobs get <id>` or `--json`, so the at-a-glance table
          // only needs the columns that answer "what job is this and
          // where does it stand?".
          //
          // Read fields off the list item directly — DO NOT call
          // `unwrapEnvelope` here. The list endpoint returns flat
          // rows with a server-side `repository` JOIN, which would
          // be mistaken for an envelope and yield the joined repo
          // (whose id, name, etc. shadow the job fields).
          //
          // The REPO column prefers the joined repo's name (so the
          // table stays readable when a workspace has many jobs for
          // the same repo — UUIDs would all be identical) and falls
          // back to the bare repositoryId if no join was returned.
          const rows = result.items.map((r) => {
            const obj = r as Record<string, unknown>;
            const repoJoin = obj.repository as Record<string, unknown> | null | undefined;
            const repoName = repoJoin?.name;
            const repoCell = (
              typeof repoName === "string" && repoName.length > 0
                ? repoName
                : String(obj.repositoryId ?? "")
            ) as string;
            return [
              String(obj.id ?? ""),
              String(obj.status ?? ""),
              repoCell,
              formatTimestamp(obj.createdAt as string | undefined),
            ];
          });
          printTable(["ID", "STATUS", "REPO", "CREATED"], rows);
          if (result.hasMore) {
            process.stderr.write(
              `… more results available. Use --offset ${result.nextOffset ?? result.items.length} to continue.\n`,
            );
          }
        },
      );
    });
  },
});

function parseLimitOrThrow(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 200 || !Number.isInteger(n)) {
    throw new CliError(`--${name} must be an integer in [1, 200]`);
  }
  return n;
}

function parseOffsetOrThrow(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new CliError(`--offset must be a non-negative integer`);
  }
  return n;
}
