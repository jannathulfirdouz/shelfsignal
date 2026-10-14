// Data quality rule definitions, the row evaluator and the trust-score maths.
// Server-only. Each rule is evaluated per row; a row "fails" a rule when test() returns false.

export const SEED_RULES = [
  { key: "dup", name: "No duplicate sales rows", dimension: "uniqueness", severity: "critical", field: "invoice_no",
    check_description: "No duplicate rows with the same invoice_no, sku, qty, unit_price and txn_datetime. The first is kept; the rest are flagged." },
  { key: "sku", name: "SKU exists in Product", dimension: "consistency", severity: "critical", field: "sku",
    check_description: "sku must exist in Product. Codes like POST, M, D and BANK CHARGES are not products." },
  { key: "qty", name: "Quantity is positive", dimension: "validity", severity: "critical", field: "qty",
    check_description: "qty must be positive unless invoice_no starts with C." },
  { key: "price", name: "Unit price above zero", dimension: "validity", severity: "critical", field: "unit_price",
    check_description: "unit_price must be greater than 0." },
  { key: "return", name: "Return invoices flagged", dimension: "validity", severity: "warning", field: "invoice_no",
    check_description: "invoice_no starting with C is a return. Kept for net sales and flagged." },
  { key: "cust", name: "Customer reference present", dimension: "completeness", severity: "warning", field: "customer_ref",
    check_description: "customer_ref should not be empty. Kept for sales totals, excluded from customer analysis." },
  { key: "listprice", name: "Price within 50% of list price", dimension: "accuracy", severity: "warning", field: "unit_price",
    check_description: "unit_price within 50% of the product's list price." },
  { key: "future", name: "Date not in the future", dimension: "timeliness", severity: "critical", field: "date",
    check_description: "date must not be in the future." },
];

// Weights for the Data Trust Score. Accuracy is a separate warning, not part of the score.
export const WEIGHTS = { completeness: 25, validity: 25, uniqueness: 20, consistency: 15, timeliness: 15 };

export const RULE_KEY_BY_NAME = Object.fromEntries(SEED_RULES.map((r) => [r.name, r.key]));

const isReturn = (r) => String(r.invoice_no ?? "").toUpperCase().startsWith("C");
const dupKey = (r) => [r.invoice_no, r.sku, r.qty, r.unit_price, r.txn_datetime].map((v) => String(v ?? "")).join("|");

// Evaluates every active rule over `rows`. `ctx` = { products: Map<sku, unit_price>, today: "YYYY-MM-DD" }.
// Returns { perRule: { key: { checked, failed, samples[] } }, failedKeysByTxn: Map<id, Set<ruleKey>> }.
export function evaluateRows(rows, activeKeys, ctx, state) {
  const { perRule, seenDup, criticalFailed } = state;
  for (const r of rows) {
    const failedHere = [];
    const check = (key, failed) => {
      if (!activeKeys.has(key)) return;
      const s = (perRule[key] ??= { checked: 0, failed: 0, samples: [] });
      s.checked += 1;
      if (failed) {
        s.failed += 1;
        if (s.samples.length < 10) s.samples.push(r.txn_id);
        failedHere.push(key);
      }
    };

    // Uniqueness: keep the first occurrence, flag the rest.
    const k = dupKey(r);
    const isDup = seenDup.has(k);
    seenDup.add(k);
    check("dup", isDup);

    check("sku", !ctx.products.has(String(r.sku ?? "")));
    check("qty", !(Number(r.qty) > 0) && !isReturn(r));
    check("price", !(Number(r.unit_price) > 0));
    check("return", isReturn(r));
    check("cust", !String(r.customer_ref ?? "").trim());

    const list = ctx.products.get(String(r.sku ?? ""));
    if (activeKeys.has("listprice") && list > 0) {
      const price = Number(r.unit_price);
      check("listprice", !(price >= list * 0.5 && price <= list * 1.5));
    }
    check("future", Boolean(r.date) && String(r.date).slice(0, 10) > ctx.today);

    // Only critical rules quarantine; warnings never do.
    const critical = failedHere.some((key) => SEED_RULES.find((x) => x.key === key)?.severity === "critical");
    if (critical) criticalFailed.add(r.txn_id);
  }
}

export function newState() {
  return { perRule: {}, seenDup: new Set(), criticalFailed: new Set() };
}

// Weighted pass rate across the five scored dimensions. A dimension's pass rate is
// 1 - (failed / checked) averaged over its rules. Dimensions with no active rule are
// left out and the remaining weights are re-normalised.
export function scoreFromRules(ruleStats) {
  const dims = {};
  for (const s of ruleStats) {
    if (!s.checked) continue;
    (dims[s.dimension] ??= []).push(1 - s.failed / s.checked);
  }
  const passRates = Object.fromEntries(
    Object.entries(dims).map(([d, arr]) => [d, arr.reduce((a, c) => a + c, 0) / arr.length])
  );
  let weighted = 0;
  let totalW = 0;
  for (const [d, w] of Object.entries(WEIGHTS)) {
    if (passRates[d] == null) continue;
    weighted += passRates[d] * w;
    totalW += w;
  }
  const score = totalW > 0 ? Math.round((weighted / totalW) * 1000) / 10 : null;
  return { score, passRates };
}