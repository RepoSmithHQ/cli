import { defineCommand } from "citty";

import { resolveActiveWorkspaceId, resolveContext, runCommand } from "../../lib/command-context.js";
import { loadConfig } from "../../lib/config.js";
import { printJson, printOutput, printTable } from "../../lib/output.js";

export const reposListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the repositories in a workspace.",
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
    search: {
      type: "string",
      alias: "q",
      description: "Substring filter against repository name or external id.",
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

      const result = await ctx.client.listRepositories(wsId, {
        limit: parseLimitOrThrow(args.limit as string, "limit"),
        offset: parseOffsetOrThrow(args.offset as string),
        ...(args.search ? { q: args.search as string } : {}),
      });

      printOutput(
        ctx.json ? "json" : "table",
        () => printJson(result),
        () => {
          const rows = result.items.map((r) => {
            const repo = (r.repository ?? r) as Record<string, unknown>;
            const latest = r.latestJob as Record<string, unknown> | null | undefined;
            const status = latest?.status ?? "—";
            const lastBackup = latest?.createdAt ?? "—";
            return [
              String(repo.id ?? ""),
              String(repo.name ?? ""),
              String(repo.externalId ?? ""),
              String(status),
              String(lastBackup),
            ];
          });
          printTable(
            ["ID", "NAME", "EXTERNAL ID", "LATEST JOB", "LAST BACKUP"],
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