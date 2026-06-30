// Errors raised by the API client.
//
// `ApiError` is the typed wrapper for any non-2xx response. We keep
// the HTTP status code and the parsed body so callers can branch on
// them (`body.error === "two_factor_required"`, `status === 401`
// to detect "logged out", etc.).
//
// `NotLoggedInError` is a convenience subclass used by the CLI to
// distinguish the "you need to run `reposmith auth login` first"
// case from generic 401s (e.g. a bad route). Commands catch it and
// print a uniform hint.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

export class NotLoggedInError extends ApiError {
  constructor(body: unknown) {
    super(401, body, "not logged in");
    this.name = "NotLoggedInError";
  }
}
