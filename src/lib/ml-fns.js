import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { forecastSeries, segmentCustomers, abcXyz, detectAnomalies } from "@/lib/ml.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canRun = (u) => ["owner", "analyst"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Only owners and analysts can run models"), { status: 403 });
const isLimit = (e) => e?.status === 429 || /daily entity write limit/i.test(e?.data?.message || e?.message || "");
const limitMsg = "Stopped: the app's daily limit of 100,000 record writes was reached. Run again later to continue.";
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const FORECAST_RUN = "forecast";
const PARTIAL_WEEK = "2011-12-05";

async function readAll(b, name, query, fields) {
  const rows = []; let cursor;
  do { const p = await b.entities[name].filter(query, { limit: 1000, cursor, fields }); rows.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor);
  return rows;
}
async function audit(b, user, { action, entity, record_ref, detail }) {
  try { await b.entities.AuditLog.create({ user: user.email || user.id, role: roleOf(user), action, entity, record_ref: record_ref || "", timestamp: new Date().toISOString(), detail: detail || "" }); } catch { /* best-effort */ }
}

// Generic diff-upsert: create new, update changed, skip identical. Dedupes the
// incoming rows by key (last wins) so a batch never contains the same record
// twice, strips any accidental id from creates, and dedupes updates by id (last
// wins) so no two records in a bulkUpdate share an id. Returns writes.
async function diffUpsert(b, entityName, rows, keyFn, valFields, existingRows) {
  const exMap = new Map(existingRows.map((x) => [keyFn(x), x]));
  const dedup = new Map();
  for (const row of rows) dedup.set(keyFn(row), row); // last wins
  const toCreate = []; const toUpdateMap = new Map();
  for (const [key, row] of dedup) {
    const ex = exMap.get(key);
    if (!ex) { const { id, ...rest } = row; toCreate.push(rest); }
    else {
      let diff = false;
      for (const f of valFields) if (ex[f] !== row[f]) { diff = true; break; }
      if (diff) toUpdateMap.set(ex.id, { id: ex.id, ...row }); // dedupe by id, last wins
    }
  }
  const toUpdate = [...toUpdateMap.values()];
  let writes = 0; let stopped = false; let error = null;
  try {
    if (toCreate.length) { for (let i = 0; i < toCreate.length; i += 500) { const s = toCreate.slice(i, i + 500); await b.entities[entityName].bulkCreate(s); writes += s.length; } }
    if (toUpdate.length) { for (let i = 0; i < toUpdate.length; i += 500) { const s = toUpdate.slice(i, i + 500); await b.entities[entityName].bulkUpdate(s); writes += s.length; } }
  } catch (e) { if (isLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
  return { writes, stopped, error };
}

// ---- Models status (last run times) -----------------------------------------
export const getModelsStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const actions = ["run_forecast", "run_segmentation", "run_abcxyz", "run_anomaly"];
    const out = {};
    for (const a of actions) {
      const p = await b.entities.AuditLog.filter({ action: a }, { sort: "-timestamp", limit: 1 });
      out[a.replace("run_", "")] = p.items?.[0]?.timestamp ?? null;
    }
    return out;
  });

export const logModelRun = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ action: z.string().max(60), entity: z.string().max(60), detail: z.string().max(500) }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    await audit(context.getBase44(), context.user, { action: data.action, entity: data.entity, detail: data.detail });
    return { ok: true };
  });

// ============ 1. Demand forecasting ============
export const prepareForecast = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const rows = await readAll(b, "SalesWeeklySummary", scope, ["store_id", "category", "sku", "net_revenue"]);
    const byStore = new Map();
    for (const r of rows) {
      if (!byStore.has(r.store_id)) byStore.set(r.store_id, { cats: new Set(), skuRev: new Map() });
      const s = byStore.get(r.store_id);
      if (r.category) s.cats.add(r.category);
      s.skuRev.set(r.sku, (s.skuRev.get(r.sku) || 0) + (Number(r.net_revenue) || 0));
    }
    const series = [];
    for (const [store_id, s] of byStore) {
      for (const cat of s.cats) series.push({ store_id, series_type: "category", series_key: cat });
      const top = [...s.skuRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      for (const [sku] of top) series.push({ store_id, series_type: "sku", series_key: sku });
    }
    return { series, estimatedWrites: series.length * 19 + 1 };
  });

export const runForecastChunk = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({
    series: z.array(z.object({ store_id: z.string(), series_type: z.enum(["category", "sku"]), series_key: z.string() })).max(20),
    sliceIndex: z.number().int(), totalSlices: z.number().int(), totalSeries: z.number().int(),
  }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const user = context.user;

    if (data.sliceIndex === 0) {
      // Clean slate: delete any partial Forecast rows left by a previous run so
      // the re-run starts clean (no stale duplicates). asServiceRole so analysts
      // can re-run too (Forecast delete is owner-only under RLS).
      try { await b.asServiceRole.entities.Forecast.deleteMany({ run_id: FORECAST_RUN }); } catch { /* best-effort */ }
      const ex = await b.entities.ForecastRun.filter({ run_id: FORECAST_RUN }, { limit: 1 });
      const now = new Date().toISOString();
      if (ex.items?.[0]) await b.entities.ForecastRun.update(ex.items[0].id, { created_by: user.email || user.id, created_at: now, series_count: data.totalSeries, notes: "" });
      else await b.entities.ForecastRun.create({ run_id: FORECAST_RUN, created_by: user.email || user.id, created_at: now, series_count: data.totalSeries, notes: "" });
    }

    let writes = 0; let stopped = false; let error = null;
    for (const s of data.series) {
      const q = { store_id: s.store_id };
      if (s.series_type === "category") q.category = s.series_key; else q.sku = s.series_key;
      const rows = await readAll(b, "SalesWeeklySummary", q, ["week_start", "units"]);
      const weeks = rows.filter((r) => r.week_start < PARTIAL_WEEK).map((r) => ({ week_start: r.week_start, units: Number(r.units) || 0 })).sort((a, c) => (a.week_start < c.week_start ? -1 : 1));
      const res = forecastSeries(weeks);
      const outRows = [];
      if (!res.notEnough) {
        for (let i = 0; i < 8; i++) outRows.push({ run_id: FORECAST_RUN, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: res.winner, wape: res.models[res.winner].wape, bias: res.models[res.winner].bias, week_start: res.testWeeks[i], predicted_units: res.backtestPred[i], lower: null, upper: null, is_backtest: true, actual_units: res.testActual[i] });
        for (let i = 0; i < 8; i++) outRows.push({ run_id: FORECAST_RUN, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: res.winner, wape: res.models[res.winner].wape, bias: res.models[res.winner].bias, week_start: res.forecastWeeks[i], predicted_units: res.forecast[i], lower: res.lower[i], upper: res.upper[i], is_backtest: false, actual_units: null });
        for (const m of ["naive", "ma", "ses", "holt"]) {
          if (m === res.winner) continue;
          outRows.push({ run_id: FORECAST_RUN, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: m, wape: res.models[m].wape, bias: res.models[m].bias, week_start: res.forecastWeeks[0], predicted_units: res.models[m].forecast[0], lower: null, upper: null, is_backtest: false, actual_units: null });
        }
      }
      if (outRows.length) {
        const orCond = data.series.map((x) => ({ store_id: x.store_id, series_type: x.series_type, series_key: x.series_key }));
        const existing = await readAll(b, "Forecast", { run_id: FORECAST_RUN, $or: orCond }, ["id", "store_id", "series_type", "series_key", "model", "week_start", "is_backtest", "predicted_units", "lower", "upper", "wape", "bias", "actual_units"]);
        const keyFn = (x) => `${x.store_id}|${x.series_type}|${x.series_key}|${x.model}|${x.week_start}|${x.is_backtest}`;
        const r = await diffUpsert(b, "Forecast", outRows, keyFn, ["predicted_units", "lower", "upper", "wape", "bias", "actual_units"], existing);
        writes += r.writes; if (r.stopped) { stopped = true; error = r.error; break; }
      }
    }
    return { sliceIndex: data.sliceIndex, writes, stopped, error };
  });

export const getForecastData = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string().optional(), seriesType: z.string().optional(), seriesKey: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const sumRows = await readAll(b, "SalesWeeklySummary", scope, ["store_id", "week_start", "category", "sku", "units", "net_revenue"]);
    const stores = [...new Set(sumRows.map((r) => r.store_id))].sort();
    if (!data.storeId) return { stores, series: [], actuals: [], backtest: [], forecast: [], comparison: [], winner: null };

    const storeRows = sumRows.filter((r) => r.store_id === data.storeId);
    const cats = new Set(); const skuRev = new Map();
    for (const r of storeRows) { if (r.category) cats.add(r.category); skuRev.set(r.sku, (skuRev.get(r.sku) || 0) + (Number(r.net_revenue) || 0)); }
    const series = [
      ...[...cats].sort().map((c) => ({ series_type: "category", series_key: c, label: c })),
      ...[...skuRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([sku]) => ({ series_type: "sku", series_key: sku, label: sku })),
    ];
    if (!data.seriesKey) return { stores, series, actuals: [], backtest: [], forecast: [], comparison: [], winner: null };

    // actuals
    const actuals = storeRows.filter((r) => (data.seriesType === "category" ? r.category === data.seriesKey : r.sku === data.seriesKey))
      .map((r) => ({ week_start: r.week_start, units: Math.round(Number(r.units) || 0) }))
      .sort((a, b) => (a.week_start < b.week_start ? -1 : 1));

    const fRows = await readAll(b, "Forecast", { run_id: FORECAST_RUN, store_id: data.storeId, series_type: data.seriesType, series_key: data.seriesKey }, ["model", "week_start", "is_backtest", "predicted_units", "lower", "upper", "wape", "bias", "actual_units"]);
    const backtest = fRows.filter((r) => r.is_backtest).map((r) => ({ week_start: r.week_start, predicted: r.predicted_units, actual: r.actual_units })).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
    const winnerRows = fRows.filter((r) => !r.is_backtest);
    const forecast = winnerRows.filter((r) => r.lower != null || r.upper != null).map((r) => ({ week_start: r.week_start, predicted: r.predicted_units, lower: r.lower, upper: r.upper })).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
    // comparison: per model wape/bias from any forecast row
    const byModel = new Map();
    for (const r of fRows) if (!byModel.has(r.model)) byModel.set(r.model, { model: r.model, wape: r.wape, bias: r.bias });
    let winner = null, minW = Infinity;
    for (const m of byModel.values()) if (m.wape != null && m.wape < minW) { minW = m.wape; winner = m.model; }
    const comparison = [...byModel.values()].map((m) => ({ ...m, isWinner: m.model === winner }));
    return { stores, series, actuals, backtest, forecast, comparison, winner };
  });

// ============ 2. Customer segmentation ============
export const prepareSegmentation = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const a = await b.entities.SalesTransaction.aggregate({ query: { ...scope, is_quarantined: { $ne: true }, customer_ref: { $exists: true, $ne: "" } }, countDistinct: "customer_ref" });
    const count = Number(a.rows?.[0]?.count_distinct_customer_ref || 0);
    return { count, estimatedWrites: count + 1 };
  });

export const runSegmentation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const txns = await readAll(b, "SalesTransaction", { ...scope, is_quarantined: { $ne: true }, customer_ref: { $exists: true, $ne: "" } }, ["customer_ref", "invoice_no", "date", "sku", "qty", "unit_price"]);
    const customers = await readAll(b, "Customer", {}, ["customer_ref", "country"]);
    const countryMap = new Map(customers.map((c) => [String(c.customer_ref), c.country]));
    const REF_DATE = new Date("2011-12-09T00:00:00Z");
    const byCust = new Map();
    for (const t of txns) {
      const ref = String(t.customer_ref);
      let c = byCust.get(ref);
      if (!c) { c = { invoices: new Set(), last: "", monetary: 0 }; byCust.set(ref, c); }
      c.invoices.add(t.invoice_no);
      if (!c.last || String(t.date) > c.last) c.last = String(t.date);
      c.monetary += (Number(t.qty) || 0) * (Number(t.unit_price) || 0);
    }
    const rfm = [];
    for (const [ref, c] of byCust) {
      const last = c.last ? new Date(c.last + "T00:00:00Z") : REF_DATE;
      const recency = Math.max(0, Math.round((REF_DATE - last) / 86400000));
      rfm.push({ customer_ref: ref, country: countryMap.get(ref) || "", recency, frequency: c.invoices.size, monetary: c.monetary });
    }
    const segments = segmentCustomers(rfm);
    return { segments, count: segments.length };
  });

export const upsertSegmentChunk = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ rows: z.array(z.object({ customer_ref: z.string(), store_id: z.string(), recency_days: z.number(), frequency: z.number(), monetary: z.number(), segment: z.string() })).max(500) }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const refs = data.rows.map((r) => r.customer_ref);
    const existing = await readAll(b, "CustomerSegment", { customer_ref: { $in: refs } }, ["id", "customer_ref", "store_id", "recency_days", "frequency", "monetary", "segment"]);
    const keyFn = (x) => String(x.customer_ref);
    const r = await diffUpsert(b, "CustomerSegment", data.rows, keyFn, ["store_id", "recency_days", "frequency", "monetary", "segment"], existing);
    return { writes: r.writes, stopped: r.stopped, error: r.error };
  });

export const getSegmentData = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ segment: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const segRows = await readAll(b, "CustomerSegment", scope, ["customer_ref", "store_id", "recency_days", "frequency", "monetary", "segment"]);
    const customers = await readAll(b, "Customer", {}, ["customer_ref", "email", "country"]);
    const emailMap = new Map(customers.map((c) => [String(c.customer_ref), c.email]));
    // summary
    const groups = {};
    for (const r of segRows) { (groups[r.segment] ??= { count: 0, monetary: 0, recency: 0, frequency: 0 }); const g = groups[r.segment]; g.count++; g.monetary += r.monetary; g.recency += r.recency_days; g.frequency += r.frequency; }
    const totalRev = Object.values(groups).reduce((a, g) => a + g.monetary, 0) || 1;
    const summary = Object.entries(groups).map(([segment, g]) => ({ segment, count: g.count, revenueShare: r2((g.monetary / totalRev) * 100), avgRecency: Math.round(g.recency / g.count), avgFrequency: r2(g.frequency / g.count), avgMonetary: r2(g.monetary / g.count), revenue: r2(g.monetary) }));
    const atRisk = (groups["At risk"]?.monetary || 0);
    let list = segRows.map((r) => ({ customer_ref: r.customer_ref, store_id: r.store_id, segment: r.segment, recency: r.recency_days, frequency: r.frequency, monetary: r.monetary, email: emailMap.get(r.customer_ref) || null }));
    if (data.segment) list = list.filter((r) => r.segment === data.segment);
    list.sort((a, b) => b.monetary - a.monetary);
    return { summary, atRiskRevenue: r2(atRisk), totalCustomers: segRows.length, customers: list.slice(0, 500) };
  });

// ============ 3. ABC-XYZ ============
export const prepareAbcXyz = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const rows = await readAll(b, "SalesWeeklySummary", scope, ["store_id", "sku"]);
    const seen = new Set(); const stores = new Set();
    for (const r of rows) { seen.add(`${r.store_id}|${r.sku}`); stores.add(r.store_id); }
    return { stores: [...stores].sort(), skuCount: seen.size, estimatedWrites: seen.size };
  });

export const runAbcXyzStore = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string() }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const rows = await readAll(b, "SalesWeeklySummary", { store_id: data.storeId }, ["sku", "week_start", "units", "net_revenue"]);
    const bySku = new Map();
    for (const r of rows) {
      let s = bySku.get(r.sku);
      if (!s) { s = { sku: r.sku, net_revenue: 0, weekly_units: {} }; bySku.set(r.sku, s); }
      s.net_revenue += Number(r.net_revenue) || 0;
      s.weekly_units[r.week_start] = (s.weekly_units[r.week_start] || 0) + (Number(r.units) || 0);
    }
    const input = [...bySku.values()].map((s) => ({ sku: s.sku, net_revenue: s.net_revenue, weekly_units: Object.entries(s.weekly_units).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v) }));
    const classified = abcXyz(input);
    const outRows = classified.map((c) => ({ store_id: data.storeId, sku: c.sku, abc_class: c.abc_class, xyz_class: c.xyz_class, cv: c.cv, revenue_share: c.revenue_share }));
    const existing = await readAll(b, "ProductClass", { store_id: data.storeId }, ["id", "store_id", "sku", "abc_class", "xyz_class", "cv", "revenue_share"]);
    const keyFn = (x) => `${x.store_id}|${x.sku}`;
    const r = await diffUpsert(b, "ProductClass", outRows, keyFn, ["abc_class", "xyz_class", "cv", "revenue_share"], existing);
    return { storeId: data.storeId, writes: r.writes, stopped: r.stopped, error: r.error };
  });

export const getAbcXyzMatrix = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const q = { ...scope }; if (data.storeId) q.store_id = data.storeId;
    const rows = await readAll(b, "ProductClass", q, ["store_id", "sku", "abc_class", "xyz_class"]);
    const matrix = {}; for (const a of ["A", "B", "C"]) for (const x of ["X", "Y", "Z"]) matrix[`${a}${x}`] = 0;
    for (const r of rows) matrix[`${r.abc_class}${r.xyz_class}`]++;
    return { matrix, total: rows.length };
  });

export const getAbcXyzSkus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string().optional(), abc: z.enum(["A", "B", "C"]), xyz: z.enum(["X", "Y", "Z"]) }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const q = { ...scope, abc_class: data.abc, xyz_class: data.xyz }; if (data.storeId) q.store_id = data.storeId;
    const rows = await readAll(b, "ProductClass", q, ["store_id", "sku", "cv", "revenue_share"]);
    const prods = await readAll(b, "Product", {}, ["sku", "category", "name"]);
    const pmap = new Map(prods.map((p) => [String(p.sku), p]));
    return rows.map((r) => ({ store_id: r.store_id, sku: r.sku, category: pmap.get(String(r.sku))?.category || "Unknown", name: pmap.get(String(r.sku))?.name || "", cv: r.cv, revenue_share: r.revenue_share })).sort((a, b) => b.revenue_share - a.revenue_share);
  });

// ============ 4. Anomaly detection ============
export const prepareAnomaly = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    // SalesTransaction has no category field. Stores come from transactions; the
    // store×category series count comes from SalesWeeklySummary (which carries
    // category), matching the categories the run produces via sku→category.
    const storeAgg = await b.entities.SalesTransaction.aggregate({ query: { ...scope, is_quarantined: { $ne: true } }, groupBy: "store_id" });
    const stores = (storeAgg.rows ?? []).map((r) => r.store_id).filter(Boolean).sort();
    const catAgg = await b.entities.SalesWeeklySummary.aggregate({ query: scope, groupBy: "store_id", countDistinct: "category" });
    const seriesCount = (catAgg.rows ?? []).reduce((a, r) => a + Number(r.count_distinct_category || 0), 0);
    return { stores, seriesCount, estimatedWrites: Math.max(seriesCount, 10) };
  });

export const runAnomalyStore = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string() }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const txns = await readAll(b, "SalesTransaction", { ...scope, store_id: data.storeId, is_quarantined: { $ne: true } }, ["date", "sku", "qty", "unit_price"]);
    const prods = await readAll(b, "Product", {}, ["sku", "category"]);
    const pmap = new Map(prods.map((p) => [String(p.sku), p.category || "Unknown"]));
    const byCat = new Map();
    for (const t of txns) {
      const cat = pmap.get(String(t.sku)) || "Unknown";
      const day = String(t.date);
      let s = byCat.get(cat);
      if (!s) { s = new Map(); byCat.set(cat, s); }
      s.set(day, (s.get(day) || 0) + (Number(t.qty) || 0) * (Number(t.unit_price) || 0));
    }
    const flagged = [];
    for (const [cat, dayMap] of byCat) {
      const series = [...dayMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
      for (const a of detectAnomalies(series)) flagged.push({ store_id: data.storeId, category: cat, date: a.date, expected: a.expected, actual: a.actual, z_score: a.z_score, direction: a.direction });
    }
    // diff against existing for the store
    const existing = await readAll(b, "Anomaly", { store_id: data.storeId }, ["id", "category", "date", "expected", "actual", "z_score", "direction"]);
    const keyFn = (x) => `${x.category}|${x.date}`;
    const exMap = new Map(existing.map((x) => [keyFn(x), x]));
    const newKeys = new Set(flagged.map(keyFn));
    const toCreate = []; const toUpdate = [];
    for (const row of flagged) { const ex = exMap.get(keyFn(row)); if (!ex) toCreate.push(row); else { let diff = false; for (const f of ["expected", "actual", "z_score", "direction"]) if (ex[f] !== row[f]) { diff = true; break; } if (diff) toUpdate.push({ id: ex.id, ...row }); } }
    const toDelete = existing.filter((x) => !newKeys.has(keyFn(x))).map((x) => x.id);
    let writes = 0; let stopped = false; let error = null;
    try {
      if (toCreate.length) { for (let i = 0; i < toCreate.length; i += 500) { const s = toCreate.slice(i, i + 500); await b.entities.Anomaly.bulkCreate(s); writes += s.length; } }
      if (toUpdate.length) { for (let i = 0; i < toUpdate.length; i += 500) { const s = toUpdate.slice(i, i + 500); await b.entities.Anomaly.bulkUpdate(s); writes += s.length; } }
      if (toDelete.length) { for (let i = 0; i < toDelete.length; i += 500) { const s = toDelete.slice(i, i + 500); await b.entities.Anomaly.deleteMany({ id: { $in: s } }); writes += s.length; } }
    } catch (e) { if (isLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
    return { storeId: data.storeId, writes, flagged: flagged.length, stopped, error };
  });

export const getAnomalies = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ storeId: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const q = { ...scope }; if (data.storeId) q.store_id = data.storeId;
    const rows = await readAll(b, "Anomaly", q, ["store_id", "category", "date", "expected", "actual", "z_score", "direction"]);
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  });