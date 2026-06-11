export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  descriptive_name TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'INR',
  manager INTEGER NOT NULL DEFAULT 0,
  test_account INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer_clients (
  client_customer TEXT NOT NULL,
  manager_customer TEXT NOT NULL,
  descriptive_name TEXT NOT NULL,
  manager INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ENABLED',
  level INTEGER NOT NULL DEFAULT 1,
  test_account INTEGER NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (manager_customer, client_customer)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENABLED',
  advertising_channel_type TEXT NOT NULL,
  budget_micros INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_groups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENABLED',
  spend REAL NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listing_groups (
  id TEXT PRIMARY KEY,
  asset_group_id TEXT NOT NULL,
  type TEXT NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  parent_id TEXT
);

CREATE TABLE IF NOT EXISTS product_groups (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  type TEXT NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  parent_id TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  price REAL NOT NULL,
  sale_price REAL,
  currency TEXT NOT NULL DEFAULT 'INR',
  image_link TEXT,
  link TEXT,
  inventory_count INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL DEFAULT 'in_stock',
  status TEXT NOT NULL DEFAULT 'ENABLED',
  custom_label_0 TEXT,
  custom_label_1 TEXT,
  custom_label_2 TEXT,
  custom_label_3 TEXT,
  custom_label_4 TEXT,
  performance_tier TEXT NOT NULL DEFAULT 'medium',
  spend REAL NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  campaign_id TEXT,
  asset_group_id TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  size TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  inventory INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL,
  availability TEXT NOT NULL DEFAULT 'in_stock'
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4285F4'
);

CREATE TABLE IF NOT EXISTS product_labels (
  product_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY (product_id, label_id)
);

CREATE TABLE IF NOT EXISTS asset_group_products (
  asset_group_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (asset_group_id, product_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user TEXT NOT NULL DEFAULT 'feedgraph',
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_item_id ON products(item_id);
CREATE INDEX IF NOT EXISTS idx_products_campaign ON products(campaign_id);
CREATE INDEX IF NOT EXISTS idx_products_asset_group ON products(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_products_tier ON products(performance_tier);
CREATE INDEX IF NOT EXISTS idx_campaigns_customer ON campaigns(customer_id);
CREATE INDEX IF NOT EXISTS idx_asset_groups_campaign ON asset_groups(campaign_id);
`;
