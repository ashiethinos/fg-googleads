import type { NextFunction, Request, Response } from "express";
import { sendGoogleAdsFailure } from "./google-errors.js";

export type FaultMode = "none" | "auth_failure" | "quota_exceeded" | "rate_limit" | "internal_error";

let activeFault: FaultMode = "none";

export function setFaultMode(mode: FaultMode): void {
  activeFault = mode;
}

export function getFaultMode(): FaultMode {
  return activeFault;
}

export function clearFaultMode(): void {
  activeFault = "none";
}

/**
 * Middleware applied to Google Ads API routes.
 * When a fault is active, short-circuits the request with the appropriate error response.
 */
export function faultInjectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const fault = activeFault;
  if (fault === "none") {
    next();
    return;
  }

  switch (fault) {
    case "auth_failure":
      sendGoogleAdsFailure(res, "UNAUTHENTICATED", "Request had invalid authentication credentials.", [
        {
          errorCode: { authenticationError: "OAUTH_TOKEN_INVALID" },
          message: "Fault injection: auth_failure — the OAuth token has been revoked or is expired.",
        },
      ]);
      break;

    case "quota_exceeded":
      sendGoogleAdsFailure(res, "RESOURCE_EXHAUSTED", "Quota exceeded.", [
        {
          errorCode: { quotaError: "RESOURCE_EXHAUSTED" },
          message:
            "Fault injection: quota_exceeded — rate of requests exceeds the allowed limit. Retry after 60 seconds.",
        },
      ]);
      break;

    case "rate_limit":
      sendGoogleAdsFailure(res, "RESOURCE_EXHAUSTED", "Rate exceeded.", [
        {
          errorCode: { quotaError: "RESOURCE_TEMPORARILY_EXHAUSTED" },
          message: "Fault injection: rate_limit — too many requests per second. Use exponential backoff.",
        },
      ]);
      break;

    case "internal_error":
      sendGoogleAdsFailure(res, "INTERNAL", "Internal error.", [
        {
          errorCode: { internalError: "INTERNAL_ERROR" },
          message:
            "Fault injection: internal_error — a transient backend error occurred. This request is retryable.",
        },
      ]);
      break;

    default:
      next();
  }
}
