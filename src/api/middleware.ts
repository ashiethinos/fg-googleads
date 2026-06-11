import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { GoogleAdsApiError, handleGoogleAdsError } from "./google-errors.js";

export function sandboxAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const auth = req.headers.authorization;
    const devToken = req.headers["developer-token"];

    if (!auth || !auth.startsWith("Bearer ")) {
      throw new GoogleAdsApiError("UNAUTHENTICATED", "Request is missing required authentication credential.", [
        {
          errorCode: { authenticationError: "DEVELOPER_TOKEN_INVALID" },
          message: "Expected OAuth 2 access token.",
        },
      ]);
    }

    if (!devToken || String(devToken).trim() === "") {
      throw new GoogleAdsApiError("UNAUTHENTICATED", "Developer token is missing.", [
        { errorCode: { authenticationError: "DEVELOPER_TOKEN_INVALID" }, message: "Developer token is missing." },
      ]);
    }

    next();
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

export function extractCustomerId(req: Request): string {
  const fromPath = req.params.customerId;
  if (fromPath) return String(Array.isArray(fromPath) ? fromPath[0] : fromPath).replace(/\D/g, "");
  const loginHeader = req.headers["login-customer-id"];
  if (loginHeader) return String(loginHeader).replace(/\D/g, "");
  return config.customerId;
}
