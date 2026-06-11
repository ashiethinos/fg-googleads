import path from "node:path";

export const config = {
  port: Number(process.env.PORT || 4789),
  apiVersion: (process.env.API_VERSION || "v24").toLowerCase(),
  customerId: (process.env.SANDBOX_CUSTOMER_ID || "1234567890").replace(/\D/g, ""),
  customerName: process.env.SANDBOX_CUSTOMER_NAME || "FeedGraph Sandbox Store",
  currency: (process.env.SANDBOX_CURRENCY || "INR").toUpperCase(),
  developerToken: process.env.SANDBOX_DEVELOPER_TOKEN || "sandbox-dev-token",
  accessToken: process.env.SANDBOX_ACCESS_TOKEN || "sandbox-access-token",
  dataDir: process.env.DATA_DIR || "./data",
  dbPath: process.env.DB_PATH || "./data/sandbox.db",
  productCount: Number(process.env.PRODUCT_COUNT || 10000),
  campaignCount: Number(process.env.CAMPAIGN_COUNT || 120),
  assetGroupCount: Number(process.env.ASSET_GROUP_COUNT || 60),
  /** Non-Google dev routes at /_dev (disable for strict googleads-only surface). */
  devRoutes: process.env.SANDBOX_DEV_ROUTES !== "false",
};

export function resolveDbPath(): string {
  return path.isAbsolute(config.dbPath) ? config.dbPath : path.resolve(process.cwd(), config.dbPath);
}
