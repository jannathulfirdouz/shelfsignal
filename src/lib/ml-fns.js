import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, allowAnonymous } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { forecastSeries, segmentCustomers, abcXyz, detectAnomalies, pickWinner, FORECAST_MODELS, rfmRuleSegments } from "@/lib/ml.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canRun = (u) => ["owner", "analyst"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Only owners and analysts can run models"), { status: 403 });
const limitMsg = "Stopped: the app's daily limit of 100,000 record writes was reached. Run again later to continue.";
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const FORECAST_RUN = "forecast";
const PARTIAL_WEEK = "2011-12-05";

// Base44 caps list pages at 5000, so large pages mean far fewer requests.
const PAGE = 5000;
// Stay under the 140 req/60s list limit (with headroom) within one invocation.
const REQ_BUDGET = 110;
const RATE_WINDOW_MS = 60000;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msgOf = (e) => e?.data?.message || e?.message || "";
const isDailyLimit = (e) => /daily entity write limit/i.test(msgOf(e));
const isRateLimit = (e) => !isDailyLimit(e) && (e?.status === 429 || /rate limit|too many requests|retry after/i.test(msgOf(e)));
function retryAfterMs(e) { const m = /retry after (\d+)\s*s/i.exec(msgOf(e)); return m ? Number(m[1]) * 1000 : 10000; }

// Sliding-window throttle so one invocation stays under the request budget.
const _reqTimes = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (_reqTimes.length && now - _reqTimes[0] >= RATE_WINDOW_MS) _reqTimes.shift();
    if (_reqTimes.length < REQ_BUDGET) { _reqTimes.push(now); return; }
    await sleep(RATE_WINDOW_MS - (now - _reqTimes[0]) + 50);
  }
}
// Throttle + automatic 429 retry: wait the seconds in the message, up to MAX_RETRIES.
export async function withRate(fn) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    try { return await fn(); }
    catch (e) {
      if (!isRateLimit(e) || attempt >= MAX_RETRIES) throw e;
      await sleep(retryAfterMs(e));
    }
  }
}

export async function readAll(b, name, query, fields) {
  const rows = []; let cursor;
  do { const p = await withRate(() => b.entities[name].filter(query, { limit: PAGE, cursor, fields })); rows.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor);
  return rows;
}

// Adds units into a store|key -> Map(week -> units) bucket.
function addUnits(outer, store, key, week, u) {
  const sk = `${store}|${key}`;
  let m = outer.get(sk); if (!m) { m = new Map(); outer.set(sk, m); }
  m.set(week, (m.get(week) || 0) + u);
}
export async function audit(b, user, { action, entity, record_ref, detail }) {
  try { await b.entities.AuditLog.create({ user: user.email || user.id, role: roleOf(user), action, entity, record_ref: record_ref || "", timestamp: new Date().toISOString(), detail: detail || "" }); } catch { /* best-effort */ }
}

// Generic diff-upsert: create new, update changed, skip identical. Dedupes the
// incoming rows by key (last wins) so a batch never contains the same record
// twice, strips any accidental id from creates, and dedupes updates by id (last
// wins) so no two records in a bulkUpdate share an id. Returns writes.
async function diffUpsert(b, entityName, rows, keyFn, valFields, existingRows, force = false) {
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
      if (diff || force) toUpdateMap.set(ex.id, { id: ex.id, ...row }); // dedupe by id, last wins
    }
  }
  const toUpdate = [...toUpdateMap.values()];
  let writes = 0; let stopped = false; let error = null;
  try {
    if (toCreate.length) { for (let i = 0; i < toCreate.length; i += 500) { const s = toCreate.slice(i, i + 500); await withRate(() => b.entities[entityName].bulkCreate(s)); writes += s.length; } }
    if (toUpdate.length) { for (let i = 0; i < toUpdate.length; i += 500) { const s = toUpdate.slice(i, i + 500); await withRate(() => b.entities[entityName].bulkUpdate(s)); writes += s.length; } }
  } catch (e) { if (isDailyLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
  return { writes, stopped, error };
}

// ---- Models status (last run times) -----------------------------------------
export const getModelsStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const actions = ["run_forecast", "run_segmentation", "run_abcxyz", "run_anomaly", "generate_recommendations"];
    const out = {};
    for (const a of actions) {
      const p = await b.entities.AuditLog.filter({ action: a }, { sort: "-timestamp", limit: 1 });
      const key = a === "generate_recommendations" ? "recommendations" : a.replace("run_", "");
      out[key] = p.items?.[0]?.timestamp ?? null;
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
    return { series, estimatedWrites: series.length * 20 + 2 };
  });

export const runForecastChunk = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({
    series: z.array(z.object({ store_id: z.string(), series_type: z.enum(["category", "sku"]), series_key: z.string() })).max(20),
    sliceIndex: z.number().int(), totalSlices: z.number().int(), totalSeries: z.number().int(), runId: z.string().min(1),
  }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const user = context.user;
    const scope = storeScope(context.user);

    if (data.sliceIndex === 0) {
      // Keep only the latest run's Forecast rows; history lives in ForecastRun.
      // asServiceRole so analysts can re-run too (Forecast delete is owner-only).
      try { await b.asServiceRole.entities.Forecast.deleteMany({}); } catch { /* best-effort */ }
      await b.entities.ForecastRun.create({ run_id: data.runId, created_by: user.email || user.id, created_at: new Date().toISOString(), series_count: 0, series_total: data.totalSeries, skipped_count: 0, notes: "" });
    }

    // One large paged read for every series in this chunk instead of one request
    // per series. Weekly units are summed per store×category and store×sku.
    const orCond = data.series.map((s) => (s.series_type === "category" ? { store_id: s.store_id, category: s.series_key } : { store_id: s.store_id, sku: s.series_key }));
    const rows = await readAll(b, "SalesWeeklySummary", { ...scope, $or: orCond }, ["store_id", "sku", "category", "week_start", "units"]);
    const catBy = new Map(); const skuBy = new Map();
    for (const r of rows) {
      if (r.week_start >= PARTIAL_WEEK) continue;
      const u = Number(r.units) || 0;
      if (r.category) addUnits(catBy, r.store_id, r.category, r.week_start, u);
      if (r.sku) addUnits(skuBy, r.store_id, r.sku, r.week_start, u);
    }

    const outRows = [];
    const skips = [];
    let wapeSum = 0, seriesCount = 0;
    for (const s of data.series) {
      const m = (s.series_type === "category" ? catBy : skuBy).get(`${s.store_id}|${s.series_key}`);
      const weeks = m ? [...m.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1)).map(([week_start, units]) => ({ week_start, units })) : [];
      const res = forecastSeries(weeks);
      if (res.notEnough) {
        // Recorded so the run can report every series it could not model, and why.
        const complete = weeks.filter((w) => w.week_start < PARTIAL_WEEK).length;
        skips.push({
          store_id: s.store_id, series_type: s.series_type, series_key: s.series_key,
          reason: complete === 0 ? "No complete weeks of sales history" : `Only ${complete} complete weeks of history; 16 are needed`,
        });
        continue;
      }
      wapeSum += res.models[res.winner].wape; seriesCount++;
      const flag = res.risingTrend ? "Check: rising trend" : "";
      for (let i = 0; i < 8; i++) outRows.push({ run_id: data.runId, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: res.winner, wape: res.models[res.winner].wape, bias: res.models[res.winner].bias, week_start: res.testWeeks[i], predicted_units: res.backtestPred[i], lower: null, upper: null, is_backtest: true, actual_units: res.testActual[i], flag: "" });
      for (let i = 0; i < 8; i++) outRows.push({ run_id: data.runId, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: res.winner, wape: res.models[res.winner].wape, bias: res.models[res.winner].bias, week_start: res.forecastWeeks[i], predicted_units: res.forecast[i], lower: res.lower[i], upper: res.upper[i], is_backtest: false, actual_units: null, flag });
      for (const mdl of FORECAST_MODELS) {
        if (mdl === res.winner) continue;
        outRows.push({ run_id: data.runId, store_id: s.store_id, series_type: s.series_type, series_key: s.series_key, model: mdl, wape: res.models[mdl].wape, bias: res.models[mdl].bias, week_start: res.forecastWeeks[0], predicted_units: res.models[mdl].forecast[0], lower: null, upper: null, is_backtest: false, actual_units: null, flag: "" });
      }
    }

    // Forecast rows for this run were cleared on slice 0, so every row here is a
    // fresh create; diffUpsert still dedupes so no batch repeats a record.
    let writes = 0; let stopped = false; let error = null;
    if (outRows.length) {
      const keyFn = (x) => `${x.store_id}|${x.series_type}|${x.series_key}|${x.model}|${x.week_start}|${x.is_backtest}`;
      const r = await diffUpsert(b, "Forecast", outRows, keyFn, ["predicted_units", "lower", "upper", "wape", "bias", "actual_units", "flag"], []);
      writes = r.writes; stopped = r.stopped; error = r.error;
    }
    return { sliceIndex: data.sliceIndex, writes, stopped, error, wapeSum, seriesCount, skips };
  });

export const finalizeForecastRun = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({
    runId: z.string().min(1), avgWape: z.number(), seriesCount: z.number().int().nonnegative(), writes: z.number().int().nonnegative(),
    seriesTotal: z.number().int().nonnegative().optional(),
    skipped: z.array(z.object({ store_id: z.string(), series_type: z.string(), series_key: z.string(), reason: z.string().max(200) })).max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const skipped = data.skipped ?? [];
    const p = await b.entities.ForecastRun.filter({ run_id: data.runId }, { limit: 1 });
    const rec = p.items?.[0];
    if (rec) await b.entities.ForecastRun.update(rec.id, {
      avg_wape: data.avgWape,
      series_count: data.seriesCount,
      series_total: data.seriesTotal ?? data.seriesCount + skipped.length,
      skipped_count: skipped.length,
      notes: JSON.stringify(skipped),
    });
    await audit(b, context.user, { action: "run_forecast", entity: "Forecast", record_ref: data.runId, detail: `${data.seriesCount} series forecast, ${skipped.length} skipped, ${data.writes} writes, avg WAPE ${(data.avgWape * 100).toFixed(1)}%` });
    return { ok: true };
  });

export const getForecastData = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(z.object({ storeId: z.string().optional(), seriesType: z.string().optional(), seriesKey: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const sumRows = await readAll(b, "SalesWeeklySummary", scope, ["store_id", "week_start", "category", "sku", "units", "net_revenue"]);
    const stores = [...new Set(sumRows.map((r) => r.store_id))].sort();

    // Latest run + history (most recent first).
    const runPage = await b.entities.ForecastRun.filter({}, { sort: "-created_at", limit: 12 });
    const runs = (runPage.items ?? []).map((r) => ({ run_id: r.run_id, created_at: r.created_at, created_by: r.created_by, series_count: r.series_count ?? null, series_total: r.series_total ?? null, skipped_count: r.skipped_count ?? null, avg_wape: r.avg_wape ?? null }));
    const runId = runs[0]?.run_id ?? null;
    const latest = runPage.items?.[0] ?? null;
    let skipped = [];
    try { skipped = latest?.notes ? JSON.parse(latest.notes) : []; } catch { skipped = []; }
    const coverage = {
      seriesTotal: latest?.series_total ?? runs[0]?.series_total ?? null,
      seriesCount: latest?.series_count ?? runs[0]?.series_count ?? null,
      skippedCount: latest?.skipped_count ?? runs[0]?.skipped_count ?? skipped.length ?? null,
      skipped,
      createdAt: latest?.created_at ?? null,
    };
    const empty = { stores, series: [], actuals: [], backtest: [], forecast: [], comparison: [], winner: null, selectionReason: "", risingTrend: false, runs, runId, coverage };
    if (!data.storeId) return empty;

    const storeRows = sumRows.filter((r) => r.store_id === data.storeId);
    const cats = new Set(); const skuRev = new Map();
    for (const r of storeRows) { if (r.category) cats.add(r.category); skuRev.set(r.sku, (skuRev.get(r.sku) || 0) + (Number(r.net_revenue) || 0)); }
    const series = [
      ...[...cats].sort().map((c) => ({ series_type: "category", series_key: c, label: c })),
      ...[...skuRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([sku]) => ({ series_type: "sku", series_key: sku, label: sku })),
    ];
    // Latest-run forecasts for this store tell us which series have data; the rest
    // (fewer than 16 complete weeks) are listed but flagged "not enough data".
    const fkRows = runId ? await readAll(b, "Forecast", { ...scope, run_id: runId, store_id: data.storeId }, ["series_type", "series_key"]) : [];
    const haveForecast = new Set(fkRows.map((r) => `${r.series_type}|${r.series_key}`));
    const seen = new Set(series.map((s) => `${s.series_type}|${s.series_key}`));
    for (const r of fkRows) {
      const k = `${r.series_type}|${r.series_key}`;
      if (!seen.has(k)) { seen.add(k); series.push({ series_type: r.series_type, series_key: r.series_key, label: r.series_key }); }
    }
    for (const s of series) s.notEnough = !haveForecast.has(`${s.series_type}|${s.series_key}`);
    if (!data.seriesKey) return { ...empty, series };

    // Actual weekly units for every history week, summed per week (a category spans
    // several SKU rows per week). Includes the backtest weeks for comparison.
    const actMap = new Map();
    for (const r of storeRows) {
      const match = data.seriesType === "category" ? r.category === data.seriesKey : r.sku === data.seriesKey;
      if (!match) continue;
      actMap.set(r.week_start, (actMap.get(r.week_start) || 0) + (Number(r.units) || 0));
    }
    const actuals = [...actMap.entries()].map(([week_start, units]) => ({ week_start, units: Math.round(units) })).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));

    const fRows = runId ? await readAll(b, "Forecast", { ...scope, run_id: runId, store_id: data.storeId, series_type: data.seriesType, series_key: data.seriesKey }, ["model", "week_start", "is_backtest", "predicted_units", "lower", "upper", "wape", "bias", "actual_units", "flag"]) : [];
    const backtest = fRows.filter((r) => r.is_backtest).map((r) => ({ week_start: r.week_start, predicted: r.predicted_units, actual: r.actual_units })).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
    const winnerRows = fRows.filter((r) => !r.is_backtest);
    const forecast = winnerRows.filter((r) => r.lower != null || r.upper != null).map((r) => ({ week_start: r.week_start, predicted: r.predicted_units, lower: r.lower, upper: r.upper })).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
    const byModel = new Map();
    for (const r of fRows) if (!byModel.has(r.model)) byModel.set(r.model, { model: r.model, wape: r.wape, bias: r.bias });
    const { winner, reason } = pickWinner(Object.fromEntries(byModel));
    const comparison = [...byModel.values()].map((m) => ({ ...m, isWinner: m.model === winner }));
    const risingTrend = fRows.some((r) => r.flag === "Check: rising trend");
    return { stores, series, actuals, backtest, forecast, comparison, winner, selectionReason: reason, risingTrend, runs, runId, coverage };
  });

// ============ 2. Customer segmentation ============
export const prepareSegmentation = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const a = await b.entities.SalesTransaction.aggregate({ query: { ...scope, is_quarantined: { $ne: true }, customer_ref: { $exists: true, $nin: ["", "null", "NULL", "Null"] } }, countDistinct: "customer_ref" });
    const count = Number(a.rows?.[0]?.count_distinct_customer_ref || 0);
    return { count, estimatedWrites: count + 1 };
  });

export const runSegmentation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    // Drop any stale segment rows with a blank or "null" customer reference.
    try { await b.asServiceRole.entities.CustomerSegment.deleteMany({ customer_ref: { $in: ["null", "NULL", "Null", ""] } }); } catch { /* best-effort */ }
    const txns = await readAll(b, "SalesTransaction", { ...scope, is_quarantined: { $ne: true }, customer_ref: { $exists: true, $ne: "" } }, ["customer_ref", "invoice_no", "date", "sku", "qty", "unit_price"]);
    const customers = await readAll(b, "Customer", {}, ["customer_ref", "country"]);
    const countryMap = new Map(customers.map((c) => [String(c.customer_ref), c.country]));
    const REF_DATE = new Date("2011-12-09T00:00:00Z");
    const byCust = new Map();
    for (const t of txns) {
      const ref = String(t.customer_ref ?? "").trim();
      if (!ref || ref.toLowerCase() === "null") continue;
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
  .validator(z.object({ rows: z.array(z.object({ customer_ref: z.string(), store_id: z.string(), recency_days: z.number(), frequency: z.number(), monetary: z.number(), segment: z.string() })).max(500), force: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const refs = data.rows.map((r) => r.customer_ref);
    const existing = await readAll(b, "CustomerSegment", { customer_ref: { $in: refs } }, ["id", "customer_ref", "store_id", "recency_days", "frequency", "monetary", "segment"]);
    const keyFn = (x) => String(x.customer_ref);
    // Compares segment plus every RFM field; `force` rewrites all of them regardless.
    const r = await diffUpsert(b, "CustomerSegment", data.rows, keyFn, ["store_id", "recency_days", "frequency", "monetary", "segment"], existing, !!data.force);
    return { writes: r.writes, stopped: r.stopped, error: r.error };
  });

export const getSegmentData = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
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
    const totalSeg = segRows.length || 1;
    const dominant = summary.reduce((a, s) => (s.count > (a ? a.count : 0) ? s : a), null);
    const dominantSharePct = dominant ? r2((dominant.count / totalSeg) * 100) : 0;
    const atRisk = (groups["At risk"]?.monetary || 0);
    let list = segRows.map((r) => ({ customer_ref: r.customer_ref, store_id: r.store_id, segment: r.segment, recency: r.recency_days, frequency: r.frequency, monetary: r.monetary, email: emailMap.get(r.customer_ref) || null }));
    if (data.segment) list = list.filter((r) => r.segment === data.segment);
    list.sort((a, b) => b.monetary - a.monetary);

    // Rule-based cross-check: how each k-means segment is classified by plain RFM
    // quintile scores (1-5 per dimension, deterministic labels).
    const SEGS = ["Champions", "Loyal", "At risk", "Lost"];
    const rule = rfmRuleSegments(segRows.map((r) => ({ recency: r.recency_days, frequency: r.frequency, monetary: r.monetary })));
    const comparison = SEGS.map((s) => {
      const row = { segment: s, total: 0 };
      for (const t of SEGS) row[t] = 0;
      return row;
    });
    const bySeg = new Map(comparison.map((c) => [c.segment, c]));
    segRows.forEach((r, i) => {
      const c = bySeg.get(r.segment) || bySeg.get("At risk");
      c.total++;
      c[rule[i].rule_segment]++;
    });

    return { summary, comparison, atRiskRevenue: r2(atRisk), totalCustomers: segRows.length, dominantSegment: dominant?.segment ?? null, dominantSharePct, customers: list.slice(0, 500) };
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
  .middleware([allowAnonymous])
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
  .middleware([allowAnonymous])
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
      for (const a of detectAnomalies(series)) flagged.push({ store_id: data.storeId, category: cat, date: a.date, expected: a.expected, actual: a.actual, z_score: a.z_score, direction: a.direction, abs_diff: a.abs_diff, peak_season: a.peak_season });
    }
    // diff against existing for the store
    const existing = await readAll(b, "Anomaly", { store_id: data.storeId }, ["id", "category", "date", "expected", "actual", "z_score", "direction", "abs_diff", "peak_season"]);
    const keyFn = (x) => `${x.category}|${x.date}`;
    const exMap = new Map(existing.map((x) => [keyFn(x), x]));
    const newKeys = new Set(flagged.map(keyFn));
    const toCreate = []; const toUpdate = [];
    for (const row of flagged) { const ex = exMap.get(keyFn(row)); if (!ex) toCreate.push(row); else { let diff = false; for (const f of ["expected", "actual", "z_score", "direction", "abs_diff", "peak_season"]) if (ex[f] !== row[f]) { diff = true; break; } if (diff) toUpdate.push({ id: ex.id, ...row }); } }
    const toDelete = existing.filter((x) => !newKeys.has(keyFn(x))).map((x) => x.id);
    let writes = 0; let stopped = false; let error = null;
    try {
      if (toCreate.length) { for (let i = 0; i < toCreate.length; i += 500) { const s = toCreate.slice(i, i + 500); await withRate(() => b.entities.Anomaly.bulkCreate(s)); writes += s.length; } }
      if (toUpdate.length) { for (let i = 0; i < toUpdate.length; i += 500) { const s = toUpdate.slice(i, i + 500); await withRate(() => b.entities.Anomaly.bulkUpdate(s)); writes += s.length; } }
      if (toDelete.length) { for (let i = 0; i < toDelete.length; i += 500) { const s = toDelete.slice(i, i + 500); await withRate(() => b.entities.Anomaly.deleteMany({ id: { $in: s } })); writes += s.length; } }
    } catch (e) { if (isDailyLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
    return { storeId: data.storeId, writes, flagged: flagged.length, stopped, error };
  });

export const getAnomalies = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(z.object({ storeId: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const q = { ...scope }; if (data.storeId) q.store_id = data.storeId;
    const rows = await readAll(b, "Anomaly", q, ["store_id", "category", "date", "expected", "actual", "z_score", "direction", "abs_diff", "peak_season"]);
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  });