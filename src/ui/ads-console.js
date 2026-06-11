const API = "/_dev/ui/api";
let cfg = {};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function gaqlSearch(query) {
  const res = await fetch(`/${cfg.apiVersion}/customers/${cfg.customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "developer-token": cfg.developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  return { status: res.status, data, requestId: res.headers.get("request-id") };
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

function statusBadge(status) {
  const cls = status === "ENABLED" ? "enabled" : status === "PAUSED" ? "paused" : "excluded";
  return `<span class="gads-status gads-status-${cls}"><span class="gads-status-dot"></span>${esc(status)}</span>`;
}

function roasClass(roas) {
  if (roas >= 4) return "gads-roas-good";
  if (roas > 0 && roas < 1) return "gads-roas-bad";
  return "";
}

function campaignTable(rows, onClick) {
  if (!rows.length) return `<div class="gads-empty">No campaigns found</div>`;
  return `<div class="gads-table-wrap"><table class="gads-table"><thead><tr>
    <th>Campaign</th><th>Type</th><th>Status</th><th>Asset groups</th>
    <th>Impr.</th><th>Clicks</th><th>Cost</th><th>Conv.</th><th>Conv. value</th><th>ROAS</th>
  </tr></thead><tbody>${rows.map((c) => `<tr class="clickable" data-id="${esc(c.campaignId)}">
    <td><a class="gads-link" data-campaign="${esc(c.campaignId)}">${esc(c.name)}</a></td>
    <td><span class="gads-type-pill">${esc(c.typeLabel || c.type)}</span></td>
    <td>${statusBadge(c.status)}</td>
    <td>${c.assetGroupCount ?? "—"}</td>
    <td>${Number(c.impressions).toLocaleString()}</td>
    <td>${Number(c.clicks).toLocaleString()}</td>
    <td>${esc(c.spendFormatted)}</td>
    <td>${Number(c.conversions).toFixed(1)}</td>
    <td>${esc(c.revenueFormatted)}</td>
    <td class="${roasClass(c.roas)}">${c.roas ?? 0}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function productTable(rows) {
  if (!rows.length) return `<div class="gads-empty">No products in this view</div>`;
  return `<div class="gads-table-wrap"><table class="gads-table"><thead><tr>
    <th>Product</th><th>Item ID</th><th>Status</th><th>Asset group</th>
    <th>Impr.</th><th>Clicks</th><th>Cost</th><th>Conv.</th><th>Revenue</th><th>ROAS</th>
  </tr></thead><tbody>${rows.map((p) => `<tr class="clickable" data-product="${esc(p.productId)}">
    <td><a class="gads-link" data-product="${esc(p.productId)}">${esc(p.title)}</a></td>
    <td><code>${esc(p.itemId)}</code></td>
    <td>${statusBadge(p.status)}</td>
    <td>${esc(p.assetGroupId || "—")}</td>
    <td>${Number(p.impressions).toLocaleString()}</td>
    <td>${Number(p.clicks).toLocaleString()}</td>
    <td>${esc(p.spendFormatted)}</td>
    <td>${Number(p.conversions).toFixed(1)}</td>
    <td>${esc(p.revenueFormatted)}</td>
    <td class="${roasClass(p.roas)}">${p.roas}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function changeList(changes) {
  if (!changes.length) return `<div class="gads-empty">No changes recorded yet. When FeedGraph executes actions (pause, move product, labels), they appear here.</div>`;
  return changes.map((c) => `<div class="gads-change-item">
    <div class="gads-change-meta">
      <span class="gads-change-action">${esc(c.actionLabel)}</span>
      <span>${new Date(c.timestamp).toLocaleString()}</span>
      <span>by ${esc(c.user)}</span>
      <span>${esc(c.resourceType)} / ${esc(c.resourceId)}</span>
    </div>
    <div class="gads-change-summary">${esc(c.summary)}</div>
    <div class="gads-diff">
      <div><strong>Before</strong><pre>${esc(JSON.stringify(c.previous, null, 2))}</pre></div>
      <div><strong>After</strong><pre>${esc(JSON.stringify(c.next, null, 2))}</pre></div>
    </div>
  </div>`).join("");
}

async function renderOverview() {
  const data = await fetchJson(`${API}/overview`);
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">Overview</h1>
    <p class="gads-page-sub">${esc(cfg.customerName)} · ${esc(cfg.dateRangeLabel)} · Sandbox account</p>
    <div class="gads-kpi-row">
      <div class="gads-kpi"><div class="gads-kpi-label">Cost</div><div class="gads-kpi-value">${esc(data.totals.spendFormatted)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Conv. value</div><div class="gads-kpi-value">${esc(data.totals.revenueFormatted)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">ROAS</div><div class="gads-kpi-value ${roasClass(data.totals.roas)}">${data.totals.roas}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Conversions</div><div class="gads-kpi-value">${data.totals.conversions.toFixed(0)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Clicks</div><div class="gads-kpi-value">${data.totals.clicks.toLocaleString()}</div></div>
    </div>
    <div class="gads-kpi-row">
      <div class="gads-kpi"><div class="gads-kpi-label">PMAX campaigns</div><div class="gads-kpi-value">${data.counts.pmaxCampaigns}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Shopping campaigns</div><div class="gads-kpi-value">${data.counts.shoppingCampaigns}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Asset groups</div><div class="gads-kpi-value">${data.counts.assetGroups}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Products in PMAX</div><div class="gads-kpi-value">${data.counts.productsInPmax.toLocaleString()}</div></div>
    </div>
    <div class="gads-card">
      <div class="gads-card-header"><h3>Recent changes (FeedGraph verification)</h3><button class="gads-btn" data-view="changes">View all</button></div>
      ${changeList(data.recentChanges)}
    </div>`;
  bindNavButtons();
}

async function renderCampaigns(type) {
  const q = type ? `?type=${type}` : "";
  const data = await fetchJson(`${API}/campaigns${q}`);
  const title = type === "PMAX" ? "Performance Max campaigns" : "Campaigns";
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">${title}</h1>
    <p class="gads-page-sub">Click a campaign to see asset groups, products, and performance — verify FeedGraph PMAX changes here.</p>
    ${campaignTable(data.campaigns)}`;
  bindCampaignClicks();
}

async function renderAssetGroups(campaignId) {
  const q = campaignId ? `?campaignId=${campaignId}` : "";
  const data = await fetchJson(`${API}/asset-groups${q}`);
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">Asset groups</h1>
    <p class="gads-page-sub">Listing groups and product sets inside PMAX campaigns</p>
    <div class="gads-table-wrap"><table class="gads-table"><thead><tr>
      <th>Asset group</th><th>Campaign</th><th>Status</th><th>Products</th>
      <th>Cost</th><th>Conv. value</th><th>ROAS</th>
    </tr></thead><tbody>${data.assetGroups.map((ag) => `<tr class="clickable" data-ag="${esc(ag.assetGroupId)}">
      <td><a class="gads-link" data-ag="${esc(ag.assetGroupId)}">${esc(ag.name)}</a></td>
      <td>${esc(ag.campaignName)}</td>
      <td>${statusBadge(ag.status)}</td>
      <td>${ag.productCount}</td>
      <td>${esc(ag.spendFormatted)}</td>
      <td>${esc(ag.revenueFormatted)}</td>
      <td class="${roasClass(ag.roas)}">${ag.roas}</td>
    </tr>`).join("")}</tbody></table></div>`;
  bindAssetGroupClicks();
}

async function renderProducts(filters = {}) {
  const params = new URLSearchParams(filters);
  const data = await fetchJson(`${API}/products?${params}`);
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">Products</h1>
    <p class="gads-page-sub">Product-level performance — verify products moved into PMAX asset groups</p>
    <div class="gads-toolbar">
      <input class="gads-input" id="productSearch" placeholder="Search title or item ID" value="${esc(filters.q || "")}" />
      <select class="gads-select" id="tierFilter">
        <option value="">All tiers</option>
        <option value="high" ${filters.tier === "high" ? "selected" : ""}>High performers</option>
        <option value="wasted" ${filters.tier === "wasted" ? "selected" : ""}>Wasted spend</option>
        <option value="none" ${filters.tier === "none" ? "selected" : ""}>No conversion</option>
        <option value="low" ${filters.tier === "low" ? "selected" : ""}>Low performers</option>
      </select>
      <button class="gads-btn gads-btn-primary" id="applyProductFilter">Apply</button>
      <span class="gads-page-sub">${data.total.toLocaleString()} products</span>
    </div>
    ${productTable(data.products)}`;
  document.getElementById("applyProductFilter")?.addEventListener("click", () => {
    renderProducts({
      q: document.getElementById("productSearch").value,
      tier: document.getElementById("tierFilter").value,
      limit: 100,
    });
  });
  bindProductClicks();
}

async function renderChanges() {
  const data = await fetchJson(`${API}/changes?limit=50`);
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">Change history</h1>
    <p class="gads-page-sub">Every FeedGraph execution is logged — use this to verify pause, move, label, and campaign actions</p>
    <div class="gads-card">${changeList(data.changes)}</div>`;
}

async function renderApiVerify() {
  document.getElementById("mainContent").innerHTML = `
    <h1 class="gads-page-title">API verification</h1>
    <p class="gads-page-sub">Same GAQL queries FeedGraph uses — confirms UI matches API data</p>
    <div class="gads-toolbar">
      <button class="gads-btn gads-btn-primary" id="runGaqlCampaigns">Run campaign query</button>
      <button class="gads-btn" id="runGaqlShopping">Run shopping performance query</button>
      <button class="gads-btn" id="runGaqlAssetGroups">Run asset group query</button>
    </div>
    <div class="gads-card"><div class="gads-card-header"><h3>GAQL response</h3><span id="gaqlMeta"></span></div>
    <div class="gads-api-box" id="gaqlOutput">Click a button to run a query…</div></div>`;

  const queries = {
    runGaqlCampaigns: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 10`,
    runGaqlShopping: `SELECT campaign.id, campaign.name, segments.product_item_id, segments.product_title, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 10`,
    runGaqlAssetGroups: `SELECT asset_group.id, asset_group.name, asset_group.status, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 10`,
  };

  for (const [id, query] of Object.entries(queries)) {
    document.getElementById(id)?.addEventListener("click", async () => {
      document.getElementById("gaqlOutput").textContent = "Running…";
      const { status, data, requestId } = await gaqlSearch(query);
      document.getElementById("gaqlMeta").textContent = `HTTP ${status} · request-id: ${requestId || "—"}`;
      document.getElementById("gaqlOutput").textContent = JSON.stringify(data, null, 2);
    });
  }
}

async function openCampaignDrawer(id) {
  const data = await fetchJson(`${API}/campaigns/${id}`);
  document.getElementById("drawerTitle").textContent = data.campaign.name;
  document.getElementById("drawerBody").innerHTML = `
    <div class="gads-breadcrumb">Campaigns › ${esc(data.campaign.name)}</div>
    <div class="gads-kpi-row">
      <div class="gads-kpi"><div class="gads-kpi-label">Type</div><div class="gads-kpi-value" style="font-size:14px">${esc(data.campaign.typeLabel)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Status</div><div>${statusBadge(data.campaign.status)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">ROAS</div><div class="gads-kpi-value ${roasClass(data.campaign.roas)}">${data.campaign.roas.toFixed(2)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Products</div><div class="gads-kpi-value">${data.productCount}</div></div>
    </div>
    <h3 style="margin:16px 0 8px">Asset groups</h3>
    <div class="gads-table-wrap"><table class="gads-table"><thead><tr>
      <th>Name</th><th>Status</th><th>Products</th><th>Cost</th><th>ROAS</th>
    </tr></thead><tbody>${data.assetGroups.map((ag) => `<tr class="clickable" data-ag="${esc(ag.assetGroupId)}">
      <td><a class="gads-link" data-ag="${esc(ag.assetGroupId)}">${esc(ag.name)}</a></td>
      <td>${statusBadge(ag.status)}</td>
      <td>${ag.productCount}</td>
      <td>${esc(ag.spendFormatted)}</td>
      <td class="${roasClass(ag.roas)}">${ag.roas}</td>
    </tr>`).join("")}</tbody></table></div>
    <h3 style="margin:20px 0 8px">Top products in campaign</h3>
    ${productTable(data.topProducts)}`;
  showDrawer();
  bindAssetGroupClicks();
  bindProductClicks();
}

async function openAssetGroupDrawer(id) {
  const data = await fetchJson(`${API}/asset-groups/${id}`);
  document.getElementById("drawerTitle").textContent = data.assetGroup.name;
  document.getElementById("drawerBody").innerHTML = `
    <div class="gads-breadcrumb">${esc(data.assetGroup.campaignName)} › ${esc(data.assetGroup.name)}</div>
    <p style="margin-bottom:12px">${statusBadge(data.assetGroup.status)} · ROAS <strong class="${roasClass(data.assetGroup.roas)}">${data.assetGroup.roas.toFixed(2)}</strong></p>
    <h3 style="margin-bottom:8px">Products in this asset group (${data.products.length})</h3>
    <p class="gads-page-sub">After FeedGraph moves products to PMAX, verify they appear here with performance metrics.</p>
    ${productTable(data.products)}
    <h3 style="margin:20px 0 8px">Related changes</h3>
    ${changeList(data.recentChanges)}`;
  showDrawer();
  bindProductClicks();
}

async function openProductDrawer(id) {
  const data = await fetchJson(`${API}/products/${id}`);
  document.getElementById("drawerTitle").textContent = data.product.title;
  document.getElementById("drawerBody").innerHTML = `
    <p><code>${esc(data.product.itemId)}</code></p>
    <div class="gads-kpi-row">
      <div class="gads-kpi"><div class="gads-kpi-label">Cost</div><div>${esc(data.product.spendFormatted)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">Revenue</div><div>${esc(data.product.revenueFormatted)}</div></div>
      <div class="gads-kpi"><div class="gads-kpi-label">ROAS</div><div class="${roasClass(data.product.roas)}">${data.product.roas}</div></div>
    </div>
    <p><strong>Campaign:</strong> ${data.campaign ? esc(data.campaign.name) : "—"}</p>
    <p><strong>Asset group:</strong> ${data.assetGroup ? esc(data.assetGroup.name) : "—"}</p>
    <p><strong>Status:</strong> ${statusBadge(data.product.status)}</p>
    <p><strong>Inventory:</strong> ${data.product.inventoryCount}</p>
    <h3 style="margin:16px 0 8px">Variants</h3>
    <div class="gads-table-wrap"><table class="gads-table"><thead><tr><th>Size</th><th>SKU</th><th>Inventory</th><th>Availability</th></tr></thead>
    <tbody>${data.variants.map((v) => `<tr><td>${esc(v.size)}</td><td>${esc(v.sku)}</td><td>${v.inventory}</td><td>${esc(v.availability)}</td></tr>`).join("")}</tbody></table></div>
    <h3 style="margin:16px 0 8px">Change history for this product</h3>
    ${changeList(data.changes)}`;
  showDrawer();
}

function showDrawer() {
  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("drawerBackdrop").classList.remove("hidden");
}

function hideDrawer() {
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("drawerBackdrop").classList.add("hidden");
}

function bindCampaignClicks() {
  document.querySelectorAll("[data-campaign]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openCampaignDrawer(el.dataset.campaign);
    });
  });
}

function bindAssetGroupClicks() {
  document.querySelectorAll("[data-ag]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openAssetGroupDrawer(el.dataset.ag);
    });
  });
}

function bindProductClicks() {
  document.querySelectorAll("[data-product]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openProductDrawer(el.dataset.product);
    });
  });
}

function bindNavButtons() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    if (btn.classList.contains("gads-nav-item")) return;
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });
}

const views = {
  overview: () => renderOverview(),
  campaigns: () => renderCampaigns(),
  pmax: () => renderCampaigns("PMAX"),
  "asset-groups": () => renderAssetGroups(),
  products: () => renderProducts({ limit: 100 }),
  changes: () => renderChanges(),
  "api-verify": () => renderApiVerify(),
};

async function navigate(view) {
  document.querySelectorAll(".gads-nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === view);
  });
  document.getElementById("mainContent").innerHTML = `<div class="gads-loading">Loading…</div>`;
  try {
    await views[view]?.();
  } catch (err) {
    document.getElementById("mainContent").innerHTML = `<div class="gads-empty">Error: ${esc(err.message)}</div>`;
  }
}

async function init() {
  cfg = await fetchJson(`${API}/config`);
  document.getElementById("accountChip").textContent = `${cfg.customerName} (${cfg.customerId})`;
  document.getElementById("dateRange").textContent = cfg.dateRangeLabel;

  document.querySelectorAll(".gads-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });

  document.getElementById("drawerClose").addEventListener("click", hideDrawer);
  document.getElementById("drawerBackdrop").addEventListener("click", hideDrawer);

  await navigate("overview");
}

init();
