import { config } from "../config.js";
import { closeDb, getDb, isSeeded, resetDatabase } from "../db/store.js";
import { sandboxProductImageUrl } from "../lib/product-images.js";

const PRODUCT_CATEGORY = "Clothing and Apparel";

const CLOTHING_CATALOG = {
  subcategories: [
    "Hoodies",
    "T-Shirts",
    "Jeans",
    "Jackets",
    "Dresses",
    "Shirts",
    "Shorts",
    "Skirts",
    "Sweaters",
    "Activewear",
    "Blazers",
    "Leggings",
  ],
  brands: ["UrbanWear", "ClassicFit", "TrendLine", "ComfortCo", "LoomLane", "ThreadCraft"],
  adjectives: ["Blue", "Black", "White", "Red", "Navy", "Grey", "Olive", "Cream", "Floral", "Striped"],
} as const;

const CATEGORIES = {
  [PRODUCT_CATEGORY]: CLOTHING_CATALOG,
} as const;

const CAMPAIGN_TEMPLATES = [
  { name: "PMAX - Clothing and Apparel", type: "PERFORMANCE_MAX" as const, category: PRODUCT_CATEGORY },
  { name: "PMAX - Tops", type: "PERFORMANCE_MAX" as const, category: PRODUCT_CATEGORY },
  { name: "PMAX - Bottoms", type: "PERFORMANCE_MAX" as const, category: PRODUCT_CATEGORY },
  { name: "PMAX - Dresses", type: "PERFORMANCE_MAX" as const, category: PRODUCT_CATEGORY },
  { name: "PMAX - Outerwear", type: "PERFORMANCE_MAX" as const, category: PRODUCT_CATEGORY },
  { name: "PMAX - All Products", type: "PERFORMANCE_MAX" as const, category: null },
  { name: "Shopping - Best Sellers", type: "SHOPPING" as const, category: null },
  { name: "Shopping - Clearance", type: "SHOPPING" as const, category: null },
  { name: "Shopping - New Arrivals", type: "SHOPPING" as const, category: null },
  { name: "Shopping - High ROAS", type: "SHOPPING" as const, category: null },
  { name: "Shopping - Low Inventory", type: "SHOPPING" as const, category: null },
];

const LABELS = [
  { name: "best-seller", color: "#34A853" },
  { name: "clearance", color: "#EA4335" },
  { name: "new-arrival", color: "#4285F4" },
  { name: "high-roas", color: "#FBBC04" },
  { name: "low-inventory", color: "#FF6D01" },
  { name: "seasonal", color: "#9C27B0" },
  { name: "premium", color: "#00ACC1" },
];

const SIZES = ["S", "M", "L", "XL"] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type PerfTier = "high" | "medium" | "low" | "none" | "wasted";

function metricsForTier(tier: PerfTier) {
  switch (tier) {
    case "high":
      return {
        spend: round2(rand(1500, 8000)),
        clicks: randInt(200, 1200),
        impressions: randInt(5000, 50000),
        conversions: round2(rand(10, 80)),
        conversionValue: 0,
      };
    case "medium":
      return {
        spend: round2(rand(500, 3000)),
        clicks: randInt(50, 400),
        impressions: randInt(1000, 15000),
        conversions: round2(rand(2, 20)),
        conversionValue: 0,
      };
    case "low":
      return {
        spend: round2(rand(200, 1500)),
        clicks: randInt(20, 150),
        impressions: randInt(500, 5000),
        conversions: round2(rand(0, 3)),
        conversionValue: 0,
      };
    case "wasted":
      return {
        spend: round2(rand(2000, 6000)),
        clicks: randInt(150, 600),
        impressions: randInt(3000, 20000),
        conversions: 0,
        conversionValue: 0,
      };
    case "none":
    default:
      return { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 };
  }
}

function inventoryScenario(tier: PerfTier, index: number): { count: number; variantPattern: "healthy" | "low" | "zero" | "mixed_oos" } {
  if (index < 50) return { count: 0, variantPattern: "zero" };
  if (index < 150) return { count: randInt(1, 5), variantPattern: "low" };
  if (index < 250 && tier === "high") return { count: randInt(2, 8), variantPattern: "low" };
  if (index < 350) return { count: randInt(20, 200), variantPattern: "mixed_oos" };
  return { count: randInt(30, 500), variantPattern: "healthy" };
}

type AssetGroupSeed = { id: string; campaignId: string; name: string; category: string; subcategory: string };

/** Pick the least-filled PMAX asset group, preferring subcategory match within clothing catalog. */
function pickPmaxAssetGroup(
  subcategory: string,
  assetGroups: AssetGroupSeed[],
  counts: Map<string, number>,
): AssetGroupSeed {
  const matching = assetGroups.filter((ag) => ag.subcategory === subcategory);
  const pool = matching.length > 0 ? matching : assetGroups;
  return pool.reduce((min, ag) =>
    (counts.get(ag.id) ?? 0) < (counts.get(min.id) ?? 0) ? ag : min,
  );
}

export async function seedDatabase(force = false): Promise<void> {
  if (!force && isSeeded()) {
    console.log("[seed] Database already seeded. Use --reset to regenerate.");
    return;
  }

  if (force) resetDatabase();
  const db = getDb();
  const customerId = config.customerId;
  const currency = config.currency;

  console.log(`[seed] Generating sandbox data for customer ${customerId}...`);

  db.prepare(
    `INSERT OR REPLACE INTO customers (id, descriptive_name, currency_code, manager, test_account)
     VALUES (?, ?, ?, 0, 1)`,
  ).run(customerId, config.customerName, currency);

  db.prepare(
    `INSERT OR REPLACE INTO customer_clients
     (client_customer, manager_customer, descriptive_name, manager, status, level, test_account, hidden)
     VALUES (?, ?, ?, 0, 'ENABLED', 1, 1, 0)`,
  ).run(customerId, customerId, config.customerName);

  const labelIds: string[] = [];
  for (const label of LABELS) {
    const id = `label-${label.name}`;
    labelIds.push(id);
    db.prepare("INSERT INTO labels (id, customer_id, name, color) VALUES (?, ?, ?, ?)").run(
      id,
      customerId,
      label.name,
      label.color,
    );
  }

  const campaignIds: Array<{ id: string; name: string; type: string; category: string | null }> = [];
  const campaignCount = config.campaignCount;

  for (let i = 0; i < campaignCount; i++) {
    const template = CAMPAIGN_TEMPLATES[i % CAMPAIGN_TEMPLATES.length];
    const suffix = i >= CAMPAIGN_TEMPLATES.length ? ` ${Math.floor(i / CAMPAIGN_TEMPLATES.length) + 1}` : "";
    const id = String(1000000000 + i);
    const name = `${template.name}${suffix}`;
    const budgetMicros = randInt(10000000, 500000000);
    const perf = metricsForTier(i % 5 === 0 ? "high" : i % 3 === 0 ? "medium" : "low");
    perf.conversionValue = perf.conversions > 0 ? round2(perf.spend * rand(3, 8)) : 0;

    db.prepare(
      `INSERT INTO campaigns (id, customer_id, name, status, advertising_channel_type, budget_micros,
        spend, clicks, impressions, conversions, conversion_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      customerId,
      name,
      i % 17 === 0 ? "PAUSED" : "ENABLED",
      template.type,
      budgetMicros,
      perf.spend,
      perf.clicks,
      perf.impressions,
      perf.conversions,
      perf.conversionValue,
    );

    campaignIds.push({ id, name, type: template.type, category: template.category });

    if (template.type === "SHOPPING") {
      const rootId = `pg-root-${id}`;
      db.prepare(
        "INSERT INTO product_groups (id, campaign_id, type, dimension, value, parent_id) VALUES (?, ?, 'SUBDIVISION', 'PRODUCT_TYPE', 'All Products', NULL)",
      ).run(rootId, id);
      for (const sub of CLOTHING_CATALOG.subcategories) {
        db.prepare(
          "INSERT INTO product_groups (id, campaign_id, type, dimension, value, parent_id) VALUES (?, ?, 'UNIT', 'PRODUCT_TYPE', ?, ?)",
        ).run(`pg-${id}-${sub}`, id, sub, rootId);
      }
    }
  }

  const subcategoryKeys = [...CLOTHING_CATALOG.subcategories];
  const pmaxCampaigns = campaignIds.filter((c) => c.type === "PERFORMANCE_MAX");
  const assetGroupCount = config.assetGroupCount;
  const assetGroupIds: AssetGroupSeed[] = [];

  for (let i = 0; i < assetGroupCount; i++) {
    const campaign = pmaxCampaigns[i % pmaxCampaigns.length];
    const subcategory = subcategoryKeys[i % subcategoryKeys.length];
    const id = String(2000000000 + i);
    const name = `AG - ${subcategory} ${i + 1}`;
    const perf = metricsForTier(i % 4 === 0 ? "high" : "medium");
    perf.conversionValue = perf.conversions > 0 ? round2(perf.spend * rand(4, 9)) : 0;

    db.prepare(
      `INSERT INTO asset_groups (id, customer_id, campaign_id, name, status, spend, clicks, impressions, conversions, conversion_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      customerId,
      campaign.id,
      name,
      i % 13 === 0 ? "PAUSED" : "ENABLED",
      perf.spend,
      perf.clicks,
      perf.impressions,
      perf.conversions,
      perf.conversionValue,
    );

    assetGroupIds.push({
      id,
      campaignId: campaign.id,
      name,
      category: PRODUCT_CATEGORY,
      subcategory,
    });

    const lgRoot = `lg-root-${id}`;
    db.prepare(
      "INSERT INTO listing_groups (id, asset_group_id, type, dimension, value, parent_id) VALUES (?, ?, 'SUBDIVISION', 'PRODUCT_TYPE', 'All Products', NULL)",
    ).run(lgRoot, id);
    db.prepare(
      "INSERT INTO listing_groups (id, asset_group_id, type, dimension, value, parent_id) VALUES (?, ?, 'UNIT', 'PRODUCT_TYPE', ?, ?)",
    ).run(`lg-${id}-all`, id, PRODUCT_CATEGORY, lgRoot);
  }

  const productCount = config.productCount;
  const shoppingCampaigns = campaignIds.filter((c) => c.type === "SHOPPING");
  const agProductCounts = new Map<string, number>();
  for (const ag of assetGroupIds) agProductCounts.set(ag.id, 0);
  let shoppingAssignIdx = 0;

  const insertProduct = db.prepare(
    `INSERT INTO products (id, customer_id, item_id, title, description, brand, category, subcategory,
      price, sale_price, currency, image_link, link, inventory_count, availability, status,
      custom_label_0, custom_label_1, custom_label_2, custom_label_3, custom_label_4,
      performance_tier, spend, clicks, impressions, conversions, conversion_value, campaign_id, asset_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertVariant = db.prepare(
    `INSERT INTO product_variants (id, product_id, size, sku, inventory, price, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAgProduct = db.prepare(
    "INSERT OR IGNORE INTO asset_group_products (asset_group_id, product_id) VALUES (?, ?)",
  );

  const insertMany = db.transaction(() => {
    for (let i = 0; i < productCount; i++) {
      const category = PRODUCT_CATEGORY;
      const subcategory = pick(CLOTHING_CATALOG.subcategories);
      const brand = pick(CLOTHING_CATALOG.brands);
      const adj = pick(CLOTHING_CATALOG.adjectives);
      const title = `${adj} ${subcategory.replace(/s$/, "")} - ${brand}`;
      const id = `prod-${i + 1}`;
      const itemId = `shop_${customerId}_${i + 1}`;
      const price = round2(rand(499, 49999));
      const onSale = i % 7 === 0;
      const salePrice = onSale ? round2(price * rand(0.5, 0.85)) : null;

      let tier: PerfTier;
      if (i < productCount * 0.08) tier = "high";
      else if (i < productCount * 0.15) tier = "wasted";
      else if (i < productCount * 0.25) tier = "none";
      else if (i < productCount * 0.45) tier = "low";
      else tier = "medium";

      const perf = metricsForTier(tier);
      if (perf.conversions > 0) {
        perf.conversionValue = round2(perf.spend * rand(tier === "high" ? 5 : 2, tier === "high" ? 10 : 5));
      }

      const invScenario = inventoryScenario(tier, i);
      const availability = invScenario.count === 0 ? "out_of_stock" : "in_stock";

      // ~55% PMAX (evenly across all asset groups), ~45% Shopping — every PMAX campaign gets products
      const assignToPmax = assetGroupIds.length > 0 && i % 100 < 55;
      let campaignId: string | null = null;
      let assetGroupId: string | null = null;

      if (assignToPmax) {
        const ag = pickPmaxAssetGroup(subcategory, assetGroupIds, agProductCounts);
        assetGroupId = ag.id;
        campaignId = ag.campaignId;
        agProductCounts.set(ag.id, (agProductCounts.get(ag.id) ?? 0) + 1);
      } else if (shoppingCampaigns.length) {
        campaignId = shoppingCampaigns[shoppingAssignIdx % shoppingCampaigns.length].id;
        shoppingAssignIdx += 1;
      }

      const missingLabels = i >= productCount * 0.7 && i < productCount * 0.8;
      const customLabel0 = missingLabels ? null : tier === "high" ? "best-seller" : tier === "wasted" ? null : i % 5 === 0 ? "new-arrival" : null;
      const customLabel1 = missingLabels ? null : invScenario.variantPattern === "low" ? "low-inventory" : null;
      const customLabel2 = onSale ? "clearance" : null;

      insertProduct.run(
        id,
        customerId,
        itemId,
        title,
        `${title} — premium clothing and apparel for everyday wear.`,
        brand,
        category,
        subcategory,
        price,
        salePrice,
        currency,
        sandboxProductImageUrl(id, 400),
        `https://sandbox.feedgraph.local/products/${itemId}`,
        invScenario.count,
        availability,
        i % 41 === 0 ? "PAUSED" : i % 53 === 0 ? "EXCLUDED" : "ENABLED",
        customLabel0,
        customLabel1,
        customLabel2,
        null,
        null,
        tier,
        perf.spend,
        perf.clicks,
        perf.impressions,
        perf.conversions,
        perf.conversionValue,
        campaignId,
        assetGroupId,
      );

      for (const size of SIZES) {
        let variantInv: number;
        let variantAvail: string;
        if (invScenario.variantPattern === "zero") {
          variantInv = 0;
          variantAvail = "out_of_stock";
        } else if (invScenario.variantPattern === "low") {
          variantInv = randInt(0, 3);
          variantAvail = variantInv > 0 ? "in_stock" : "out_of_stock";
        } else if (invScenario.variantPattern === "mixed_oos") {
          variantInv = size === "S" || size === "M" ? 0 : randInt(5, 50);
          variantAvail = variantInv > 0 ? "in_stock" : "out_of_stock";
        } else {
          variantInv = randInt(10, 100);
          variantAvail = "in_stock";
        }
        insertVariant.run(
          `${id}-${size}`,
          id,
          size,
          `${itemId}-${size}`,
          variantInv,
          price,
          variantAvail,
        );
      }

      if (assetGroupId) {
        insertAgProduct.run(assetGroupId, id);
      }

      if (tier === "high" && labelIds[0]) {
        db.prepare("INSERT OR IGNORE INTO product_labels (product_id, label_id) VALUES (?, ?)").run(id, labelIds[0]);
      }
      if (onSale && labelIds[1]) {
        db.prepare("INSERT OR IGNORE INTO product_labels (product_id, label_id) VALUES (?, ?)").run(id, labelIds[1]);
      }
    }
  });

  insertMany();

  const pmaxProductStats = db
    .prepare(
      `SELECT MIN(cnt) AS minProducts, MAX(cnt) AS maxProducts, COUNT(*) AS campaignsWithProducts
       FROM (
         SELECT c.id, COUNT(p.id) AS cnt
         FROM campaigns c
         LEFT JOIN products p ON p.campaign_id = c.id
         WHERE c.advertising_channel_type = 'PERFORMANCE_MAX'
         GROUP BY c.id
       )`,
    )
    .get() as { minProducts: number; maxProducts: number; campaignsWithProducts: number };

  console.log(`[seed] Created ${productCount} products, ${campaignCount} campaigns, ${assetGroupCount} asset groups`);
  console.log(
    `[seed] PMAX coverage: ${pmaxProductStats.campaignsWithProducts} campaigns, ` +
      `${pmaxProductStats.minProducts}–${pmaxProductStats.maxProducts} products each`,
  );
  console.log("[seed] Test scenarios: high performers, wasted spend, no conversion, low inventory, missing labels, variant OOS");
}

const isMain = process.argv[1]?.includes("seed");
if (isMain) {
  const forceReset = process.argv.includes("--reset");
  seedDatabase(forceReset)
    .then(() => {
      closeDb();
      console.log("[seed] Done.");
    })
    .catch((err) => {
      console.error("[seed] Failed:", err);
      closeDb();
      process.exit(1);
    });
}
