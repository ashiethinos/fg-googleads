/**
 * FeedGraph Google Ads Sandbox Connector
 *
 * Drop-in configuration for switching FeedGraph between LIVE and SANDBOX modes
 * without changing application logic.
 */

export type GoogleAdsEnvironment = "live" | "sandbox";

export type SandboxConnectorConfig = {
  environment: GoogleAdsEnvironment;
  sandboxBaseUrl: string;
  sandboxDeveloperToken: string;
  sandboxAccessToken: string;
  sandboxCustomerId: string;
  liveApiVersion: string;
};

export const DEFAULT_SANDBOX_CONFIG: SandboxConnectorConfig = {
  environment: "sandbox",
  sandboxBaseUrl: "http://localhost:4789",
  sandboxDeveloperToken: "sandbox-dev-token",
  sandboxAccessToken: "sandbox-access-token",
  sandboxCustomerId: "1234567890",
  liveApiVersion: "v24",
};

export function loadConnectorConfigFromEnv(): SandboxConnectorConfig {
  const env = (process.env.GOOGLE_ADS_ENVIRONMENT || "live").toLowerCase();
  return {
    environment: env === "sandbox" ? "sandbox" : "live",
    sandboxBaseUrl: (process.env.GOOGLE_ADS_SANDBOX_URL || "http://localhost:4789").replace(/\/$/, ""),
    sandboxDeveloperToken: process.env.SANDBOX_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "sandbox-dev-token",
    sandboxAccessToken: process.env.SANDBOX_ACCESS_TOKEN || "sandbox-access-token",
    sandboxCustomerId: (process.env.SANDBOX_CUSTOMER_ID || "1234567890").replace(/\D/g, ""),
    liveApiVersion: (process.env.GOOGLE_ADS_API_VERSION || "v20").toLowerCase(),
  };
}

export function isSandboxMode(config: SandboxConnectorConfig = loadConnectorConfigFromEnv()): boolean {
  return config.environment === "sandbox";
}

/** Build the Google Ads API base URL for the current environment. */
export function googleAdsApiBaseUrl(config: SandboxConnectorConfig = loadConnectorConfigFromEnv()): string {
  if (isSandboxMode(config)) {
    return config.sandboxBaseUrl;
  }
  return "https://googleads.googleapis.com";
}

/** Build a full Google Ads REST endpoint URL. */
export function googleAdsEndpoint(
  path: string,
  config: SandboxConnectorConfig = loadConnectorConfigFromEnv(),
): string {
  const base = googleAdsApiBaseUrl(config);
  const version = config.liveApiVersion;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isSandboxMode(config)) {
    return `${base}${normalizedPath.replace(`/${version}`, `/${version}`)}`;
  }
  return `${base}${normalizedPath}`;
}

/** Headers for Google Ads API requests in either environment. */
export function googleAdsRequestHeaders(
  opts: { accessToken?: string; loginCustomerId?: string },
  config: SandboxConnectorConfig = loadConnectorConfigFromEnv(),
): Record<string, string> {
  const token = isSandboxMode(config)
    ? config.sandboxAccessToken
    : (opts.accessToken || "");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": isSandboxMode(config) ? config.sandboxDeveloperToken : (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ""),
    "Content-Type": "application/json",
  };

  if (opts.loginCustomerId) {
    headers["login-customer-id"] = opts.loginCustomerId;
  }

  return headers;
}

/**
 * Integration patch for FeedGraph's google-ads-routes.ts:
 *
 * 1. Add to .env:
 *    GOOGLE_ADS_ENVIRONMENT=sandbox
 *    GOOGLE_ADS_SANDBOX_URL=http://localhost:4789
 *    SANDBOX_ACCESS_TOKEN=sandbox-access-token
 *
 * 2. Replace hardcoded googleads.googleapis.com URLs:
 *    const base = googleAdsApiBaseUrl();
 *    `${base}/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`
 *
 * 3. In getGoogleAdsApiContext(), when sandbox mode is active, return:
 *    { customerId: config.sandboxCustomerId, accessToken: config.sandboxAccessToken, ... }
 *
 * 4. Skip OAuth flow when GOOGLE_ADS_ENVIRONMENT=sandbox — auto-connect with sandbox credentials.
 */
export const FEEDGRAPH_INTEGRATION_SNIPPET = `
// Add to feedgraph/server/google-ads-sandbox-connector.ts
import {
  googleAdsApiBaseUrl,
  googleAdsRequestHeaders,
  isSandboxMode,
  loadConnectorConfigFromEnv,
} from '@feedgraph/google-ads-sandbox/connector';

const sandboxConfig = loadConnectorConfigFromEnv();

export function resolveGoogleAdsSearchUrl(customerId: string): string {
  const base = googleAdsApiBaseUrl(sandboxConfig);
  const version = sandboxConfig.liveApiVersion;
  return \`\${base}/\${version}/customers/\${customerId}/googleAds:search\`;
}

export function resolveGoogleAdsMutateUrl(customerId: string): string {
  const base = googleAdsApiBaseUrl(sandboxConfig);
  const version = sandboxConfig.liveApiVersion;
  return \`\${base}/\${version}/customers/\${customerId}/googleAds:mutate\`;
}
`.trim();
