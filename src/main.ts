// Root command — wires together the subcommand tree and exposes
// the `--json` flag. citty's `defineCommand` produces a node we
// embed in `commands/auth/`, etc., so this file stays small.
//
// Subcommands:
//   auth login, auth logout
//   workspace list, workspace use
//   repos list, repos get
//   jobs list, jobs get
//   archives download
//
// `--api` overrides the API base URL for one invocation
// (equivalent to setting `REPOSMITH_API`). Useful for pointing the
// CLI at a local dev server.

import { defineCommand } from "citty";

import { authCommand } from "./commands/auth/login.js";
import { authLogoutCommand } from "./commands/auth/logout.js";
import { workspaceListCommand } from "./commands/workspace/list.js";
import { workspaceUseCommand } from "./commands/workspace/use.js";
import { reposListCommand } from "./commands/repos/list.js";
import { reposGetCommand } from "./commands/repos/get.js";
import { jobsListCommand } from "./commands/jobs/list.js";
import { jobsGetCommand } from "./commands/jobs/get.js";
import { archivesDownloadCommand } from "./commands/archives/download.js";

export const main = defineCommand({
  meta: {
    name: "reposmith",
    version: "0.1.0",
    description:
      "Repo Smith CLI — manage your GitHub backups from the terminal.",
  },
  args: {
    json: {
      type: "boolean",
      alias: "j",
      description:
        "Output JSON instead of a human-readable table (also implied when stdout is piped).",
      default: false,
    },
    api: {
      type: "string",
      description:
        "Override the API base URL (default: $REPOSMITH_API or https://api.reposmith.dev).",
    },
  },
  subCommands: {
    auth: defineCommand({
      meta: { name: "auth", description: "Authenticate with Repo Smith (login, logout)." },
      subCommands: {
        login: authCommand,
        logout: authLogoutCommand,
      },
    }),
    workspace: defineCommand({
      meta: { name: "workspace", description: "Manage the active workspace." },
      subCommands: {
        list: workspaceListCommand,
        use: workspaceUseCommand,
      },
    }),
    repos: defineCommand({
      meta: { name: "repos", description: "List and inspect repositories in a workspace." },
      subCommands: {
        list: reposListCommand,
        get: reposGetCommand,
      },
    }),
    jobs: defineCommand({
      meta: { name: "jobs", description: "List and inspect backup jobs in a workspace." },
      subCommands: {
        list: jobsListCommand,
        get: jobsGetCommand,
      },
    }),
    archives: defineCommand({
      meta: { name: "archives", description: "Download backup archives." },
      subCommands: {
        download: archivesDownloadCommand,
      },
    }),
  },
});

// Re-export the helpers that the subcommands need so they can
// `import { resolveContext } from "../main"`.
export type RootArgs = {
  json: boolean;
  api?: string;
};