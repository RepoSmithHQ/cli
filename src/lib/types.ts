// Types mirroring the server response shapes for the CLI endpoints.
// Hand-maintained — no codegen. Keep these in sync with the actual
// server contract; an unintentional drift here surfaces as a CLI
// crash instead of a silent mismatch.

export type EncryptionMode = "none" | "password" | "archive";
export type JobStatus = "pending" | "cloning" | "uploading" | "succeeded" | "failed";

export interface CliUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  plan: {
    productId: string | null;
    status: string;
  };
  createdAt: string;
}

export interface MeResponse {
  success: true;
  user: CliUser;
  workspaces: WorkspaceSummary[];
}

export interface LoginResponse {
  success: true;
  token: string;
  expiresAt: string | null;
  user: { id: string; email: string; name: string };
}

// ── Device-flow (RFC 8628) responses ──────────────────────────────────

/**
 * Shape of the response from `POST /api/auth/device/code`.
 * `verification_uri_complete` is the full URL the CLI should open —
 * the user_code is already in the query string.
 */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

/**
 * Success shape from `POST /api/auth/device/token`. Better-auth
 * returns the user's session token as `access_token` (the plugin
 * creates a fresh session in its own DB row when the device code
 * is approved).
 */
export interface DeviceTokenSuccess {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
}

/**
 * Discriminated union for every response shape — keeps callers
 * narrowly typed. Errors come back as `{ error, error_description }`
 * (RFC 6749), which `pollDeviceToken` translates to `DeviceFlowError`.
 */
export type DeviceTokenResponse = DeviceTokenSuccess;

export interface RepositorySummary {
  // The shape returned by `listRepositoriesWithLatestJob`. Includes
  // the workspace inheritance join and the latest-job window
  // function — we keep it loose (`Record<string, unknown>`) so a
  // server-side schema addition doesn't break the CLI build.
  [key: string]: unknown;
}

export interface ListRepositoriesResponse {
  success: true;
  items: RepositorySummary[];
  totalReturned: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface ListJobsResponse {
  success: true;
  items: Record<string, unknown>[];
  totalReturned: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface ArchiveStreamResponse {
  success: true;
  mode: "stream";
  url: string;
  filename: string;
  expiresIn: number;
  repositoryName: string;
}

export interface ArchiveRestorePendingResponse {
  success: true;
  mode: "restore-pending";
  repositoryName: string;
}

export type ArchiveDownloadResponse =
  ArchiveStreamResponse | ArchiveRestorePendingResponse;

/**
 * Some endpoints return `{ job: {...} }` / `{ repository: {...} }`
 * envelopes while others return the inner object directly (depending
 * on whether the row was joined with another table server-side).
 * `unwrapEnvelope` picks the inner object when an envelope is
 * present and falls back to the input otherwise — so callers can
 * treat both shapes uniformly without nested casts.
 */
export function unwrapEnvelope<T extends object>(value: T): T;
export function unwrapEnvelope<T extends object>(value: { job?: T; repository?: T }): T;
export function unwrapEnvelope<T extends object>(
  value: T | { job?: T; repository?: T },
): T {
  if (value && typeof value === "object") {
    const v = value as { job?: T; repository?: T };
    if (v.job) return v.job;
    if (v.repository) return v.repository;
  }
  return value as T;
}
