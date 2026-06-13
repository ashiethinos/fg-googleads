import {
  getCustomer,
  listAssetGroups,
  listCampaigns,
  listCustomerClients,
  listListingGroups,
  listShoppingPerformance,
} from "../db/store.js";
import type { GaqlSearchResult } from "../models/types.js";
import { buildFieldMask, filterRowBySelect } from "./field-mask.js";
import { microsFromSpend, parseGaql } from "./parser.js";
import type { ParsedGaql } from "./parser.js";
import { dateRangeMultiplier, segmentsFromSelect } from "./segments.js";
import { queryError } from "../api/google-errors.js";

export type GaqlSearchResponse = {
  results: GaqlSearchResult[];
  totalResultsCount: number;
  fieldMask: string;
};

const SUPPORTED_RESOURCES = new Set([
  "customer",
  "customer_client",
  "campaign",
  "asset_group",
  "shopping_performance_view",
  "asset_group_listing_group_filter",
]);

function buildMetrics(
  spend: number,
  clicks: number,
  impressions: number,
  conversions: number,
  conversionValue: number,
) {
  const costMicros = microsFromSpend(spend);
  const averageCpc = clicks > 0 ? String(Math.round((spend / clicks) * 1_000_000)) : "0";
  const ctr = impressions > 0 ? clicks / impressions : 0;
  return {
    impressions: String(impressions),
    clicks: String(clicks),
    costMicros,
    conversions: String(conversions),
    conversionsValue: String(conversionValue),
    averageCpc,
    ctr,
  };
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Resolve a GAQL dotted field path (e.g. "metrics.cost_micros") to the row value. */
function resolveField(row: GaqlSearchResult, gaqlField: string): string | number | null {
  const dot = gaqlField.indexOf(".");
  if (dot < 0) return null;
  const resourceKey = snakeToCamel(gaqlField.slice(0, dot));
  const fieldKey = snakeToCamel(gaqlField.slice(dot + 1));
  const obj = (row as Record<string, unknown>)[resourceKey];
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[fieldKey];
  return val === undefined ? null : (val as string | number);
}

function applyWhereNumeric(rows: GaqlSearchResult[], parsed: ParsedGaql): GaqlSearchResult[] {
  let filtered = rows;
  for (const cond of parsed.where) {
    if (cond.field === "segments.date") continue;
    filtered = filtered.filter((r) => {
      const rv = resolveField(r, cond.field);
      switch (cond.operator) {
        case "=":   return String(rv ?? "") === String(cond.value);
        case "!=":  return String(rv ?? "") !== String(cond.value);
        case ">":   return Number(rv ?? 0) > Number(cond.value);
        case "<":   return Number(rv ?? 0) < Number(cond.value);
        case ">=":  return Number(rv ?? 0) >= Number(cond.value);
        case "<=":  return Number(rv ?? 0) <= Number(cond.value);
        case "IN":  return Array.isArray(cond.value) && cond.value.map(String).includes(String(rv ?? ""));
        default:    return true;
      }
    });
  }
  return filtered;
}

function applyOrderBy(rows: GaqlSearchResult[], parsed: ParsedGaql): GaqlSearchResult[] {
  if (!parsed.orderBy) return rows;
  const { field, direction } = parsed.orderBy;
  const mul = direction === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = resolveField(a, field);
    const bv = resolveField(b, field);
    if (av === null && bv === null) return 0;
    if (av === null) return mul;
    if (bv === null) return -mul;
    const an = Number(av);
    const bn = Number(bv);
    if (!isNaN(an) && !isNaN(bn)) return (an - bn) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
}

export function executeGaqlSearch(customerId: string, query: string): GaqlSearchResponse {
  let parsed: ParsedGaql;
  try {
    parsed = parseGaql(query);
  } catch (err) {
    throw queryError(err instanceof Error ? err.message : "Invalid GAQL query", "SYNTAX_ERROR");
  }

  if (!SUPPORTED_RESOURCES.has(parsed.from)) {
    throw queryError(
      `Cannot select fields from '${parsed.from}', because it is not a valid resource.`,
      "UNRECOGNIZED_FIELD",
    );
  }

  let rows: GaqlSearchResult[] = [];

  switch (parsed.from) {
    case "customer":
      rows = executeCustomerQuery(customerId);
      break;
    case "customer_client":
      rows = executeCustomerClientQuery(customerId);
      break;
    case "campaign":
      rows = executeCampaignQuery(customerId, parsed);
      break;
    case "asset_group":
      rows = executeAssetGroupQuery(customerId, parsed);
      break;
    case "shopping_performance_view":
      rows = executeShoppingPerformanceQuery(customerId, parsed);
      break;
    case "asset_group_listing_group_filter":
      rows = executeListingGroupQuery(customerId);
      break;
  }

  rows = applyWhereNumeric(rows, parsed);
  rows = applyOrderBy(rows, parsed);

  const totalResultsCount = rows.length;
  if (parsed.limit) rows = rows.slice(0, parsed.limit);

  const fieldMask = buildFieldMask(parsed.select);
  const results = rows.map((row) => filterRowBySelect(row, parsed.select) as GaqlSearchResult);

  return { results, totalResultsCount, fieldMask };
}

function executeCustomerQuery(customerId: string): GaqlSearchResult[] {
  const customer = getCustomer(customerId);
  if (!customer) return [];
  return [
    {
      customer: {
        resourceName: `customers/${customer.id}`,
        id: customer.id,
        descriptiveName: customer.descriptiveName,
        currencyCode: customer.currencyCode,
        manager: customer.manager,
        testAccount: customer.testAccount,
      },
    },
  ];
}

function executeCustomerClientQuery(managerCustomerId: string): GaqlSearchResult[] {
  const clients = listCustomerClients(managerCustomerId);
  return clients.map((c) => {
    const clientId = String(c.client_customer).replace(/^customers\//, "");
    return {
      customerClient: {
        resourceName: `customers/${managerCustomerId}/customerClients/${clientId}`,
        clientCustomer: `customers/${clientId}`,
        descriptiveName: String(c.descriptive_name),
        manager: Boolean(c.manager),
        status: String(c.status),
        level: String(c.level),
        testAccount: Boolean(c.test_account),
        hidden: Boolean(c.hidden),
      },
    };
  });
}

function executeCampaignQuery(customerId: string, parsed: ParsedGaql): GaqlSearchResult[] {
  const campaigns = listCampaigns(customerId, 100_000);
  const seg = segmentsFromSelect(parsed);
  const mult = dateRangeMultiplier(parsed.where);

  return campaigns.map((c) => {
    const result: GaqlSearchResult = {
      campaign: {
        resourceName: `customers/${customerId}/campaigns/${c.id}`,
        id: c.id,
        name: c.name,
        status: c.status,
        advertisingChannelType: c.advertisingChannelType,
      },
      metrics: buildMetrics(
        c.spend * mult,
        Math.round(c.clicks * mult),
        Math.round(c.impressions * mult),
        c.conversions * mult,
        c.conversionValue * mult,
      ),
    };
    if (seg) result.segments = seg;
    return result;
  });
}

function executeAssetGroupQuery(customerId: string, parsed: ParsedGaql): GaqlSearchResult[] {
  const groups = listAssetGroups(customerId, 100_000);
  const campaigns = listCampaigns(customerId);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const seg = segmentsFromSelect(parsed);
  const mult = dateRangeMultiplier(parsed.where);

  return groups.map((ag) => {
    const campaign = campaignById.get(ag.campaignId);
    const result: GaqlSearchResult = {
      assetGroup: {
        resourceName: `customers/${customerId}/assetGroups/${ag.id}`,
        id: ag.id,
        name: ag.name,
        status: ag.status,
      },
      campaign: campaign
        ? {
            resourceName: `customers/${customerId}/campaigns/${campaign.id}`,
            id: campaign.id,
            name: campaign.name,
            advertisingChannelType: campaign.advertisingChannelType,
          }
        : undefined,
      metrics: buildMetrics(
        ag.spend * mult,
        Math.round(ag.clicks * mult),
        Math.round(ag.impressions * mult),
        ag.conversions * mult,
        ag.conversionValue * mult,
      ),
    };
    if (seg) result.segments = seg;
    return result;
  });
}

function executeShoppingPerformanceQuery(customerId: string, parsed: ParsedGaql): GaqlSearchResult[] {
  const rows = listShoppingPerformance(customerId, 100_000);
  const seg = segmentsFromSelect(parsed);
  const mult = dateRangeMultiplier(parsed.where);

  return rows.map((r) => {
    const spend = Number(r.spend) * mult;
    const clicks = Math.round(Number(r.clicks) * mult);
    const impressions = Math.round(Number(r.impressions) * mult);
    const conversions = Number(r.conversions) * mult;
    const conversionValue = Number(r.conversion_value) * mult;
    const campaignId = String(r.camp_id || r.campaign_id || "");

    const segments: Record<string, string> = {};
    if (parsed.select.includes("segments.product_item_id")) segments.productItemId = String(r.item_id);
    if (parsed.select.includes("segments.product_title")) segments.productTitle = String(r.title);
    if (seg?.date) segments.date = seg.date;

    const result: GaqlSearchResult = {
      campaign: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        id: campaignId,
        name: String(r.camp_name || ""),
        advertisingChannelType: String(r.advertising_channel_type || "SHOPPING"),
      },
      metrics: buildMetrics(spend, clicks, impressions, conversions, conversionValue),
    };

    if (Object.keys(segments).length) result.segments = segments;
    return result;
  });
}

function executeListingGroupQuery(customerId: string): GaqlSearchResult[] {
  const groups = listListingGroups();
  return groups.map((lg) => ({
    assetGroupListingGroupFilter: {
      resourceName: `customers/${customerId}/assetGroupListingGroupFilters/${lg.id}`,
      id: lg.id,
      type: lg.type,
      caseValue: {
        productType: { level: lg.dimension === "PRODUCT_TYPE" ? "LEVEL1" : "LEVEL0", value: lg.value },
      },
      parentListingGroupFilter: lg.parentId
        ? `customers/${customerId}/assetGroupListingGroupFilters/${lg.parentId}`
        : undefined,
    },
    assetGroup: {
      resourceName: `customers/${customerId}/assetGroups/${lg.assetGroupId}`,
      id: lg.assetGroupId,
    },
  }));
}
