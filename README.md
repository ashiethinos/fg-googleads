# FeedGraph Google Ads Sandbox Simulator

A **drop-in replacement for `googleads.googleapis.com`** used by FeedGraph for development, QA, and execution testing. The server exposes Google Ads API v24 REST paths on the root surface — identical to production.

Point FeedGraph at `http://localhost:4789` instead of `https://googleads.googleapis.com`.

## Quick Start

```bash
npm install
npm run reset    # Wipe and seed: 10k clothing products, 120 campaigns, 60 asset groups
npm run dev      # Start on http://localhost:4789
```

Production build:

```bash
npm run build
npm start
```

Verify the API:

```bash
curl http://localhost:4789/v24/customers:listAccessibleCustomers \
  -H "Authorization: Bearer sandbox-access-token" \
  -H "developer-token: sandbox-dev-token"

npm run verify:api   # 11 automated Google Ads API compliance checks
```

Open the Google Ads UI:

```bash
open http://localhost:4789/_dev/ui
```

## Google Ads UI — verify FeedGraph changes

Open **http://localhost:4789/_dev/ui** after running an execution in FeedGraph. The console mirrors the Google Ads layout:

| View | Purpose |
|------|---------|
| **Overview** | Account KPIs and recent FeedGraph changes |
| **Campaigns** | All campaigns with cost, ROAS, conversions |
| **Performance Max** | PMAX campaigns only — drill into asset groups and products |
| **Asset groups** | Listing groups and product sets inside PMAX |
| **Products** | Product-level performance, search, tier filters |
| **Change history** | Full audit trail with before/after JSON diff |
| **API verification** | Run the same GAQL queries FeedGraph uses |

| What you did in FeedGraph | Where to verify in the UI |
|---------------------------|---------------------------|
| Pushed products into a PMAX asset group | **Performance Max** → campaign → asset group drawer → **Products in this asset group** |
| Paused / enabled a campaign or asset group | **Campaigns** or **Asset groups** — status badge; **Change history** shows before/after |
| Applied labels or custom labels | **Products** → product drawer → **Change history for this product** |
| Any execution | **Overview** → **Recent changes**, or **Change history** for the full trail |

The **API verification** tab runs GAQL against `campaign`, `shopping_performance_view`, and `asset_group` so you can cross-check UI numbers against raw API responses.

- `/_dev/` redirects to the UI in a browser
- `GET /_dev` with `Accept: application/json` returns sandbox metadata and stats

UI data API (used by the console): `GET /_dev/ui/api/overview`, `/campaigns`, `/asset-groups`, `/products`, `/changes`, `/config`

## FeedGraph Integration

FeedGraph already ships with `server/google-ads-sandbox-connector.ts`. When sandbox mode is on, **no real Google Ads account or OAuth is required** — the Integrations UI connects with one click.

### Step 1 — Start the sandbox

```bash
# Terminal 1 — sandbox-googleads
npm run reset
npm run dev
# → http://localhost:4789
```

### Step 2 — Configure FeedGraph

Add to **FeedGraph's** `.env` (see `feedgraph/.env.example`):

```env
GOOGLE_ADS_ENVIRONMENT=sandbox
GOOGLE_ADS_SANDBOX_URL=http://localhost:4789
GOOGLE_ADS_API_VERSION=v24
SANDBOX_ACCESS_TOKEN=sandbox-access-token
SANDBOX_DEVELOPER_TOKEN=sandbox-dev-token
SANDBOX_CUSTOMER_ID=1234567890
```

Restart the FeedGraph server after changing `.env`.

You do **not** need `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or a live `GOOGLE_ADS_DEVELOPER_TOKEN` for sandbox mode.

### Step 3 — Connect in the FeedGraph UI

1. Open FeedGraph → **Integrations** → **Marketing**
2. Click **Connect Google Ads**
3. FeedGraph detects sandbox mode and calls `POST /api/google-ads/connect-sandbox` (no Google OAuth popup)
4. Click **Sync Now** to pull PMAX / Shopping performance from the sandbox into FeedGraph

Or via curl:

```bash
curl -X POST http://localhost:5000/api/google-ads/connect-sandbox
curl -X POST http://localhost:5000/api/google-ads/sync
```

### Step 4 — Use FeedGraph features

| FeedGraph feature | Sandbox behavior |
|-------------------|------------------|
| Sync Center → Google Ads | Pulls GAQL performance into `ad_performance_data` |
| Google Ads Operations / PMAX | Intelligence + execution against sandbox API |
| Execute actions (pause, move product, labels) | `googleAds:mutate` → sandbox SQLite |
| Verify changes | Open [sandbox UI](http://localhost:4789/_dev/ui) → Change history |

### How routing works

When `GOOGLE_ADS_ENVIRONMENT=sandbox`, FeedGraph redirects all Google Ads API calls from `googleads.googleapis.com` to `GOOGLE_ADS_SANDBOX_URL`:

| Live | Sandbox |
|------|---------|
| `https://googleads.googleapis.com/v24/...` | `http://localhost:4789/v24/...` |
| OAuth access token | `SANDBOX_ACCESS_TOKEN` |
| Developer token | `SANDBOX_DEVELOPER_TOKEN` |
| Your MCC / customer ID | `SANDBOX_CUSTOMER_ID` (`1234567890`) |

FeedGraph application logic is unchanged — only the API origin and credentials switch.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Sandbox not reachable" on connect | Ensure `npm run dev` is running in sandbox-googleads |
| Connect button still opens Google OAuth | `GOOGLE_ADS_ENVIRONMENT=sandbox` not set or server not restarted |
| Sync returns 0 products | SKU `merchantId` in FeedGraph catalog must match sandbox `item_id` (e.g. `shop_1234567890_1`) |
| API version errors | Set `GOOGLE_ADS_API_VERSION=v24` in both projects |

## API Endpoints

### Google Ads API (root — production-identical surface)

These paths are on the server root, same as `googleads.googleapis.com`. Any other path returns a Google-style `GoogleAdsFailure` 404.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v24/customers/{id}/googleAds:search` | GAQL search (paginated, 10k rows/page) |
| POST | `/v24/customers/{id}/googleAds:searchStream` | GAQL search stream (all results in one response) |
| POST | `/v24/customers/{id}/googleAds:mutate` | Campaign/asset group create and status updates |
| GET | `/v24/customers:listAccessibleCustomers` | List sandbox account |

Compatible with Google Ads API v20–v24 path structure. Default version: **v24** ([API reference](https://developers.google.com/google-ads/api/reference/rpc/v24/overview)).

| Google Service | REST path | Request body key | Response body key |
|----------------|-----------|------------------|-------------------|
| `GoogleAdsService.Search` | `POST /{v}/customers/{id}/googleAds:search` | `query`, `pageToken` | `results`, `fieldMask`, `totalResultsCount`, `nextPageToken` |
| `GoogleAdsService.SearchStream` | `POST /{v}/customers/{id}/googleAds:searchStream` | `query` | JSON **array** of `{ results, fieldMask }` |
| `GoogleAdsService.Mutate` | `POST /{v}/customers/{id}/googleAds:mutate` | `mutateOperations` | `mutateOperationResponses` |
| `CustomerService.ListAccessibleCustomers` | `GET /{v}/customers:listAccessibleCustomers` | — | `resourceNames` |
| `CampaignService.Mutate` | `POST /{v}/customers/{id}/campaigns:mutate` | `operations` | `results` |
| `AssetGroupService.Mutate` | `POST /{v}/customers/{id}/assetGroups:mutate` | `operations` | `results` |

All responses include a `request-id` header. Errors use the `GoogleAdsFailure` format with `details` and `requestId`.

Verify compliance: `npm run verify:api`

### Dev API (`/_dev` — internal helpers, not part of Google Ads API)

Mounted at `/_dev` when `SANDBOX_DEV_ROUTES` is enabled (default). Use these for debugging and manual testing — FeedGraph should only call the root Google Ads paths above.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/_dev/info` | Sandbox metadata, connector config, implemented endpoints |
| GET | `/_dev/health` | Health check |
| GET | `/_dev/stats` | Row counts (products, campaigns, asset groups, audit logs) |
| GET | `/_dev/campaigns` | List campaigns with metrics |
| GET | `/_dev/asset-groups` | List asset groups |
| GET | `/_dev/listing-groups` | List listing groups (`?assetGroupId=`) |
| GET | `/_dev/product-groups` | List product groups |
| GET | `/_dev/products` | List products (`?tier=high\|wasted\|none\|low`, `?limit=`, `?q=`) |
| GET | `/_dev/products/:id` | Product detail with variants |
| GET | `/_dev/labels` | List labels |
| GET | `/_dev/audit-logs` | Action audit trail (`?limit=`, `?offset=`) |
| GET | `/_dev/performance/metrics` | Campaign or product metrics |
| POST | `/_dev/campaigns` | Create campaign |
| POST | `/_dev/campaigns/:id/pause` | Pause campaign |
| POST | `/_dev/campaigns/:id/enable` | Enable campaign |
| POST | `/_dev/asset-groups` | Create asset group |
| POST | `/_dev/asset-groups/:id/pause` | Pause asset group |
| POST | `/_dev/asset-groups/:id/enable` | Enable asset group |
| POST | `/_dev/products/:id/pause` | Pause product |
| POST | `/_dev/products/:id/enable` | Enable product |
| POST | `/_dev/products/:id/exclude` | Exclude product |
| POST | `/_dev/products/:id/include` | Include product |
| POST | `/_dev/products/:id/move` | Move product to asset group (`{ assetGroupId }`) |
| POST | `/_dev/products/:id/labels` | Apply label |
| DELETE | `/_dev/products/:id/labels/:labelId` | Remove label |
| POST | `/_dev/products/:id/custom-labels` | Apply custom label slot |

## Test Scenarios (Built-in)

| Scenario | How to find |
|----------|-------------|
| High performers | `GET /_dev/products?tier=high` |
| Wasted spend (high spend, no revenue) | `GET /_dev/products?tier=wasted` |
| No conversion products | `GET /_dev/products?tier=none` |
| Low performers | `GET /_dev/products?tier=low` |
| Low inventory + high ROAS | Products with `customLabel1=low-inventory` and `tier=high` |
| Missing labels | ~10% of products have no custom labels |
| Zero inventory | First 50 products |
| Variant OOS (S/M out, L/XL in stock) | Products 250–350 |

## Data Model

### Catalog — Clothing and Apparel only

All products use category **Clothing and Apparel**. There are no electronics, furniture, or other verticals.

| Subcategories | Brands |
|---------------|--------|
| Hoodies, T-Shirts, Jeans, Jackets, Dresses, Shirts, Shorts, Skirts, Sweaters, Activewear, Blazers, Leggings | UrbanWear, ClassicFit, TrendLine, ComfortCo, LoomLane, ThreadCraft |

### Campaigns

| Type | Examples |
|------|----------|
| **Performance Max** | PMAX - Clothing and Apparel, PMAX - Tops, PMAX - Bottoms, PMAX - Dresses, PMAX - Outerwear, PMAX - All Products |
| **Shopping** | Shopping - Best Sellers, Clearance, New Arrivals, High ROAS, Low Inventory |

### Scale (defaults)

- **10,000 products** — ~55% in PMAX asset groups, ~45% in Shopping campaigns; distributed evenly across all PMAX asset groups by subcategory
- **120 campaigns** — PMAX and Shopping (templates cycle with numeric suffixes)
- **60 asset groups** — each with listing groups scoped to Clothing and Apparel
- **Product groups** — per Shopping campaign, subdivided by clothing subcategory
- **7 labels** — best-seller, clearance, new-arrival, high-roas, low-inventory, seasonal, premium
- **Variants** — S / M / L / XL with independent inventory

Data is persisted in SQLite at `./data/sandbox.db`.

## Audit Logs

Every state-changing action (FeedGraph mutate, dev API POST) is logged with action, timestamp, user, previous state, and new state:

```bash
curl http://localhost:4789/_dev/audit-logs?limit=20
```

View in the UI under **Change history**, or per-product in the product drawer.

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4789 | Server port |
| `API_VERSION` | v24 | Google Ads API version prefix |
| `SANDBOX_CUSTOMER_ID` | 1234567890 | Sandbox account ID (dashes stripped) |
| `SANDBOX_CUSTOMER_NAME` | FeedGraph Sandbox Store | Account display name |
| `SANDBOX_CURRENCY` | INR | Account currency |
| `SANDBOX_DEVELOPER_TOKEN` | sandbox-dev-token | Accepted `developer-token` header value |
| `SANDBOX_ACCESS_TOKEN` | sandbox-access-token | Accepted `Authorization: Bearer` value |
| `PRODUCT_COUNT` | 10000 | Products to generate on seed |
| `CAMPAIGN_COUNT` | 120 | Campaigns to generate on seed |
| `ASSET_GROUP_COUNT` | 60 | PMAX asset groups to generate on seed |
| `SANDBOX_DEV_ROUTES` | true | Set to `false` to disable `/_dev` (Google Ads API only) |
| `DATA_DIR` | ./data | Data directory |
| `DB_PATH` | ./data/sandbox.db | SQLite database path |

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript and copy UI assets to `dist/` |
| `npm start` | Run compiled server (`dist/index.js`) |
| `npm run seed` | Seed database if empty |
| `npm run reset` | Wipe and regenerate all sandbox data |
| `npm run verify:api` | Run Google Ads API compliance checks |

## Reset Data

```bash
npm run reset   # Wipe and regenerate all sandbox data
```

Restart the dev server after reset so the UI reflects the new data.
# fg-googleads
