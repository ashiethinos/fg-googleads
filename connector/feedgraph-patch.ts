/**
 * Copy this file to feedgraph/server/google-ads-sandbox-connector.ts
 * and wire it into google-ads-routes.ts and google-ads-mutate.ts.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GoogleAdsEnvironment = "live" | "sandbox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadSandboxConnectorConfig() {
  const environment = (process.env.GOOGLE_ADS_ENVIRONMENT || "live").toLowerCase() as GoogleAdsEnvironment;
  return {
    environment: environment === "sandbox" ? ("sandbox" as const) : ("live" as const),
    sandboxBaseUrl: (process.env.GOOGLE_ADS_SANDBOX_URL || "http://localhost:4789").replace(/\/$/, ""),
    sandboxAccessToken: process.env.SANDBOX_ACCESS_TOKEN || "sandbox-access-token",
    sandboxDeveloperToken:
      process.env.SANDBOX_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "sandbox-dev-token",
    sandboxCustomerId: (process.env.SANDBOX_CUSTOMER_ID || "1234567890").replace(/\D/g, ""),
    apiVersion: (process.env.GOOGLE_ADS_API_VERSION || "v24").toLowerCase(),
  };
}

export function isGoogleAdsSandboxMode(): boolean {
  return loadSandboxConnectorConfig().environment === "sandbox";
}

export function googleAdsApiOrigin(): string {
  const cfg = loadSandboxConnectorConfig();
  return cfg.environment === "sandbox" ? cfg.sandboxBaseUrl : "https://googleads.googleapis.com";
}

export function googleAdsSearchUrl(customerId: string): string {
  const cfg = loadSandboxConnectorConfig();
  return `${googleAdsApiOrigin()}/${cfg.apiVersion}/customers/${customerId}/googleAds:search`;
}

export function googleAdsMutateUrl(customerId: string): string {
  const cfg = loadSandboxConnectorConfig();
  return `${googleAdsApiOrigin()}/${cfg.apiVersion}/customers/${customerId}/googleAds:mutate`;
}

export function sandboxApiHeaders(accessToken?: string, loginCustomerId?: string): Record<string, string> {
  const cfg = loadSandboxConnectorConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${isGoogleAdsSandboxMode() ? cfg.sandboxAccessToken : accessToken || ""}`,
    "developer-token": isGoogleAdsSandboxMode() ? cfg.sandboxDeveloperToken : process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

/** Resolve connector module path for FeedGraph monorepo linking */
export function sandboxPackageRoot(): string {
  return path.resolve(__dirname, "..");
}
