/**
 * Seed the Google Ads sandbox with the 100-product Style Union PILOT and their REAL shopping metrics.
 *
 * item_id = skuKey (real style code, e.g. LEJ00004) — the join key FeedGraph resolves against.
 * Metrics come straight from the client's real Google Shopping export (via styleunion_100.json), so a
 * FeedGraph sync reproduces the same per-SKU numbers as the direct FeedGraph seed.
 *
 * Recreates the real Style Union shopping/PMax campaigns and attaches each product to its real
 * top-spend campaign. Keeps one asset group. Replaces the generic base products.
 *
 * Run from sandbox-googleads:  npx tsx script/seed-su-pilot.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "../src/db/store.js";
import { config } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const CANON = join(here, "..", "..", "feedgraph", "script", "data", "styleunion_100.json");

type Canon = {
  pid: string; handle: string; skuKey: string; title: string; brand: string; category: string;
  productType: string; color: string; size: string; price: string; image: string; description: string;
  availability: string; customLabel0?: string; bucket: string;
  google: null | { clicks: number; impressions: number; cost: number; conversions: number; convValue: number; topCampaign: string | null };
};

const parsePrice = (raw: string) => { const n = Number((raw || "").replace(/inr/i, "").replace(/,/g, "").trim()); return Number.isFinite(n) ? n : 0; };
const channelOf = (name: string) => /pmax/i.test(name) ? "PERFORMANCE_MAX" : /shopping/i.test(name) ? "SHOPPING" : "PERFORMANCE_MAX";

function main() {
  const db = getDb();
  const customerId = config.customerId;
  const canon: Canon[] = JSON.parse(readFileSync(CANON, "utf8"));
  const withGoogle = canon.filter((c) => c.google);
  console.log(`Loaded ${canon.length} pilot products (${withGoogle.length} with Google shopping activity).`);

  // distinct real campaigns from per-product top campaign
  const campNames = [...new Set(withGoogle.map((c) => c.google!.topCampaign).filter(Boolean) as string[])];
  const campIdByName = new Map<string, string>();

  const assetGroup = db.prepare("SELECT id FROM asset_groups WHERE customer_id = ? LIMIT 1").get(customerId) as { id: string } | undefined;

  const insertProduct = db.prepare(
    `INSERT INTO products (id, customer_id, item_id, title, description, brand, category, subcategory,
       price, sale_price, currency, image_link, link, inventory_count, availability, status,
       custom_label_0, custom_label_1, custom_label_2, custom_label_3, custom_label_4,
       performance_tier, spend, clicks, impressions, conversions, conversion_value, campaign_id, asset_group_id)
     VALUES (@id,@customer_id,@item_id,@title,@description,@brand,@category,@subcategory,
       @price,@sale_price,@currency,@image_link,@link,@inventory_count,@availability,@status,
       @cl0,@cl1,@cl2,@cl3,@cl4,
       @performance_tier,@spend,@clicks,@impressions,@conversions,@conversion_value,@campaign_id,@asset_group_id)`,
  );
  const insertCampaign = db.prepare(
    `INSERT INTO campaigns (id, customer_id, name, status, advertising_channel_type, budget_micros,
       spend, clicks, impressions, conversions, conversion_value)
     VALUES (@id,@customer_id,@name,'ENABLED',@type,@budget,@spend,@clicks,@impressions,@conversions,@conversion_value)`,
  );

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM asset_group_products").run();
    db.prepare("DELETE FROM product_variants").run();
    db.prepare("DELETE FROM products").run();
    db.prepare("DELETE FROM campaigns").run();

    // create real campaigns (id = 1000000000 + i); aggregate metrics summed from member products
    campNames.forEach((name, i) => {
      const id = String(1000000000 + i);
      campIdByName.set(name, id);
      const members = withGoogle.filter((c) => c.google!.topCampaign === name);
      const spend = members.reduce((s, c) => s + c.google!.cost, 0);
      const clicks = members.reduce((s, c) => s + c.google!.clicks, 0);
      const impressions = members.reduce((s, c) => s + c.google!.impressions, 0);
      const conv = members.reduce((s, c) => s + c.google!.conversions, 0);
      const convVal = members.reduce((s, c) => s + c.google!.convValue, 0);
      insertCampaign.run({ id, customer_id: customerId, name, type: channelOf(name),
        budget: Math.round(spend * 1e6 / 30) || 100000000,
        spend: Math.round(spend * 100) / 100, clicks: Math.round(clicks), impressions: Math.round(impressions),
        conversions: Math.round(conv * 100) / 100, conversion_value: Math.round(convVal * 100) / 100 });
    });
    // fallback campaign for products whose google has no top campaign
    const fallbackId = String(1000000000 + campNames.length);
    insertCampaign.run({ id: fallbackId, customer_id: customerId, name: "Style Union — Shopping Catch-All",
      type: "PERFORMANCE_MAX", budget: 100000000, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 });

    for (const c of canon) {
      const g = c.google;
      const price = parsePrice(c.price);
      const campId = g?.topCampaign ? campIdByName.get(g.topCampaign) ?? fallbackId : fallbackId;
      insertProduct.run({
        id: `p_${c.skuKey}`, customer_id: customerId, item_id: c.skuKey,
        title: c.title || c.skuKey, description: c.description || "", brand: c.brand || "Style Union",
        category: c.category || "Apparel & Accessories > Clothing", subcategory: c.productType || "",
        price, sale_price: null, currency: "INR", image_link: c.image || "",
        link: `https://styleunion.in/products/${c.handle}`, inventory_count: 25,
        availability: c.availability || "in_stock", status: "ENABLED",
        cl0: c.bucket || null, cl1: null, cl2: null, cl3: null, cl4: null,
        performance_tier: g && g.convValue > g.cost ? "high" : g && g.cost > 0 ? "medium" : "low",
        spend: g ? Math.round(g.cost * 100) / 100 : 0, clicks: g ? Math.round(g.clicks) : 0,
        impressions: g ? Math.round(g.impressions) : 0,
        conversions: g ? Math.round(g.conversions * 100) / 100 : 0,
        conversion_value: g ? Math.round(g.convValue * 100) / 100 : 0,
        campaign_id: campId, asset_group_id: assetGroup?.id ?? null,
      });
      if (assetGroup) db.prepare("INSERT OR IGNORE INTO asset_group_products (asset_group_id, product_id) VALUES (?, ?)").run(assetGroup.id, `p_${c.skuKey}`);
    }
  });
  tx();

  const count = (db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;
  const withImp = (db.prepare("SELECT COUNT(*) AS c FROM products WHERE impressions > 0").get() as { c: number }).c;
  const camps = (db.prepare("SELECT COUNT(*) AS c FROM campaigns").get() as { c: number }).c;
  const tot = db.prepare("SELECT ROUND(SUM(spend),0) spend, ROUND(SUM(conversion_value),0) rev FROM products").get();
  console.log(`\nGoogle sandbox: ${count} products (${withImp} served), ${camps} campaigns.`);
  console.log("totals:", JSON.stringify(tot));
  console.log("top by spend:", JSON.stringify(db.prepare("SELECT item_id,title,spend,impressions,conversion_value FROM products ORDER BY spend DESC LIMIT 4").all(), null, 2));
  process.exit(0);
}
main();
