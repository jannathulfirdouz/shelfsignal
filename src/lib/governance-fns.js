import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, allowAnonymous } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { seedDictionary } from "@/lib/data-dictionary.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canGovern = (u) => ["owner", "analyst"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Owners and analysts only"), { status: 403 });

async function audit(b, user, { action, entity, record_ref, detail }) {
  try {
    await b.entities.AuditLog.create({ user: user.email || user.id, role: roleOf(user), action, entity, record_ref: record_ref || "", timestamp: new Date().toISOString(), detail: detail || "" });
  } catch { /* best-effort */ }
}

// ---- One load for the Governance page: seed dictionary, return all data -------
export const getGovernanceData = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .handler(async ({ context }) => {
    // Signed-in owners and analysts get the full view; a public demo visitor gets the
    // dictionary, metrics and lineage read-only, and never the audit log.
    if (context.user && !canGovern(context.user)) throw forbid();
    const b = context.getBase44();
    const demo = !context.user;
    const seed = demo ? { created: 0, repaired: 0 } : await seedDictionary(b);

    let cursor;
    const dictionary = [];
    do { const p = await b.entities.DataDictionaryEntry.filter({}, { limit: 1000, cursor }); dictionary.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor);

    const metrics = (await b.entities.MetricDefinition.filter({}, { limit: 50 })).items ?? [];

    const auditPage = demo ? { items: [] } : await b.entities.AuditLog.filter({}, { sort: "-timestamp", limit: 300 });
    const auditLog = auditPage.items ?? [];

    return { seed, dictionary, metrics, auditLog, demo };
  });

// ---- Edit a dictionary entry (definition + owner) ----------------------------
export const updateDictionaryEntry = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string(), definition: z.string().min(1).max(500), owner: z.string().max(50) }))
  .handler(async ({ data, context }) => {
    if (!canGovern(context.user)) throw forbid();
    const b = context.getBase44();
    const before = await b.entities.DataDictionaryEntry.get(data.id);
    await b.entities.DataDictionaryEntry.update(data.id, { definition: data.definition, owner: data.owner });
    const parts = [];
    if ((before?.definition || "") !== data.definition) parts.push(`definition: "${(before?.definition || "").slice(0, 40)}" to "${data.definition.slice(0, 40)}"`);
    if ((before?.owner || "") !== data.owner) parts.push(`owner: ${before?.owner || "—"} to ${data.owner || "—"}`);
    await audit(b, context.user, { action: "dictionary_edit", entity: "DataDictionaryEntry", record_ref: data.id, detail: `${before?.entity || ""}.${before?.field || ""}: ${parts.join("; ") || "no change"}` });
    return { ok: true };
  });

// ---- Audit log with filters (server-applied) --------------------------------
const AuditFilter = z.object({ user: z.string().optional(), action: z.string().optional(), from: z.string().optional(), to: z.string().optional() });

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(AuditFilter)
  .handler(async ({ data, context }) => {
    if (!canGovern(context.user)) throw forbid();
    const b = context.getBase44();
    const q = {};
    if (data.user) q.user = { $regex: data.user, $options: "i" };
    if (data.action) q.action = data.action;
    if (data.from) q.timestamp = { ...(q.timestamp || {}), $gte: data.from };
    if (data.to) q.timestamp = { ...(q.timestamp || {}), $lte: data.to + "T23:59:59" };
    const page = await b.entities.AuditLog.filter(q, { sort: "-timestamp", limit: 500 });
    return page.items ?? [];
  });

export const exportAuditLogCsv = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(AuditFilter)
  .handler(async ({ data, context }) => {
    if (!canGovern(context.user)) throw forbid();
    const b = context.getBase44();
    const q = {};
    if (data.user) q.user = { $regex: data.user, $options: "i" };
    if (data.action) q.action = data.action;
    if (data.from) q.timestamp = { ...(q.timestamp || {}), $gte: data.from };
    if (data.to) q.timestamp = { ...(q.timestamp || {}), $lte: data.to + "T23:59:59" };
    const page = await b.entities.AuditLog.filter(q, { sort: "-timestamp", limit: 1000 });
    const rows = page.items ?? [];
    const cols = ["timestamp", "user", "role", "action", "entity", "record_ref", "detail"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = cols.join(",");
    const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
    return header + "\n" + body;
  });

// ---- Lineage for a KPI -------------------------------------------------------
const KPI_MAP = {
  net_revenue: { label: "Net revenue", metricName: "Net revenue", summary: "SalesWeeklySummary.net_revenue", pages: ["Home", "Dashboard", "Sales"] },
  gross_margin: { label: "Gross margin %", metricName: "Gross margin %", summary: "SalesWeeklySummary.net_revenue + cost", pages: ["Home"] },
  return_rate: { label: "Return rate", metricName: "Return rate", summary: "SalesWeeklySummary.returns_value / gross_revenue", pages: ["Home", "Sales"] },
  stock_cover: { label: "Stock cover days", metricName: "Stock cover days", summary: "InventorySnapshot.on_hand / SalesWeeklySummary.units (last 4w)", pages: ["Inventory"] },
};

export const getLineage = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(z.object({ kpi: z.enum(["net_revenue", "gross_margin", "return_rate", "stock_cover"]) }))
  .handler(async ({ data, context }) => {
    if (!canGovern(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const meta = KPI_MAP[data.kpi];

    const batchPage = await b.entities.DataBatch.filter({ file_name: "sales_transactions.csv", quality_status: "complete" }, { sort: "-created_date", limit: 1 });
    const batch = batchPage.items?.[0] ?? null;
    const rowsIn = batch?.rows_in ?? 0;

    const quarantined = await b.entities.SalesTransaction.count({ ...scope, is_quarantined: true });
    const used = Math.max(0, rowsIn - quarantined);

    const issues = batch ? ((await b.entities.DataQualityIssue.filter({ batch_id: batch.batch_id }, { limit: 100 })).items ?? []) : [];
    const rules = issues.map((i) => ({ rule_name: i.rule_name, dimension: i.dimension, severity: i.severity, failed_count: i.failed_count, checked_count: i.checked_count }));

    const metricPage = await b.entities.MetricDefinition.filter({ name: meta.metricName }, { limit: 1 });
    const metric = metricPage.items?.[0] ?? null;

    return {
      kpi: data.kpi,
      label: meta.label,
      source: batch ? { file: batch.file_name, batchId: batch.batch_id, rowsIn } : null,
      quarantined,
      used,
      rules,
      summaryTable: meta.summary,
      formula: metric?.formula ?? "",
      metricNotes: metric?.notes ?? "",
      pages: meta.pages,
    };
  });

// ---- Privacy: setting, preview, apply --------------------------------------
export const getPrivacySetting = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (roleOf(context.user) !== "owner") throw Object.assign(new Error("Owners only"), { status: 403 });
    const b = context.getBase44();
    const page = await b.entities.PrivacySetting.filter({}, { limit: 1 });
    let setting = page.items?.[0] ?? null;
    if (!setting) {
      setting = await b.entities.PrivacySetting.create({ retention_months: 24, last_applied_at: "", last_applied_by: "" });
    }
    return setting;
  });

function addMonths(dStr, n) { const d = new Date(dStr + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }

export const updatePrivacySetting = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ retentionMonths: z.number().int().min(1).max(120) }))
  .handler(async ({ data, context }) => {
    if (roleOf(context.user) !== "owner") throw Object.assign(new Error("Owners only"), { status: 403 });
    const b = context.getBase44();
    const page = await b.entities.PrivacySetting.filter({}, { limit: 1 });
    const existing = page.items?.[0];
    if (existing) await b.entities.PrivacySetting.update(existing.id, { retention_months: data.retentionMonths });
    else await b.entities.PrivacySetting.create({ retention_months: data.retentionMonths, last_applied_at: "", last_applied_by: "" });
    await audit(b, context.user, { action: "privacy_setting_change", entity: "PrivacySetting", record_ref: "", detail: `retention_months=${data.retentionMonths}` });
    return { ok: true };
  });

export const previewEmailMasking = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ retentionMonths: z.number().int().min(1).max(120) }))
  .handler(async ({ data, context }) => {
    if (roleOf(context.user) !== "owner") throw Object.assign(new Error("Owners only"), { status: 403 });
    const b = context.getBase44();
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = addMonths(today, -data.retentionMonths);
    const count = await b.entities.Customer.count({ first_purchase_date: { $lt: cutoff }, email: { $ne: "[removed]" } });
    return { count, cutoff };
  });

export const applyEmailMasking = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ retentionMonths: z.number().int().min(1).max(120) }))
  .handler(async ({ data, context }) => {
    if (roleOf(context.user) !== "owner") throw Object.assign(new Error("Owners only"), { status: 403 });
    const b = context.getBase44();
    const user = context.user;
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = addMonths(today, -data.retentionMonths);
    const query = { first_purchase_date: { $lt: cutoff }, email: { $ne: "[removed]" } };

    const ids = [];
    let cursor;
    do {
      const p = await b.entities.Customer.filter(query, { limit: 1000, cursor, fields: ["id"] });
      for (const r of p.items ?? []) ids.push(r.id);
      cursor = p.has_more ? p.next_cursor : undefined;
    } while (cursor);

    let writes = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500).map((id) => ({ id, email: "[removed]" }));
      await b.entities.Customer.bulkUpdate(slice);
      writes += slice.length;
    }

    const page = await b.entities.PrivacySetting.filter({}, { limit: 1 });
    const existing = page.items?.[0];
    const now = new Date().toISOString();
    if (existing) await b.entities.PrivacySetting.update(existing.id, { last_applied_at: now, last_applied_by: user.email || user.id });
    else await b.entities.PrivacySetting.create({ retention_months: data.retentionMonths, last_applied_at: now, last_applied_by: user.email || user.id });

    await audit(b, user, { action: "privacy_apply", entity: "Customer", record_ref: "", detail: `${writes} emails masked (retention ${data.retentionMonths} months)` });
    return { writes };
  });