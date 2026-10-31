// Pure ML helpers for ShelfSignal. No I/O, no Base44 SDK — imported by ml-fns.js.
const r2 = (n) => Math.round((n || 0) * 100) / 100;
const r4 = (n) => Math.round((n || 0) * 10000) / 10000;
const ri = (n) => Math.max(0, Math.round(n || 0));

function addDays(dStr, n) { const d = new Date(dStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------------- Demand forecasting ----------------
// Five models. Backtest on the last `bt` complete weeks. Selection: lowest WAPE,
// but among models within 1 percentage point of the best, the smallest |bias| wins.
const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const PHIS = [0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98];
export const FORECAST_MODELS = ["naive", "ma", "ses", "holt", "damped"];

function naiveFc(y, h) { const last = y.length ? y[y.length - 1] : 0; return Array.from({ length: h }, () => last); }
function maFc(y, h, k = 4) { const w = y.slice(-k); const avg = w.length ? w.reduce((a, c) => a + c, 0) / w.length : 0; return Array.from({ length: h }, () => avg); }
function sesFc(y, h, a) { if (!y.length) return Array.from({ length: h }, () => 0); let s = y[0]; for (let i = 1; i < y.length; i++) s = a * y[i] + (1 - a) * s; return Array.from({ length: h }, () => s); }
function holtFc(y, h, a, b) { if (y.length < 2) { const last = y[y.length - 1] ?? 0; return Array.from({ length: h }, () => last); } let level = y[0]; let trend = y[1] - y[0]; for (let i = 1; i < y.length; i++) { const pl = level; level = a * y[i] + (1 - a) * (level + trend); trend = b * (level - pl) + (1 - b) * trend; } return Array.from({ length: h }, (_, k) => level + (k + 1) * trend); }
// Damped Holt: the trend is multiplied by phi^k, so it flattens with the horizon.
function dampedFc(y, h, a, b, phi) { if (y.length < 2) { const last = y[y.length - 1] ?? 0; return Array.from({ length: h }, () => last); } let level = y[0]; let trend = y[1] - y[0]; for (let i = 1; i < y.length; i++) { const pl = level; level = a * y[i] + (1 - a) * (level + trend); trend = b * (level - pl) + (1 - b) * trend; } const out = []; let cum = 0; for (let k = 1; k <= h; k++) { cum += Math.pow(phi, k); out.push(level + trend * cum); } return out; }

function wapeBias(actual, pred) {
  let ae = 0, at = 0, bias = 0;
  for (let i = 0; i < actual.length; i++) { ae += Math.abs(actual[i] - pred[i]); at += Math.abs(actual[i]); bias += (pred[i] - actual[i]); }
  const w = at > 0 ? ae / at : (ae > 0 ? 1 : 0);
  return { wape: w, bias: actual.length ? bias / actual.length : 0 };
}

// Lowest WAPE; if another model is within 1 percentage point of it, the smallest
// absolute bias of that set wins. Returns the chosen model and a readable reason.
export function pickWinner(models) {
  const arr = Object.entries(models)
    .filter(([, m]) => m && m.wape != null && isFinite(m.wape))
    .map(([name, m]) => ({ name, wape: m.wape, bias: m.bias || 0 }));
  if (!arr.length) return { winner: "naive", reason: "" };
  arr.sort((a, b) => a.wape - b.wape);
  const best = arr[0];
  const near = arr.filter((a) => a.wape - best.wape <= 0.01 + 1e-9);
  let pick = near[0];
  for (const a of near) if (Math.abs(a.bias) < Math.abs(pick.bias)) pick = a;
  let reason;
  if (pick.name === best.name) reason = `Lowest backtest WAPE (${(best.wape * 100).toFixed(1)}%).`;
  else {
    const others = near.filter((a) => a.name !== pick.name).map((a) => `${a.name} ${(a.wape * 100).toFixed(1)}%`).join(", ");
    reason = `WAPE ${(pick.wape * 100).toFixed(1)}% is within 1 percentage point of the best (${(best.wape * 100).toFixed(1)}%; ${others}), and its bias (${pick.bias.toFixed(1)}) is the smallest of those.`;
  }
  return { winner: pick.name, reason };
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
  let bestDamped = { alpha: 0.3, beta: 0.1, phi: 0.9, wape: Infinity, bias: 0, fc: null };
  for (const a of ALPHAS) for (const b of ALPHAS) for (const phi of PHIS) { const p = dampedFc(train, bt, a, b, phi); const { wape, bias } = wapeBias(test, p); if (wape < bestDamped.wape) bestDamped = { alpha: a, beta: b, phi, wape, bias, fc: dampedFc(y, h, a, b, phi) }; }

  const np = naiveFc(train, bt); const mp = maFc(train, bt, 4);
  const nWB = wapeBias(test, np); const mWB = wapeBias(test, mp);
  const models = {
    naive: { wape: nWB.wape, bias: nWB.bias, backtest: np, forecast: naiveFc(y, h) },
    ma: { wape: mWB.wape, bias: mWB.bias, backtest: mp, forecast: maFc(y, h, 4) },
    ses: { wape: bestSes.wape, bias: bestSes.bias, backtest: sesFc(train, bt, bestSes.alpha), forecast: bestSes.fc },
    holt: { wape: bestHolt.wape, bias: bestHolt.bias, backtest: holtFc(train, bt, bestHolt.alpha, bestHolt.beta), forecast: bestHolt.fc },
    damped: { wape: bestDamped.wape, bias: bestDamped.bias, backtest: dampedFc(train, bt, bestDamped.alpha, bestDamped.beta, bestDamped.phi), forecast: bestDamped.fc },
  };
  const { winner, reason } = pickWinner(models);

  const errs = test.map((a, i) => a - models[winner].backtest[i]);
  const emean = errs.reduce((a, c) => a + c, 0) / (errs.length || 1);
  const variance = errs.reduce((a, c) => a + (c - emean) ** 2, 0) / (errs.length || 1);
  const std = Math.sqrt(variance) || 0;
  const fc = models[winner].forecast;
  // Band widens with horizon: +/- 1.28 * sigma * sqrt(weeks ahead).
  const lower = fc.map((v, k) => ri(v - 1.28 * std * Math.sqrt(k + 1)));
  const upper = fc.map((v, k) => ri(v + 1.28 * std * Math.sqrt(k + 1)));
  const fcr = fc.map(ri);

  // "Check: rising trend" — 8-week average forecast > 30% above the last 8 actual weeks.
  const avgFc = fcr.reduce((a, c) => a + c, 0) / (fcr.length || 1);
  const last8 = y.slice(-8);
  const avgLast8 = last8.reduce((a, c) => a + c, 0) / (last8.length || 1);
  const risingTrend = avgLast8 > 0 && avgFc > 1.3 * avgLast8;

  return {
    notEnough: false,
    winner,
    reason,
    risingTrend,
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
      damped: { wape: r4(models.damped.wape), bias: r2(models.damped.bias), forecast: models.damped.forecast.map(ri) },
    },
  };
}

// ---------------- Customer segmentation (k-means) ----------------
function mulberry32(seed) {
  return function () { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function standardize(arr) {
  // A single non-finite input would turn every distance into NaN and silently put
  // every point in one cluster, so scrub it first.
  const safe = arr.map((v) => (Number.isFinite(v) ? v : 0));
  const mean = safe.reduce((a, c) => a + c, 0) / (safe.length || 1);
  const sd = Math.sqrt(safe.reduce((a, c) => a + (c - mean) ** 2, 0) / (safe.length || 1)) || 1;
  return safe.map((v) => (v - mean) / sd);
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx];
}
function kmeans(data, k, rng, inits = 10, iters = 50) {
  let best = null;
  for (let init = 0; init < inits; init++) {
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
      const sums = Array.from({ length: k }, () => Array(data[0].length).fill(0));
      const counts = Array(k).fill(0);
      for (let i = 0; i < data.length; i++) { counts[assign[i]]++; for (let j = 0; j < data[0].length; j++) sums[assign[i]][j] += data[i][j]; }
      for (let c = 0; c < k; c++) if (counts[c]) cents[c] = sums[c].map((s) => s / counts[c]);
      // Reseed any empty cluster to the point farthest from its centroid, so a
      // cluster cannot collapse and every label ends up used.
      for (let c = 0; c < k; c++) {
        if (counts[c]) continue;
        let far = -1, farI = -1;
        for (let i = 0; i < data.length; i++) { const cc = cents[assign[i]]; const d = data[i].reduce((a, v, j) => a + (v - cc[j]) ** 2, 0); if (d > far) { far = d; farI = i; } }
        if (farI >= 0) { cents[c] = [...data[farI]]; assign[farI] = c; changed = true; }
      }
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
  if (!rfm.length) return [];
  if (rfm.length < 4) return rfm.map((x) => ({ customer_ref: x.customer_ref, store_id: storeFromCountry(x.country), recency_days: Math.round(x.recency), frequency: x.frequency, monetary: r2(x.monetary), segment: "Loyal" }));
  // Winsorise frequency and monetary at the 99th percentile before scaling so a
  // few huge wholesale customers cannot dominate the clusters.
  const fCap = percentile(rfm.map((x) => x.frequency), 0.99);
  const mCap = percentile(rfm.map((x) => x.monetary), 0.99);
  const rec = rfm.map((x) => x.recency);
  // Monetary can be negative when returns exceed purchases; Math.log1p of a value
  // below -1 is NaN, which collapsed every customer into cluster 0 (all Champions).
  // Floor at zero before the log.
  const logF = rfm.map((x) => Math.log1p(Math.max(0, Math.min(x.frequency, fCap))));
  const logM = rfm.map((x) => Math.log1p(Math.max(0, Math.min(x.monetary, mCap))));
  const rZ = standardize(rec), fZ = standardize(logF), mZ = standardize(logM);
  const data = rfm.map((_, i) => [rZ[i], fZ[i], mZ[i]]);
  const best = kmeans(data, 4, mulberry32(42));

  // Rank clusters on a combined score of their standardised centroids: recent (+),
  // frequent (+), high spend (+). Best = Champions … worst = Lost, each used once.
  const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const counts = [0, 0, 0, 0];
  best.assign.forEach((c, i) => { counts[c]++; for (let j = 0; j < 3; j++) sums[c][j] += data[i][j]; });
  const score = sums.map((s, c) => (counts[c] ? (-s[0] + s[1] + s[2]) / counts[c] : -Infinity));
  const order = [0, 1, 2, 3].sort((a, b) => score[b] - score[a]);
  const labels = ["Champions", "Loyal", "At risk", "Lost"];
  const labelMap = {};
  order.forEach((c, idx) => { labelMap[c] = labels[idx]; });

  return rfm.map((x, i) => ({
    customer_ref: x.customer_ref,
    store_id: storeFromCountry(x.country),
    recency_days: Math.round(x.recency),
    frequency: x.frequency,
    monetary: r2(x.monetary),
    segment: labelMap[best.assign[i]] || "Lost",
  }));
}

// Rule-based RFM check alongside k-means: recency, frequency and monetary each get a
// quintile score 1-5 (5 = best: most recent, most orders, highest spend), then a
// deterministic label. Used only to compare against the k-means segments.
// rows: [{ recency, frequency, monetary }]
export function rfmRuleSegments(rows) {
  if (!rows.length) return [];
  const cuts = (vals) => {
    const s = [...vals].sort((a, b) => a - b);
    return [0.2, 0.4, 0.6, 0.8].map((p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]);
  };
  const rCuts = cuts(rows.map((r) => Number(r.recency) || 0));
  const fCuts = cuts(rows.map((r) => Number(r.frequency) || 0));
  const mCuts = cuts(rows.map((r) => Number(r.monetary) || 0));
  const above = (c, v) => c.filter((x) => v >= x).length; // 0-4
  return rows.map((r) => {
    const recency_score = 5 - above(rCuts, Number(r.recency) || 0); // recent = high score
    const frequency_score = 1 + above(fCuts, Number(r.frequency) || 0);
    const monetary_score = 1 + above(mCuts, Number(r.monetary) || 0);
    let rule_segment;
    if (recency_score >= 4 && frequency_score >= 4 && monetary_score >= 4) rule_segment = "Champions";
    else if (recency_score + frequency_score + monetary_score >= 11) rule_segment = "Loyal";
    else if (recency_score <= 2 && frequency_score <= 2 && monetary_score <= 2) rule_segment = "Lost";
    else rule_segment = "At risk";
    return { recency_score, frequency_score, monetary_score, rule_segment };
  });
}

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
// A day is flagged only when it is both statistically unusual (|z| > 3) and
// materially large in money terms (|actual - expected| >= minGbp). Without the
// second test, small-variance categories produce a crowd of trivial flags.
export function detectAnomalies(series, window = 28, minGbp = 500) {
  const out = [];
  for (let i = window; i < series.length; i++) {
    const w = series.slice(i - window, i).map((d) => d.value);
    const mean = w.reduce((a, c) => a + c, 0) / window;
    const sd = Math.sqrt(w.reduce((a, c) => a + (c - mean) ** 2, 0) / window);
    if (sd <= 0) continue;
    const z = (series[i].value - mean) / sd;
    if (Math.abs(z) <= 3) continue;
    const absDiff = Math.abs(series[i].value - mean);
    if (absDiff < minGbp) continue;
    const month = Number(String(series[i].date).slice(5, 7));
    out.push({
      date: series[i].date,
      expected: r2(mean),
      actual: r2(series[i].value),
      z_score: r4(z),
      direction: z > 0 ? "high" : "low",
      abs_diff: r2(absDiff),
      peak_season: month === 11 || month === 12,
    });
  }
  return out;
}