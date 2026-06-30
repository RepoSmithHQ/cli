import { defineCommand } from "citty";

import { logoutFlow } from "../../lib/auth.js";

export const authLogoutCommand = defineCommand({
  meta: {
    name: "logout",
    description:
      "Revoke the CLI token and clear the local config. Idempotent.",
  },
  async run() {
    await logoutFlow();
  },
});