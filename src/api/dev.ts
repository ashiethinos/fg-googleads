import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import { GOOGLE_ADS_API_PATHS, GOOGLE_ADS_DOC_LINKS } from "./google-ads-paths.js";
import { clearFaultMode, getFaultMode, setFaultMode, type FaultMode } from "./fault-injection.js";
import { uiApiRouter } from "./ui-api.js";
import {
  applyCustomLabel,
  applyProductLabel,
  createAssetGroup,
  createCampaign,
  getAssetGroup,
  getCampaign,
  getCustomer,
  getProduct,
  getStats,
  listAssetGroups,
  listAuditLogs,
  listCampaigns,
  listLabels,
  listListingGroups,
  listProductGroups,
  listProducts,
  listProductVariants,
  moveProductToAssetGroup,
  removeProductLabel,
  updateAssetGroupStatus,
  updateCampaignStatus,
  updateProductStatus,
  writeAuditLog,
} from "../db/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, "../ui");

export const devRouter = Router();

/** Google Ads–style web console — verify PMAX changes, product performance, audit trail. */
devRouter.use("/ui/api", uiApiRouter);
devRouter.use("/ui", express.static(uiDir));
devRouter.get("/ui", (_req, res) => {
  res.sendFile(path.join(uiDir, "index.html"));
});

devRouter.get("/", (req, res) => {
  if (req.accepts(["html", "json"]) === "json") {
    const base = `http://localhost:${config.port}`;
    return res.json({
      name: "FeedGraph Google Ads Sandbox Simulator",
      mode: "sandbox",
      ui: `${base}/_dev/ui`,
      docs: `${base}/_dev/info`,
      health: `${base}/_dev/health`,
      customerId: config.customerId,
      stats: getStats(),
    });
  }
  res.redirect("/_dev/ui");
});

devRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", mode: "sandbox", version: config.apiVersion });
});

devRouter.get("/info", (_req, res) => {
  const customer = getCustomer(config.customerId);
  const base = `http://localhost:${config.port}`;
  const v = config.apiVersion;
  const cid = config.customerId;
  res.json({
    mode: "sandbox",
    apiVersion: v,
    customerId: cid,
    customerName: customer?.descriptiveName ?? config.customerName,
    currency: customer?.currencyCode ?? config.currency,
    stats: getStats(),
    connector: {
      baseUrl: base,
      developerToken: config.developerToken,
      accessToken: config.accessToken,
      accountId: cid,
    },
    googleAdsApi: {
      host: "googleads.googleapis.com (live) | localhost (sandbox)",
      documentation: GOOGLE_ADS_DOC_LINKS,
      implementedEndpoints: [
        {
          service: "GoogleAdsService.Search",
          method: "POST",
          path: `/${v}/customers/${cid}/googleAds:search`,
          url: `${base}/${v}/customers/${cid}/googleAds:search`,
          requestBody: { query: "SELECT ...", pageToken: "(optional)" },
          responseBody: { results: [], fieldMask: "", totalResultsCount: "", nextPageToken: "(optional)" },
        },
        {
          service: "GoogleAdsService.SearchStream",
          method: "POST",
          path: `/${v}/customers/${cid}/googleAds:searchStream`,
          url: `${base}/${v}/customers/${cid}/googleAds:searchStream`,
          requestBody: { query: "SELECT ..." },
          responseBody: [{ results: [], fieldMask: "" }],
        },
        {
          service: "GoogleAdsService.Mutate",
          method: "POST",
          path: `/${v}/customers/${cid}/googleAds:mutate`,
          url: `${base}/${v}/customers/${cid}/googleAds:mutate`,
          requestBody: { mutateOperations: [] },
          responseBody: { mutateOperationResponses: [] },
        },
        {
          service: "CustomerService.ListAccessibleCustomers",
          method: "GET",
          path: `/${v}/customers:listAccessibleCustomers`,
          url: `${base}/${v}/customers:listAccessibleCustomers`,
          responseBody: { resourceNames: [`customers/${cid}`] },
        },
        {
          service: "CampaignService.Mutate",
          method: "POST",
          path: `/${v}/customers/${cid}/campaigns:mutate`,
          url: `${base}/${v}/customers/${cid}/campaigns:mutate`,
          requestBody: { operations: [{ update: {}, updateMask: "status" }] },
          responseBody: { results: [{ resourceName: "" }] },
        },
        {
          service: "AssetGroupService.Mutate",
          method: "POST",
          path: `/${v}/customers/${cid}/assetGroups:mutate`,
          url: `${base}/${v}/customers/${cid}/assetGroups:mutate`,
          requestBody: { operations: [{ update: {}, updateMask: "status" }] },
          responseBody: { results: [{ resourceName: "" }] },
        },
      ],
      pathTemplates: GOOGLE_ADS_API_PATHS,
      requiredHeaders: ["Authorization: Bearer <token>", "developer-token: <token>"],
      optionalHeaders: ["login-customer-id (MCC access)", "linked-customer-id (partners)"],
      responseHeaders: ["request-id"],
    },
    testScenarios: [
      "high_performers",
      "wasted_spend",
      "no_conversion",
      "low_inventory_high_roas",
      "missing_labels",
      "variant_out_of_stock",
      "zero_inventory",
    ],
  });
});

devRouter.get("/stats", (_req, res) => {
  res.json(getStats());
});

devRouter.get("/audit-logs", (req, res) => {
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  res.json({ logs: listAuditLogs(limit, offset) });
});

devRouter.get("/campaigns", (req, res) => {
  const customerId = String(req.query.customerId || config.customerId).replace(/\D/g, "");
  const campaigns = listCampaigns(customerId);
  res.json({
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      campaignName: c.name,
      campaignType: c.advertisingChannelType,
      status: c.status,
      spend: c.spend,
      revenue: c.conversionValue,
      roas: c.spend > 0 ? Math.round((c.conversionValue / c.spend) * 100) / 100 : 0,
      conversions: c.conversions,
      clicks: c.clicks,
      impressions: c.impressions,
    })),
  });
});

devRouter.get("/asset-groups", (req, res) => {
  const customerId = String(req.query.customerId || config.customerId).replace(/\D/g, "");
  const groups = listAssetGroups(customerId);
  res.json({
    assetGroups: groups.map((ag) => {
      const campaign = getCampaign(ag.campaignId);
      return {
        assetGroupId: ag.id,
        assetGroupName: ag.name,
        campaignId: ag.campaignId,
        campaignName: campaign?.name ?? "",
        status: ag.status,
        spend: ag.spend,
        revenue: ag.conversionValue,
        roas: ag.spend > 0 ? Math.round((ag.conversionValue / ag.spend) * 100) / 100 : 0,
        conversions: ag.conversions,
        clicks: ag.clicks,
        impressions: ag.impressions,
      };
    }),
  });
});

devRouter.get("/listing-groups", (req, res) => {
  const assetGroupId = req.query.assetGroupId ? String(req.query.assetGroupId) : undefined;
  res.json({ listingGroups: listListingGroups(assetGroupId) });
});

devRouter.get("/product-groups", (req, res) => {
  const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
  res.json({ productGroups: listProductGroups(campaignId) });
});

devRouter.get("/products", (req, res) => {
  const customerId = String(req.query.customerId || config.customerId).replace(/\D/g, "");
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  const tier = req.query.tier ? String(req.query.tier) : undefined;

  let products = listProducts({ customerId, limit: tier ? 10000 : limit, offset });
  if (tier) {
    products = products.filter((p) => p.performanceTier === tier).slice(0, limit);
  }

  res.json({
    products: products.map((p) => ({
      productId: p.id,
      itemId: p.itemId,
      title: p.title,
      category: p.category,
      brand: p.brand,
      price: p.price,
      inventoryCount: p.inventoryCount,
      availability: p.availability,
      status: p.status,
      spend: p.spend,
      revenue: p.conversionValue,
      roas: p.spend > 0 ? Math.round((p.conversionValue / p.spend) * 100) / 100 : 0,
      clicks: p.clicks,
      conversions: p.conversions,
      performanceTier: p.performanceTier,
      customLabels: [p.customLabel0, p.customLabel1, p.customLabel2, p.customLabel3, p.customLabel4].filter(Boolean),
      campaignId: p.campaignId,
      assetGroupId: p.assetGroupId,
    })),
    total: getStats().products,
    limit,
    offset,
  });
});

devRouter.get("/products/:productId", (req, res) => {
  const product = getProduct(req.params.productId);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const variants = listProductVariants(product.id);
  res.json({ product, variants });
});

devRouter.get("/labels", (req, res) => {
  const customerId = String(req.query.customerId || config.customerId).replace(/\D/g, "");
  res.json({ labels: listLabels(customerId) });
});

devRouter.get("/performance/metrics", (req, res) => {
  const customerId = String(req.query.customerId || config.customerId).replace(/\D/g, "");
  const level = String(req.query.level || "product");
  if (level === "campaign") {
    const campaigns = listCampaigns(customerId, 100);
    return res.json({
      metrics: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        spend: c.spend,
        revenue: c.conversionValue,
        roas: c.spend > 0 ? c.conversionValue / c.spend : 0,
        clicks: c.clicks,
        impressions: c.impressions,
        conversions: c.conversions,
      })),
    });
  }
  const products = listProducts({ customerId, limit: 100 });
  res.json({
    metrics: products.map((p) => ({
      id: p.id,
      itemId: p.itemId,
      title: p.title,
      spend: p.spend,
      revenue: p.conversionValue,
      roas: p.spend > 0 ? p.conversionValue / p.spend : 0,
      clicks: p.clicks,
      conversions: p.conversions,
      performanceTier: p.performanceTier,
    })),
  });
});

function auditAndRespond(
  res: Response,
  entry: Parameters<typeof writeAuditLog>[0],
  payload: Record<string, unknown>,
): void {
  const log = writeAuditLog(entry);
  res.json({ ...payload, auditLogId: log.id });
}

devRouter.post("/campaigns", (req, res) => {
  const customerId = String(req.body.customerId || config.customerId).replace(/\D/g, "");
  const campaign = createCampaign({
    customerId,
    name: String(req.body.name || "New Campaign"),
    channelType: req.body.channelType || "SHOPPING",
    budgetMicros: req.body.budgetMicros,
  });
  auditAndRespond(
    res,
    {
      action: "create_campaign",
      user: String(req.body.user || "feedgraph"),
      resourceType: "campaign",
      resourceId: campaign.id,
      previousState: "{}",
      newState: JSON.stringify(campaign),
    },
    { campaign },
  );
});

devRouter.post("/campaigns/:campaignId/pause", (req, res) => {
  const prev = getCampaign(req.params.campaignId);
  if (!prev) return res.status(404).json({ error: "Campaign not found" });
  const updated = updateCampaignStatus(req.params.campaignId, "PAUSED");
  auditAndRespond(
    res,
    {
      action: "pause_campaign",
      user: String(req.body.user || "feedgraph"),
      resourceType: "campaign",
      resourceId: req.params.campaignId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { campaign: updated },
  );
});

devRouter.post("/campaigns/:campaignId/enable", (req, res) => {
  const prev = getCampaign(req.params.campaignId);
  if (!prev) return res.status(404).json({ error: "Campaign not found" });
  const updated = updateCampaignStatus(req.params.campaignId, "ENABLED");
  auditAndRespond(
    res,
    {
      action: "enable_campaign",
      user: String(req.body.user || "feedgraph"),
      resourceType: "campaign",
      resourceId: req.params.campaignId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { campaign: updated },
  );
});

devRouter.post("/asset-groups", (req, res) => {
  const customerId = String(req.body.customerId || config.customerId).replace(/\D/g, "");
  const ag = createAssetGroup({
    customerId,
    campaignId: String(req.body.campaignId),
    name: String(req.body.name || "New Asset Group"),
  });
  auditAndRespond(
    res,
    {
      action: "create_asset_group",
      user: String(req.body.user || "feedgraph"),
      resourceType: "asset_group",
      resourceId: ag.id,
      previousState: "{}",
      newState: JSON.stringify(ag),
    },
    { assetGroup: ag },
  );
});

devRouter.post("/asset-groups/:assetGroupId/pause", (req, res) => {
  const prev = getAssetGroup(req.params.assetGroupId);
  if (!prev) return res.status(404).json({ error: "Asset group not found" });
  const updated = updateAssetGroupStatus(req.params.assetGroupId, "PAUSED");
  auditAndRespond(
    res,
    {
      action: "pause_asset_group",
      user: String(req.body.user || "feedgraph"),
      resourceType: "asset_group",
      resourceId: req.params.assetGroupId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { assetGroup: updated },
  );
});

devRouter.post("/asset-groups/:assetGroupId/enable", (req, res) => {
  const prev = getAssetGroup(req.params.assetGroupId);
  if (!prev) return res.status(404).json({ error: "Asset group not found" });
  const updated = updateAssetGroupStatus(req.params.assetGroupId, "ENABLED");
  auditAndRespond(
    res,
    {
      action: "enable_asset_group",
      user: String(req.body.user || "feedgraph"),
      resourceType: "asset_group",
      resourceId: req.params.assetGroupId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { assetGroup: updated },
  );
});

devRouter.post("/products/:productId/pause", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const updated = updateProductStatus(req.params.productId, "PAUSED");
  auditAndRespond(
    res,
    {
      action: "pause_product",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { product: updated },
  );
});

devRouter.post("/products/:productId/enable", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const updated = updateProductStatus(req.params.productId, "ENABLED");
  auditAndRespond(
    res,
    {
      action: "enable_product",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { product: updated },
  );
});

devRouter.post("/products/:productId/exclude", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const updated = updateProductStatus(req.params.productId, "EXCLUDED");
  auditAndRespond(
    res,
    {
      action: "exclude_product",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { product: updated },
  );
});

devRouter.post("/products/:productId/include", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const updated = updateProductStatus(req.params.productId, "ENABLED");
  auditAndRespond(
    res,
    {
      action: "include_product",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    },
    { product: updated },
  );
});

devRouter.post("/products/:productId/move", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const assetGroupId = String(req.body.assetGroupId || "");
  const updated = moveProductToAssetGroup(req.params.productId, assetGroupId);
  if (!updated) return res.status(400).json({ error: "Move failed — check product and asset group IDs" });
  auditAndRespond(
    res,
    {
      action: "move_product",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ assetGroupId: prev.assetGroupId, campaignId: prev.campaignId }),
      newState: JSON.stringify({ assetGroupId: updated.assetGroupId, campaignId: updated.campaignId }),
      metadata: JSON.stringify({ targetAssetGroupId: assetGroupId }),
    },
    { product: updated },
  );
});

devRouter.post("/products/:productId/labels", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const labelId = String(req.body.labelId || "");
  applyProductLabel(req.params.productId, labelId);
  auditAndRespond(
    res,
    {
      action: "apply_label",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ labels: [] }),
      newState: JSON.stringify({ labelId }),
    },
    { productId: prev.id, labelId },
  );
});

devRouter.delete("/products/:productId/labels/:labelId", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  removeProductLabel(req.params.productId, req.params.labelId);
  auditAndRespond(
    res,
    {
      action: "remove_label",
      user: String(req.headers["x-sandbox-user"] || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ labelId: req.params.labelId }),
      newState: JSON.stringify({ labelId: null }),
    },
    { productId: prev.id, labelId: req.params.labelId },
  );
});

const VALID_FAULT_MODES: FaultMode[] = ["none", "auth_failure", "quota_exceeded", "rate_limit", "internal_error"];

devRouter.get("/fault-injection", (_req, res) => {
  res.json({
    active: getFaultMode(),
    available: VALID_FAULT_MODES,
    description: "POST with { mode } to activate, DELETE to clear.",
  });
});

devRouter.post("/fault-injection", (req, res) => {
  const mode = String(req.body?.mode || "none") as FaultMode;
  if (!VALID_FAULT_MODES.includes(mode)) {
    return res.status(400).json({ error: `Unknown fault mode "${mode}". Valid: ${VALID_FAULT_MODES.join(", ")}` });
  }
  setFaultMode(mode);
  res.json({ active: mode, message: mode === "none" ? "Fault injection cleared." : `Fault mode "${mode}" activated.` });
});

devRouter.delete("/fault-injection", (_req, res) => {
  clearFaultMode();
  res.json({ active: "none", message: "Fault injection cleared." });
});

devRouter.post("/products/:productId/custom-labels", (req, res) => {
  const prev = getProduct(req.params.productId);
  if (!prev) return res.status(404).json({ error: "Product not found" });
  const slot = Number(req.body.slot ?? 0) as 0 | 1 | 2 | 3 | 4;
  const value = req.body.value != null ? String(req.body.value) : null;
  const prevLabel = [prev.customLabel0, prev.customLabel1, prev.customLabel2, prev.customLabel3, prev.customLabel4][slot];
  const updated = applyCustomLabel(req.params.productId, slot, value);
  auditAndRespond(
    res,
    {
      action: "apply_custom_label",
      user: String(req.body.user || "feedgraph"),
      resourceType: "product",
      resourceId: prev.id,
      previousState: JSON.stringify({ slot, value: prevLabel }),
      newState: JSON.stringify({ slot, value }),
    },
    { product: updated },
  );
});
