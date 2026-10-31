import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, allowAnonymous } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { readAll, withRate, audit } from "@/lib/ml-fns";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canRun = (u) => ["owner", "analyst"].includes(roleOf(u));
const canDecide = (u) => ["owner", "store_manager"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Only owners and analysts can generate recommendations"), { status: 403 });
const LIMIT = "Stopped: the app's daily limit of 100,000 record writes was reached. Run again later to continue.";

const num = (v) => Number(v) || 0;
const r0 = (n) => Math.round(num(n));
const r2 = (n) => Math.round(num(n) * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, c) => x + c, 0) / a.length : 0);
const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, c) => x + (c - m) ** 2, 0) / a.length); };
function addDays(d, n) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// Confidence rule: forecast WAPE below 25% is high, 25% to 45% is medium, above 45%
// (or no forecast for the series) is low. A trust score under 90% downgrades the
// result by one level. Shown as a tooltip on every Action centre card.
function confidenceFor(wape, trust) {
  if (wape == null || !isFinite(wape)) return "low";
  let level = wape < 0.25 ? "high" : wape <= 0.45 ? "medium" : "low";
  if (trust != null && trust < 90) level = level === "high" ? "medium" : "low";
  return level;
}
const keyOf = (r) => [r.type, r.store_id || "", r.sku || "", r.category || "", r.customer_ref || ""].join("|");

async function latestTrustScore(b) {
  const p = await b.entities.DataBatch.filter({ file_name: "sales_transactions.csv", quality_status: "complete" }, { sort: "-created_date", limit: 1, fields: ["quality_score"] });
  return p.items?.[0]?.quality_score ?? null;
}

export const prepareRecommendations = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const snap = await b.entities.InventorySnapshot.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const date = snap.items?.[0]?.date;
    const positions = date ? await b.entities.InventorySnapshot.count({ ...scope, date }) : 0;
    return { estimatedWrites: positions + 80, positions };
  });

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const user = context.user;
    const scope = storeScope(context.user);
    const trust = await latestTrustScore(b);
    const now = new Date().toISOString();
    const runId = "rec_" + Date.now();
    const recs = [];

    // Reference data.
    const products = new Map();
    for (const p of await readAll(b, "Product", {}, ["sku", "category", "unit_cost", "unit_price", "supplier_id", "name"])) products.set(String(p.sku), p);
    const suppliers = new Map();
    for (const s of await readAll(b, "Supplier", {}, ["supplier_id", "lead_time_days", "min_order_qty"])) suppliers.set(String(s.supplier_id), s);
    const pclass = new Map();
    for (const r of await readAll(b, "ProductClass", scope, ["store_id", "sku", "abc_class", "xyz_class"])) pclass.set(`${r.store_id}|${r.sku}`, r);

    // Weekly units over the last 8 weeks (last 4 for demand, 8 for volatility).
    const weekly = new Map();
    const maxW = (await b.entities.SalesWeeklySummary.filter(scope, { sort: "-week_start", limit: 1, fields: ["week_start"] })).items?.[0]?.week_start;
    const seasonMonth = maxW ? Number(String(maxW).slice(5, 7)) : 0;
    const peakSeason = seasonMonth === 11 || seasonMonth === 12;
    if (maxW) {
      const from = addDays(maxW, -55);
      const rows = await readAll(b, "SalesWeeklySummary", { ...scope, week_start: { $gte: from } }, ["store_id", "sku", "week_start", "units"]);
      const tmp = new Map();
      for (const r of rows) { const k = `${r.store_id}|${r.sku}`; let m = tmp.get(k); if (!m) { m = new Map(); tmp.set(k, m); } m.set(r.week_start, num(r.units)); }
      for (const [k, m] of tmp) weekly.set(k, [...m.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1)).map(([, v]) => v));
    }

    // Latest forecast run (SKU series): weekly demand, WAPE, model, rising-trend flag.
    const runP = await b.entities.ForecastRun.filter({}, { sort: "-created_at", limit: 1 });
    const fRunId = runP.items?.[0]?.run_id ?? null;
    const fmap = new Map();
    if (fRunId) {
      const rows = await readAll(b, "Forecast", { ...scope, run_id: fRunId, series_type: "sku", is_backtest: false }, ["store_id", "series_key", "predicted_units", "wape", "model", "flag"]);
      const tmp = new Map();
      for (const r of rows) {
        const k = `${r.store_id}|${r.series_key}`;
        let e = tmp.get(k); if (!e) { e = { vals: [], wape: r.wape, model: r.model, flag: "" }; tmp.set(k, e); }
        e.vals.push(num(r.predicted_units));
        if (r.flag) e.flag = r.flag;
      }
      for (const [k, e] of tmp) fmap.set(k, { weekly: mean(e.vals), wape: e.wape, model: e.model, flag: e.flag });
    }

    // Latest inventory snapshot positions.
    const snapP = await b.entities.InventorySnapshot.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const snapDate = snapP.items?.[0]?.date;
    const positions = snapDate ? await readAll(b, "InventorySnapshot", { ...scope, date: snapDate }, ["store_id", "sku", "on_hand", "on_order", "is_simulated"]) : [];

    for (const row of positions) {
      const key = `${row.store_id}|${row.sku}`;
      const p = products.get(String(row.sku)) || {};
      const wk = weekly.get(key) || [];
      const avg4 = mean(wk.slice(-4));
      const sd8 = std(wk.slice(-8));
      const fc = fmap.get(key);
      const weeklyDemand = Math.max(0, fc ? fc.weekly : avg4);
      const sup = suppliers.get(String(p.supplier_id || "")) || {};
      const leadTime = num(sup.lead_time_days) || 14;
      const moq = Math.max(1, num(sup.min_order_qty) || 1);
      const onHand = num(row.on_hand), onOrder = num(row.on_order);
      const safety = 1.65 * sd8 * Math.sqrt(leadTime / 7);
      const reorderPoint = weeklyDemand * (leadTime / 7) + safety;
      const available = onHand + onOrder;
      const simulated = !!row.is_simulated;
      const pc = pclass.get(key);

      // Seasonal guard: when the window includes November/December peak trading, or the
      // series is flagged as a rising trend, the forecast over-states January demand, so
      // the order quantity is sized on the last 8 weeks of actuals instead.
      const seasonalGuard = peakSeason || (fc?.flag === "Check: rising trend");
      const orderDemand = seasonalGuard ? mean(wk.slice(-8)) : weeklyDemand;

      // Reorder
      if (available < reorderPoint || onHand === 0) {
        const shortfall = Math.max(0, reorderPoint - available);
        const rawQty = Math.max(0, Math.ceil(reorderPoint + 2 * orderDemand - available));
        const orderQty = Math.ceil(rawQty / moq) * moq;
        const price = num(p.unit_price) || num(p.unit_cost);
        const base = `On hand ${onHand} and on order ${onOrder}, below the reorder point of ${r0(reorderPoint)} units. Supplier lead time is ${leadTime} days. ` +
          (fc ? `Forecast demand is ${r0(weeklyDemand)} units per week (${fc.model}, WAPE ${(num(fc.wape) * 100).toFixed(1)}%).` : `Average demand is ${r0(avg4)} units per week (last 4 weeks).`);
        recs.push({
          type: "reorder", store_id: row.store_id, sku: row.sku, category: p.category || "", customer_ref: "",
          title: `Reorder ${row.sku}${p.name ? ` — ${p.name}` : ""}`,
          reason: base + (seasonalGuard ? " Peak-season guard: the order quantity uses the last 8 weeks of actuals, so re-check it for January before ordering." : "") + (simulated ? " Based on simulated stock." : ""),
          metrics: { on_hand: onHand, on_order: onOrder, available, reorder_point: r0(reorderPoint), safety_stock: r0(safety), weekly_demand: r0(weeklyDemand), order_demand_used: r0(orderDemand), seasonal_guard: seasonalGuard, abc_class: pc?.abc_class ?? null, std_weekly_units: r2(sd8), lead_time_days: leadTime, min_order_qty: moq, order_qty: orderQty, unit_price: r2(p.unit_price), unit_cost: r2(p.unit_cost), shortfall_units: r0(shortfall), wape: fc ? num(fc.wape) : null, model: fc ? fc.model : null, is_simulated: simulated, trust_score: trust },
          confidence: confidenceFor(fc ? num(fc.wape) : null, trust), expected_impact_gbp: r0(shortfall * price),
        });
      }

      // Markdown: ABC C or XYZ Z with stock cover above 120 days.
      if (pc && (pc.abc_class === "C" || pc.xyz_class === "Z") && onHand > 0) {
        const avgDaily = avg4 / 7;
        const cover = avgDaily > 0 ? onHand / avgDaily : Infinity;
        if (cover > 120) {
          const stockValue = onHand * num(p.unit_cost);
          const coverText = isFinite(cover) ? `${Math.round(cover)} days` : "no recent sales";
          recs.push({
            type: "markdown", store_id: row.store_id, sku: row.sku, category: p.category || "", customer_ref: "",
            title: `Markdown ${row.sku}${p.name ? ` — ${p.name}` : ""}`,
            reason: `${row.sku} is ${pc.abc_class}/${pc.xyz_class} class with ${coverText} of cover. On hand ${onHand} units, £${r0(stockValue)} at cost. Suggest a markdown to clear stock.`,
            metrics: { on_hand: onHand, cover_days: isFinite(cover) ? r0(cover) : null, abc_class: pc.abc_class, xyz_class: pc.xyz_class, unit_cost: r2(p.unit_cost), stock_value: r0(stockValue), avg_daily_units: r2(avgDaily), trust_score: trust },
            confidence: confidenceFor(fc ? num(fc.wape) : null, trust), expected_impact_gbp: r0(stockValue),
          });
        }
      }
    }

    // Investigate: anomaly days in the last 4 weeks of data (one per store × category).
    const anomP = await b.entities.Anomaly.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const anomMax = anomP.items?.[0]?.date;
    if (anomMax) {
      const from = addDays(anomMax, -27);
      const rows = await readAll(b, "Anomaly", { ...scope, date: { $gte: from } }, ["store_id", "category", "date", "expected", "actual", "z_score"]);
      const byCat = new Map();
      for (const a of rows) {
        const k = `${a.store_id}|${a.category}`;
        let e = byCat.get(k); if (!e) { e = { store: a.store_id, category: a.category, days: 0, maxZ: 0, dev: 0, last: a.date, peak: a }; byCat.set(k, e); }
        e.days++; e.dev += Math.abs(num(a.actual) - num(a.expected));
        if (Math.abs(num(a.z_score)) > Math.abs(e.maxZ)) { e.maxZ = num(a.z_score); e.peak = a; }
        if (a.date > e.last) e.last = a.date;
      }
      for (const e of byCat.values()) {
        recs.push({
          type: "investigate", store_id: e.store, sku: "", category: e.category, customer_ref: "",
          title: `Investigate ${e.category} in ${e.store}`,
          reason: `${e.days} anomaly day${e.days === 1 ? "" : "s"} in the last 4 weeks; largest deviation z = ${r2(e.maxZ)} on ${e.peak.date} (actual £${r0(e.peak.actual)} vs expected £${r0(e.peak.expected)}).`,
          metrics: { anomaly_days: e.days, max_abs_z: Math.abs(r2(e.maxZ)), deviation_gbp: r0(e.dev), last_anomaly: e.last, trust_score: trust },
          confidence: trust != null && trust >= 95 ? "medium" : "low", expected_impact_gbp: r0(e.dev),
        });
      }
    }

    // Investigate: SKUs whose forecast is flagged "Check: rising trend".
    for (const [k, fc] of fmap) {
      if (fc.flag !== "Check: rising trend") continue;
      const [store_id, sku] = k.split("|");
      const p = products.get(String(sku)) || {};
      const last8 = mean((weekly.get(k) || []).slice(-8));
      const risePct = last8 > 0 ? ((fc.weekly - last8) / last8) * 100 : 100;
      const price = num(p.unit_price) || num(p.unit_cost);
      recs.push({
        type: "investigate", store_id, sku, category: p.category || "", customer_ref: "",
        title: `Check: rising trend — ${sku} in ${store_id}`,
        reason: `${sku} forecast averages ${r0(fc.weekly)} units per week over 8 weeks, ${r0(risePct)}% above the last 8 weeks of actuals (${r0(last8)} units). Check: rising trend.`,
        metrics: { weekly_forecast: r0(fc.weekly), last8_avg_units: r0(last8), rise_pct: r0(risePct), wape: num(fc.wape), model: fc.model, trust_score: trust },
        confidence: confidenceFor(num(fc.wape), trust), expected_impact_gbp: r0(Math.abs(fc.weekly - last8) * price * 8),
      });
    }

    // Re-engage: top 20 "At risk" customers by monetary value.
    const atRisk = await readAll(b, "CustomerSegment", { ...scope, segment: "At risk" }, ["customer_ref", "store_id", "recency_days", "frequency", "monetary"]);
    atRisk.sort((a, b2) => num(b2.monetary) - num(a.monetary));
    for (const c of atRisk.slice(0, 20)) {
      recs.push({
        type: "re_engage", store_id: c.store_id, sku: "", category: "", customer_ref: c.customer_ref,
        title: `Re-engage ${c.customer_ref}`,
        reason: `${c.customer_ref} is an At risk customer with £${r0(c.monetary)} historic spend across ${c.frequency} order${num(c.frequency) === 1 ? "" : "s"}; last purchase ${num(c.recency_days)} days before 2011-12-09.`,
        metrics: { monetary: r2(c.monetary), frequency: c.frequency, recency_days: c.recency_days, trust_score: trust },
        confidence: trust != null && trust >= 95 ? "medium" : "low", expected_impact_gbp: r0(c.monetary),
      });
    }

    // Upsert: create new, update changed "new" ones only, never touch accepted/rejected.
    const existing = await readAll(b, "Recommendation", scope, ["type", "store_id", "sku", "category", "customer_ref", "title", "reason", "metrics", "confidence", "expected_impact_gbp", "status"]);
    const exByKey = new Map(existing.map((r) => [keyOf(r), r]));
    const newKeys = new Set(recs.map(keyOf));
    const toCreate = []; const toUpdate = []; const stale = [];
    for (const rec of recs) {
      rec.generated_at = now; rec.run_id = runId; rec.status = "new";
      const ex = exByKey.get(keyOf(rec));
      if (!ex) { toCreate.push(rec); continue; }
      if (ex.status === "accepted" || ex.status === "rejected") continue;
      const changed = ex.title !== rec.title || ex.reason !== rec.reason || ex.confidence !== rec.confidence || ex.expected_impact_gbp !== rec.expected_impact_gbp || JSON.stringify(ex.metrics || {}) !== JSON.stringify(rec.metrics || {});
      if (changed) toUpdate.push({ id: ex.id, ...rec });
    }
    for (const ex of existing) if (ex.status === "new" && !newKeys.has(keyOf(ex))) stale.push(ex.id);

    let writes = 0; let stopped = false; let error = null;
    try {
      if (toCreate.length) { for (let i = 0; i < toCreate.length; i += 500) { const s = toCreate.slice(i, i + 500); await withRate(() => b.entities.Recommendation.bulkCreate(s)); writes += s.length; } }
      if (toUpdate.length) { for (let i = 0; i < toUpdate.length; i += 500) { const s = toUpdate.slice(i, i + 500); await withRate(() => b.entities.Recommendation.bulkUpdate(s)); writes += s.length; } }
      if (stale.length) { for (let i = 0; i < stale.length; i += 500) { const s = stale.slice(i, i + 500); await withRate(() => b.entities.Recommendation.deleteMany({ id: { $in: s } })); writes += s.length; } }
    } catch (e) { if (/daily entity write limit/i.test(e?.data?.message || e?.message || "")) { stopped = true; error = LIMIT; } else throw e; }

    await audit(b, user, { action: "generate_recommendations", entity: "Recommendation", record_ref: runId, detail: `${toCreate.length} new, ${toUpdate.length} updated, ${stale.length} removed, ${writes} writes` });
    return { runId, writes, created: toCreate.length, updated: toUpdate.length, removed: stale.length, total: recs.length, stopped, error };
  });

export const getRecommendations = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const rows = await readAll(b, "Recommendation", scope, ["type", "store_id", "sku", "category", "customer_ref", "title", "reason", "metrics", "confidence", "expected_impact_gbp", "status", "decided_by", "decided_at", "decision_note", "generated_at", "run_id", "ai_explanation"]);
    rows.sort((a, b2) => num(b2.expected_impact_gbp) - num(a.expected_impact_gbp));
    return {
      recommendations: rows,
      canDecide: canDecide(context.user),
      role: roleOf(context.user),
      storeId: context.user?.store_id || context.user?.data?.store_id || "",
      generatedAt: rows[0]?.generated_at ?? null,
    };
  });

export const decideRecommendation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string(), status: z.enum(["accepted", "rejected"]), note: z.string().max(500).optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const user = context.user;
    const role = roleOf(user);
    if (!canDecide(user)) throw Object.assign(new Error("Only owners and store managers can decide recommendations"), { status: 403 });
    const rec = await b.entities.Recommendation.get(data.id);
    const storeId = user?.store_id || user?.data?.store_id;
    if (role === "store_manager" && rec.store_id !== storeId) throw Object.assign(new Error("You can only decide recommendations for your own store"), { status: 403 });
    await b.asServiceRole.entities.Recommendation.update(data.id, { status: data.status, decided_by: user.email || user.id, decided_at: new Date().toISOString(), decision_note: data.note || "" });
    await audit(b, user, { action: data.status === "accepted" ? "recommendation_accept" : "recommendation_reject", entity: "Recommendation", record_ref: data.id, detail: `${rec.title} → ${data.status}${data.note ? ` (${data.note})` : ""}` });
    return { ok: true };
  });

export const explainRecommendation = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    // Spending an AI credit needs a signed-in caller.
    if (!context.user) throw Object.assign(new Error("Sign in to generate an explanation"), { status: 401 });
    const rec = await b.entities.Recommendation.get(data.id);
    if (rec.ai_explanation) return { explanation: rec.ai_explanation };
    const prompt = `You are a retail operations assistant. Explain this recommendation in at most 3 short sentences for a store manager. Use ONLY the numbers in the metrics JSON. Do not invent any figure, product, supplier or date. Do not add advice beyond the recommendation.\n\nRecommendation: ${rec.title}\nType: ${rec.type}\nReason: ${rec.reason}\nMetrics JSON: ${JSON.stringify(rec.metrics || {})}`;
    const text = await b.asServiceRole.integrations.Core.InvokeLLM({ prompt });
    const explanation = String(text || "").trim();
    if (explanation) { try { await b.asServiceRole.entities.Recommendation.update(data.id, { ai_explanation: explanation }); } catch { /* best-effort */ } }
    return { explanation };
  });