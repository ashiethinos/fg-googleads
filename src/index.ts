import express from "express";
import { config } from "./config.js";
import { googleAdsRouter, googleNotFoundHandler } from "./api/google-ads.js";
import { devRouter } from "./api/dev.js";
import { closeDb, getDb, getStats, isSeeded } from "./db/store.js";
import { seedDatabase } from "./generator/seed.js";

async function bootstrap(): Promise<void> {
  getDb();
  if (!isSeeded()) {
    console.log("[sandbox] No data found — running seed...");
    await seedDatabase(false);
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  app.use(express.json({ limit: "10mb" }));

  // Primary surface: behaves like googleads.googleapis.com
  app.use(googleAdsRouter);

  // Non-Google helpers for FeedGraph developers only (not part of the Ads API)
  if (config.devRoutes) {
    app.use("/_dev", devRouter);
  }

  app.use(googleNotFoundHandler);

  const server = app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     Google Ads API Sandbox (googleads.googleapis.com)      ║
╠══════════════════════════════════════════════════════════════╣
║  Base URL:   http://localhost:${config.port}
║  API:        /${config.apiVersion}/customers/${config.customerId}/googleAds:search
║  Account:    ${config.customerId} (${config.customerName})
║  Stats:      ${JSON.stringify(getStats())}
║  Google Ads UI: http://localhost:${config.port}/_dev/ui
║  Dev API:      ${config.devRoutes ? `http://localhost:${config.port}/_dev` : "disabled"}
╚══════════════════════════════════════════════════════════════╝
`);
  });

  const shutdown = () => {
    server.close();
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("[sandbox] Failed to start:", err);
  closeDb();
  process.exit(1);
});
