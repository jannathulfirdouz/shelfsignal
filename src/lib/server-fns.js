import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

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

    const [txCount, quarantined, productCount, customerCount, batchPage] = await Promise.all([
      safe(b.entities.SalesTransaction.count({})),
      safe(b.entities.SalesTransaction.count({ is_quarantined: true })),
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

// ---- Import -----------------------------------------------------------------
const ImportInput = z.object({
  entity: z.enum(IMPORTABLE),
  rows: z.array(z.record(z.any())).max(2000),
  fileName: z.string().min(1),
});

export const importEntity = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ImportInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const user = context.user;
    const role = userRole(user);
    if (role !== "owner" && role !== "analyst") {
      throw Object.assign(new Error("Only owners and analysts can import data"), {
        status: 403,
      });
    }

    const batchId = crypto.randomUUID();
    const rowsIn = data.rows.length;
    let rowsPassed = 0;
    let status = "failed";

    const entity = b.entities[data.entity];
    if (!entity) throw new Error("Unknown entity");

    try {
      const CHUNK = 500;
      let created = 0;
      for (let i = 0; i < data.rows.length; i += CHUNK) {
        const slice = data.rows.slice(i, i + CHUNK);
        const res = await entity.bulkCreate(slice);
        created += Array.isArray(res) ? res.length : slice.length;
      }
      rowsPassed = created;
      status = rowsPassed === rowsIn ? "completed" : rowsPassed > 0 ? "partial" : "failed";
    } catch {
      rowsPassed = 0;
      status = "failed";
    }

    const trustScore = rowsIn > 0 ? Math.round((rowsPassed / rowsIn) * 100) : 0;

    try {
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
    } catch {
      /* best-effort */
    }

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
    const page = await admin.entities.User.list({ limit: 100 });
    const items = page.items ?? page ?? [];
    return items.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      app_role: u.app_role || "viewer",
      store_id: u.store_id || "",
    }));
  });