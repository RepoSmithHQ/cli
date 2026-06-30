import { defineCommand } from "citty";

import { resolveActiveWorkspaceId, resolveContext, runCommand } from "../../lib/command-context.js";
import { loadConfig } from "../../lib/config.js";
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
      description:
        "Workspace id (defaults to the one set by `reposmith workspace use`).",
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
      const wsId = resolveActiveWorkspaceId(args.workspace as string | undefined, cfg ?? {});
      if (!wsId) {
        process.stderr.write(
          "No active workspace. Run `reposmith workspace use <id>` first.\n",
        );
        process.exit(1);
      }

      const status = (args.status as string | undefined)?.trim();
      if (status && !(JOB_STATUSES as readonly string[]).includes(status)) {
        process.stderr.write(
          `Invalid --status "${status}". Allowed: ${JOB_STATUSES.join(", ")}\n`,
        );
        process.exit(1);
      }

      const result = await ctx.client.listJobs(wsId, {
        limit: parseLimitOrThrow(args.limit as string, "limit"),
        offset: parseOffsetOrThrow(args.offset as string),
        ...(status ? { status: status as typeof JOB_STATUSES[number] } : {}),
      });

      printOutput(
        ctx.json ? "json" : "table",
        () => printJson(result),
        () => {
          const rows = result.items.map((r) => {
            const job = (r as { job?: Record<string, unknown> } | Record<string, unknown>) as Record<string, unknown>;
            const obj = (job.job ?? job) as Record<string, unknown>;
            return [
              String(obj.id ?? ""),
              String(obj.status ?? ""),
              String(obj.repositoryId ?? ""),
              String(obj.createdAt ?? ""),
              String(obj.updatedAt ?? ""),
            ];
          });
          printTable(
            ["ID", "STATUS", "REPO", "CREATED", "UPDATED"],
            rows,
          );
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
    throw new Error(`--${name} must be an integer in [1, 200]`);
  }
  return n;
}

function parseOffsetOrThrow(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`--offset must be a non-negative integer`);
  }
  return n;
}