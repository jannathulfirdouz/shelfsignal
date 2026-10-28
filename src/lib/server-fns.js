import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";

const IMPORTABLE = [
  "Store",
  "Supplier",
  "Product",
  "Customer",
  "SalesTransaction",
  "InventorySnapshot",
  "DataDictionaryEntry",
];

const ROLES = ["owner", "store_manager", "analyst", "viewer"];

function userRole(user) {
  return user?.app_role || user?.data?.app_role || "viewer";
}

async function writeAudit(b, user, { action, entity, record_ref, detail }) {
  try {
    await b.entities.AuditLog.create({
      user: user.email || user.id,
      role: userRole(user),
      action,
      entity,
      record_ref: record_ref || "",
      timestamp: new Date().toISOString(),
      detail: detail || "",
    });
  } catch {
    /* audit is best-effort */
  }
}

// ---- Dashboard --------------------------------------------------------------
export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const safe = (p) => p.catch(() => null);

    // Required for any SalesTransaction/InventorySnapshot read: see store-scope.server.js.
    const scope = storeScope(context.user);

    // Transactions and revenue exclude quarantined rows.
    const clean = { ...scope, is_quarantined: { $ne: true } };
    const [txCount, quarantined, productCount, customerCount, inventoryCount, batchPage, revenueAgg] = await Promise.all([
      safe(b.entities.SalesTransaction.count(clean)),
      safe(b.entities.SalesTransaction.count({ ...scope, is_quarantined: true })),
      safe(b.entities.Product.count({})),
      safe(b.entities.Customer.count({})),
      safe(b.entities.InventorySnapshot.count(scope)),
      safe(b.entities.DataBatch.filter({}, { sort: "-created_date", limit: 6 })),
      safe(b.entities.SalesTransaction.aggregate({ query: clean, groupBy: "unit_price", sum: "qty", limit: 1000 })),
    ]);

    const batches = batchPage?.items ?? [];
    // Failed batches (nothing imported) are excluded from the average trust score.
    const trustValues = batches
      .filter((x) => x.status !== "failed" && (x.rows_passed ?? 0) > 0)
      .map((x) => x.trust_score)
      .filter((v) => typeof v === "number");
    const avgTrust =
      trustValues.length > 0
        ? Math.round(trustValues.reduce((a, c) => a + c, 0) / trustValues.length)
        : null;

    // Revenue = sum(qty x unit_price) over non-quarantined rows (GBP). Exact when the
    // number of distinct prices fits in one aggregate; flagged when it does not.
    const revenue = (revenueAgg?.rows ?? []).reduce((a, r) => a + (Number(r.unit_price) || 0) * (Number(r.sum_qty) || 0), 0);

    return {
      revenue: Math.round(revenue * 100) / 100,
      revenueTruncated: Boolean(revenueAgg?.truncated),
      counts: {
        transactions: txCount ?? 0,
        quarantined: quarantined ?? 0,
        products: productCount ?? 0,
        customers: customerCount ?? 0,
        inventory: inventoryCount ?? 0,
      },
      avgTrust,
      recentBatches: batches,
    };
  });

// ---- Import (chunked) -------------------------------------------------------
// The browser sends a file in chunks of up to 500 rows (importChunk), then calls
// finalizeImport once, which records a single DataBatch + audit entry with the totals.
function assertCanImport(user) {
  const role = userRole(user);
  if (role !== "owner" && role !== "analyst") {
    throw Object.assign(new Error("Only owners and analysts can import data"), { status: 403 });
  }
}

const ChunkInput = z.object({
  entity: z.enum(IMPORTABLE),
  rows: z.array(z.record(z.any())).max(500),
});

// Natural key used to skip rows that already exist, so a resumed import never duplicates.
const NATURAL_KEY = {
  SalesTransaction: ["txn_id"],
  InventorySnapshot: ["date", "store_id", "sku"],
};

const keyOf = (row, fields) => fields.map((f) => String(row[f] ?? "")).join("|");

// Finds which of the chunk's rows already exist. Reads of SalesTransaction/InventorySnapshot
// MUST go through storeScope(); importers (owner/analyst) get {} = all stores.
async function existingKeys(entity, entityName, rows, scope) {
  const fields = NATURAL_KEY[entityName];
  const found = new Set();
  const first = fields[0];
  const values = [...new Set(rows.map((r) => r[first]).filter((v) => v != null && v !== ""))];
  if (values.length === 0) return found;
  let cursor;
  do {
    const page = await entity.filter(
      { ...scope, [first]: { $in: values } },
      { limit: 1000, cursor, fields }
    );
    for (const it of page.items ?? []) found.add(keyOf(it, fields));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return found;
}

export const importChunk = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ChunkInput)
  .handler(async ({ data, context }) => {
    assertCanImport(context.user);
    const entity = context.getBase44().entities[data.entity];
    if (!entity) throw new Error("Unknown entity");

    let toInsert = data.rows;
    let skipped = 0;
    const fields = NATURAL_KEY[data.entity];
    if (fields) {
      const scope = storeScope(context.user);
      const existing = await existingKeys(entity, data.entity, data.rows, scope);
      // Resume: skip only rows whose key already exists in the database. Rows are never
      // dropped for matching other rows in the same file — duplicates are imported as-is
      // so the data quality rules can catch them later.
      toInsert = data.rows.filter((r) => !existing.has(keyOf(r, fields)));
      skipped = data.rows.length - toInsert.length;
    }

    if (toInsert.length === 0) return { passed: 0, skipped, error: null };
    try {
      const res = await entity.bulkCreate(toInsert);
      return { passed: Array.isArray(res) ? res.length : toInsert.length, skipped, error: null };
    } catch (err) {
      const message = err?.data?.message || err?.message || "Unknown error";
      return { passed: 0, skipped, error: `${message}${err?.status ? ` (HTTP ${err.status})` : ""}` };
    }
  });

const FinalizeInput = z.object({
  entity: z.enum(IMPORTABLE),
  fileName: z.string().min(1).max(300),
  rowsIn: z.number().int().min(0),
  rowsPassed: z.number().int().min(0),
  batchId: z.string().optional(),
  errorMessage: z.string().max(1000).optional(),
});

// Import status (completed / partial / failed) is separate from trust. Trust is only
// calculated from rows that were actually imported; a failed import has no trust score.
// Placeholder until data-quality rules exist: share of imported rows (100 when any imported).
function trustFor(rowsPassed) {
  return rowsPassed > 0 ? 100 : null;
}

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(FinalizeInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const user = context.user;
    assertCanImport(user);

    const { rowsIn, rowsPassed } = data;
    const status = rowsPassed >= rowsIn ? "completed" : rowsPassed > 0 ? "partial" : "failed";
    const trustScore = trustFor(rowsPassed);
    const fields = {
      rows_in: rowsIn,
      rows_passed: rowsPassed,
      trust_score: trustScore,
      status,
      error_message: data.errorMessage || "",
    };

    let batchId = data.batchId;
    if (batchId) {
      const found = await b.entities.DataBatch.filter({ batch_id: batchId }, { limit: 1 });
      const existing = found?.items?.[0];
      if (existing) await b.entities.DataBatch.update(existing.id, fields);
      else batchId = undefined;
    }
    if (!batchId) {
      batchId = crypto.randomUUID();
      await b.entities.DataBatch.create({
        batch_id: batchId,
        file_name: data.fileName,
        uploaded_by: user.email || user.id,
        created_at: new Date().toISOString(),
        ...fields,
      });
    }

    await writeAudit(b, user, {
      action: data.batchId ? "import_resume" : "import",
      entity: data.entity,
      record_ref: batchId,
      detail: `${rowsPassed}/${rowsIn} rows — ${status}${data.errorMessage ? ` — ${data.errorMessage}` : ""}`,
    });

    return {
      batch_id: batchId,
      rows_in: rowsIn,
      rows_passed: rowsPassed,
      trust_score: trustScore,
      status,
      error_message: data.errorMessage || "",
    };
  });

// ---- Role / profile management ---------------------------------------------
const RoleInput = z.object({
  userId: z.string(),
  appRole: z.enum(ROLES),
  storeId: z.string().optional(),
});

export const setRoleAndStore = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(RoleInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const me = context.user;
    if (data.appRole === "store_manager" && !data.storeId) {
      throw Object.assign(new Error("A store is required for the store manager role"), { status: 400 });
    }
    const isSelf = data.userId === me.id;
    if (!isSelf && userRole(me) !== "owner") {
      throw Object.assign(new Error("Only owners can change other users' roles"), {
        status: 403,
      });
    }

    const admin = b.asServiceRole;
    // 1. Sync onto the User so RLS sees it.
    try {
      await admin.entities.User.update(data.userId, {
        app_role: data.appRole,
        store_id: data.storeId || "",
      });
    } catch {
      /* updating the built-in user may be restricted; profile still carries it */
    }

    // 2. Mirror into AppUserProfile.
    let profile = null;
    try {
      const found = await admin.entities.AppUserProfile.filter({ user: data.userId }, { limit: 1 });
      profile = found?.items?.[0] ?? null;
    } catch {
      /* ignore */
    }
    const payload = { user: data.userId, role: data.appRole, store_id: data.storeId || "" };
    try {
      if (profile) await admin.entities.AppUserProfile.update(profile.id, payload);
      else await admin.entities.AppUserProfile.create(payload);
    } catch {
      /* ignore */
    }

    await writeAudit(b, me, {
      action: isSelf ? "role_switch" : "role_update",
      entity: "AppUserProfile",
      record_ref: data.userId,
      detail: `role=${data.appRole} store=${data.storeId || "—"}`,
    });

    return { ok: true };
  });

// ---- Admin: list users ------------------------------------------------------
export const listUsersForAdmin = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (userRole(context.user) !== "owner") {
      throw Object.assign(new Error("Owners only"), { status: 403 });
    }
    const admin = context.getBase44().asServiceRole;
    const items = await admin.entities.User.list("-created_date", 100);
    return items.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      app_role: u.app_role || "viewer",
      store_id: u.store_id || "",
    }));
  });