import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, allowAnonymous } from "@/lib/auth-middleware";
import { storeScope } from "@/lib/store-scope.server";
import { netRevenueTotal, outlierContribs, loadProductsMap } from "@/lib/revenue.server";

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

function weeklyQuery(scope, f, from, to) {
  const q = { ...scope };
  if (f.store) q.store_id = f.store;
  if (f.category) q.category = f.category;
  if (from) q.week_start = { ...(q.week_start || {}), $gte: from };
  if (to) q.week_start = { ...(q.week_start || {}), $lte: to };
  return q;
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

// Return rate excluding and including outlier rows, given summary totals and the
// outlier contribution for the same window.
function returnRatePair(sums, out) {
  const incl = sums.gross_revenue ? r2(sums.returns_value / sums.gross_revenue * 100) : null;
  const adjGross = sums.gross_revenue - out.total.gross;
  const adjReturns = sums.returns_value - out.total.returns;
  const excl = adjGross ? r2(adjReturns / adjGross * 100) : null;
  return { excl, incl };
}

// Orders = distinct invoice_no over non-quarantined transactions (single aggregate).
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
  { name: "Average order value", formula: "Net revenue divided by orders.", owner: "ShelfSignal", notes: "Based on the 120 sampled products, so it understates the full basket value." },
  { name: "Return rate", formula: "Returns value divided by gross revenue.", owner: "ShelfSignal", notes: "Excludes outlier quantities (abs > 10,000) by default." },
  { name: "Stock cover days", formula: "On-hand units divided by average daily units over the last 4 weeks.", owner: "ShelfSignal", notes: "Inventory page." },
  { name: "Sell-through %", formula: "Units sold divided by (units sold plus on-hand).", owner: "ShelfSignal", notes: "Inventory page." },
  { name: "Trust Score", formula: "Weighted pass rate of the active data quality rules.", owner: "ShelfSignal", notes: "" },
  { name: "Reorder impact (GBP)", formula: "Shortfall units (reorder point minus on-hand and on-order units, floored at zero) times unit price.", owner: "ShelfSignal", notes: "Reorder recommendations in the Action centre." },
  { name: "Markdown impact (GBP)", formula: "On-hand units at risk of write-off times unit cost.", owner: "ShelfSignal", notes: "Markdown recommendations in the Action centre." },
  { name: "Investigate impact (GBP)", formula: "Absolute difference between actual and expected revenue on the flagged days, summed.", owner: "ShelfSignal", notes: "Investigate recommendations in the Action centre." },
  { name: "Re-engage impact (GBP)", formula: "The customer's historic monetary value (quantity times unit price across all orders).", owner: "ShelfSignal", notes: "Re-engage recommendations in the Action centre." },
];

// Keeps the stored definitions in step with METRICS. Writes records, so it runs
// only for a signed-in visitor; the public demo reads the definitions as they are.
async function seedMetrics(b) {
    const page = await b.entities.MetricDefinition.filter({}, { limit: 50 });
    const byName = new Map((page.items ?? []).map((x) => [x.name, x]));
    const toCreate = [];
    const toUpdate = [];
    for (const m of METRICS) {
      const ex = byName.get(m.name);
      if (!ex) toCreate.push(m);
      else if (ex.formula !== m.formula || ex.notes !== m.notes || ex.owner !== m.owner) toUpdate.push({ id: ex.id, ...m });
    }
    if (toCreate.length) await b.entities.MetricDefinition.bulkCreate(toCreate);
    if (toUpdate.length) await b.entities.MetricDefinition.bulkUpdate(toUpdate);
}

export const getMetricDefinitions = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .handler(async ({ context }) => {
    const b = context.getBase44();
    if (context.user) await seedMetrics(b);
    const all = await b.entities.MetricDefinition.filter({}, { limit: 50 });
    return all.items ?? [];
  });

// ---- Home -------------------------------------------------------------------
export const getHomeData = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(FilterInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store, category: data.category };
    const range = data.range || "all";
    const maxDate = await maxWeekStart(b, scope);
    const { from, to } = rangeToDates(range, maxDate);

    // The unfiltered public view reads the one KPI record written by "Refresh
    // summaries" instead of scanning transactions. Any filter uses the live path.
    const useSummary = !f.store && !f.category && range === "all" && Object.keys(scope).length === 0;
    let kpis = null;
    let prevKpis = null;

    if (useSummary) {
      const p = await b.entities.KpiSummary.filter({}, { sort: "-computed_at", limit: 1 });
      const s = p.items?.[0];
      if (s) {
        kpis = {
          netRevenue: r2(s.net_revenue),
          grossMargin: s.gross_margin ?? null,
          units: Math.round(Number(s.units) || 0),
          orders: Number(s.orders) || 0,
          aov: s.aov ?? null,
          returnRate: { excl: s.return_rate_excl ?? null, incl: s.return_rate_incl ?? null },
        };
      }
    }

    if (!kpis) {
      const sums = await sumWeekly(b, weeklyQuery(scope, f, from, to));
      const curOrders = await orderCount(b, scope, f, from, to);
      const products = await loadProductsMap(b);
      const out = await outlierContribs(b, products, scope, f, from, to);
      const curRR = returnRatePair(sums, out);
      const netRevenue = await netRevenueTotal(b, scope, { ...f, from, to });

      kpis = {
        netRevenue: r2(netRevenue),
        grossMargin: sums.net_revenue ? r2((sums.net_revenue - sums.cost) / sums.net_revenue * 100) : null,
        units: Math.round(sums.units),
        orders: curOrders,
        aov: curOrders ? r2(netRevenue / curOrders) : null,
        returnRate: curRR,
      };

      if (from && to) {
        const len = daysBetween(from, to) + 1;
        const pFrom = addDays(from, -len);
        const pTo = addDays(from, -1);
        const prevSums = await sumWeekly(b, weeklyQuery(scope, f, pFrom, pTo));
        const prevOrders = await orderCount(b, scope, f, pFrom, pTo);
        const prevOut = await outlierContribs(b, products, scope, f, pFrom, pTo);
        const prevRR = returnRatePair(prevSums, prevOut);
        const prevNet = await netRevenueTotal(b, scope, { ...f, from: pFrom, to: pTo });
        prevKpis = {
          netRevenue: r2(prevNet),
          grossMargin: prevNet ? r2((prevNet - prevSums.cost) / prevNet * 100) : null,
          units: Math.round(prevSums.units),
          orders: prevOrders,
          aov: prevOrders ? r2(prevNet / prevOrders) : null,
          returnRate: prevRR,
        };
      }
    }

    const trendAgg = await b.entities.SalesWeeklySummary.aggregate({ query: weeklyQuery(scope, f, from, to), groupBy: "week_start", sum: ["net_revenue"] });
    const weeklyTrend = (trendAgg.rows ?? []).map((r) => ({ week: r.week_start, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => (a.week < b2.week ? -1 : 1));

    const storeAgg = await b.entities.SalesWeeklySummary.aggregate({ query: weeklyQuery(scope, f, from, to), groupBy: "store_id", sum: ["net_revenue"] });
    const revenueByStore = (storeAgg.rows ?? []).map((r) => ({ store: r.store_id, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => b2.netRevenue - a.netRevenue);

    const trust = await latestTrust(b);
    kpis.trustScore = trust?.score ?? null;
    const filters = await filterOptions(b, context.user);

    const topActions = (await b.entities.Recommendation.filter({ ...scope, status: "new" }, { sort: "-expected_impact_gbp", limit: 5 })).items ?? [];

    return { kpis, prevKpis, weeklyTrend, revenueByStore, trust, filters, maxDate, topActions };
  });

// ---- Sales ------------------------------------------------------------------
export const getSalesAnalytics = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(FilterInput)
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store, category: data.category };
    const maxDate = await maxWeekStart(b, scope);
    const { from, to } = rangeToDates(data.range, maxDate);
    const wq = weeklyQuery(scope, f, from, to);

    const wkAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "week_start", sum: ["net_revenue"] });
    const byWeek = (wkAgg.rows ?? []).map((r) => ({ week: r.week_start, netRevenue: Number(r.sum_net_revenue || 0) })).sort((a, b2) => (a.week < b2.week ? -1 : 1));
    const monthlyMap = {};
    for (const w of byWeek) { const m = w.week.slice(0, 7); monthlyMap[m] = (monthlyMap[m] || 0) + w.netRevenue; }
    const monthly = Object.entries(monthlyMap).map(([month, netRevenue]) => ({ month, netRevenue: r2(netRevenue) }));
    for (let i = 0; i < monthly.length; i++) {
      const prev = monthly[i - 1];
      monthly[i].momChange = prev ? r2((monthly[i].netRevenue - prev.netRevenue) / (prev.netRevenue || 1) * 100) : null;
    }
    // The data ends 9 Dec 2011, so December is a partial month.
    const partialMonth = maxDate && Number(maxDate.slice(8)) < 28 ? maxDate.slice(0, 7) : null;

    const catAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "category", sum: ["net_revenue"] });
    const revenueByCategory = (catAgg.rows ?? []).map((r) => ({ category: r.category, netRevenue: r2(Number(r.sum_net_revenue || 0)) })).sort((a, b2) => b2.netRevenue - a.netRevenue);

    const retAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "category", sum: ["returns_value", "gross_revenue"] });
    const products = await loadProductsMap(b);
    const out = await outlierContribs(b, products, scope, f, from, to);
    const returnRateByCategory = (retAgg.rows ?? []).map((r) => {
      const cat = r.category || "Unknown";
      const gross = Number(r.sum_gross_revenue || 0);
      const returns = Number(r.sum_returns_value || 0);
      const incl = gross ? r2(returns / gross * 100) : 0;
      const oc = out.byCat[cat] || { returns: 0, gross: 0 };
      const adjGross = gross - oc.gross;
      const excl = adjGross ? r2((returns - oc.returns) / adjGross * 100) : 0;
      return { category: cat, returnRateExcl: excl, returnRateIncl: incl };
    }).sort((a, b2) => b2.returnRateExcl - a.returnRateExcl);

    const skuAgg = await b.entities.SalesWeeklySummary.aggregate({ query: wq, groupBy: "sku", sum: ["net_revenue"] });
    const skuRows = (skuAgg.rows ?? []).map((r) => ({ sku: r.sku, revenue: Number(r.sum_net_revenue || 0) })).sort((a, b2) => b2.revenue - a.revenue);
    const top20 = skuRows.slice(0, 20);
    const totalRev = skuRows.reduce((a, c) => a + c.revenue, 0) || 1;
    let cum = 0;
    const pareto = top20.map((s) => { cum += s.revenue; return { sku: s.sku, revenue: r2(s.revenue), cumulativePct: r2(cum / totalRev * 100) }; });

    // Top countries by distinct orders (not transaction rows). Fetch a few extra so
    // the client-side "Exclude United Kingdom" toggle still has 10 to show.
    const countryQ = { ...scope, is_quarantined: { $ne: true } };
    if (f.store) countryQ.store_id = f.store;
    if (from) countryQ.date = { ...(countryQ.date || {}), $gte: from };
    if (to) countryQ.date = { ...(countryQ.date || {}), $lte: to };
    const countryAgg = await b.entities.SalesTransaction.aggregate({ query: countryQ, groupBy: "country", countDistinct: "invoice_no" });
    const topCountries = (countryAgg.rows ?? [])
      .map((r) => ({ country: r.country || "Unknown", orders: Number(r.count_distinct_invoice_no || 0) }))
      .sort((a, b2) => b2.orders - a.orders)
      .slice(0, 15);

    const hourlyQ = { ...scope };
    if (f.store) hourlyQ.store_id = f.store;
    const hourlyRows = await readAll(b, "SalesHourSummary", hourlyQ, ["weekday", "hour", "orders"]);
    const heatmap = hourlyRows.map((h) => ({ weekday: h.weekday, hour: h.hour, orders: h.orders }));

    const filters = await filterOptions(b, context.user);
    return { monthly, partialMonth, revenueByCategory, returnRateByCategory, pareto, topCountries, heatmap, filters, maxDate };
  });

// ---- Inventory --------------------------------------------------------------
async function loadSuppliers(b) {
  const map = new Map();
  let cursor;
  do {
    const p = await b.entities.Supplier.filter({}, { limit: 1000, cursor, fields: ["supplier_id", "lead_time_days"] });
    for (const s of p.items ?? []) map.set(String(s.supplier_id), Number(s.lead_time_days) || 0);
    cursor = p.has_more ? p.next_cursor : undefined;
  } while (cursor);
  return map;
}

export const getInventoryAnalytics = createServerFn({ method: "GET" })
  .middleware([allowAnonymous])
  .validator(z.object({ store: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const b = context.getBase44();
    const scope = storeScope(context.user);
    const f = { store: data.store };

    const maxSnapP = await b.entities.InventorySnapshot.filter(scope, { sort: "-date", limit: 1, fields: ["date"] });
    const maxSnap = maxSnapP.items?.[0]?.date ?? null;
    if (!maxSnap) {
      const filters = await filterOptions(b, context.user);
      return { latestDate: null, rows: [], outOfStock: [], belowLeadTime: [], positionsInStock: 0, filters, maxDate: null };
    }

    const latestQ = { ...scope, date: maxSnap };
    if (f.store) latestQ.store_id = f.store;
    const latest = await readAll(b, "InventorySnapshot", latestQ);

    const products = await (async () => {
      const m = new Map();
      let cursor;
      do {
        const p = await b.entities.Product.filter({}, { limit: 1000, cursor, fields: ["sku", "category", "unit_cost", "supplier_id", "days_since_last_sale"] });
        for (const x of p.items ?? []) m.set(String(x.sku), x);
        cursor = p.has_more ? p.next_cursor : undefined;
      } while (cursor);
      return m;
    })();
    const suppliers = await loadSuppliers(b);

    // Units sold over the last 4 weeks (for cover days) and net revenue over the
    // last 12 weeks (for sorting stockout risk), per (store, sku).
    const from4 = addDays(maxSnap, -27);
    const from12 = addDays(maxSnap, -83);
    const u4Q = { ...scope, week_start: { $gte: from4 } };
    const u12Q = { ...scope, week_start: { $gte: from12 } };
    if (f.store) { u4Q.store_id = f.store; u12Q.store_id = f.store; }
    const u4Rows = await readAll(b, "SalesWeeklySummary", u4Q, ["store_id", "sku", "units"]);
    const u12Rows = await readAll(b, "SalesWeeklySummary", u12Q, ["store_id", "sku", "net_revenue"]);
    const units4 = new Map();
    for (const u of u4Rows) { const k = `${u.store_id}|${u.sku}`; units4.set(k, (units4.get(k) || 0) + (Number(u.units) || 0)); }
    const rev12 = new Map();
    for (const u of u12Rows) { const k = `${u.store_id}|${u.sku}`; rev12.set(k, (rev12.get(k) || 0) + (Number(u.net_revenue || 0))); }

    const rows = latest.map((l) => {
      const p = products.get(String(l.sku)) || {};
      const leadTime = suppliers.get(String(p.supplier_id || "")) ?? null;
      const units = units4.get(`${l.store_id}|${l.sku}`) || 0;
      const avgDaily = units / 28;
      const onHand = Number(l.on_hand) || 0;
      const coverDays = onHand === 0 ? 0 : (avgDaily > 0 ? r2(onHand / avgDaily) : null);
      let stockoutType = null;
      if (onHand === 0) stockoutType = "out_of_stock";
      else if (coverDays != null && leadTime != null && coverDays < leadTime) stockoutType = "below_lead_time";
      const daysSinceLastSale = p.days_since_last_sale ?? null;
      const deadStock = (daysSinceLastSale ?? 0) > 90;
      const stockValue = r2(onHand * (Number(p.unit_cost) || 0));
      const sellThrough = units + onHand > 0 ? r2(units / (units + onHand) * 100) : null;
      return {
        store_id: l.store_id, sku: l.sku, category: p.category || "Unknown",
        on_hand: onHand, on_order: Number(l.on_order) || 0,
        coverDays, leadTime, stockoutType, daysSinceLastSale, deadStock, stockValue, sellThrough,
        rev12: r2(rev12.get(`${l.store_id}|${l.sku}`) || 0),
      };
    });

    const outOfStock = rows.filter((r) => r.stockoutType === "out_of_stock").sort((a, b2) => b2.rev12 - a.rev12);
    const belowLeadTime = rows.filter((r) => r.stockoutType === "below_lead_time").sort((a, b2) => b2.rev12 - a.rev12);
    const positionsInStock = rows.filter((r) => r.on_hand > 0).length;

    const filters = await filterOptions(b, context.user);
    const maxDate = await maxWeekStart(b, scope);
    return { latestDate: maxSnap, rows, outOfStock, belowLeadTime, positionsInStock, filters, maxDate };
  });