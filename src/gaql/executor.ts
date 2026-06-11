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
import { segmentsFromSelect } from "./segments.js";
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

function applyWhereNumeric(rows: GaqlSearchResult[], parsed: ParsedGaql): GaqlSearchResult[] {
  let filtered = rows;
  for (const cond of parsed.where) {
    if (cond.field === "segments.date") continue;
    if (cond.operator === ">") {
      if (cond.field === "metrics.impressions") {
        filtered = filtered.filter(
          (r) => Number((r.metrics as Record<string, unknown>)?.impressions || 0) > Number(cond.value),
        );
      }
      if (cond.field === "metrics.cost_micros") {
        filtered = filtered.filter(
          (r) => Number((r.metrics as Record<string, unknown>)?.costMicros || 0) > Number(cond.value),
        );
      }
    }
    if (cond.operator === "=") {
      if (cond.field === "campaign.id") {
        filtered = filtered.filter(
          (r) => String((r.campaign as Record<string, unknown>)?.id) === String(cond.value),
        );
      }
      if (cond.field === "asset_group.id") {
        filtered = filtered.filter(
          (r) => String((r.assetGroup as Record<string, unknown>)?.id) === String(cond.value),
        );
      }
      if (cond.field === "campaign.status") {
        filtered = filtered.filter((r) => (r.campaign as Record<string, string>)?.status === cond.value);
      }
      if (cond.field === "asset_group.status") {
        filtered = filtered.filter((r) => (r.assetGroup as Record<string, string>)?.status === cond.value);
      }
    }
  }
  return filtered;
}

function applyOrderBy(rows: GaqlSearchResult[], parsed: ParsedGaql): GaqlSearchResult[] {
  if (!parsed.orderBy) return rows;
  const { field, direction } = parsed.orderBy;
  const mul = direction === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let av = 0;
    let bv = 0;
    if (field === "metrics.cost_micros") {
      av = Number((a.metrics as Record<string, unknown>)?.costMicros || 0);
      bv = Number((b.metrics as Record<string, unknown>)?.costMicros || 0);
    }
    return (av - bv) * mul;
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

  return campaigns.map((c) => {
    const result: GaqlSearchResult = {
      campaign: {
        resourceName: `customers/${customerId}/campaigns/${c.id}`,
        id: c.id,
        name: c.name,
        status: c.status,
        advertisingChannelType: c.advertisingChannelType,
      },
      metrics: buildMetrics(c.spend, c.clicks, c.impressions, c.conversions, c.conversionValue),
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
      metrics: buildMetrics(ag.spend, ag.clicks, ag.impressions, ag.conversions, ag.conversionValue),
    };
    if (seg) result.segments = seg;
    return result;
  });
}

function executeShoppingPerformanceQuery(customerId: string, parsed: ParsedGaql): GaqlSearchResult[] {
  const rows = listShoppingPerformance(customerId, 100_000);
  const seg = segmentsFromSelect(parsed);

  return rows.map((r) => {
    const spend = Number(r.spend);
    const clicks = Number(r.clicks);
    const impressions = Number(r.impressions);
    const conversions = Number(r.conversions);
    const conversionValue = Number(r.conversion_value);
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
