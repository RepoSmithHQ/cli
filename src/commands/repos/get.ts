import { defineCommand } from "citty";

import { resolveContext, runCommand } from "../../lib/command-context.js";
import { printJson } from "../../lib/output.js";
import { unwrapEnvelope } from "../../lib/types.js";

export const reposGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Show one repository by id.",
  },
  args: {
    id: {
      type: "positional",
      description: "Repository id.",
      required: true,
    },
    json: {
      type: "boolean",
      alias: "j",
      description: "Output JSON instead of a key: value block.",
      default: false,
    },
  },
  async run({ args }) {
    await runCommand(async () => {
      const ctx = resolveContext({ json: args.json });
      const result = await ctx.client.getRepository(args.id as string);

      if (ctx.json) {
        printJson(result);
        return;
      }

      const repo = unwrapEnvelope(result);
      const lines = [
        `ID:           ${repo.id}`,
        `Name:         ${repo.name}`,
        `External ID:  ${repo.externalId ?? "—"}`,
        `URL:          ${repo.url ?? "—"}`,
        `Workspace:    ${repo.workspaceId ?? "—"}`,
        `Created:      ${repo.createdAt ?? "—"}`,
        `Has schedule: ${result.hasCustomSchedule ?? "—"}`,
      ];
      console.log(lines.join("\n"));
    });
  },
});
