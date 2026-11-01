import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const canRun = (u) => ["owner", "analyst"].includes(roleOf(u));
const forbid = () => Object.assign(new Error("Only owners and analysts can do this"), { status: 403 });
const isLimit = (e) => e?.status === 429 || /daily entity write limit/i.test(e?.data?.message || e?.message || "");
const limitMsg = "Stopped: the app's daily limit of 100,000 record writes was reached. Run again later to continue.";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

function addDays(dStr, n) {
  const d = new Date(dStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dStr) {
  const d = new Date(dStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
function weekStarts(minDate, maxDate) {
  let start = mondayOf(minDate);
  const end = mondayOf(maxDate);
  const out = [];
  while (start <= end) { out.push(start); start = addDays(start, 7); }
  return out;
}
function parseDT(txn_datetime, date) {
  if (txn_datetime) { const d = new Date(String(txn_datetime).replace(" ", "T")); if (!isNaN(d)) return d; }
  if (date) return new Date(date + "T00:00:00Z");
  return new Date();
}

async function readAll(b, name, query, fields) {
  const rows = [];
  let cursor;
  do {
    const page = await b.entities[name].filter(query, { limit: 1000, cursor, fields });
    rows.push(...(page.items ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function loadProductsFull(b) {
  const map = new Map();
  const rows = await readAll(b, "Product", {}, ["sku", "category", "unit_cost", "supplier_id", "days_since_last_sale", "unit_price"]);
  for (const p of rows) map.set(String(p.sku), { category: p.category || "Unknown", unit_cost: Number(p.unit_cost) || 0, supplier_id: p.supplier_id || "", days_since_last_sale: p.days_since_last_sale ?? null, unit_price: Number(p.unit_price) || 0 });
  return map;
}

// ---- Plan: weeks to process + estimated writes ------------------------------
export const getRefreshPlan = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const clean = { ...scope, is_quarantined: { $ne: true } };
    const minP = await b.entities.SalesTransaction.filter(clean, { sort: "date", limit: 1, fields: ["date"] });
    const maxP = await b.entities.SalesTransaction.filter(clean, { sort: "-date", limit: 1, fields: ["date"] });
    const minD = minP.items?.[0]?.date;
    const maxD = maxP.items?.[0]?.date;
    const weeks = minD && maxD ? weekStarts(minD, maxD) : [];
    const count = await b.entities.SalesTransaction.count(clean);
    // Rough: ~1 weekly row per 3 transactions + the small hourly table.
    const estimatedWrites = Math.min(Math.round(count / 3), 60000) + 504;
    return { weeks, weekCount: weeks.length, estimatedWrites, rowCount: count, minDate: minD, maxDate: maxD };
  });

// ---- Process one week: write changed weekly rows, return hourly contributions -
export const refreshWeek = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ weekStart: z.string(), storeFilter: z.string().optional() }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const weekStart = data.weekStart;
    const weekEnd = addDays(weekStart, 7);
    const query = { ...scope, is_quarantined: { $ne: true }, date: { $gte: weekStart, $lt: weekEnd } };
    if (data.storeFilter) query.store_id = data.storeFilter;

    const rows = await readAll(b, "SalesTransaction", query, ["invoice_no", "date", "txn_datetime", "store_id", "sku", "qty", "unit_price"]);
    const products = await loadProductsFull(b);

    const weekly = new Map();
    const hourly = new Map();
    for (const r of rows) {
      const p = products.get(String(r.sku ?? "")) || { category: "Unknown", unit_cost: 0 };
      const cat = p.category || "Unknown";
      const isRet = String(r.invoice_no ?? "").toUpperCase().startsWith("C");
      const qty = Number(r.qty) || 0;
      const price = Number(r.unit_price) || 0;
      const lineNet = qty * price;
      const wKey = `${weekStart}|${r.store_id ?? ""}|${r.sku ?? ""}|${cat}`;
      let w = weekly.get(wKey);
      if (!w) { w = { week_start: weekStart, store_id: r.store_id ?? "", sku: String(r.sku ?? ""), category: cat, units: 0, gross_revenue: 0, returns_value: 0, net_revenue: 0, orders: new Set(), cost: 0 }; weekly.set(wKey, w); }
      w.units += qty;
      if (isRet) w.returns_value += Math.abs(qty) * price;
      else { w.gross_revenue += qty * price; w.cost += qty * (p.unit_cost || 0); }
      w.net_revenue += lineNet;
      w.orders.add(r.invoice_no);

      const dt = parseDT(r.txn_datetime, r.date);
      const wd = dt.getUTCDay();
      const hr = dt.getUTCHours();
      const hKey = `${r.store_id ?? ""}|${wd}|${hr}`;
      let h = hourly.get(hKey);
      if (!h) { h = { store_id: r.store_id ?? "", weekday: wd, hour: hr, net_revenue: 0, orders: new Set() }; hourly.set(hKey, h); }
      h.net_revenue += lineNet;
      h.orders.add(r.invoice_no);
    }

    const existing = await readAll(b, "SalesWeeklySummary", { ...scope, week_start: weekStart, ...(data.storeFilter ? { store_id: data.storeFilter } : {}) }, ["id", "store_id", "sku", "category", "units", "gross_revenue", "returns_value", "net_revenue", "orders", "cost"]);
    const exMap = new Map(existing.map((x) => [`${x.store_id}|${x.sku}|${x.category}`, x]));
    const toCreate = [];
    const toUpdate = [];
    for (const w of weekly.values()) {
      const row = { week_start: w.week_start, store_id: w.store_id, sku: w.sku, category: w.category, units: w.units, gross_revenue: r2(w.gross_revenue), returns_value: r2(w.returns_value), net_revenue: r2(w.net_revenue), orders: w.orders.size, cost: r2(w.cost) };
      const ex = exMap.get(`${w.store_id}|${w.sku}|${w.category}`);
      if (!ex) toCreate.push(row);
      else if (ex.units !== row.units || ex.gross_revenue !== row.gross_revenue || ex.returns_value !== row.returns_value || ex.net_revenue !== row.net_revenue || ex.orders !== row.orders || ex.cost !== row.cost) toUpdate.push({ id: ex.id, ...row });
    }

    let writes = 0;
    let stopped = false;
    let error = null;
    try {
      if (toCreate.length) { await b.entities.SalesWeeklySummary.bulkCreate(toCreate); writes += toCreate.length; }
    } catch (e) { if (isLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
    if (!stopped && toUpdate.length) {
      try { for (let i = 0; i < toUpdate.length && !stopped; i += 500) { const s = toUpdate.slice(i, i + 500); await b.entities.SalesWeeklySummary.bulkUpdate(s); writes += s.length; } }
      catch (e) { if (isLimit(e)) { stopped = true; error = limitMsg; } else throw e; }
    }

    const hourlyArr = [...hourly.values()].map((h) => ({ store_id: h.store_id, weekday: h.weekday, hour: h.hour, net_revenue: r2(h.net_revenue), orders: h.orders.size }));
    return { weekStart, weeklyWrites: writes, hourly: hourlyArr, stopped, error };
  });

// ---- Finalize hourly: diff the small (<=504) global table --------------------
export const finalizeHourly = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ rows: z.array(z.any()).max(2000) }))
  .handler(async ({ data, context }) => {
    if (!canRun(context.user)) throw forbid();
    const b = context.getBase44();
    const user = context.user;
    const scope = storeScope(user);
    const existing = await readAll(b, "SalesHourSummary", scope, ["id", "store_id", "weekday", "hour", "net_revenue", "orders"]);
    const exMap = new Map(existing.map((x) => [`${x.store_id}|${x.weekday}|${x.hour}`, x]));
    const toCreate = [];
    const toUpdate = [];
    for (const r of data.rows) {
      const ex = exMap.get(`${r.store_id}|${r.weekday}|${r.hour}`);
      if (!ex) toCreate.push({ store_id: r.store_id, weekday: r.weekday, hour: r.hour, net_revenue: r.net_revenue, orders: r.orders });
      else if (ex.net_revenue !== r.net_revenue || ex.orders !== r.orders) toUpdate.push({ id: ex.id, net_revenue: r.net_revenue, orders: r.orders });
    }
    let writes = 0;
    try {
      if (toCreate.length) { await b.entities.SalesHourSummary.bulkCreate(toCreate); writes += toCreate.length; }
      if (toUpdate.length) { await b.entities.SalesHourSummary.bulkUpdate(toUpdate); writes += toUpdate.length; }
    } catch (e) { if (isLimit(e)) return { writes, stopped: true, error: limitMsg }; throw e; }

    // Home KPI summary: one small record so Home reads it instead of scanning
    // transactions. Built from the weekly summary (already refreshed) plus two
    // cheap queries: distinct invoices and the outlier rows only.
    let kpiError = null;
    try {
      const sums = await b.entities.SalesWeeklySummary.aggregate({ query: {}, sum: ["net_revenue", "units", "cost", "gross_revenue", "returns_value"] });
      const sr = sums.rows?.[0] || {};
      const net = Number(sr.sum_net_revenue || 0);
      const cost = Number(sr.sum_cost || 0);
      const grossRev = Number(sr.sum_gross_revenue || 0);
      const returnsVal = Number(sr.sum_returns_value || 0);
      const orderAgg = await b.entities.SalesTransaction.aggregate({ query: { is_quarantined: { $ne: true } }, countDistinct: "invoice_no" });
      const orders = Number(orderAgg.rows?.[0]?.count_distinct_invoice_no || 0);
      const outRows = await readAll(b, "SalesTransaction", { is_quarantined: { $ne: true }, $or: [{ qty: { $gt: 10000 } }, { qty: { $lt: -10000 } }] }, ["invoice_no", "qty", "unit_price"]);
      let oReturns = 0;
      let oGross = 0;
      for (const r of outRows) {
        const value = Math.abs(Number(r.qty) || 0) * (Number(r.unit_price) || 0);
        if (String(r.invoice_no ?? "").toUpperCase().startsWith("C")) oReturns += value;
        else oGross += value;
      }
      const adjGross = grossRev - oGross;
      const record = {
        net_revenue: r2(net),
        units: Math.round(Number(sr.sum_units || 0)),
        orders,
        aov: orders ? r2(net / orders) : null,
        gross_margin: net ? r2((net - cost) / net * 100) : null,
        return_rate_incl: grossRev ? r2(returnsVal / grossRev * 100) : null,
        return_rate_excl: adjGross ? r2((returnsVal - oReturns) / adjGross * 100) : null,
        computed_at: new Date().toISOString(),
      };
      const found = await b.entities.KpiSummary.filter({}, { limit: 1 });
      const ex = found.items?.[0];
      if (ex) { await b.entities.KpiSummary.update(ex.id, record); writes += 1; }
      else { await b.entities.KpiSummary.create(record); writes += 1; }
    } catch (e) { kpiError = e?.data?.message || e?.message || "KPI summary not written"; }

    try {
      await b.entities.AuditLog.create({ user: user.email || user.id, role: roleOf(user), action: "refresh_summaries", entity: "SalesWeeklySummary", record_ref: "", timestamp: new Date().toISOString(), detail: `${writes} hourly rows written` });
    } catch { /* best-effort */ }
    return { writes, stopped: false, error: null, kpiError };
  });

// ---- When were summaries last refreshed? -----------------------------------
export const getSummaryStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const page = await b.entities.AuditLog.filter({ action: "refresh_summaries" }, { sort: "-timestamp", limit: 1 });
    return page.items?.[0]?.timestamp ?? null;
  });