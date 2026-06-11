import type { Response } from "express";
import { config } from "../config.js";

export type GoogleApiErrorStatus =
  | "INVALID_ARGUMENT"
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "INTERNAL"
  | "UNIMPLEMENTED"
  | "FAILED_PRECONDITION";

type GoogleAdsError = {
  errorCode: Record<string, string>;
  message: string;
  trigger?: { stringValue?: string };
  location?: { fieldPathElements?: Array<{ fieldName: string; index?: number }> };
};

const STATUS_TO_HTTP: Record<GoogleApiErrorStatus, number> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  FAILED_PRECONDITION: 400,
  INTERNAL: 500,
  UNIMPLEMENTED: 501,
};

const STATUS_TO_RPC_CODE: Record<GoogleApiErrorStatus, number> = {
  INVALID_ARGUMENT: 3,
  UNAUTHENTICATED: 16,
  PERMISSION_DENIED: 7,
  NOT_FOUND: 5,
  FAILED_PRECONDITION: 9,
  INTERNAL: 13,
  UNIMPLEMENTED: 12,
};

export class GoogleAdsApiError extends Error {
  constructor(
    public readonly status: GoogleApiErrorStatus,
    message: string,
    public readonly adsErrors: GoogleAdsError[] = [],
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

export function queryError(message: string, code = "BAD_FIELD_NAME"): GoogleAdsApiError {
  return new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    { errorCode: { queryError: code }, message },
  ]);
}

export function authorizationError(customerId: string): GoogleAdsApiError {
  return new GoogleAdsApiError(
    "PERMISSION_DENIED",
    "The caller does not have permission",
    [
      {
        errorCode: { authorizationError: "USER_PERMISSION_DENIED" },
        message: `User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the 'login-customer-id' header.`,
        trigger: { stringValue: customerId },
      },
    ],
  );
}

export function mutateResourceNotFound(resourceType: string, id: string): GoogleAdsApiError {
  return new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    {
      errorCode: { mutateError: "RESOURCE_NOT_FOUND" },
      message: `Resource was not found.`,
      trigger: { stringValue: `${resourceType}/${id}` },
    },
  ]);
}

export function sendGoogleAdsFailure(
  res: Response,
  status: GoogleApiErrorStatus,
  message: string,
  adsErrors: GoogleAdsError[] = [],
  requestId?: string,
): void {
  const httpStatus = STATUS_TO_HTTP[status];
  const rid = requestId || res.getHeader("request-id")?.toString() || "unknown";

  res.status(httpStatus).json({
    error: {
      code: STATUS_TO_RPC_CODE[status],
      message,
      status,
      details: [
        {
          "@type": `type.googleapis.com/google.ads.googleads.${config.apiVersion}.errors.GoogleAdsFailure`,
          errors: adsErrors.length
            ? adsErrors
            : [{ errorCode: { requestError: "UNKNOWN" }, message }],
          requestId: rid,
        },
      ],
    },
  });
}

export function sendGoogleError(res: Response, httpStatus: number, status: GoogleApiErrorStatus, message: string): void {
  const mapped =
    httpStatus === 401
      ? "UNAUTHENTICATED"
      : httpStatus === 403
        ? "PERMISSION_DENIED"
        : httpStatus === 404
          ? "NOT_FOUND"
          : status;
  sendGoogleAdsFailure(res, mapped, message, [], res.getHeader("request-id")?.toString());
}

export function handleGoogleAdsError(res: Response, err: unknown): void {
  if (err instanceof GoogleAdsApiError) {
    sendGoogleAdsFailure(res, err.status, err.message, err.adsErrors);
    return;
  }
  const message = err instanceof Error ? err.message : "Internal error";
  sendGoogleAdsFailure(res, "INTERNAL", message, [
    { errorCode: { internalError: "INTERNAL_ERROR" }, message },
  ]);
}
