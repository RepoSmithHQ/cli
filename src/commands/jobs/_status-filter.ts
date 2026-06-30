// Shared job-status filter constant. Kept inline here (not in a
// shared schema module) because the only validation we do is the
// "is it one of these strings" check — duplicating the array keeps
// this file self-contained.

export const JOB_STATUSES = [
  "pending",
  "cloning",
  "uploading",
  "succeeded",
  "failed",
] as const;
