/**
 * Reseed the sandbox's products to the 100 Style Union test SKUs (item_id = SU-TEST-###) so the
 * Google Ads sandbox advertises exactly the products in FeedGraph's catalog. Keeps existing
 * campaigns/asset groups; replaces the ~10k generic products.
 *
 * Reads feedgraph/StyleUnion_test_100.csv (the same file loaded into FeedGraph).
 * Run from sandbox-googleads: npx tsx script/reseed-from-test-csv.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "../src/db/store.js";
import { config } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(here, "..", "..", "feedgraph", "StyleUnion_test_100.csv");

/** Minimal RFC4180 CSV parser (handles quoted fields with commas/quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()!;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const rnd = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const parsePrice = (raw: string) => {
  const n = Number((raw || "").replace(/inr/i, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

function metrics(price: number) {
  const roll = rnd();
  const tier = roll < 0.15 ? "low" : roll < 0.35 ? "high" : "medium";
  if (tier === "low") return { tier, spend: 0, clicks: 0, impressions: Math.floor(rnd() * 50), conversions: 0, conversion_value: 0 };
  const mult = tier === "high" ? 3 : 1;
  const impressions = Math.floor(800 * mult * (0.5 + rnd() * 1.8));
  const clicks = Math.max(1, Math.round(impressions * (0.02 + rnd() * 0.03)));
  const spend = Math.round(clicks * (2 + rnd() * 13) * 100) / 100;
  const conversions = Math.round(clicks * (0.01 + rnd() * 0.06) * 100) / 100;
  const conversion_value = Math.round(conversions * (price || 499) * 100) / 100;
  return { tier, spend, clicks, impressions, conversions, conversion_value };
}

function main() {
  const db = getDb();
  const customerId = config.customerId;
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8")).filter((r) => r.id);
  console.log(`Parsed ${rows.length} products from ${CSV_PATH}`);

  const campaign = db.prepare("SELECT id FROM campaigns WHERE customer_id = ? ORDER BY spend DESC LIMIT 1").get(customerId) as { id: string } | undefined;
  const assetGroup = db.prepare("SELECT id FROM asset_groups WHERE customer_id = ? LIMIT 1").get(customerId) as { id: string } | undefined;
  if (!campaign) throw new Error("No campaign in sandbox — run `npm run reset` first to seed campaigns.");
  console.log(`Attaching products to campaign ${campaign.id}, asset group ${assetGroup?.id ?? "(none)"}`);

  const insert = db.prepare(
    `INSERT INTO products (id, customer_id, item_id, title, description, brand, category, subcategory,
       price, sale_price, currency, image_link, link, inventory_count, availability, status,
       custom_label_0, custom_label_1, custom_label_2, custom_label_3, custom_label_4,
       performance_tier, spend, clicks, impressions, conversions, conversion_value, campaign_id, asset_group_id)
     VALUES (@id, @customer_id, @item_id, @title, @description, @brand, @category, @subcategory,
       @price, @sale_price, @currency, @image_link, @link, @inventory_count, @availability, @status,
       @cl0, @cl1, @cl2, @cl3, @cl4,
       @performance_tier, @spend, @clicks, @impressions, @conversions, @conversion_value, @campaign_id, @asset_group_id)`,
  );

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM asset_group_products").run();
    db.prepare("DELETE FROM product_variants").run();
    db.prepare("DELETE FROM products").run();

    for (const r of rows) {
      const price = parsePrice(r.price);
      const m = metrics(price);
      const id = `p_${r.id}`;
      insert.run({
        id,
        customer_id: customerId,
        item_id: r.id.trim(),
        title: r.title || r.id,
        description: r.description || "",
        brand: r.brand || "Style Union",
        category: r.google_product_category || r.product_type || "Apparel & Accessories > Clothing",
        subcategory: r.product_type || "",
        price,
        sale_price: parsePrice(r.sale_price) || null,
        currency: "INR",
        image_link: r.image_link || "",
        link: r.link || "",
        inventory_count: r.quantity ? Number(r.quantity) : 0,
        availability: r.availability || "in_stock",
        status: "ENABLED",
        cl0: r.custom_label_0 || null, cl1: r.custom_label_1 || null,
        cl2: null, cl3: null, cl4: null,
        performance_tier: m.tier,
        spend: m.spend, clicks: m.clicks, impressions: m.impressions,
        conversions: m.conversions, conversion_value: m.conversion_value,
        campaign_id: campaign.id, asset_group_id: assetGroup?.id ?? null,
      });
      if (assetGroup) db.prepare("INSERT OR IGNORE INTO asset_group_products (asset_group_id, product_id) VALUES (?, ?)").run(assetGroup.id, id);
    }
  });
  tx();

  const count = (db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;
  const withImp = (db.prepare("SELECT COUNT(*) AS c FROM products WHERE impressions > 0").get() as { c: number }).c;
  const sample = db.prepare("SELECT item_id, title, price, spend, impressions FROM products ORDER BY spend DESC LIMIT 4").all();
  console.log(`\nSandbox now has ${count} products (${withImp} with impressions > 0, i.e. served in shopping).`);
  console.log("Top by spend:", JSON.stringify(sample, null, 2));
  process.exit(0);
}
main();
