/**
 * Verifies sandbox behaves like googleads.googleapis.com
 */
const BASE = process.env.GOOGLE_ADS_SANDBOX_URL || "http://localhost:4789";
const TOKEN = process.env.SANDBOX_ACCESS_TOKEN || "sandbox-access-token";
const DEV = process.env.SANDBOX_DEVELOPER_TOKEN || "sandbox-dev-token";
const CID = (process.env.SANDBOX_CUSTOMER_ID || "1234567890").replace(/\D/g, "");
const V = (process.env.API_VERSION || "v24").toLowerCase();

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "developer-token": DEV,
  "Content-Type": "application/json",
};

type Check = { name: string; pass: boolean; detail?: string };

const checks: Check[] = [];

async function req(method: string, path: string, body?: unknown, hdrs: Record<string, string> = headers) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: hdrs,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, requestId: res.headers.get("request-id") };
}

function hasGoogleAdsFailure(json: unknown): boolean {
  const err = (json as { error?: { details?: Array<{ "@type"?: string }> } })?.error;
  return !!err?.details?.some((d) => d["@type"]?.includes("GoogleAdsFailure"));
}

async function main() {
  console.log(`Verifying Google Ads API behavior at ${BASE} (${V})...\n`);

  const root = await req("GET", "/", undefined, {});
  checks.push({ name: "GET / returns Google 404 (not custom app)", pass: root.status === 404 && hasGoogleAdsFailure(root.json) });

  const noAuth = await req("POST", `/${V}/customers/${CID}/googleAds:search`, { query: "SELECT customer.id FROM customer" }, {
    "Content-Type": "application/json",
  });
  checks.push({ name: "missing auth returns GoogleAdsFailure", pass: noAuth.status === 401 && hasGoogleAdsFailure(noAuth.json) });

  const list = await req("GET", `/${V}/customers:listAccessibleCustomers`);
  checks.push({ name: "GET /customers:listAccessibleCustomers", pass: list.status === 200 && Array.isArray((list.json as { resourceNames?: string[] })?.resourceNames) });
  checks.push({ name: "response header request-id", pass: !!list.requestId });

  const feedgraphCampaignQuery =
    "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpc, metrics.ctr FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 2";
  const search = await req("POST", `/${V}/customers/${CID}/googleAds:search`, { query: feedgraphCampaignQuery });
  const s = search.json as { results?: unknown[]; fieldMask?: string; totalResultsCount?: string };
  const row = s.results?.[0] as { campaign?: Record<string, unknown>; metrics?: Record<string, unknown> } | undefined;
  checks.push({
    name: "FeedGraph campaign GAQL shape",
    pass:
      search.status === 200 &&
      !!row?.campaign?.id &&
      typeof row?.metrics?.costMicros === "string" &&
      !("segments" in (row || {})),
    detail: `fieldMask=${s.fieldMask?.slice(0, 50)}`,
  });

  const shoppingQ =
    "SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, segments.product_item_id, segments.product_title FROM shopping_performance_view WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 1";
  const shop = await req("POST", `/${V}/customers/${CID}/googleAds:search`, { query: shoppingQ });
  const shopRow = (shop.json as { results?: Array<{ segments?: Record<string, unknown> }> })?.results?.[0];
  checks.push({
    name: "shopping_performance_view segments (no date unless selected)",
    pass: shop.status === 200 && shopRow?.segments?.productItemId != null && shopRow?.segments?.date === undefined,
  });

  const stream = await req("POST", `/${V}/customers/${CID}/googleAds:searchStream`, {
    query: "SELECT customer.id FROM customer LIMIT 1",
  });
  checks.push({ name: "searchStream returns JSON array", pass: stream.status === 200 && Array.isArray(stream.json) });

  const mutate = await req("POST", `/${V}/customers/${CID}/googleAds:mutate`, {
    mutateOperations: [
      {
        campaignOperation: {
          update: { resourceName: `customers/${CID}/campaigns/1000000002`, status: "ENABLED" },
          updateMask: "status",
        },
      },
    ],
  });
  checks.push({
    name: "googleAds:mutate",
    pass: mutate.status === 200 && Array.isArray((mutate.json as { mutateOperationResponses?: unknown[] })?.mutateOperationResponses),
  });

  const badCustomer = await req("POST", `/${V}/customers/9999999999/googleAds:search`, {
    query: "SELECT customer.id FROM customer",
  });
  checks.push({
    name: "wrong customer returns PERMISSION_DENIED + GoogleAdsFailure",
    pass: badCustomer.status === 403 && hasGoogleAdsFailure(badCustomer.json),
  });

  const badMutate = await req("POST", `/${V}/customers/${CID}/googleAds:mutate`, {
    mutateOperations: [
      {
        campaignOperation: {
          update: { resourceName: `customers/${CID}/campaigns/9999999999`, status: "PAUSED" },
          updateMask: "status",
        },
      },
    ],
  });
  checks.push({
    name: "mutate missing resource returns GoogleAdsFailure",
    pass: badMutate.status === 400 && hasGoogleAdsFailure(badMutate.json),
  });

  const pageSize = await req("POST", `/${V}/customers/${CID}/googleAds:search`, {
    query: "SELECT customer.id FROM customer",
    pageSize: 100,
  });
  checks.push({ name: "pageSize rejected", pass: pageSize.status === 400 && hasGoogleAdsFailure(pageSize.json) });

  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) console.log(`${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
