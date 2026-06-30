import { defineCommand } from "citty";

import { resolveContext, runCommand } from "../../lib/command-context.js";
import { printJson, printOutput, printTable } from "../../lib/output.js";

export const workspaceListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List the workspaces the current user is a member of.",
  },
  args: {
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
      const me = await ctx.client.me();

      printOutput(
        ctx.json,
        () => printJson(me.workspaces),
        () =>
          // Curated columns: id / status are reachable via `workspace
          // use <name>` and `--json` respectively, so the at-a-glance
          // table only needs the picking fields.
          printTable(
            ["NAME", "ROLE", "PLAN"],
            me.workspaces.map((w) => [w.name, w.role, w.plan.productId ?? "—"]),
          ),
      );
    });
  },
});
