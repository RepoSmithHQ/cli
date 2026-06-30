import { defineCommand } from "citty";

import { resolveContext, runCommand } from "../../lib/command-context.js";
import { loadConfig, saveConfig } from "../../lib/config.js";
import { CliError } from "../../lib/errors.js";
import { logSuccess } from "../../lib/output.js";
import type { WorkspaceSummary } from "../../lib/types.js";

/**
 * `reposmith workspace use <id|name>` — set the active workspace
 * (stored locally; every subsequent `reposmith repos list` /
 * `jobs list` etc. defaults to this one).
 *
 * Resolution:
 *   - Exact ID match → set
 *   - Unique name match → set
 *   - Multiple matches → print the candidates and exit
 *   - No matches → print the available workspaces and exit
 *
 * Saving happens even if the workspace isn't the first one in the
 * user's list, so this command is also a "pick from list" tool.
 */
export const workspaceUseCommand = defineCommand({
  meta: {
    name: "use",
    description: "Set the active workspace by id or name.",
  },
  args: {
    idOrName: {
      type: "positional",
      description: "Workspace id (or unique name).",
      required: true,
    },
  },
  async run({ args }) {
    await runCommand(async () => {
      const ctx = resolveContext({ requireLogin: false });
      const me = await ctx.client.me();

      const needle = (args.idOrName as string).trim().toLowerCase();
      const exact = me.workspaces.find((w) => w.id === needle);
      if (exact) {
        persistAndReport(ctx.apiUrl, exact.id, exact.name);
        return;
      }

      const byName = me.workspaces.filter(
        (w: WorkspaceSummary) => w.name.toLowerCase() === needle,
      );
      if (byName.length === 1) {
        persistAndReport(ctx.apiUrl, byName[0].id, byName[0].name);
        return;
      }

      if (byName.length > 1) {
        const candidates = byName.map((w) => `  • ${w.id}  ${w.name}`).join("\n");
        throw new CliError(
          `Multiple workspaces match "${needle}" by name. Pick an id:\n${candidates}`,
        );
      }

      // No exact id match, no unique name match → ambiguous or
      // unknown. Print the available workspaces to help the user
      // spot the typo.
      const available = me.workspaces.map((w) => `  • ${w.id}  ${w.name}`).join("\n");
      throw new CliError(
        `No workspace found matching "${needle}". Available:\n${available}`,
      );
    });
  },
});

function persistAndReport(apiUrl: string, id: string, name: string): void {
  const cfg = loadConfig() ?? { apiUrl };
  saveConfig({ ...cfg, apiUrl, workspaceId: id });
  logSuccess(`Active workspace set to ${name} (${id}).`);
}
