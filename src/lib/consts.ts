// Project-wide constants.
//
// Defaults that are referenced from multiple modules (env resolution,
// config loading, help text, etc.) live here so there is one place to
// change them. Anything derived from the runtime environment belongs
// in `env.ts`; the values below are static.

/** Production API base URL. Override at runtime via `REPOSMITH_API`. */
export const DEFAULT_API_URL = "https://reposmith.com/api";