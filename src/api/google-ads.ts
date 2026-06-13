import { Router, type Request, type Response, type NextFunction } from "express";
import { config } from "../config.js";
import { executeGaqlSearch } from "../gaql/executor.js";
import {
  createAssetGroup,
  createCampaign,
  createListingGroup,
  getAssetGroup,
  getCampaign,
  getListingGroup,
  removeListingGroup,
  updateAssetGroupStatus,
  updateCampaignStatus,
  writeAuditLog,
} from "../db/store.js";
import { googleAdsPageSize, paginateResults } from "../gaql/pagination.js";
import { sandboxAuth } from "./middleware.js";
import { GoogleAdsApiError, handleGoogleAdsError, mutateResourceNotFound, sendGoogleAdsFailure } from "./google-errors.js";
import { faultInjectionMiddleware } from "./fault-injection.js";
import { assertCustomerAccess } from "./google-ads-guard.js";
import { GOOGLE_ADS_API_PATHS, newRequestId, normalizeCustomerId } from "./google-ads-paths.js";

type MutateOperation = Record<string, unknown>;

const RE_SEARCH = /^\/(v\d+)\/customers\/([\d-]+)\/googleAds:search$/;
const RE_SEARCH_STREAM = /^\/(v\d+)\/customers\/([\d-]+)\/googleAds:searchStream$/;
const RE_MUTATE = /^\/(v\d+)\/customers\/([\d-]+)\/googleAds:mutate$/;
const RE_CAMPAIGNS_MUTATE = /^\/(v\d+)\/customers\/([\d-]+)\/campaigns:mutate$/;
const RE_ASSET_GROUPS_MUTATE = /^\/(v\d+)\/customers\/([\d-]+)\/assetGroups:mutate$/;
const RE_LIST_CUSTOMERS = /^\/(v\d+)\/customers:listAccessibleCustomers$/;

export const googleAdsRouter = Router();

googleAdsRouter.use(attachRequestId);
googleAdsRouter.use(stripSandboxHeaders);
googleAdsRouter.use(faultInjectionMiddleware);

googleAdsRouter.post(RE_SEARCH, sandboxAuth, handleSearch);
googleAdsRouter.post(RE_SEARCH_STREAM, sandboxAuth, handleSearchStream);
googleAdsRouter.post(RE_MUTATE, sandboxAuth, handleGoogleAdsMutate);
googleAdsRouter.post(RE_CAMPAIGNS_MUTATE, sandboxAuth, handleCampaignsMutate);
googleAdsRouter.post(RE_ASSET_GROUPS_MUTATE, sandboxAuth, handleAssetGroupsMutate);
googleAdsRouter.get(RE_LIST_CUSTOMERS, sandboxAuth, handleListAccessibleCustomers);

function attachRequestId(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("request-id", newRequestId());
  next();
}

/** Google API responses do not include Express/framework headers. */
function stripSandboxHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.removeHeader("X-Powered-By");
  next();
}

function parseCustomerFromPath(req: Request): string {
  const match =
    req.path.match(RE_SEARCH) ||
    req.path.match(RE_SEARCH_STREAM) ||
    req.path.match(RE_MUTATE) ||
    req.path.match(RE_CAMPAIGNS_MUTATE) ||
    req.path.match(RE_ASSET_GROUPS_MUTATE);
  if (match) return normalizeCustomerId(match[2]);
  return config.customerId;
}

function handleSearch(req: Request, res: Response): void {
  try {
    const customerId = parseCustomerFromPath(req);
    assertCustomerAccess(customerId);

    const body = req.body as {
      query?: string;
      pageToken?: string;
      validateOnly?: boolean;
      pageSize?: number;
    };

    if (!body.query || typeof body.query !== "string") {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        { errorCode: { requestError: "REQUIRED_FIELD_MISSING" }, message: "Required field is missing: query" },
      ]);
    }

    if (body.pageSize != null) {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        {
          errorCode: { requestError: "PAGE_SIZE_NOT_SUPPORTED" },
          message: "Setting the page size is not supported.",
        },
      ]);
    }

    if (body.validateOnly) {
      executeGaqlSearch(customerId, body.query);
      res.json({ results: [], fieldMask: "" });
      return;
    }

    const { results, totalResultsCount, fieldMask } = executeGaqlSearch(customerId, body.query);
    const { page, nextPageToken } = paginateResults(results, body.pageToken);

    const response: Record<string, unknown> = {
      results: page,
      fieldMask,
      totalResultsCount: String(totalResultsCount),
    };
    if (nextPageToken) response.nextPageToken = nextPageToken;

    res.json(response);
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

function handleSearchStream(req: Request, res: Response): void {
  try {
    const customerId = parseCustomerFromPath(req);
    assertCustomerAccess(customerId);

    const body = req.body as { query?: string; validateOnly?: boolean };

    if (!body.query || typeof body.query !== "string") {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        { errorCode: { requestError: "REQUIRED_FIELD_MISSING" }, message: "Required field is missing: query" },
      ]);
    }

    if (body.validateOnly) {
      res.json([]);
      return;
    }

    const { results, fieldMask } = executeGaqlSearch(customerId, body.query);
    const pageSize = googleAdsPageSize();
    const chunks: Array<{ results: unknown[]; fieldMask: string }> = [];

    for (let offset = 0; offset < results.length; offset += pageSize) {
      chunks.push({ results: results.slice(offset, offset + pageSize), fieldMask });
    }
    if (chunks.length === 0) chunks.push({ results: [], fieldMask });

    res.json(chunks);
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

function handleGoogleAdsMutate(req: Request, res: Response): void {
  try {
    const customerId = parseCustomerFromPath(req);
    assertCustomerAccess(customerId);

    const body = req.body as {
      mutateOperations?: MutateOperation[];
      partialFailure?: boolean;
      validateOnly?: boolean;
    };

    if (!Array.isArray(body.mutateOperations) || body.mutateOperations.length === 0) {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        { errorCode: { requestError: "REQUIRED_FIELD_MISSING" }, message: "Required field is missing: mutate_operations" },
      ]);
    }

    if (body.validateOnly) {
      for (const op of body.mutateOperations) validateMutateOperation(customerId, op);
      res.json({ mutateOperationResponses: [] });
      return;
    }

    const user = String(req.headers["x-sandbox-user"] || "feedgraph");
    const responses = runMutateBatch(customerId, body.mutateOperations, user, !!body.partialFailure);
    res.json({ mutateOperationResponses: responses });
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

function handleCampaignsMutate(req: Request, res: Response): void {
  try {
    const customerId = parseCustomerFromPath(req);
    assertCustomerAccess(customerId);

    const body = req.body as { operations?: Array<Record<string, unknown>>; validateOnly?: boolean; partialFailure?: boolean };
    if (!Array.isArray(body.operations) || body.operations.length === 0) {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        { errorCode: { requestError: "REQUIRED_FIELD_MISSING" }, message: "Required field is missing: operations" },
      ]);
    }

    const wrapped = body.operations.map((op) => ({ campaignOperation: op }));
    if (body.validateOnly) {
      for (const op of wrapped) validateMutateOperation(customerId, op);
      res.json({ results: [] });
      return;
    }

    const user = String(req.headers["x-sandbox-user"] || "feedgraph");
    const responses = runMutateBatch(customerId, wrapped, user, !!body.partialFailure);
    res.json({
      results: responses.map((r) => ({
        resourceName: (r.campaignResult as { resourceName?: string })?.resourceName,
      })),
    });
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

function handleAssetGroupsMutate(req: Request, res: Response): void {
  try {
    const customerId = parseCustomerFromPath(req);
    assertCustomerAccess(customerId);

    const body = req.body as { operations?: Array<Record<string, unknown>>; validateOnly?: boolean; partialFailure?: boolean };
    if (!Array.isArray(body.operations) || body.operations.length === 0) {
      throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
        { errorCode: { requestError: "REQUIRED_FIELD_MISSING" }, message: "Required field is missing: operations" },
      ]);
    }

    const wrapped = body.operations.map((op) => ({ assetGroupOperation: op }));
    if (body.validateOnly) {
      for (const op of wrapped) validateMutateOperation(customerId, op);
      res.json({ results: [] });
      return;
    }

    const user = String(req.headers["x-sandbox-user"] || "feedgraph");
    const responses = runMutateBatch(customerId, wrapped, user, !!body.partialFailure);
    res.json({
      results: responses.map((r) => ({
        resourceName: (r.assetGroupResult as { resourceName?: string })?.resourceName,
      })),
    });
  } catch (err) {
    handleGoogleAdsError(res, err);
  }
}

function handleListAccessibleCustomers(_req: Request, res: Response): void {
  res.json({ resourceNames: [`customers/${config.customerId}`] });
}

/** Atomic batch — all operations succeed or none are applied (unless partialFailure). */
function runMutateBatch(
  customerId: string,
  operations: MutateOperation[],
  user: string,
  partialFailure: boolean,
): Array<Record<string, unknown>> {
  for (const op of operations) validateMutateOperation(customerId, op);

  const responses: Array<Record<string, unknown>> = [];
  for (const op of operations) {
    try {
      responses.push(applyMutateOperation(customerId, op, user));
    } catch (err) {
      if (!partialFailure) throw err;
      responses.push({});
    }
  }
  return responses;
}

function validateMutateOperation(customerId: string, op: MutateOperation): void {
  if (op.campaignOperation) {
    validateCampaignOperation(customerId, op.campaignOperation as Record<string, unknown>);
    return;
  }
  if (op.assetGroupOperation) {
    validateAssetGroupOperation(customerId, op.assetGroupOperation as Record<string, unknown>);
    return;
  }
  if (op.assetGroupListingGroupFilterOperation) {
    validateListingGroupFilterOperation(customerId, op.assetGroupListingGroupFilterOperation as Record<string, unknown>);
    return;
  }
  throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    {
      errorCode: { mutateError: "OPERATION_NOT_SUPPORTED_FOR_CONTEXT" },
      message: `Unsupported mutate operation: ${Object.keys(op).join(", ")}`,
    },
  ]);
}

function validateCampaignOperation(customerId: string, operation: Record<string, unknown>): void {
  if (operation.update) {
    const update = operation.update as Record<string, unknown>;
    const resourceName = String(update.resourceName || "");
    const campaignId = resourceName.split("/").pop() || "";
    if (!getCampaign(campaignId)) throw mutateResourceNotFound("campaign", campaignId);
    if (!resourceName.startsWith(`customers/${customerId}/`)) throw mutateResourceNotFound("campaign", campaignId);
  }
}

function validateAssetGroupOperation(customerId: string, operation: Record<string, unknown>): void {
  if (operation.update) {
    const update = operation.update as Record<string, unknown>;
    const resourceName = String(update.resourceName || "");
    const assetGroupId = resourceName.split("/").pop() || "";
    if (!getAssetGroup(assetGroupId)) throw mutateResourceNotFound("assetGroup", assetGroupId);
    if (!resourceName.startsWith(`customers/${customerId}/`)) throw mutateResourceNotFound("assetGroup", assetGroupId);
  }
  if (operation.create) {
    const create = operation.create as Record<string, unknown>;
    const campaignResource = String(create.campaign || "");
    const campaignId = campaignResource.split("/").pop() || "";
    if (!getCampaign(campaignId)) throw mutateResourceNotFound("campaign", campaignId);
  }
}

function applyMutateOperation(customerId: string, op: MutateOperation, user: string): Record<string, unknown> {
  if (op.campaignOperation) return applyCampaignOperation(customerId, op.campaignOperation as Record<string, unknown>, user);
  if (op.assetGroupOperation) return applyAssetGroupOperation(customerId, op.assetGroupOperation as Record<string, unknown>, user);
  if (op.assetGroupListingGroupFilterOperation) return applyListingGroupFilterOperation(customerId, op.assetGroupListingGroupFilterOperation as Record<string, unknown>, user);
  throw new Error("unsupported");
}

function validateListingGroupFilterOperation(_customerId: string, operation: Record<string, unknown>): void {
  if (operation.create) {
    const create = operation.create as Record<string, unknown>;
    const assetGroupResource = String(create.assetGroup || "");
    const assetGroupId = assetGroupResource.split("/").pop() || "";
    if (!getAssetGroup(assetGroupId)) throw mutateResourceNotFound("assetGroup", assetGroupId);
    return;
  }
  if (operation.remove) {
    const resourceName = String(operation.remove);
    const id = resourceName.split("/").pop() || "";
    if (!getListingGroup(id)) throw mutateResourceNotFound("assetGroupListingGroupFilter", id);
    return;
  }
  throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    { errorCode: { mutateError: "OPERATION_NOT_SUPPORTED_FOR_CONTEXT" }, message: "assetGroupListingGroupFilterOperation requires create or remove" },
  ]);
}

function applyListingGroupFilterOperation(
  customerId: string,
  operation: Record<string, unknown>,
  user: string,
): Record<string, unknown> {
  if (operation.create) {
    const create = operation.create as Record<string, unknown>;
    const assetGroupResource = String(create.assetGroup || "");
    const assetGroupId = assetGroupResource.split("/").pop() || "";
    const caseValue = create.caseValue as Record<string, unknown> | undefined;
    const productType = (caseValue?.productType as Record<string, unknown> | undefined) ?? {};
    const dimension = String(productType.level || "ALL_PRODUCTS");
    const value = String(productType.value || "");
    const parentResource = String(create.parentListingGroupFilter || "");
    const parentId = parentResource.split("/").pop() || null;
    const type = (create.type as "UNIT" | "SUBDIVISION") || "UNIT";

    const lg = createListingGroup({ assetGroupId, type, dimension, value, parentId: parentId || null });
    writeAuditLog({
      action: "create_listing_group_filter",
      user,
      resourceType: "asset_group_listing_group_filter",
      resourceId: lg.id,
      previousState: "{}",
      newState: JSON.stringify(lg),
    });
    return {
      assetGroupListingGroupFilterResult: {
        resourceName: `customers/${customerId}/assetGroupListingGroupFilters/${lg.id}`,
      },
    };
  }

  if (operation.remove) {
    const resourceName = String(operation.remove);
    const id = resourceName.split("/").pop() || "";
    const existing = getListingGroup(id)!;
    removeListingGroup(id);
    writeAuditLog({
      action: "remove_listing_group_filter",
      user,
      resourceType: "asset_group_listing_group_filter",
      resourceId: id,
      previousState: JSON.stringify(existing),
      newState: "{}",
    });
    return { assetGroupListingGroupFilterResult: { resourceName } };
  }

  throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    { errorCode: { mutateError: "OPERATION_NOT_SUPPORTED_FOR_CONTEXT" }, message: "Unsupported assetGroupListingGroupFilter operation" },
  ]);
}

function applyCampaignOperation(
  customerId: string,
  operation: Record<string, unknown>,
  user: string,
): Record<string, unknown> {
  if (operation.create) {
    const create = operation.create as Record<string, unknown>;
    const campaign = createCampaign({
      customerId,
      name: String(create.name || "New Campaign"),
      channelType: (create.advertisingChannelType as "PERFORMANCE_MAX" | "SHOPPING") || "SHOPPING",
    });
    writeAuditLog({
      action: "create_campaign",
      user,
      resourceType: "campaign",
      resourceId: campaign.id,
      previousState: "{}",
      newState: JSON.stringify(campaign),
    });
    return { campaignResult: { resourceName: `customers/${customerId}/campaigns/${campaign.id}` } };
  }

  if (operation.update) {
    const update = operation.update as Record<string, unknown>;
    const resourceName = String(update.resourceName || "");
    const campaignId = resourceName.split("/").pop() || "";
    const prev = getCampaign(campaignId)!;
    const status = update.status as "PAUSED" | "ENABLED";
    const updated = updateCampaignStatus(campaignId, status);
    writeAuditLog({
      action: status === "PAUSED" ? "pause_campaign" : "enable_campaign",
      user,
      resourceType: "campaign",
      resourceId: campaignId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    });
    return { campaignResult: { resourceName: `customers/${customerId}/campaigns/${campaignId}` } };
  }

  throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    { errorCode: { mutateError: "OPERATION_NOT_SUPPORTED_FOR_CONTEXT" }, message: "Unsupported campaign operation" },
  ]);
}

function applyAssetGroupOperation(
  customerId: string,
  operation: Record<string, unknown>,
  user: string,
): Record<string, unknown> {
  if (operation.create) {
    const create = operation.create as Record<string, unknown>;
    const campaignResource = String(create.campaign || "");
    const campaignId = campaignResource.split("/").pop() || "";
    const ag = createAssetGroup({ customerId, campaignId, name: String(create.name || "New Asset Group") });
    writeAuditLog({
      action: "create_asset_group",
      user,
      resourceType: "asset_group",
      resourceId: ag.id,
      previousState: "{}",
      newState: JSON.stringify(ag),
    });
    return { assetGroupResult: { resourceName: `customers/${customerId}/assetGroups/${ag.id}` } };
  }

  if (operation.update) {
    const update = operation.update as Record<string, unknown>;
    const resourceName = String(update.resourceName || "");
    const assetGroupId = resourceName.split("/").pop() || "";
    const prev = getAssetGroup(assetGroupId)!;
    const status = update.status as "PAUSED" | "ENABLED";
    const updated = updateAssetGroupStatus(assetGroupId, status);
    writeAuditLog({
      action: status === "PAUSED" ? "pause_asset_group" : "enable_asset_group",
      user,
      resourceType: "asset_group",
      resourceId: assetGroupId,
      previousState: JSON.stringify({ status: prev.status }),
      newState: JSON.stringify({ status: updated?.status }),
    });
    return { assetGroupResult: { resourceName: `customers/${customerId}/assetGroups/${assetGroupId}` } };
  }

  throw new GoogleAdsApiError("INVALID_ARGUMENT", "Request contains an invalid argument.", [
    { errorCode: { mutateError: "OPERATION_NOT_SUPPORTED_FOR_CONTEXT" }, message: "Unsupported asset group operation" },
  ]);
}

export function googleNotFoundHandler(_req: Request, res: Response): void {
  sendGoogleAdsFailure(
    res,
    "NOT_FOUND",
    `Method not found.`,
    [{ errorCode: { requestError: "UNKNOWN" }, message: "The requested URL was not found on this server." }],
  );
}

export { GOOGLE_ADS_API_PATHS };
