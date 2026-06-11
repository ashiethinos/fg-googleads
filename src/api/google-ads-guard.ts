import { config } from "../config.js";
import { getCustomer } from "../db/store.js";
import { authorizationError } from "./google-errors.js";
import { normalizeCustomerId } from "./google-ads-paths.js";

/** Google rejects requests for customer IDs the credential cannot access. */
export function assertCustomerAccess(customerId: string): void {
  const normalized = normalizeCustomerId(customerId);
  const customer = getCustomer(normalized);
  if (!customer || normalized !== config.customerId) {
    throw authorizationError(normalized);
  }
}
