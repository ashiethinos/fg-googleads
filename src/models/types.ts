export type CampaignStatus = "ENABLED" | "PAUSED" | "REMOVED";
export type AssetGroupStatus = "ENABLED" | "PAUSED" | "REMOVED";
export type ProductStatus = "ENABLED" | "PAUSED" | "EXCLUDED";
export type ChannelType = "PERFORMANCE_MAX" | "SHOPPING" | "SEARCH" | "DISPLAY";

export type Customer = {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  manager: boolean;
  testAccount: boolean;
};

export type Campaign = {
  id: string;
  customerId: string;
  name: string;
  status: CampaignStatus;
  advertisingChannelType: ChannelType;
  budgetMicros: number;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
};

export type AssetGroup = {
  id: string;
  customerId: string;
  campaignId: string;
  name: string;
  status: AssetGroupStatus;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
};

export type ListingGroup = {
  id: string;
  assetGroupId: string;
  type: "UNIT" | "SUBDIVISION";
  dimension: string;
  value: string;
  parentId: string | null;
};

export type ProductGroup = {
  id: string;
  campaignId: string;
  type: "UNIT" | "SUBDIVISION";
  dimension: string;
  value: string;
  parentId: string | null;
};

export type ProductVariant = {
  id: string;
  productId: string;
  size: string;
  sku: string;
  inventory: number;
  price: number;
  availability: "in_stock" | "out_of_stock" | "preorder";
};

export type Product = {
  id: string;
  customerId: string;
  itemId: string;
  title: string;
  description: string;
  brand: string;
  category: string;
  subcategory: string;
  price: number;
  salePrice: number | null;
  currency: string;
  imageLink: string;
  link: string;
  inventoryCount: number;
  availability: "in_stock" | "out_of_stock" | "preorder";
  status: ProductStatus;
  customLabel0: string | null;
  customLabel1: string | null;
  customLabel2: string | null;
  customLabel3: string | null;
  customLabel4: string | null;
  performanceTier: "high" | "medium" | "low" | "none" | "wasted";
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
  campaignId: string | null;
  assetGroupId: string | null;
};

export type Label = {
  id: string;
  customerId: string;
  name: string;
  color: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  user: string;
  resourceType: string;
  resourceId: string;
  previousState: string;
  newState: string;
  timestamp: string;
  metadata: string | null;
};

export type GaqlSearchResult = Record<string, unknown>;
