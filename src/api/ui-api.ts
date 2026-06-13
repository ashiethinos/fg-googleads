import { Router } from "express";
import { config } from "../config.js";
import {
  getCampaign,
  getAssetGroup,
  getCustomer,
  getProduct,
  listAssetGroups,
  listAuditLogs,
  listCampaigns,
  listProducts,
  listProductVariants,
} from "../db/store.js";
import { sandboxProductImageUrl } from "../lib/product-images.js";

export const uiApiRouter = Router();

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

function resolveProductImageLink(p: ReturnType<typeof listProducts>[0]): string {
  const link = (p.imageLink || "").trim();
  if (link && !link.includes("sandbox.feedgraph.local")) return link;
  return sandboxProductImageUrl(p.id, 80);
}

function productRow(p: ReturnType<typeof listProducts>[0], currency: string) {
  const roas = p.spend > 0 ? p.conversionValue / p.spend : 0;
  return {
    productId: p.id,
    itemId: p.itemId,
    title: p.title,
    imageLink: resolveProductImageLink(p),
    category: p.category,
    status: p.status,
    campaignId: p.campaignId,
    assetGroupId: p.assetGroupId,
    inventoryCount: p.inventoryCount,
    spend: p.spend,
    revenue: p.conversionValue,
    roas: Math.round(roas * 100) / 100,
    clicks: p.clicks,
    impressions: p.impressions,
    conversions: p.conversions,
    performanceTier: p.performanceTier,
    customLabels: [p.customLabel0, p.customLabel1, p.customLabel2, p.customLabel3, p.customLabel4].filter(Boolean),
    spendFormatted: money(p.spend, currency),
    revenueFormatted: money(p.conversionValue, currency),
  };
}

uiApiRouter.get("/config", (_req, res) => {
  const customer = getCustomer(config.customerId);
  res.json({
    apiVersion: config.apiVersion,
    customerId: config.customerId,
    customerName: customer?.descriptiveName ?? config.customerName,
    currency: customer?.currencyCode ?? config.currency,
    apiBase: `http://localhost:${config.port}`,
    accessToken: config.accessToken,
    developerToken: config.developerToken,
    dateRangeLabel: "Last 30 days",
  });
});

uiApiRouter.get("/overview", (_req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const campaigns = listCampaigns(config.customerId);
  const assetGroups = listAssetGroups(config.customerId);
  const products = listProducts({ customerId: config.customerId, limit: 100_000 });

  const totals = campaigns.reduce(
    (a, c) => ({
      spend: a.spend + c.spend,
      revenue: a.revenue + c.conversionValue,
      clicks: a.clicks + c.clicks,
      impressions: a.impressions + c.impressions,
      conversions: a.conversions + c.conversions,
    }),
    { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 },
  );

  const pmax = campaigns.filter((c) => c.advertisingChannelType === "PERFORMANCE_MAX");
  const shopping = campaigns.filter((c) => c.advertisingChannelType === "SHOPPING");

  res.json({
    currency,
    totals: {
      ...totals,
      roas: totals.spend > 0 ? Math.round((totals.revenue / totals.spend) * 100) / 100 : 0,
      spendFormatted: money(totals.spend, currency),
      revenueFormatted: money(totals.revenue, currency),
    },
    counts: {
      campaigns: campaigns.length,
      pmaxCampaigns: pmax.length,
      shoppingCampaigns: shopping.length,
      assetGroups: assetGroups.length,
      products: products.length,
      productsInPmax: products.filter((p) => p.assetGroupId).length,
    },
    recentChanges: listAuditLogs(8, 0).map(formatChange),
  });
});

uiApiRouter.get("/campaigns", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : null;

  let campaigns = listCampaigns(config.customerId);
  if (typeFilter === "PMAX" || typeFilter === "PERFORMANCE_MAX") {
    campaigns = campaigns.filter((c) => c.advertisingChannelType === "PERFORMANCE_MAX");
  } else if (typeFilter === "SHOPPING") {
    campaigns = campaigns.filter((c) => c.advertisingChannelType === "SHOPPING");
  }

  const assetGroups = listAssetGroups(config.customerId);
  const agByCampaign = new Map<string, number>();
  for (const ag of assetGroups) agByCampaign.set(ag.campaignId, (agByCampaign.get(ag.campaignId) || 0) + 1);

  res.json({
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      name: c.name,
      type: c.advertisingChannelType,
      typeLabel: c.advertisingChannelType === "PERFORMANCE_MAX" ? "Performance Max" : c.advertisingChannelType,
      status: c.status,
      spend: c.spend,
      revenue: c.conversionValue,
      roas: c.spend > 0 ? Math.round((c.conversionValue / c.spend) * 100) / 100 : 0,
      clicks: c.clicks,
      impressions: c.impressions,
      conversions: c.conversions,
      assetGroupCount: agByCampaign.get(c.id) || 0,
      spendFormatted: money(c.spend, currency),
      revenueFormatted: money(c.conversionValue, currency),
    })),
  });
});

uiApiRouter.get("/campaigns/:campaignId", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const campaign = getCampaign(req.params.campaignId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const assetGroups = listAssetGroups(config.customerId).filter((ag) => ag.campaignId === campaign.id);
  const products = listProducts({ customerId: config.customerId, campaignId: campaign.id, limit: 500 });

  res.json({
    campaign: {
      campaignId: campaign.id,
      name: campaign.name,
      type: campaign.advertisingChannelType,
      typeLabel: campaign.advertisingChannelType === "PERFORMANCE_MAX" ? "Performance Max" : campaign.advertisingChannelType,
      status: campaign.status,
      spend: campaign.spend,
      revenue: campaign.conversionValue,
      roas: campaign.spend > 0 ? campaign.conversionValue / campaign.spend : 0,
      clicks: campaign.clicks,
      impressions: campaign.impressions,
      conversions: campaign.conversions,
      spendFormatted: money(campaign.spend, currency),
      revenueFormatted: money(campaign.conversionValue, currency),
    },
    assetGroups: assetGroups.map((ag) => {
      const agProducts = products.filter((p) => p.assetGroupId === ag.id);
      return {
        assetGroupId: ag.id,
        name: ag.name,
        status: ag.status,
        productCount: agProducts.length,
        spend: ag.spend,
        revenue: ag.conversionValue,
        roas: ag.spend > 0 ? Math.round((ag.conversionValue / ag.spend) * 100) / 100 : 0,
        clicks: ag.clicks,
        impressions: ag.impressions,
        conversions: ag.conversions,
        spendFormatted: money(ag.spend, currency),
        revenueFormatted: money(ag.conversionValue, currency),
      };
    }),
    topProducts: products.slice(0, 25).map((p) => productRow(p, currency)),
    productCount: products.length,
  });
});

uiApiRouter.get("/asset-groups", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;

  let groups = listAssetGroups(config.customerId);
  if (campaignId) groups = groups.filter((g) => g.campaignId === campaignId);

  const campaigns = listCampaigns(config.customerId);
  const campById = new Map(campaigns.map((c) => [c.id, c]));

  res.json({
    assetGroups: groups.map((ag) => {
      const camp = campById.get(ag.campaignId);
      const productCount = listProducts({ assetGroupId: ag.id, limit: 1_000_000 }).length;
      return {
        assetGroupId: ag.id,
        name: ag.name,
        status: ag.status,
        campaignId: ag.campaignId,
        campaignName: camp?.name ?? "",
        campaignType: camp?.advertisingChannelType ?? "",
        productCount,
        spend: ag.spend,
        revenue: ag.conversionValue,
        roas: ag.spend > 0 ? Math.round((ag.conversionValue / ag.spend) * 100) / 100 : 0,
        clicks: ag.clicks,
        impressions: ag.impressions,
        conversions: ag.conversions,
        spendFormatted: money(ag.spend, currency),
        revenueFormatted: money(ag.conversionValue, currency),
      };
    }),
  });
});

uiApiRouter.get("/asset-groups/:assetGroupId", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const ag = getAssetGroup(req.params.assetGroupId);
  if (!ag) return res.status(404).json({ error: "Asset group not found" });

  const campaign = getCampaign(ag.campaignId);
  const products = listProducts({ assetGroupId: ag.id, limit: 500 });
  const changes = listAuditLogs(50, 0).filter(
    (l) => l.resourceId === ag.id || products.some((p) => p.id === l.resourceId),
  );

  res.json({
    assetGroup: {
      assetGroupId: ag.id,
      name: ag.name,
      status: ag.status,
      campaignId: ag.campaignId,
      campaignName: campaign?.name ?? "",
      spendFormatted: money(ag.spend, currency),
      revenueFormatted: money(ag.conversionValue, currency),
      roas: ag.spend > 0 ? ag.conversionValue / ag.spend : 0,
    },
    products: products.map((p) => productRow(p, currency)),
    recentChanges: changes.slice(0, 10).map(formatChange),
  });
});

uiApiRouter.get("/products", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
  const assetGroupId = req.query.assetGroupId ? String(req.query.assetGroupId) : undefined;
  const tier = req.query.tier ? String(req.query.tier) : undefined;
  const search = req.query.q ? String(req.query.q).toLowerCase() : undefined;
  const limit = Math.min(Number(req.query.limit || 100), 500);

  let products = listProducts({
    customerId: config.customerId,
    campaignId,
    assetGroupId,
    limit: 10_000,
  });

  if (tier) products = products.filter((p) => p.performanceTier === tier);
  if (search) {
    products = products.filter(
      (p) => p.title.toLowerCase().includes(search) || p.itemId.toLowerCase().includes(search),
    );
  }

  res.json({
    products: products.slice(0, limit).map((p) => productRow(p, currency)),
    total: products.length,
  });
});

uiApiRouter.get("/products/:productId", (req, res) => {
  const customer = getCustomer(config.customerId);
  const currency = customer?.currencyCode ?? config.currency;
  const product = getProduct(req.params.productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const campaign = product.campaignId ? getCampaign(product.campaignId) : null;
  const assetGroup = product.assetGroupId ? getAssetGroup(product.assetGroupId) : null;
  const variants = listProductVariants(product.id);
  const changes = listAuditLogs(100, 0).filter((l) => l.resourceId === product.id);

  res.json({
    product: productRow(product, currency),
    campaign: campaign ? { id: campaign.id, name: campaign.name, type: campaign.advertisingChannelType } : null,
    assetGroup: assetGroup ? { id: assetGroup.id, name: assetGroup.name } : null,
    variants,
    changes: changes.map(formatChange),
  });
});

uiApiRouter.get("/changes", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);
  res.json({ changes: listAuditLogs(limit, offset).map(formatChange) });
});

function formatChange(log: ReturnType<typeof listAuditLogs>[0]) {
  let previous: Record<string, unknown> = {};
  let next: Record<string, unknown> = {};
  try {
    previous = JSON.parse(log.previousState);
  } catch {
    previous = { raw: log.previousState };
  }
  try {
    next = JSON.parse(log.newState);
  } catch {
    next = { raw: log.newState };
  }

  return {
    id: log.id,
    action: log.action,
    actionLabel: log.action.replace(/_/g, " "),
    user: log.user,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    timestamp: log.timestamp,
    previous,
    next,
    summary: summarizeChange(log.action, previous, next),
  };
}

function summarizeChange(action: string, prev: Record<string, unknown>, next: Record<string, unknown>): string {
  if (action === "move_product") {
    return `Moved to asset group ${next.assetGroupId ?? "?"} (campaign ${next.campaignId ?? "?"})`;
  }
  if (action.includes("pause")) return `Status: ${prev.status ?? "?"} → ${next.status ?? "PAUSED"}`;
  if (action.includes("enable")) return `Status: ${prev.status ?? "?"} → ${next.status ?? "ENABLED"}`;
  if (action === "apply_custom_label") return `Label slot ${prev.slot ?? next.slot}: "${prev.value ?? ""}" → "${next.value ?? ""}"`;
  if (action === "create_asset_group") return `Created asset group ${next.name ?? next.id ?? ""}`;
  if (action === "create_campaign") return `Created campaign ${next.name ?? next.id ?? ""}`;
  return JSON.stringify(next).slice(0, 120);
}
