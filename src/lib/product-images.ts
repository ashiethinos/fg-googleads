import { config } from "../config.js";

/** All verified Unsplash apparel IDs (HTTP 200). Shared pool for maximum variety. */
const ALL_VERIFIED_PHOTO_IDS: readonly string[] = [
  "1556821840-3a63f95609a7",
  "1620799140408-edc6dcb6d633",
  "1562157873-818bc0726f68",
  "1521572163474-6864f9cf17ab",
  "1583743814966-8936f5b7be1a",
  "1523381210434-271e8be1f52b",
  "1542272604-787c3835535d",
  "1541099649105-f69ad21f3246",
  "1553062407-98eeb64c6a62",
  "1551028719-00167b16eac5",
  "1591047139829-d91aecb6caea",
  "1594938298603-c8148c4dae35",
  "1595777457583-95e059d581b8",
  "1515372039744-b8f02a3ae446",
  "1490481651871-ab68de25d43d",
  "1602810318383-e386cc2a3ccf",
  "1596755094514-f87e34085b2c",
  "1489987707025-afc232f7ea0f",
  "1591195853828-11db59a44f6b",
  "1556906781-9a412961c28c",
  "1571019614242-c5c5dee9f50b",
  "1434389677669-e08b4cac3105",
  "1576566588028-4147f3842f27",
  "1518611012118-696072aa579a",
  "1507679799987-c73779587ccf",
  "1506629082955-511b1aa562c8",
  "1503341504253-dff4815485f1",
] as const;

/** Flickr tags verified HTTP 200 — used only when Unsplash fails. */
const SUBCATEGORY_FLICKR_TAGS: Record<string, string> = {
  Hoodies: "hoodie,wear",
  "T-Shirts": "shirt,clothes",
  Jeans: "denim,jeans",
  Jackets: "jacket,coat",
  Dresses: "dress,fashion",
  Shirts: "shirt,clothes",
  Shorts: "shorts,sport",
  Skirts: "dress,fashion",
  Sweaters: "apparel,style",
  Activewear: "activewear,gym",
  Blazers: "blazer,suit",
  Leggings: "leggings,gym",
};

const DEFAULT_SUBCATEGORY = "T-Shirts";

export type SandboxProductImageInput = {
  id: string;
  subcategory?: string | null;
  title?: string | null;
};

function stableIndex(key: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

function inferSubcategoryFromTitle(title: string | null | undefined): string | undefined {
  if (!title?.trim()) return undefined;
  const lower = title.toLowerCase();
  for (const subcategory of Object.keys(SUBCATEGORY_FLICKR_TAGS)) {
    const singular = subcategory.replace(/s$/, "").toLowerCase();
    if (lower.includes(singular)) return subcategory;
  }
  return undefined;
}

export function resolveProductSubcategory(input: SandboxProductImageInput): string {
  const fromField = input.subcategory?.trim();
  if (fromField && SUBCATEGORY_FLICKR_TAGS[fromField]) return fromField;
  const fromTitle = inferSubcategoryFromTitle(input.title);
  if (fromTitle) return fromTitle;
  return DEFAULT_SUBCATEGORY;
}

function rotatedPhotoPool(subcategory: string): readonly string[] {
  const offset = stableIndex(subcategory, ALL_VERIFIED_PHOTO_IDS.length);
  return [
    ...ALL_VERIFIED_PHOTO_IDS.slice(offset),
    ...ALL_VERIFIED_PHOTO_IDS.slice(0, offset),
  ];
}

function pickPhotoId(input: SandboxProductImageInput, subcategory: string): string {
  const pool = rotatedPhotoPool(subcategory);
  const idx = stableIndex(`${input.id}|${input.title || ""}|${subcategory}`, pool.length);
  return pool[idx]!;
}

function cropQuery(size: number, input: SandboxProductImageInput): string {
  const dim = Math.max(40, Math.min(800, size));
  const variants = [
    `w=${dim}&h=${dim}&fit=crop`,
    `w=${dim}&h=${Math.round(dim * 0.82)}&fit=crop`,
    `w=${Math.round(dim * 0.82)}&h=${dim}&fit=crop`,
    `w=${dim}&h=${dim}&fit=crop&crop=entropy`,
    `w=${Math.round(dim * 1.12)}&h=${dim}&fit=crop`,
    `w=${dim}&h=${Math.round(dim * 1.12)}&fit=crop`,
  ];
  const cropIdx = stableIndex(`${input.title || ""}|${input.id}|crop`, variants.length);
  return variants[cropIdx]!;
}

/** Per-product Flickr URL (unique lock) — category-tagged. */
export function getLoremflickrPhotoUrl(input: SandboxProductImageInput, size = 80): string | null {
  const subcategory = resolveProductSubcategory(input);
  const tags = SUBCATEGORY_FLICKR_TAGS[subcategory];
  if (!tags) return null;
  const dim = Math.max(40, Math.min(800, size));
  const lock = stableIndex(`${input.id}|${input.title || ""}`, 2_000_000) + 1;
  return `https://loremflickr.com/${dim}/${dim}/${tags}?lock=${lock}`;
}

/** Verified Unsplash URL — 27 photos × 6 crop variants ≈ 162 distinct thumbnails. */
export function getVerifiedUnsplashPhotoUrl(input: SandboxProductImageInput, size = 80): string {
  const subcategory = resolveProductSubcategory(input);
  const photoId = pickPhotoId(input, subcategory);
  const crop = cropQuery(size, input);
  return `https://images.unsplash.com/photo-${photoId}?ixlib=rb-4.0.3&auto=format&${crop}&q=80`;
}

/** Upstream URLs: Unsplash first (fast), Flickr fallback (unique per product). */
export function getCatalogImageUpstreamUrls(input: SandboxProductImageInput, size = 80): string[] {
  const urls: string[] = [getVerifiedUnsplashPhotoUrl(input, size)];
  const flickr = getLoremflickrPhotoUrl(input, size);
  if (flickr) urls.push(flickr);
  return urls;
}

/** Same-origin proxy — never 404 in the UI (SVG fallback server-side). */
export function sandboxProductImageUrl(
  product: string | SandboxProductImageInput,
  size = 80,
): string {
  const input: SandboxProductImageInput =
    typeof product === "string" ? { id: product } : product;
  const subcategory = resolveProductSubcategory(input);
  const dim = Math.max(40, Math.min(800, size));
  const params = new URLSearchParams({
    subcategory,
    id: input.id,
    size: String(dim),
    v: "3",
  });
  if (input.title?.trim()) params.set("title", input.title.trim());
  return `http://localhost:${config.port}/_dev/catalog-image?${params}`;
}

export function catalogImageSvgPlaceholder(subcategory: string, size: number): string {
  const dim = Math.max(40, Math.min(800, size));
  const label = subcategory.replace(/s$/, "").slice(0, 12);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">
  <rect width="100%" height="100%" fill="#e8eaed"/>
  <rect x="${dim * 0.12}" y="${dim * 0.12}" width="${dim * 0.76}" height="${dim * 0.76}" rx="${dim * 0.08}" fill="#f8f9fa" stroke="#dadce0"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#5f6368" font-family="system-ui,sans-serif" font-size="${Math.max(10, dim * 0.11)}">${esc(label)}</text>
</svg>`;
}

/** Stored URLs that should be re-resolved through the catalog image proxy. */
export function isLegacySandboxImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.includes("picsum.photos") ||
    u.includes("images.unsplash.com") ||
    u.includes("loremflickr.com") ||
    u.includes("sandbox.feedgraph.local") ||
    u.includes("/_dev/catalog-image")
  );
}
