// API base URL resolution.
//
// Priority:
//   1. `REPOSMITH_API` env var (set by CI, advanced users)
//   2. `https://api.reposmith.dev` (production default)
//
// The CLI is open-source and ships against the production API by
// default. Devs running a local Nitro server set
// `REPOSMITH_API=http://localhost:3000` before invoking the CLI.

export const DEFAULT_API_URL = "https://api.reposmith.dev";

export function resolveApiUrl(): string {
  const fromEnv = process.env.REPOSMITH_API;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  return DEFAULT_API_URL;
}