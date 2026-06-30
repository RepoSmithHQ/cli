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
import { unwrapEnvelope } from "../../lib/types.js";

export const reposListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the repositories in a workspace.",
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
      const wsId = resolveActiveWorkspaceId(
        args.workspace as string | undefined,
        cfg ?? {},
      );
      if (!wsId) {
        throw new CliError(
          "No active workspace. Run `reposmith workspace use <id>` first.",
        );
      }

      const result = await ctx.client.listRepositories(wsId, {
        limit: parseLimitOrThrow(args.limit as string, "limit"),
        offset: parseOffsetOrThrow(args.offset as string),
        ...(args.search ? { q: args.search as string } : {}),
      });

      printOutput(
        ctx.json,
        () => printJson(result),
        () => {
          // Curated columns: `externalId` and the latest-job status
          // are reachable via `repos get <id>` or `--json`. We keep
          // `id` on the table itself because it's what the user
          // copy-pastes into `repos get <id>` and `jobs get <id>` —
          // surfacing it here saves a round trip just to find an id.
          const rows = result.items.map((r) => {
            const repo = unwrapEnvelope(r);
            const latest = r.latestJob as Record<string, unknown> | null | undefined;
            const lastBackup = formatTimestamp(latest?.createdAt as string | undefined);
            return [String(repo.id ?? ""), String(repo.name ?? ""), lastBackup];
          });
          printTable(["ID", "NAME", "LAST BACKUP"], rows);
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
