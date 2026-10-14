import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { SEED_RULES, evaluateRows, newState, scoreFromRules } from "@/lib/dq-rules.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canRun = (u) => ["owner", "analyst"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Only owners and analysts can do this"), { status: 403 });
const isLimit = (e) => e?.status === 429 || /daily entity write limit/i.test(e?.data?.message || e?.message || "");
const limitMsg =
  "Stopped: the app's daily limit of 100,000 record writes was reached. Nothing is lost - run the checks again later and they continue from where they stopped.";

async function ensureRules(b) {
  const page = await b.entities.DataQualityRule.filter({ entity: "SalesTransaction" }, { limit: 50 });
  const have = new Set((page.items ?? []).map((r) => r.name));
  const missing = SEED_RULES.filter((r) => !have.has(r.name)).map(({ key, ...r }) => ({
    ...r, entity: "SalesTransaction", active: true,
  }));
  if (missing.length) await b.entities.DataQualityRule.bulkCreate(missing);
  const all = await b.entities.DataQualityRule.filter({ entity: "SalesTransaction" }, { limit: 50 });
  return all.items ?? [];
}

// Reads every sales row once (reads are free; only writes count against the daily limit).
// MUST go through storeScope(): importers are all-stores, anyone else is restricted.
async function scanSales(b, user, onPage) {
  const scope = storeScope(user);
  let cursor;
  do {
    const page = await b.entities.SalesTransaction.filter(scope, {
      sort: "created_date", limit: 1000, cursor,
      fields: ["txn_id", "invoice_no", "sku", "qty", "unit_price", "txn_datetime", "customer_ref", "date", "is_quarantined"],
    });
    onPage(page.items ?? []);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
}

async function loadProducts(b) {
  const map = new Map();
  let cursor;
  do {
    const page = await b.entities.Product.filter({}, { limit: 1000, cursor, fields: ["sku", "unit_price"] });
    for (const p of page.items ?? []) map.set(String(p.sku), Number(p.unit_price) || 0);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return map;
}

async function evaluate(b, user) {
  const rules = (await ensureRules(b)).filter((r) => r.active !== false);
  const activeKeys = new Set(SEED_RULES.filter((s) => rules.some((r) => r.name === s.name)).map((s) => s.key));
  const ctx = { products: await loadProducts(b), today: new Date().toISOString().slice(0, 10) };
  const state = newState();
  const current = new Map(); // txn_id -> record id + current quarantine flag, only rows that may change
  const quarantinedNow = new Map();
  let total = 0;
  await scanSales(b, user, (rows) => {
    total += rows.length;
    evaluateRows(rows, activeKeys, ctx, state);
    for (const r of rows) quarantinedNow.set(r.txn_id, { id: r.id, q: Boolean(r.is_quarantined) });
  });
  const toQuarantine = [];
  const toRelease = [];
  for (const [txn, cur] of quarantinedNow) {
    const should = state.criticalFailed.has(txn);
    if (should && !cur.q) toQuarantine.push(cur.id);
    if (!should && cur.q) toRelease.push(cur.id);
  }
  return { rules, state, total, toQuarantine, toRelease, activeKeys, current };
}

// ---- Header trust summary (latest checked sales batch) -----------------------
export const getTrustSummary = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const page = await b.entities.DataBatch.filter(
      { file_name: "sales_transactions.csv", quality_status: "complete" },
      { sort: "-created_date", limit: 1 }
    );
    const batch = page.items?.[0];
    if (!batch) return null;
    return {
      score: batch.quality_score ?? null,
      rowsExcluded: batch.rows_excluded ?? 0,
      lastCheckedAt: batch.last_checked_at ?? null,
    };
  });

// ---- Estimate (no writes) ---------------------------------------------------
export const estimateChecks = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ batchId: z.string().min(1).max(100) }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const e = await evaluate(b, context.user);
    const ruleSummaries = e.rules.length;
    const writes = e.toQuarantine.length + e.toRelease.length + ruleSummaries + 1;
    return {
      batchId: data.batchId,
      rowsChecked: e.total,
      rowsToQuarantine: e.toQuarantine.length,
      rowsToRelease: e.toRelease.length,
      ruleSummaries,
      estimatedWrites: writes,
    };
  });

// ---- Run checks -------------------------------------------------------------
export const runChecks = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ batchId: z.string().min(1).max(100) }))
  .handler(async ({ data, context }) => {
    const user = context.user;
    if (!canRun(user)) throw forbid();
    const b = context.getBase44();
    const { batchId } = data;

    const batchPage = await b.entities.DataBatch.filter({ batch_id: batchId }, { limit: 1 });
    const batch = batchPage.items?.[0];
    if (!batch) throw Object.assign(new Error("Batch not found"), { status: 404 });

    const e = await evaluate(b, user);
    let writes = 0;
    let stoppedByLimit = false;
    let limitError = null;

    // 1. Quarantine flags - only rows whose value actually changes are written.
    const setFlag = async (ids, value) => {
      for (let i = 0; i < ids.length && !stoppedByLimit; i += 500) {
        const slice = ids.slice(i, i + 500);
        try {
          await b.entities.SalesTransaction.bulkUpdate(slice.map((id) => ({ id, is_quarantined: value })));
          writes += slice.length;
        } catch (err) {
          if (!isLimit(err)) throw err;
          stoppedByLimit = true;
          limitError = limitMsg;
        }
      }
    };
    await setFlag(e.toQuarantine, true);
    if (!stoppedByLimit) await setFlag(e.toRelease, false);

    // 2. One issue summary per rule per batch (update in place on re-runs).
    const existing = await b.entities.DataQualityIssue.filter({ batch_id: batchId }, { limit: 100 });
    const byRule = new Map((existing.items ?? []).map((x) => [x.rule_name, x]));
    const stats = [];
    for (const rule of e.rules) {
      const seed = SEED_RULES.find((s) => s.name === rule.name);
      const s = (seed && e.state.perRule[seed.key]) || { checked: 0, failed: 0, samples: [] };
      stats.push({ dimension: rule.dimension, checked: s.checked, failed: s.failed });
      if (stoppedByLimit) continue;
      const prev = byRule.get(rule.name);
      const next = {
        batch_id: batchId, rule_name: rule.name, dimension: rule.dimension, severity: rule.severity,
        failed_count: s.failed, checked_count: s.checked, sample_record_refs: s.samples,
      };
      try {
        if (prev) {
          const same =
            prev.failed_count === next.failed_count && prev.checked_count === next.checked_count &&
            JSON.stringify(prev.sample_record_refs ?? []) === JSON.stringify(next.sample_record_refs);
          if (!same) { await b.entities.DataQualityIssue.update(prev.id, next); writes += 1; }
        } else {
          await b.entities.DataQualityIssue.create({ ...next, status: "open", created_at: new Date().toISOString() });
          writes += 1;
        }
      } catch (err) {
        if (!isLimit(err)) throw err;
        stoppedByLimit = true;
        limitError = limitMsg;
      }
    }

    // 3. Trust score saved on the batch (only when the run completed).
    const scored = scoreFromRules(stats.filter((x) => x.dimension !== "accuracy"));
    const acc = stats.filter((x) => x.dimension === "accuracy" && x.checked > 0);
    const accuracy = acc.length ? Math.round((1 - acc.reduce((a, c) => a + c.failed, 0) / acc.reduce((a, c) => a + c.checked, 0)) * 1000) / 10 : null;
    const excluded = e.state.criticalFailed.size;
    if (!stoppedByLimit) {
      try {
        await b.entities.DataBatch.update(batch.id, {
          quality_score: scored.score, accuracy_pass_rate: accuracy, rows_excluded: excluded,
          last_checked_at: new Date().toISOString(), quality_status: "complete",
        });
        writes += 1;
      } catch (err) {
        if (!isLimit(err)) throw err;
        stoppedByLimit = true;
        limitError = limitMsg;
      }
    }

    try {
      await b.entities.AuditLog.create({
        user: user.email || user.id, role: roleOf(user), action: "run_checks", entity: "SalesTransaction",
        record_ref: batchId, timestamp: new Date().toISOString(),
        detail: `${e.total} rows checked, ${writes} writes, ${excluded} excluded${stoppedByLimit ? " - STOPPED: daily write limit" : ""}`,
      });
    } catch { /* audit is best-effort */ }

    return {
      complete: !stoppedByLimit, error: limitError, rowsChecked: e.total, writes,
      score: stoppedByLimit ? null : scored.score, rowsExcluded: excluded,
    };
  });

// ---- Read results -----------------------------------------------------------
export const getQualityData = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ batchId: z.string().max(100).optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const batches = (await b.entities.DataBatch.filter({ file_name: "sales_transactions.csv" }, { sort: "-created_date", limit: 20 })).items ?? [];
    const batch = batches.find((x) => x.batch_id === data.batchId) ?? batches[0] ?? null;
    if (!batch) return { batches, batch: null, issues: [], dimensions: [] };
    const issues = (await b.entities.DataQualityIssue.filter({ batch_id: batch.batch_id }, { limit: 100 })).items ?? [];
    const dims = {};
    for (const i of issues) {
      if (!i.checked_count) continue;
      (dims[i.dimension] ??= []).push(1 - i.failed_count / i.checked_count);
    }
    const dimensions = Object.entries(dims).map(([dimension, arr]) => ({
      dimension, passRate: Math.round((arr.reduce((a, c) => a + c, 0) / arr.length) * 1000) / 10,
    }));
    return { batches, batch, issues, dimensions };
  });

export const setIssueStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string(), status: z.enum(["open", "resolved", "accepted"]) }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    await b.entities.DataQualityIssue.update(data.id, { status: data.status });
    try {
      await b.entities.AuditLog.create({
        user: context.user.email || context.user.id, role: roleOf(context.user), action: `issue_${data.status}`,
        entity: "DataQualityIssue", record_ref: data.id, timestamp: new Date().toISOString(), detail: "",
      });
    } catch { /* best-effort */ }
    return { ok: true };
  });

// ---- Column profiling (aggregate calls; never loads rows) -------------------
const PROFILE_COLS = ["invoice_no", "sku", "qty", "unit_price", "customer_ref", "date"];
export const getColumnProfile = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const total = await b.entities.SalesTransaction.count({ ...scope });
    const minMax = await b.entities.SalesTransaction.aggregate({
      query: scope, min: ["qty", "unit_price"], max: ["qty", "unit_price"],
    });
    const row = minMax.rows?.[0] ?? {};
    const dateMin = await b.entities.SalesTransaction.filter(scope, { sort: "date", limit: 1, fields: ["date"] });
    const dateMax = await b.entities.SalesTransaction.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const distinctAgg = await b.entities.SalesTransaction.aggregate({
      query: scope, countDistinct: "sku",
    });
    const distinctSku = distinctAgg.rows?.[0]?.count_distinct_sku ?? null;
    const out = [];
    for (const col of PROFILE_COLS) {
      const nulls = await b.entities.SalesTransaction.count({
        ...scope,
        // Missing = absent, null, empty or whitespace-only.
        $or: [{ [col]: { $exists: false } }, { [col]: null }, { [col]: { $regex: "^\\s*$" } }],
      });
      out.push({
        column: col,
        nullPct: total ? Math.round((nulls / total) * 1000) / 10 : 0,
        distinct: col === "sku" ? distinctSku : null,
        min: col === "date" ? dateMin.items?.[0]?.date ?? null : row[`min_${col}`] ?? null,
        max: col === "date" ? dateMax.items?.[0]?.date ?? null : row[`max_${col}`] ?? null,
      });
    }
    return { total, columns: out };
  });