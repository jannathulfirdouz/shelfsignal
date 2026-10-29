// Shared metric helpers used by both the Dashboard and Home so the net-revenue
// figure is computed one way everywhere. Reads from the summary tables (built by
// refreshSummaries from non-quarantined rows), so it equals sum(qty x unit_price)
// over non-quarantined rows without scanning every transaction at view time.
const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Sum of net_revenue across the weekly summary (store-scoped), optionally narrowed
// by store / category / week_start window. This is the single source of truth for
// headline net revenue on Dashboard and Home.
export async function netRevenueTotal(b, scope, f = {}) {
  const q = { ...scope };
  if (f.store) q.store_id = f.store;
  if (f.category) q.category = f.category;
  if (f.from) q.week_start = { ...(q.week_start || {}), $gte: f.from };
  if (f.to) q.week_start = { ...(q.week_start || {}), $lte: f.to };
  const agg = await b.entities.SalesWeeklySummary.aggregate({ query: q, sum: ["net_revenue"] });
  return r2(Number(agg.rows?.[0]?.sum_net_revenue || 0));
}

// All products: sku -> { category, unit_cost, ... }. Used to attribute outlier
// transaction rows to a category for the outlier-adjusted return rate.
export async function loadProductsMap(b) {
  const map = new Map();
  let cursor;
  do {
    const p = await b.entities.Product.filter({}, { limit: 1000, cursor, fields: ["sku", "category"] });
    for (const x of p.items ?? []) map.set(String(x.sku), { category: x.category || "Unknown" });
    cursor = p.has_more ? p.next_cursor : undefined;
  } while (cursor);
  return map;
}

// Contribution of outlier rows (abs(qty) > 10,000) to returns_value and
// gross_revenue, overall and per category, so the return rate can exclude them.
export async function outlierContribs(b, products, scope, f, from, to) {
  const q = { ...scope, is_quarantined: { $ne: true }, $or: [{ qty: { $gt: 10000 } }, { qty: { $lt: -10000 } }] };
  if (f?.store) q.store_id = f.store;
  if (from) q.date = { ...(q.date || {}), $gte: from };
  if (to) q.date = { ...(q.date || {}), $lte: to };
  const rows = [];
  let cursor;
  do {
    const p = await b.entities.SalesTransaction.filter(q, { limit: 1000, cursor, fields: ["invoice_no", "sku", "qty", "unit_price"] });
    rows.push(...(p.items ?? []));
    cursor = p.has_more ? p.next_cursor : undefined;
  } while (cursor);
  const total = { returns: 0, gross: 0 };
  const byCat = {};
  for (const r of rows) {
    const cat = products.get(String(r.sku ?? ""))?.category || "Unknown";
    const isRet = String(r.invoice_no ?? "").toUpperCase().startsWith("C");
    const qty = Number(r.qty) || 0;
    const price = Number(r.unit_price) || 0;
    byCat[cat] = byCat[cat] || { returns: 0, gross: 0 };
    if (isRet) { byCat[cat].returns += Math.abs(qty) * price; total.returns += Math.abs(qty) * price; }
    else { byCat[cat].gross += qty * price; total.gross += qty * price; }
  }
  return { total, byCat };
}