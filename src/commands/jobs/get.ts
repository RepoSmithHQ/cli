import { defineCommand } from "citty";

import { resolveContext, runCommand } from "../../lib/command-context.js";
import { printJson } from "../../lib/output.js";

export const jobsGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "Show one backup job by id.",
  },
  args: {
    id: {
      type: "positional",
      description: "Job id.",
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
      const result = await ctx.client.getJob(args.id as string);

      if (ctx.json) {
        printJson(result);
        return;
      }

      const job = (result.job ?? result) as Record<string, unknown>;
      const lines = [
        `ID:           ${job.id}`,
        `Status:       ${job.status}`,
        `Repository:   ${job.repositoryId}`,
        `Created:      ${job.createdAt}`,
        `Updated:      ${job.updatedAt}`,
        `Archive:      ${job.archiveUrl ?? "—"}`,
        `Encryption:   ${job.encryptionMode ?? "—"}`,
      ];
      console.log(lines.join("\n"));
    });
  },
});
