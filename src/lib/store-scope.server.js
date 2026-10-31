// Store scope for the signed-in user. REQUIRED in every backend function that reads
// SalesTransaction, InventorySnapshot, forecasts or recommendations.
//
// Why: server-side entity queries cannot be trusted to apply the row-level rules for
// store managers (the dashboard once counted every store's rows for a STORE_EU manager),
// so each query must merge this filter explicitly:
//   entities.SalesTransaction.count({ ...storeScope(context.user), is_quarantined: true })
//
// Returns a query fragment:
//   anonymous demo visitor            -> {}                      (all stores, read-only)
//   owner / analyst / viewer          -> {}                      (all stores)
//   store_manager with a store        -> { store_id: "<store>" } (own store only)
//   store_manager without a store     -> NO_ACCESS               (matches nothing)
//   no role / unknown role            -> NO_ACCESS               (matches nothing)
const NO_ACCESS = { store_id: "__no_access__" };
const ALL_STORES_ROLES = ["owner", "analyst", "viewer"];

export function storeScope(user) {
  // No session at all means the public demo: read everything, and every write path
  // is refused separately by its own role check and by the entity's write rules.
  if (!user) return {};
  const role = user?.app_role || user?.data?.app_role;
  if (ALL_STORES_ROLES.includes(role)) return {};
  if (role === "store_manager") {
    const storeId = user?.store_id || user?.data?.store_id;
    return storeId ? { store_id: storeId } : NO_ACCESS;
  }
  return NO_ACCESS;
}