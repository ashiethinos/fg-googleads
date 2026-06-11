import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config, resolveDbPath } from "../config.js";
import { SCHEMA_SQL } from "./schema.js";
import type {
  AssetGroup,
  AuditLogEntry,
  Campaign,
  Customer,
  Label,
  ListingGroup,
  Product,
  ProductGroup,
  ProductVariant,
} from "../models/types.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function isSeeded(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number };
  return row.c > 0;
}

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    name: String(row.name),
    status: row.status as Campaign["status"],
    advertisingChannelType: row.advertising_channel_type as Campaign["advertisingChannelType"],
    budgetMicros: Number(row.budget_micros),
    spend: Number(row.spend),
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversion_value),
  };
}

function rowToAssetGroup(row: Record<string, unknown>): AssetGroup {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    status: row.status as AssetGroup["status"],
    spend: Number(row.spend),
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversion_value),
  };
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    itemId: String(row.item_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    brand: String(row.brand ?? ""),
    category: String(row.category),
    subcategory: String(row.subcategory ?? ""),
    price: Number(row.price),
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    currency: String(row.currency),
    imageLink: String(row.image_link ?? ""),
    link: String(row.link ?? ""),
    inventoryCount: Number(row.inventory_count),
    availability: row.availability as Product["availability"],
    status: row.status as Product["status"],
    customLabel0: row.custom_label_0 ? String(row.custom_label_0) : null,
    customLabel1: row.custom_label_1 ? String(row.custom_label_1) : null,
    customLabel2: row.custom_label_2 ? String(row.custom_label_2) : null,
    customLabel3: row.custom_label_3 ? String(row.custom_label_3) : null,
    customLabel4: row.custom_label_4 ? String(row.custom_label_4) : null,
    performanceTier: row.performance_tier as Product["performanceTier"],
    spend: Number(row.spend),
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversion_value),
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    assetGroupId: row.asset_group_id ? String(row.asset_group_id) : null,
  };
}

export function getCustomer(customerId: string): Customer | null {
  const row = getDb()
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(customerId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    descriptiveName: String(row.descriptive_name),
    currencyCode: String(row.currency_code),
    manager: Boolean(row.manager),
    testAccount: Boolean(row.test_account),
  };
}

export function listCustomerClients(managerCustomerId: string) {
  return getDb()
    .prepare("SELECT * FROM customer_clients WHERE manager_customer = ?")
    .all(managerCustomerId) as Record<string, unknown>[];
}

export function listCampaigns(customerId: string, limit = 1000): Campaign[] {
  const rows = getDb()
    .prepare("SELECT * FROM campaigns WHERE customer_id = ? ORDER BY spend DESC LIMIT ?")
    .all(customerId, limit) as Record<string, unknown>[];
  return rows.map(rowToCampaign);
}

export function getCampaign(campaignId: string): Campaign | null {
  const row = getDb().prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToCampaign(row) : null;
}

export function listAssetGroups(customerId: string, limit = 1000): AssetGroup[] {
  const rows = getDb()
    .prepare("SELECT * FROM asset_groups WHERE customer_id = ? ORDER BY spend DESC LIMIT ?")
    .all(customerId, limit) as Record<string, unknown>[];
  return rows.map(rowToAssetGroup);
}

export function getAssetGroup(assetGroupId: string): AssetGroup | null {
  const row = getDb().prepare("SELECT * FROM asset_groups WHERE id = ?").get(assetGroupId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToAssetGroup(row) : null;
}

export function listListingGroups(assetGroupId?: string): ListingGroup[] {
  const sql = assetGroupId
    ? "SELECT * FROM listing_groups WHERE asset_group_id = ?"
    : "SELECT * FROM listing_groups";
  const rows = (assetGroupId
    ? getDb().prepare(sql).all(assetGroupId)
    : getDb().prepare(sql).all()) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    assetGroupId: String(row.asset_group_id),
    type: row.type as ListingGroup["type"],
    dimension: String(row.dimension),
    value: String(row.value),
    parentId: row.parent_id ? String(row.parent_id) : null,
  }));
}

export function listProductGroups(campaignId?: string): ProductGroup[] {
  const sql = campaignId
    ? "SELECT * FROM product_groups WHERE campaign_id = ?"
    : "SELECT * FROM product_groups";
  const rows = (campaignId
    ? getDb().prepare(sql).all(campaignId)
    : getDb().prepare(sql).all()) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    campaignId: String(row.campaign_id),
    type: row.type as ProductGroup["type"],
    dimension: String(row.dimension),
    value: String(row.value),
    parentId: row.parent_id ? String(row.parent_id) : null,
  }));
}

export function listProducts(opts: {
  customerId?: string;
  campaignId?: string;
  assetGroupId?: string;
  limit?: number;
  offset?: number;
}): Product[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.customerId) {
    conditions.push("customer_id = ?");
    params.push(opts.customerId);
  }
  if (opts.campaignId) {
    conditions.push("campaign_id = ?");
    params.push(opts.campaignId);
  }
  if (opts.assetGroupId) {
    conditions.push("asset_group_id = ?");
    params.push(opts.assetGroupId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 10000;
  const offset = opts.offset ?? 0;
  const rows = getDb()
    .prepare(`SELECT * FROM products ${where} ORDER BY spend DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[];
  return rows.map(rowToProduct);
}

export function getProduct(productId: string): Product | null {
  const row = getDb().prepare("SELECT * FROM products WHERE id = ? OR item_id = ?").get(productId, productId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToProduct(row) : null;
}

export function listProductVariants(productId: string): ProductVariant[] {
  const rows = getDb()
    .prepare("SELECT * FROM product_variants WHERE product_id = ?")
    .all(productId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    size: String(row.size),
    sku: String(row.sku),
    inventory: Number(row.inventory),
    price: Number(row.price),
    availability: row.availability as ProductVariant["availability"],
  }));
}

export function listLabels(customerId: string): Label[] {
  const rows = getDb()
    .prepare("SELECT * FROM labels WHERE customer_id = ?")
    .all(customerId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    customerId: String(row.customer_id),
    name: String(row.name),
    color: String(row.color),
  }));
}

export function listShoppingPerformance(customerId: string, limit = 50000) {
  return getDb()
    .prepare(
      `SELECT p.*, c.id AS camp_id, c.name AS camp_name, c.advertising_channel_type
       FROM products p
       LEFT JOIN campaigns c ON p.campaign_id = c.id
       WHERE p.customer_id = ? AND p.impressions > 0
       ORDER BY p.spend DESC LIMIT ?`,
    )
    .all(customerId, limit) as Record<string, unknown>[];
}

export function updateCampaignStatus(campaignId: string, status: Campaign["status"]): Campaign | null {
  const prev = getCampaign(campaignId);
  if (!prev) return null;
  getDb().prepare("UPDATE campaigns SET status = ? WHERE id = ?").run(status, campaignId);
  return getCampaign(campaignId);
}

export function updateAssetGroupStatus(assetGroupId: string, status: AssetGroup["status"]): AssetGroup | null {
  const prev = getAssetGroup(assetGroupId);
  if (!prev) return null;
  getDb().prepare("UPDATE asset_groups SET status = ? WHERE id = ?").run(status, assetGroupId);
  return getAssetGroup(assetGroupId);
}

export function updateProductStatus(productId: string, status: Product["status"]): Product | null {
  const prev = getProduct(productId);
  if (!prev) return null;
  getDb().prepare("UPDATE products SET status = ? WHERE id = ?").run(status, prev.id);
  return getProduct(prev.id);
}

export function moveProductToAssetGroup(productId: string, assetGroupId: string): Product | null {
  const product = getProduct(productId);
  const ag = getAssetGroup(assetGroupId);
  if (!product || !ag) return null;
  const dbConn = getDb();
  dbConn.prepare("UPDATE products SET asset_group_id = ?, campaign_id = ? WHERE id = ?").run(
    assetGroupId,
    ag.campaignId,
    product.id,
  );
  dbConn
    .prepare(
      "INSERT OR IGNORE INTO asset_group_products (asset_group_id, product_id) VALUES (?, ?)",
    )
    .run(assetGroupId, product.id);
  return getProduct(product.id);
}

export function applyProductLabel(productId: string, labelId: string): void {
  const product = getProduct(productId);
  if (!product) return;
  getDb()
    .prepare("INSERT OR IGNORE INTO product_labels (product_id, label_id) VALUES (?, ?)")
    .run(product.id, labelId);
}

export function removeProductLabel(productId: string, labelId: string): void {
  const product = getProduct(productId);
  if (!product) return;
  getDb()
    .prepare("DELETE FROM product_labels WHERE product_id = ? AND label_id = ?")
    .run(product.id, labelId);
}

export function applyCustomLabel(
  productId: string,
  slot: 0 | 1 | 2 | 3 | 4,
  value: string | null,
): Product | null {
  const product = getProduct(productId);
  if (!product) return null;
  const col = `custom_label_${slot}`;
  getDb().prepare(`UPDATE products SET ${col} = ? WHERE id = ?`).run(value, product.id);
  return getProduct(product.id);
}

export function createCampaign(input: {
  customerId: string;
  name: string;
  channelType: Campaign["advertisingChannelType"];
  budgetMicros?: number;
}): Campaign {
  const id = String(9000000000 + Math.floor(Math.random() * 99999999));
  getDb()
    .prepare(
      `INSERT INTO campaigns (id, customer_id, name, status, advertising_channel_type, budget_micros)
       VALUES (?, ?, ?, 'ENABLED', ?, ?)`,
    )
    .run(id, input.customerId, input.name, input.channelType, input.budgetMicros ?? 50000000);
  return getCampaign(id)!;
}

export function createAssetGroup(input: {
  customerId: string;
  campaignId: string;
  name: string;
}): AssetGroup {
  const id = String(8000000000 + Math.floor(Math.random() * 99999999));
  getDb()
    .prepare(
      `INSERT INTO asset_groups (id, customer_id, campaign_id, name, status)
       VALUES (?, ?, ?, ?, 'ENABLED')`,
    )
    .run(id, input.customerId, input.campaignId, input.name);
  return getAssetGroup(id)!;
}

export function writeAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp" | "metadata"> & { id?: string; metadata?: string | null },
): AuditLogEntry {
  const id = entry.id ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO audit_logs (id, action, user, resource_type, resource_id, previous_state, new_state, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      entry.action,
      entry.user,
      entry.resourceType,
      entry.resourceId,
      entry.previousState,
      entry.newState,
      timestamp,
      entry.metadata ?? null,
    );
  return {
    id,
    action: entry.action,
    user: entry.user,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    previousState: entry.previousState,
    newState: entry.newState,
    timestamp,
    metadata: entry.metadata ?? null,
  };
}

export function listAuditLogs(limit = 100, offset = 0): AuditLogEntry[] {
  const rows = getDb()
    .prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    action: String(row.action),
    user: String(row.user),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    previousState: String(row.previous_state),
    newState: String(row.new_state),
    timestamp: String(row.timestamp),
    metadata: row.metadata ? String(row.metadata) : null,
  }));
}

export function getStats() {
  const dbConn = getDb();
  return {
    products: (dbConn.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c,
    campaigns: (dbConn.prepare("SELECT COUNT(*) AS c FROM campaigns").get() as { c: number }).c,
    assetGroups: (dbConn.prepare("SELECT COUNT(*) AS c FROM asset_groups").get() as { c: number }).c,
    listingGroups: (dbConn.prepare("SELECT COUNT(*) AS c FROM listing_groups").get() as { c: number }).c,
    labels: (dbConn.prepare("SELECT COUNT(*) AS c FROM labels").get() as { c: number }).c,
    auditLogs: (dbConn.prepare("SELECT COUNT(*) AS c FROM audit_logs").get() as { c: number }).c,
  };
}

export function resetDatabase(): void {
  const dbConn = getDb();
  const tables = [
    "audit_logs",
    "product_labels",
    "asset_group_products",
    "product_variants",
    "products",
    "listing_groups",
    "product_groups",
    "asset_groups",
    "campaigns",
    "labels",
    "customer_clients",
    "customers",
  ];
  for (const table of tables) {
    dbConn.prepare(`DELETE FROM ${table}`).run();
  }
}
