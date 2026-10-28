import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";

const roleOf = (u) => u?.app_role || u?.data?.app_role || "viewer";
const r2 = (n) => Math.round((n || 0) * 100) / 100;

const FilterInput = z.object({
  store: z.string().optional(),
  category: z.string().optional(),
  range: z.enum(["all", "4w", "12w", "ytd"]).optional(),
});

function addDays(dStr, n) { const d = new Date(dStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

function rangeToDates(range, maxDate) {
  if (!maxDate) return { from: null, to: null };
  if (range === "4w") return { from: addDays(maxDate, -27), to: maxDate };
  if (range === "12w") return { from: addDays(maxDate, -83), to: maxDate };
  if (range === "ytd") return { from: maxDate.slice(0, 4) + "-01-01", to: maxDate };
  return { from: null, to: null };
}

// Weekly-summary query for the chosen filters + date window (on week_start).
function weeklyQuery(scope, f, from, to) {
  const q = { ...scope };
  if (f.store) q.store_id = f.store;
  if (f.category) q.category = f.category;
  if (from) q.week_start = { ...(q.week_start || {}), $gte: from };
  if (to) q.week_start = { ...(q.week_start || {}), $lte: to };
  return q;
}

async function sumWeekly(b, query) {
  const agg = await b.entities.SalesWeeklySummary.aggregate({ query, sum: ["net_revenue", "units", "cost", "gross_revenue", "returns_value"] });
  const r = agg.rows?.[0] || {};
  return {
    net_revenue: Number(r.sum_net_revenue || 0),
    units: Number(r.sum_units || 0),
    cost: Number(r.sum_cost || 0),
    gross_revenue: Number(r.sum_gross_revenue || 0),
    returns_value: Number(r.sum_returns_value || 0),
  };
}

// Orders = distinct invoice_no over non-quarantined transactions (single aggregate, not a row scan).
async function orderCount(b, scope, f, from, to) {
  const q = { ...scope, is_quarantined: { $ne: true } };
  if (f.store) q.store_id = f.store;
  if (from) q.date = { ...(q.date || {}), $gte: from };
  if (to) q.date = { ...(q.date || {}), $lte: to };
  const a = await b.entities.SalesTransaction.aggregate({ query: q, countDistinct: "invoice_no" });
  return Number(a.rows?.[0]?.count_distinct_invoice_no || 0);
}

async function latestTrust(b) {
  const page = await b.entities.DataBatch.filter({ file_name: "sales_transactions.csv", quality_status: "complete" }, { sort: "-created_date", limit: 1 });
  const batch = page.items?.[0];
  if (!batch) return null;
  return { score: batch.quality_score ?? null, rowsExcluded: batch.rows_excluded ?? 0, lastCheckedAt: batch.last_checked_at ?? null };
}

async function maxWeekStart(b, scope) {
  const p = await b.entities.SalesWeeklySummary.filter(scope, { sort: "-week_start", limit: 1, fields: ["week_start"] });
  return p.items?.[0]?.week_start ?? null;
}

// ---- Filter options for the filter bar --------------------------------------
async function filterOptions(b, user) {
  const scope = storeScope(user);
  const role = roleOf(user);
  const storeQ = role === "store_manager" ? { store_id: user?.store_id || user?.data?.store_id || "" } : {};
  const stores = (await b.entities.Store.filter(storeQ, { limit: 100 })).items ?? [];
  const catAgg = await b.entities.Product.aggregate({ groupBy: "category" });
  const categories = (catAgg.rows ?? []).map((r) => r.category).filter(Boolean).sort();
  const maxDate = await maxWeekStart(b, scope);
  return { stores: stores.map((s) => ({ store_id: s.store_id, name: s.name })), categories, maxDate };
}

const METRICS = [
  { name: "Net revenue", formula: "Gross revenue minus returns value.", owner: "ShelfSignal", notes: "Headline revenue figure." },
  { name: "Gross margin %", formula: "Net revenue minus cost, divided by net revenue. Cost is simulated.", owner: "ShelfSignal", notes: "Tagged Simulated." },
  { name: "Units sold", formula: "Sum of quantity sold (returns are negative).", owner: "ShelfSignal", notes: "" },
  { name: "Orders", formula: "Distinct invoice numbers in the period.", owner: "ShelfSignal", notes: "" },
  { name: "Average order value", formula: "Net revenue divided by orders.", owner: "ShelfSignal", notes: "" },
  { name: "Return rate", formula: "Returns value divided by gross revenue.", owner: "ShelfSignal", notes: "" },
  { name: "Stock cover days", formula: "On-hand units divided by average daily units over the last 4 weeks.", owner: "ShelfSignal", notes: "Inventory page." },
  { name: "Sell-through %", formula: "Units sold divided by (units sold plus on-hand).", owner: "ShelfSignal", notes: "Inventory page." },
  { name: "Trust Score", formula: "Weighted pass rate of the active data quality rules.", owner: "ShelfSignal", notes: "" },
];

export const getMetricDefinitions = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    const page = await b.entities.MetricDefinition.filter({}, { limit: 50 });
    const have = new Set((page.items ?? []).map((x) => x.name));
    const missing = METRICS.filter((m) => !have.has(m.name));
    if (missing.length) await b.entities.MetricDefinition.bulkCreate(missing);
    const all = await b.entities.MetricDefinition.filter({}, { limit: 50 });
    return all.items ?? [];
  });

// ---- Home -------------------------------------------------------------------
export const getHomeData = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(FilterInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store, category: data.category };
    const maxDate = await maxWeekStart(b, scope);
    const { from, to } = rangeToDates(data.range, maxDate);

    const cur = await sumWeekly(b, weeklyQuery(scope, f, from, to));
    const curOrders = await orderCount(b, scope, f, from, to);

    let prev = null;
    if (from && to) {
      const len = daysBetween(from, to) + 1;
      const pFrom = addDays(from, -len);
      const pTo = addDays(from, -1);
      const prevSums = await sumWeekly(b, weeklyQuery(scope, f, pFrom, pTo));
      const prevOrders = await orderCount(b, scope, f, pFrom, pTo);
      prev = { ...prevSums, orders: prevOrders };
    }

    const trendAgg = await b.entities.SalesWeeklySummary.aggregate({ query: weeklyQuery(scope, f, from, to), groupBy: "week_start", sum: ["net_revenue"] });
    const weeklyTrend = (trendAgg.rows ?? []).map((r) => ({ week: r.week_start, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => a.week < b2.week ? -1 : 1);

    const storeAgg = await b.entities.SalesWeeklySummary.aggregate({ query: weeklyQuery(scope, f, from, to), groupBy: "store_id", sum: ["net_revenue"] });
    const revenueByStore = (storeAgg.rows ?? []).map((r) => ({ store: r.store_id, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => b2.netRevenue - a.netRevenue);

    const trust = await latestTrust(b);
    const filters = await filterOptions(b, context.user);

    const kpis = {
      netRevenue: r2(cur.net_revenue),
      grossMargin: cur.net_revenue ? r2((cur.net_revenue - cur.cost) / cur.net_revenue * 100) : null,
      units: Math.round(cur.units),
      orders: curOrders,
      aov: curOrders ? r2(cur.net_revenue / curOrders) : null,
      returnRate: cur.gross_revenue ? r2(cur.returns_value / cur.gross_revenue * 100) : null,
      trustScore: trust?.score ?? null,
    };
    const prevKpis = prev ? {
      netRevenue: r2(prev.net_revenue),
      grossMargin: prev.net_revenue ? r2((prev.net_revenue - prev.cost) / prev.net_revenue * 100) : null,
      units: Math.round(prev.units),
      orders: prev.orders,
      aov: prev.orders ? r2(prev.net_revenue / prev.orders) : null,
      returnRate: prev.gross_revenue ? r2(prev.returns_value / prev.gross_revenue * 100) : null,
    } : null;

    return { kpis, prevKpis, weeklyTrend, revenueByStore, trust, filters, maxDate };
  });

// ---- Sales ------------------------------------------------------------------
export const getSalesAnalytics = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(FilterInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store, category: data.category };
    const maxDate = await maxWeekStart(b, scope);
    const { from, to } = rangeToDates(data.range, maxDate);
    const wq = weeklyQuery(scope, f, from, to);

    const wkAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "week_start", sum: ["net_revenue"] });
    const byWeek = (wkAgg.rows ?? []).map((r) => ({ week: r.week_start, netRevenue: Number(r.sum_net_revenue || 0) })).sort((a, b2) => a.week < b2.week ? -1 : 1);
    const monthlyMap = {};
    for (const w of byWeek) { const m = w.week.slice(0, 7); monthlyMap[m] = (monthlyMap[m] || 0) + w.netRevenue; }
    const monthly = Object.entries(monthlyMap).map(([month, netRevenue]) => ({ month, netRevenue: r2(netRevenue) }));
    for (let i = 0; i < monthly.length; i++) {
      const prev = monthly[i - 1];
      monthly[i].momChange = prev ? r2((monthly[i].netRevenue - prev.netRevenue) / (prev.netRevenue || 1) * 100) : null;
    }

    const catAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "category", sum: ["net_revenue"] });
    const revenueByCategory = (catAgg.rows ?? []).map((r) => ({ category: r.category, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => b2.netRevenue - a.netRevenue);

    const retAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "category", sum: ["returns_value", "gross_revenue"] });
    const returnRateByCategory = (retAgg.rows ?? []).map((r) => ({ category: r.category, returnRate: Number(r.sum_gross_revenue || 0) ? r2(Number(r.sum_returns_value || 0) / Number(r.sum_gross_revenue || 0) * 100) : 0 })).sort((a, b2) => b2.returnRate - a.returnRate);

    const skuAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "sku", sum: ["net_revenue"] });
    const skuRows = (skuAgg.rows ?? []).map((r) => ({ sku: r.sku, revenue: Number(r.sum_net_revenue || 0) })).sort((a, b2) => b2.revenue - a.revenue);
    const top20 = skuRows.slice(0, 20);
    const totalRev = skuRows.reduce((a, c) => a + c.revenue, 0) || 1;
    let cum = 0;
    const pareto = top20.map((s) => { cum += s.revenue; return { sku: s.sku, revenue: r2(s.revenue), cumulativePct: r2(cum / totalRev * 100) }; });

    const countryQ = { ...scope, is_quarantined: { $ne: true } };
    if (f.store) countryQ.store_id = f.store;
    if (from) countryQ.date = { ...(countryQ.date || {}), $gte: from };
    if (to) countryQ.date = { ...(countryQ.date || {}), $lte: to };
    const countryAgg = await b.entities.SalesTransaction.aggregate({ query: countryQ, groupBy: "country" });
    const topCountries = (countryAgg.rows ?? []).map((r) => ({ country: r.country || "Unknown", count: r.count })).sort((a, b2) => b2.count - a.count).slice(0, 10);

    const hourlyQ = { ...scope };
    if (f.store) hourlyQ.store_id = f.store;
    const hourlyRows = await (async () => { const out = []; let cursor; do { const p = await b.entities.SalesHourSummary.filter(hourlyQ, { limit: 1000, cursor }); out.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor); return out; })();
    const heatmap = hourlyRows.map((h) => ({ weekday: h.weekday, hour: h.hour, orders: h.orders }));

    const filters = await filterOptions(b, context.user);
    return { monthly, revenueByCategory, returnRateByCategory, pareto, topCountries, heatmap, filters, maxDate };
  });

// ---- Inventory --------------------------------------------------------------
async function loadSuppliers(b) {
  const map = new Map();
  let cursor;
  do { const p = await b.entities.Supplier.filter({}, { limit: 1000, cursor, fields: ["supplier_id", "lead_time_days"] }); for (const s of p.items ?? []) map.set(String(s.supplier_id), Number(s.lead_time_days) || 0); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor);
  return map;
}

export const getInventoryAnalytics = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ store: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store };

    const maxSnapP = await b.entities.InventorySnapshot.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const maxSnap = maxSnapP.items?.[0]?.date ?? null;
    if (!maxSnap) {
      const filters = await filterOptions(b, context.user);
      return { latestDate: null, rows: [], filters, maxDate: null };
    }

    const latestQ = { ...scope, date: maxSnap };
    if (f.store) latestQ.store_id = f.store;
    const latest = await (async () => { const out = []; let cursor; do { const p = await b.entities.InventorySnapshot.filter(latestQ, { limit: 1000, cursor }); out.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor); return out; })();

    const products = await (async () => { const m = new Map(); let cursor; do { const p = await b.entities.Product.filter({}, { limit: 1000, cursor, fields: ["sku", "category", "unit_cost", "supplier_id", "days_since_last_sale"] }); for (const x of p.items ?? []) m.set(String(x.sku), x); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor); return m; })();
    const suppliers = await loadSuppliers(b);

    // Units sold over the last 4 weeks per (store, sku) from the weekly summary.
    const from4 = addDays(maxSnap, -27);
    const u4Q = { ...scope, week_start: { $gte: from4 } };
    if (f.store) u4Q.store_id = f.store;
    const u4Rows = await (async () => { const out = []; let cursor; do { const p = await b.entities.SalesWeeklySummary.filter(u4Q, { limit: 1000, cursor, fields: ["store_id", "sku", "units"] }); out.push(...(p.items ?? [])); cursor = p.has_more ? p.next_cursor : undefined; } while (cursor); return out; })();
    const units4 = new Map();
    for (const u of u4Rows) { const k = `${u.store_id}|${u.sku}`; units4.set(k, (units4.get(k) || 0) + (Number(u.units) || 0)); }

    const rows = latest.map((l) => {
      const p = products.get(String(l.sku)) || {};
      const leadTime = suppliers.get(String(p.supplier_id || "")) ?? null;
      const units = units4.get(`${l.store_id}|${l.sku}`) || 0;
      const avgDaily = units / 28;
      const coverDays = avgDaily > 0 ? r2(Number(l.on_hand) / avgDaily) : null;
      const stockoutRisk = coverDays != null && leadTime != null && coverDays < leadTime;
      const daysSinceLastSale = p.days_since_last_sale ?? null;
      const deadStock = (daysSinceLastSale ?? 0) > 90;
      const stockValue = r2(Number(l.on_hand) * (Number(p.unit_cost) || 0));
      const sellThrough = units + Number(l.on_hand) > 0 ? r2(units / (units + Number(l.on_hand)) * 100) : null;
      return {
        store_id: l.store_id, sku: l.sku, category: p.category || "Unknown",
        on_hand: Number(l.on_hand) || 0, on_order: Number(l.on_order) || 0,
        coverDays, leadTime, stockoutRisk, daysSinceLastSale, deadStock, stockValue, sellThrough,
      };
    });

    const filters = await filterOptions(b, context.user);
    const maxDate = await maxWeekStart(b, scope);
    return { latestDate: maxSnap, rows, filters, maxDate };
  });