export class RicoConfigurationError extends Error {
  constructor() {
    super("RICO integration is not configured.");
    this.name = "RicoConfigurationError";
  }
}

export class RicoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code:
      | "AUTHENTICATION"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "RATE_LIMITED"
      | "TIMEOUT"
      | "UPSTREAM"
      | "INVALID_RESPONSE",
  ) {
    super(message);
    this.name = "RicoApiError";
  }
}

export function getRicoUserMessage(error: unknown) {
  if (error instanceof RicoConfigurationError) return error.message;
  if (!(error instanceof RicoApiError)) return "RICO is temporarily unavailable.";
  if (error.code === "RATE_LIMITED") return "RICO is busy. Wait a moment and retry.";
  if (error.code === "TIMEOUT") return "RICO did not respond in time. Retry the search.";
  if (error.code === "NOT_FOUND") return "The requested RICO record was not found.";
  if (error.code === "FORBIDDEN") return "That product is outside the approved RICO catalogue.";
  if (error.code === "AUTHENTICATION") return "RICO authentication failed. Ask an administrator to check the integration.";
  return "RICO returned an unexpected response. Retry the search.";
}
