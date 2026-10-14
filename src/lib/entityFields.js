// Field definitions for each importable entity, used by the import mapper.
// `simulated` flags fields whose values are simulated and must be labelled.
export const ENTITY_FIELDS = {
  Store: [
    { name: "store_id", type: "string", required: true },
    { name: "name", type: "string", required: true },
    { name: "region", type: "string", required: true },
  ],
  Supplier: [
    { name: "supplier_id", type: "string", required: true },
    { name: "name", type: "string", required: true },
    { name: "lead_time_days", type: "number" },
    { name: "min_order_qty", type: "number" },
    { name: "is_simulated", type: "boolean", simulated: true },
  ],
  Product: [
    { name: "sku", type: "string", required: true },
    { name: "name", type: "string", required: true },
    { name: "first_sale_date", type: "string" },
    { name: "last_sale_date", type: "string" },
    { name: "unit_price", type: "number" },
    { name: "category", type: "string" },
    { name: "supplier_id", type: "string" },
    { name: "unit_cost", type: "number" },
    { name: "unit_cost_is_simulated", type: "boolean", simulated: true },
    { name: "days_since_last_sale", type: "number" },
    { name: "active", type: "boolean" },
  ],
  Customer: [
    { name: "customer_ref", type: "string", required: true },
    { name: "country", type: "string", required: true },
    { name: "first_purchase_date", type: "string" },
    { name: "email", type: "string" },
    { name: "email_is_simulated", type: "boolean", simulated: true },
  ],
  SalesTransaction: [
    { name: "txn_id", type: "string", required: true },
    { name: "invoice_no", type: "string" },
    { name: "date", type: "string" },
    { name: "txn_datetime", type: "string" },
    { name: "store_id", type: "string", required: true },
    { name: "sku", type: "string", required: true },
    { name: "description", type: "string" },
    { name: "qty", type: "number" },
    { name: "unit_price", type: "number" },
    { name: "customer_ref", type: "string" },
    { name: "channel", type: "string" },
    { name: "country", type: "string" },
    { name: "batch_id", type: "string" },
    { name: "is_quarantined", type: "boolean" },
  ],
  InventorySnapshot: [
    { name: "date", type: "string", required: true },
    { name: "store_id", type: "string", required: true },
    { name: "sku", type: "string", required: true },
    { name: "on_hand", type: "number" },
    { name: "on_order", type: "number" },
    { name: "is_simulated", type: "boolean", simulated: true },
  ],
  DataDictionaryEntry: [
    { name: "entity", type: "string", required: true },
    { name: "field", type: "string", required: true },
    { name: "definition", type: "string", required: true },
    { name: "source_type", type: "string", required: true },
    { name: "sensitivity", type: "string" },
  ],
};

export const IMPORTABLE_ENTITIES = Object.keys(ENTITY_FIELDS);

export function autoMap(headers, fields) {
  const map = {};
  for (const f of fields) {
    const match = headers.find(
      (h) => h.toLowerCase().replace(/[\s-]/g, "_") === f.name.toLowerCase()
    );
    map[f.name] = match || "";
  }
  return map;
}