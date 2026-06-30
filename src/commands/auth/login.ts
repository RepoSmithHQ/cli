import { defineCommand } from "citty";

import { loginFlow } from "../../lib/auth.js";

/**
 * `reposmith auth login` — browser-based authentication via the
 * RFC 8628 device flow.
 *
 * UX:
 *   1. CLI requests a user_code + verification URL.
 *   2. CLI opens the browser to that URL.
 *   3. User signs in to the web app (or is already signed in),
 *      clicks Approve at /app/cli/authorize.
 *   4. CLI polls until approved, exchanges the session token for
 *      a scoped CLI API key, saves the key, prints the workspace
 *      list.
 *
 * If the user's machine has no default browser (headless server,
 * SSH session without X forwarding), the CLI prints the URL
 * verbatim so the user can paste it into a browser on another
 * machine. The user_code is part of the URL (the
 * `verification_uri_complete` we open), so even copy/paste
 * surfaces the code pre-filled.
 *
 * The CLI never sees the user's password. 2FA works for free
 * because the web app enforces TOTP before the user can click
 * Approve.
 */
export const authCommand = defineCommand({
  meta: {
    name: "login",
    description:
      "Authenticate via browser — opens the Repo Smith web app for approval.",
  },
  args: {
    api: {
      type: "string",
      description: "Override the API base URL for this invocation.",
    },
  },
  async run({ args }) {
    await loginFlow({ ...(args.api ? { apiUrl: args.api } : {}) });
  },
});