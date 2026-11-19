export type FailureKind = "unsupported" | "too_early" | "connection" | "rate_limit" | "other";

export class AnalyticsError extends Error {
  constructor(message: string, readonly kind: FailureKind | "runner") { super(message); }
}

export const CONNECTION_FIX = "The Instagram connection in Composio is not valid. Fix it on the host with: composio link instagram";
