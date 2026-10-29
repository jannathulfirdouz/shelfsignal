// Catalog of every field of every entity, used to seed the DataDictionaryEntry
// table. Existing entries are kept; only missing (entity, field) pairs are created.
// owner: "Owner" | "Analyst" | "System"
// source: "UCI Online Retail II" | "Python ETL" | "App" | "Simulated"
// source_type: "Real" | "Derived" | "Simulated"
// sensitivity: "Public" | "Internal" | "Confidential" | "PII"
export const DICTIONARY_CATALOG = [
  // Store
  { entity: "Store", field: "store_id", definition: "Unique store identifier.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "Store", field: "name", definition: "Store display name.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "Store", field: "region", definition: "Sales region (UK, EU, ROW).", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  // Supplier
  { entity: "Supplier", field: "supplier_id", definition: "Unique supplier identifier.", owner: "Analyst", source: "Python ETL", source_type: "Real", sensitivity: "Internal" },
  { entity: "Supplier", field: "name", definition: "Supplier name.", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Supplier", field: "lead_time_days", definition: "Typical supplier lead time in days.", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Supplier", field: "min_order_qty", definition: "Minimum order quantity from supplier.", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Supplier", field: "is_simulated", definition: "True if supplier attributes are simulated.", owner: "System", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  // Product
  { entity: "Product", field: "sku", definition: "Stock keeping unit identifier.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "Product", field: "name", definition: "Product name.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "Product", field: "first_sale_date", definition: "Date of first sale.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Product", field: "last_sale_date", definition: "Date of most recent sale.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Product", field: "unit_price", definition: "Selling price per unit (GBP).", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "Product", field: "category", definition: "Product category, derived from SKU.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Product", field: "supplier_id", definition: "Linked supplier.", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Product", field: "unit_cost", definition: "Cost per unit (GBP), simulated.", owner: "Owner", source: "Simulated", source_type: "Simulated", sensitivity: "Confidential" },
  { entity: "Product", field: "unit_cost_is_simulated", definition: "True if unit_cost is simulated.", owner: "System", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Product", field: "days_since_last_sale", definition: "Days since last sale.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Product", field: "active", definition: "Whether the product is active.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // Customer
  { entity: "Customer", field: "customer_ref", definition: "Customer reference identifier.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "Customer", field: "country", definition: "Customer country.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "Customer", field: "first_purchase_date", definition: "Date of first purchase.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Customer", field: "email", definition: "Customer email address.", owner: "Owner", source: "UCI Online Retail II", source_type: "Real", sensitivity: "PII" },
  { entity: "Customer", field: "email_is_simulated", definition: "True if email is simulated.", owner: "System", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  // SalesTransaction
  { entity: "SalesTransaction", field: "txn_id", definition: "Unique transaction identifier.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "invoice_no", definition: "Invoice number.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "date", definition: "Transaction date.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "txn_datetime", definition: "Transaction timestamp.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "store_id", definition: "Store the sale belongs to.", owner: "Analyst", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "sku", definition: "Product sold.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "SalesTransaction", field: "description", definition: "Line description.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "qty", definition: "Quantity sold (negative for returns).", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "unit_price", definition: "Unit price (GBP).", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "customer_ref", definition: "Customer reference.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "channel", definition: "Sales channel.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "country", definition: "Destination country.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "SalesTransaction", field: "batch_id", definition: "Import batch.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesTransaction", field: "is_quarantined", definition: "True if row failed a critical data quality rule.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // InventorySnapshot
  { entity: "InventorySnapshot", field: "date", definition: "Snapshot date.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Internal" },
  { entity: "InventorySnapshot", field: "store_id", definition: "Store.", owner: "Analyst", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "InventorySnapshot", field: "sku", definition: "Product.", owner: "Analyst", source: "UCI Online Retail II", source_type: "Real", sensitivity: "Public" },
  { entity: "InventorySnapshot", field: "on_hand", definition: "Units on hand (simulated).", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "InventorySnapshot", field: "on_order", definition: "Units on order (simulated).", owner: "Analyst", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "InventorySnapshot", field: "is_simulated", definition: "True if snapshot figures are simulated.", owner: "System", source: "Simulated", source_type: "Simulated", sensitivity: "Internal" },
  // DataBatch
  { entity: "DataBatch", field: "batch_id", definition: "Batch identifier.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "file_name", definition: "Source file name.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "uploaded_by", definition: "User who uploaded.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "rows_in", definition: "Rows in source file.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "rows_passed", definition: "Rows imported.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "trust_score", definition: "Legacy trust score.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "status", definition: "Import status.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "error_message", definition: "Import error message.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "created_at", definition: "Batch creation time.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "quality_score", definition: "Weighted data quality pass rate.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "accuracy_pass_rate", definition: "Accuracy dimension pass rate.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "rows_excluded", definition: "Rows excluded by data quality rules.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "last_checked_at", definition: "Last data quality check time.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataBatch", field: "quality_status", definition: "Data quality check status.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // DataQualityRule
  { entity: "DataQualityRule", field: "name", definition: "Rule name.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "dimension", definition: "Data quality dimension.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "entity", definition: "Entity the rule applies to.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "field", definition: "Field the rule checks.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "check_description", definition: "What the rule checks.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "severity", definition: "Critical or warning.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityRule", field: "active", definition: "Whether the rule is active.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // DataQualityIssue
  { entity: "DataQualityIssue", field: "batch_id", definition: "Batch the issue belongs to.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "rule_name", definition: "Rule that failed.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "dimension", definition: "Data quality dimension.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "severity", definition: "Critical or warning.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "failed_count", definition: "Rows that failed the rule.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "checked_count", definition: "Rows checked by the rule.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "sample_record_refs", definition: "Sample failing record references.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "status", definition: "Open, resolved or accepted.", owner: "Analyst", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataQualityIssue", field: "created_at", definition: "Issue creation time.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // AuditLog
  { entity: "AuditLog", field: "user", definition: "User who performed the action.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "role", definition: "Role at time of action.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "action", definition: "Action performed.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "entity", definition: "Entity affected.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "record_ref", definition: "Record reference.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "timestamp", definition: "Action timestamp.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AuditLog", field: "detail", definition: "Action detail.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // AppUserProfile
  { entity: "AppUserProfile", field: "user", definition: "User id.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "AppUserProfile", field: "role", definition: "App role.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Confidential" },
  { entity: "AppUserProfile", field: "store_id", definition: "Assigned store (store managers).", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // MetricDefinition
  { entity: "MetricDefinition", field: "name", definition: "Metric name.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "MetricDefinition", field: "formula", definition: "Metric formula.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "MetricDefinition", field: "owner", definition: "Metric owner.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "MetricDefinition", field: "notes", definition: "Metric notes.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // SalesWeeklySummary
  { entity: "SalesWeeklySummary", field: "week_start", definition: "Week start date (Monday).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "store_id", definition: "Store.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "sku", definition: "Product.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Public" },
  { entity: "SalesWeeklySummary", field: "category", definition: "Product category.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "units", definition: "Units sold in the week.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "gross_revenue", definition: "Gross revenue (GBP).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "returns_value", definition: "Returns value (GBP).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "net_revenue", definition: "Net revenue (GBP).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "orders", definition: "Distinct invoices in the week.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "cost", definition: "Cost of goods sold (GBP, simulated).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Confidential" },
  // SalesHourSummary
  { entity: "SalesHourSummary", field: "store_id", definition: "Store.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "weekday", definition: "Day of week (0 = Sunday).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "hour", definition: "Hour of day (0-23).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "net_revenue", definition: "Net revenue (GBP).", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "orders", definition: "Distinct invoices.", owner: "System", source: "Python ETL", source_type: "Derived", sensitivity: "Internal" },
  // DataDictionaryEntry
  { entity: "DataDictionaryEntry", field: "entity", definition: "Entity name.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "field", definition: "Field name.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "definition", definition: "Field definition.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "source_type", definition: "Real, Derived or Simulated.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "sensitivity", definition: "Public, Internal, Confidential or PII.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "owner", definition: "Definition owner.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "DataDictionaryEntry", field: "source", definition: "Data source.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // User
  { entity: "User", field: "email", definition: "User email.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "PII" },
  { entity: "User", field: "full_name", definition: "User full name.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "User", field: "app_role", definition: "App role.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Confidential" },
  { entity: "User", field: "store_id", definition: "Assigned store.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // PrivacySetting
  { entity: "PrivacySetting", field: "retention_months", definition: "Email retention period in months.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "PrivacySetting", field: "last_applied_at", definition: "Last masking application time.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "PrivacySetting", field: "last_applied_by", definition: "User who last applied masking.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
];

// Create only the (entity, field) pairs not already present. Returns counts.
export async function seedDictionary(b) {
  const existing = [];
  let cursor;
  do {
    const page = await b.entities.DataDictionaryEntry.filter({}, { limit: 1000, cursor });
    existing.push(...(page.items ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  const have = new Set(existing.map((x) => `${x.entity}|${x.field}`));
  const missing = DICTIONARY_CATALOG.filter((c) => !have.has(`${c.entity}|${c.field}`));
  if (missing.length) await b.entities.DataDictionaryEntry.bulkCreate(missing);
  return { created: missing.length, total: existing.length + missing.length };
}