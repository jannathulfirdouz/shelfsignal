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

    const [txCount, quarantined, productCount, customerCount, batchPage] = await Promise.all([
      safe(b.entities.SalesTransaction.count({ ...scope })),
      safe(b.entities.SalesTransaction.count({ ...scope, is_quarantined: true })),
      safe(b.entities.Product.count({})),
      safe(b.entities.Customer.count({})),
      safe(b.entities.DataBatch.filter({}, { sort: "-created_date", limit: 6 })),
    ]);

    const batches = batchPage?.items ?? [];
    const trustValues = batches
      .map((x) => x.trust_score)
      .filter((v) => typeof v === "number");
    const avgTrust =
      trustValues.length > 0
        ? Math.round(trustValues.reduce((a, c) => a + c, 0) / trustValues.length)
        : null;

    return {
      counts: {
        transactions: txCount ?? 0,
        quarantined: quarantined ?? 0,
        products: productCount ?? 0,
        customers: customerCount ?? 0,
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

export const importChunk = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ChunkInput)
  .handler(async ({ data, context }) => {
    assertCanImport(context.user);
    const entity = context.getBase44().entities[data.entity];
    if (!entity) throw new Error("Unknown entity");
    try {
      const res = await entity.bulkCreate(data.rows);
      return { passed: Array.isArray(res) ? res.length : data.rows.length };
    } catch {
      return { passed: 0 };
    }
  });

const FinalizeInput = z.object({
  entity: z.enum(IMPORTABLE),
  fileName: z.string().min(1).max(300),
  rowsIn: z.number().int().min(0),
  rowsPassed: z.number().int().min(0),
});

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(FinalizeInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const user = context.user;
    assertCanImport(user);

    const batchId = crypto.randomUUID();
    const { rowsIn, rowsPassed } = data;
    const status = rowsPassed === rowsIn ? "completed" : rowsPassed > 0 ? "partial" : "failed";
    const trustScore = rowsIn > 0 ? Math.round((rowsPassed / rowsIn) * 100) : 0;

    await b.entities.DataBatch.create({
      batch_id: batchId,
      file_name: data.fileName,
      uploaded_by: user.email || user.id,
      rows_in: rowsIn,
      rows_passed: rowsPassed,
      trust_score: trustScore,
      status,
      created_at: new Date().toISOString(),
    });

    await writeAudit(b, user, {
      action: "import",
      entity: data.entity,
      record_ref: batchId,
      detail: `${rowsPassed}/${rowsIn} rows — trust ${trustScore}`,
    });

    return { batch_id: batchId, rows_in: rowsIn, rows_passed: rowsPassed, trust_score: trustScore, status };
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