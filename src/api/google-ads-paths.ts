/**
 * Official Google Ads API v24 REST paths.
 * @see https://developers.google.com/google-ads/api/reference/rpc/v24/overview
 * @see https://developers.google.com/google-ads/api/rest/common/search
 * @see https://developers.google.com/google-ads/api/rest/common/mutate
 */

export const GOOGLE_ADS_API_PATHS = {
  /** GoogleAdsService.Search */
  search: "POST /{version}/customers/{customerId}/googleAds:search",
  /** GoogleAdsService.SearchStream */
  searchStream: "POST /{version}/customers/{customerId}/googleAds:searchStream",
  /** GoogleAdsService.Mutate (atomic multi-resource) */
  googleAdsMutate: "POST /{version}/customers/{customerId}/googleAds:mutate",
  /** CustomerService.ListAccessibleCustomers */
  listAccessibleCustomers: "GET /{version}/customers:listAccessibleCustomers",
  /** CampaignService.Mutate */
  campaignsMutate: "POST /{version}/customers/{customerId}/campaigns:mutate",
  /** AssetGroupService.Mutate */
  assetGroupsMutate: "POST /{version}/customers/{customerId}/assetGroups:mutate",
} as const;

export const GOOGLE_ADS_DOC_LINKS = {
  overview: "https://developers.google.com/google-ads/api/reference/rpc/v24/overview",
  search: "https://developers.google.com/google-ads/api/rest/common/search",
  mutate: "https://developers.google.com/google-ads/api/rest/common/mutate",
  listAccounts: "https://developers.google.com/google-ads/api/docs/account-management/listing-accounts",
  auth: "https://developers.google.com/google-ads/api/rest/auth",
  jsonMappings: "https://developers.google.com/google-ads/api/rest/design/json-mappings",
} as const;

/** Strip hyphens/spaces — Google API customer IDs are numeric only. */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
