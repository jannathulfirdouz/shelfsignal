// Pure ML helpers for ShelfSignal. No I/O, no Base44 SDK — imported by ml-fns.js.
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const r4 = (n) => Math.round((n || 0) * 10000) / 10000;
const ri = (n) => Math.max(0, Math.round(n || 0));

function addDays(dStr, n) { const d = new Date(dStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------------- Demand forecasting ----------------
// Four models. Backtest on the last `bt` complete weeks; pick lowest WAPE.
const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

function naiveFc(y, h) { const last = y.length ? y[y.length - 1] : 0; return Array.from({ length: h }, () => last); }
function maFc(y, h, k = 4) { const w = y.slice(-k); const avg = w.length ? w.reduce((a, c) => a + c, 0) / w.length : 0; return Array.from({ length: h }, () => avg); }
function sesFc(y, h, a) { if (!y.length) return Array.from({ length: h }, () => 0); let s = y[0]; for (let i = 1; i < y.length; i++) s = a * y[i] + (1 - a) * s; return Array.from({ length: h }, () => s); }
function holtFc(y, h, a, b) { if (y.length < 2) { const last = y[y.length - 1] ?? 0; return Array.from({ length: h }, () => last); } let level = y[0]; let trend = y[1] - y[0]; for (let i = 1; i < y.length; i++) { const pl = level; level = a * y[i] + (1 - a) * (level + trend); trend = b * (level - pl) + (1 - b) * trend; } return Array.from({ length: h }, (_, k) => level + (k + 1) * trend); }

function wapeBias(actual, pred) {
  let ae = 0, at = 0, bias = 0;
  for (let i = 0; i < actual.length; i++) { ae += Math.abs(actual[i] - pred[i]); at += Math.abs(actual[i]); bias += (pred[i] - actual[i]); }
  const w = at > 0 ? ae / at : (ae > 0 ? 1 : 0);
  return { wape: w, bias: actual.length ? bias / actual.length : 0 };
}

// weeks: [{ week_start, units }] of COMPLETE weeks (caller excludes the partial week).
export function forecastSeries(weeks, h = 8, bt = 8) {
  const n = weeks.length;
  if (n < 16) return { notEnough: true };
  const y = weeks.map((w) => Number(w.units) || 0);
  const train = y.slice(0, n - bt);
  const test = y.slice(n - bt);
  const testWeeks = weeks.slice(n - bt).map((w) => w.week_start);
  const lastWeek = weeks[n - 1].week_start;
  const forecastWeeks = Array.from({ length: h }, (_, k) => addDays(lastWeek, 7 * (k + 1)));

  let bestSes = { alpha: 0.3, wape: Infinity, bias: 0, fc: null };
  for (const a of ALPHAS) { const p = sesFc(train, bt, a); const { wape, bias } = wapeBias(test, p); if (wape < bestSes.wape) bestSes = { alpha: a, wape, bias, fc: sesFc(y, h, a) }; }
  let bestHolt = { alpha: 0.3, beta: 0.1, wape: Infinity, bias: 0, fc: null };
  for (const a of ALPHAS) for (const b of ALPHAS) { const p = holtFc(train, bt, a, b); const { wape, bias } = wapeBias(test, p); if (wape < bestHolt.wape) bestHolt = { alpha: a, beta: b, wape, bias, fc: holtFc(y, h, a, b) }; }

  const np = naiveFc(train, bt); const mp = maFc(train, bt, 4);
  const nWB = wapeBias(test, np); const mWB = wapeBias(test, mp);
  const models = {
    naive: { wape: nWB.wape, bias: nWB.bias, backtest: np, forecast: naiveFc(y, h) },
    ma: { wape: mWB.wape, bias: mWB.bias, backtest: mp, forecast: maFc(y, h, 4) },
    ses: { wape: bestSes.wape, bias: bestSes.bias, backtest: sesFc(train, bt, bestSes.alpha), forecast: bestSes.fc },
    holt: { wape: bestHolt.wape, bias: bestHolt.bias, backtest: holtFc(train, bt, bestHolt.alpha, bestHolt.beta), forecast: bestHolt.fc },
  };
  let winner = "naive";
  for (const k of ["ma", "ses", "holt"]) if (models[k].wape < models[winner].wape) winner = k;

  const errs = test.map((a, i) => a - models[winner].backtest[i]);
  const emean = errs.reduce((a, c) => a + c, 0) / (errs.length || 1);
  const variance = errs.reduce((a, c) => a + (c - emean) ** 2, 0) / (errs.length || 1);
  const std = Math.sqrt(variance) || 0;
  const fc = models[winner].forecast;
  const lower = fc.map((v) => ri(v - 1.28 * std));
  const upper = fc.map((v) => ri(v + 1.28 * std));
  const fcr = fc.map(ri);

  return {
    notEnough: false,
    winner,
    testWeeks,
    testActual: test.map((v) => ri(v)),
    backtestPred: models[winner].backtest.map(ri),
    forecastWeeks,
    forecast: fcr,
    lower,
    upper,
    models: {
      naive: { wape: r4(models.naive.wape), bias: r2(models.naive.bias), forecast: models.naive.forecast.map(ri) },
      ma: { wape: r4(models.ma.wape), bias: r2(models.ma.bias), forecast: models.ma.forecast.map(ri) },
      ses: { wape: r4(models.ses.wape), bias: r2(models.ses.bias), forecast: models.ses.forecast.map(ri) },
      holt: { wape: r4(models.holt.wape), bias: r2(models.holt.bias), forecast: models.holt.forecast.map(ri) },
    },
  };
}

// ---------------- Customer segmentation (k-means) ----------------
function mulberry32(seed) {
  return function () { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function standardize(arr) {
  const mean = arr.reduce((a, c) => a + c, 0) / (arr.length || 1);
  const sd = Math.sqrt(arr.reduce((a, c) => a + (c - mean) ** 2, 0) / (arr.length || 1)) || 1;
  return arr.map((v) => (v - mean) / sd);
}
function kmeans(data, k, rng, inits = 10, iters = 50) {
  let best = null;
  for (let init = 0; init < inits; init++) {
    // pick k distinct random points as centroids
    const idxs = new Set();
    while (idxs.size < k && idxs.size < data.length) idxs.add(Math.floor(rng() * data.length));
    let cents = [...idxs].map((i) => [...data[i]]);
    let assign = new Array(data.length).fill(0);
    for (let it = 0; it < iters; it++) {
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        let bd = Infinity, bi = 0;
        for (let c = 0; c < k; c++) { const d = data[i].reduce((a, v, j) => a + (v - cents[c][j]) ** 2, 0); if (d < bd) { bd = d; bi = c; } }
        if (assign[i] !== bi) { assign[i] = bi; changed = true; }
      }
      // recompute
      const sums = Array.from({ length: k }, () => Array(data[0].length).fill(0));
      const counts = Array(k).fill(0);
      for (let i = 0; i < data.length; i++) { counts[assign[i]]++; for (let j = 0; j < data[0].length; j++) sums[assign[i]][j] += data[i][j]; }
      for (let c = 0; c < k; c++) if (counts[c]) cents[c] = sums[c].map((s) => s / counts[c]);
      if (!changed) break;
    }
    let inertia = 0;
    for (let i = 0; i < data.length; i++) { const c = cents[assign[i]]; inertia += data[i].reduce((a, v, j) => a + (v - c[j]) ** 2, 0); }
    if (!best || inertia < best.inertia) best = { assign, inertia };
  }
  return best;
}

// rfm: [{ customer_ref, country, recency, frequency, monetary }]
export function segmentCustomers(rfm) {
  if (rfm.length < 4) return rfm.map((x) => ({ customer_ref: x.customer_ref, store_id: storeFromCountry(x.country), recency_days: Math.round(x.recency), frequency: x.frequency, monetary: r2(x.monetary), segment: "Loyal" }));
  const rec = rfm.map((x) => x.recency);
  const logF = rfm.map((x) => Math.log1p(x.frequency));
  const logM = rfm.map((x) => Math.log1p(x.monetary));
  const rZ = standardize(rec), fZ = standardize(logF), mZ = standardize(logM);
  const data = rfm.map((_, i) => [rZ[i], fZ[i], mZ[i]]);
  const best = kmeans(data, 4, mulberry32(42));

  // cluster means on original scale
  const groups = [[], [], [], []];
  best.assign.forEach((c, i) => groups[c].push(i));
  const means = groups.map((g) => ({
    recency: avg(g.map((i) => rfm[i].recency)),
    frequency: avg(g.map((i) => rfm[i].frequency)),
    monetary: avg(g.map((i) => rfm[i].monetary)),
  }));
  // Rank: higher = better (recent, frequent, high spend)
  const score = means.map((m) => -m.recency + m.frequency + m.monetary);
  const order = [0, 1, 2, 3].sort((a, b) => score[b] - score[a]);
  const labelMap = { [order[0]]: "Champions", [order[1]]: "Loyal", [order[2]]: "At risk", [order[3]]: "Lost" };

  return rfm.map((x, i) => ({
    customer_ref: x.customer_ref,
    store_id: storeFromCountry(x.country),
    recency_days: Math.round(x.recency),
    frequency: x.frequency,
    monetary: r2(x.monetary),
    segment: labelMap[best.assign[i]],
  }));
}
function avg(arr) { return arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : 0; }

function storeFromCountry(country) {
  const c = (country || "").trim();
  if (!c) return "STORE_ROW";
  if (c === "United Kingdom") return "STORE_UK";
  const EU = ["Germany", "France", "EIRE", "Spain", "Netherlands", "Belgium", "Switzerland", "Portugal", "Sweden", "Norway", "Denmark", "Finland", "Italy", "Poland", "Austria", "Iceland", "Cyprus", "Malta", "Greece", "Channel Islands", "European", "Lithuania"];
  return EU.includes(c) ? "STORE_EU" : "STORE_ROW";
}

// ---------------- ABC-XYZ ----------------
// rows: [{ sku, net_revenue, weekly_units: [] }] for one store
export function abcXyz(rows) {
  const total = rows.reduce((a, r) => a + (r.net_revenue || 0), 0) || 1;
  const sorted = [...rows].sort((a, b) => (b.net_revenue || 0) - (a.net_revenue || 0));
  let cum = 0;
  const abc = {};
  for (const r of sorted) { cum += r.net_revenue || 0; const share = cum / total; abc[r.sku] = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C"; }
  return rows.map((r) => {
    const u = r.weekly_units || [];
    const mean = u.reduce((a, c) => a + c, 0) / (u.length || 1);
    const sd = Math.sqrt(u.reduce((a, c) => a + (c - mean) ** 2, 0) / (u.length || 1));
    const cv = mean ? sd / mean : 0;
    return {
      sku: r.sku,
      abc_class: abc[r.sku],
      xyz_class: cv < 0.5 ? "X" : cv <= 1.0 ? "Y" : "Z",
      cv: r4(cv),
      revenue_share: r4((r.net_revenue || 0) / total),
    };
  });
}

// ---------------- Anomaly detection ----------------
// series: [{ date, value }] trading days, sorted ascending
export function detectAnomalies(series, window = 28) {
  const out = [];
  for (let i = window; i < series.length; i++) {
    const w = series.slice(i - window, i).map((d) => d.value);
    const mean = w.reduce((a, c) => a + c, 0) / window;
    const sd = Math.sqrt(w.reduce((a, c) => a + (c - mean) ** 2, 0) / window);
    if (sd <= 0) continue;
    const z = (series[i].value - mean) / sd;
    if (Math.abs(z) > 3) out.push({ date: series[i].date, expected: r2(mean), actual: r2(series[i].value), z_score: r4(z), direction: z > 0 ? "high" : "low" });
  }
  return out;
}