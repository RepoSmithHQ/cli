// HTTP client for the CLI. Wraps `fetch` to add the bearer token
// and error envelope.
//
// `Authorization: Bearer <token>` is set on every request after a
// successful login. `setToken(undefined)` clears it for the login
// flow itself (no token yet → can't send one).
//
// All non-2xx responses raise `ApiError` with the status and parsed
// JSON body. 401s raise `NotLoggedInError` so commands can branch
// on them without re-checking the status.
//
// Device-flow requests use a separate `rawRequest` path that does
// NOT inject the CLI bearer token — better-auth's `/api/auth/device/*`
// endpoints are anonymous, and the device-exchange endpoint is
// authenticated with a session token instead of the CLI key.

import { ApiError, NotLoggedInError } from "./errors.js";
import type {
  ArchiveDownloadResponse,
  DeviceCodeResponse,
  DeviceTokenResponse,
  DeviceTokenSuccess,
  ListJobsResponse,
  ListRepositoriesResponse,
  LoginResponse,
  MeResponse,
} from "./types.js";

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface ListRepositoriesOptions {
  limit?: number;
  offset?: number;
  q?: string;
}

export interface ListJobsOptions {
  limit?: number;
  offset?: number;
  status?: string;
}

/**
 * Thrown by `pollDeviceToken` for the RFC 8628 error codes the
 * server returns in the body of a non-2xx response. Callers branch
 * on `kind`; the human-readable description is on `description`.
 */
export class DeviceFlowError extends Error {
  constructor(
    public readonly kind: "pending" | "slow_down" | "denied" | "expired",
    description: string,
  ) {
    super(description);
    this.name = "DeviceFlowError";
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | undefined;
  private fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    // Allow tests to inject a mock fetch. Node 20+ exposes `fetch`
    // globally so the default just uses that.
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("No fetch implementation available — Node 20+ required");
    }
  }

  setToken(token: string | undefined): void {
    this.token = token;
  }

  /**
   * Authenticated request — injects the CLI bearer token (if set).
   * Used by every command after login. 401s are mapped to
   * `NotLoggedInError` so the CLI can print "Run `reposmith auth
   * login` first".
   */
  private async request<T>(
    method: string,
    path: string,
    init?: { body?: unknown },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new ApiError(res.status, text, `HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        return text as unknown as T;
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new NotLoggedInError(parsed);
      }
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "message" in parsed &&
        typeof (parsed as { message: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : `HTTP ${res.status}`;
      throw new ApiError(res.status, parsed, message);
    }

    return parsed as T;
  }

  /**
   * Unauthenticated (or differently-authenticated) request. Does
   * NOT inject the CLI bearer token — the caller supplies whatever
   * headers they need (e.g. `Authorization: Bearer <session-token>`
   * when exchanging a device-flow session for a CLI key). 401s are
   * NOT mapped to `NotLoggedInError` here because the better-auth
   * device endpoints return 400 (not 401) for the standard
   * `authorization_pending` / `slow_down` / `access_denied` /
   * `expired_token` errors; callers branch on the parsed body's
   * `error` field via `pollDeviceToken` below.
   */
  private async rawRequest<T>(
    method: string,
    path: string,
    init?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    };
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new ApiError(res.status, text, `HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        return text as unknown as T;
      }
    }

    if (!res.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "error_description" in parsed &&
        typeof (parsed as { error_description: unknown }).error_description === "string"
          ? (parsed as { error_description: string }).error_description
          : `HTTP ${res.status}`;
      throw new ApiError(res.status, parsed, message);
    }

    return parsed as T;
  }

  // ── Device-flow login (RFC 8628) ──────────────────────────────
  /**
   * Request a (device_code, user_code) pair from better-auth's
   * `deviceAuthorization` plugin. Returns the verification URI
   * (full URL — plugin builds it from `baseURL`) plus the polling
   * interval the server expects.
   */
  requestDeviceCode(
    clientId: string,
    scope?: string,
  ): Promise<DeviceCodeResponse> {
    return this.rawRequest<DeviceCodeResponse>("POST", "/api/auth/device/code", {
      body: scope ? { client_id: clientId, scope } : { client_id: clientId },
    });
  }

  /**
   * Poll better-auth's `/device/token` for the session token.
   * Better-auth returns standard RFC 8628 error codes in the body
   * for `authorization_pending` / `slow_down` / `access_denied` /
   * `expired_token`; we surface those by throwing `DeviceFlowError`
   * so the caller can branch.
   */
  async pollDeviceToken(
    deviceCode: string,
    clientId: string,
  ): Promise<DeviceTokenSuccess> {
    try {
      const res = await this.rawRequest<DeviceTokenResponse>(
        "POST",
        "/api/auth/device/token",
        {
          body: {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
            client_id: clientId,
          },
        },
      );
      return res;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const body = err.body as {
          error?: string;
          error_description?: string;
        };
        if (body.error === "authorization_pending") {
          throw new DeviceFlowError(
            "pending",
            body.error_description ?? "",
          );
        }
        if (body.error === "slow_down") {
          throw new DeviceFlowError(
            "slow_down",
            body.error_description ?? "",
          );
        }
        if (body.error === "access_denied") {
          throw new DeviceFlowError(
            "denied",
            body.error_description ?? "",
          );
        }
        if (body.error === "expired_token") {
          throw new DeviceFlowError(
            "expired",
            body.error_description ?? "",
          );
        }
      }
      throw err;
    }
  }

  /**
   * Exchange a device-flow session token for a scoped CLI API key.
   * The session token is sent on `Authorization: Bearer` (NOT the
   * existing CLI token); better-auth's `getSession` reads it on
   * the server, identifies the user, mints a CLI key with
   * `permissions: { cli: ["read"] }`, and returns it.
   */
  exchangeSessionForCliKey(sessionToken: string): Promise<LoginResponse> {
    return this.rawRequest<LoginResponse>(
      "POST",
      "/api/cli/v1/auth/device-exchange",
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
  }

  logout(): Promise<{ success: true }> {
    return this.request<{ success: true }>("POST", "/api/cli/v1/auth/logout");
  }

  // ── Me / workspaces ─────────────────────────────────────────────
  me(): Promise<MeResponse> {
    return this.request<MeResponse>("GET", "/api/cli/v1/me");
  }

  // ── Repositories ────────────────────────────────────────────────
  listRepositories(
    workspaceId: string,
    opts: ListRepositoriesOptions = {},
  ): Promise<ListRepositoriesResponse> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts.q !== undefined && opts.q.length > 0) params.set("q", opts.q);
    const qs = params.toString();
    return this.request<ListRepositoriesResponse>(
      "GET",
      `/api/cli/v1/workspaces/${encodeURIComponent(workspaceId)}/repositories${qs ? `?${qs}` : ""}`,
    );
  }

  getRepository(repoId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "GET",
      `/api/cli/v1/repositories/${encodeURIComponent(repoId)}`,
    );
  }

  // ── Jobs ────────────────────────────────────────────────────────
  listJobs(
    workspaceId: string,
    opts: ListJobsOptions = {},
  ): Promise<ListJobsResponse> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts.status !== undefined) params.set("status", opts.status);
    const qs = params.toString();
    return this.request<ListJobsResponse>(
      "GET",
      `/api/cli/v1/workspaces/${encodeURIComponent(workspaceId)}/jobs${qs ? `?${qs}` : ""}`,
    );
  }

  getJob(jobId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "GET",
      `/api/cli/v1/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  getArchiveDownload(jobId: string): Promise<ArchiveDownloadResponse> {
    return this.request<ArchiveDownloadResponse>(
      "GET",
      `/api/cli/v1/jobs/${encodeURIComponent(jobId)}/archive`,
    );
  }
}