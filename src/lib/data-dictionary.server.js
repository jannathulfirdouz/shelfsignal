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
  { entity: "SalesWeeklySummary", field: "week_start", definition: "Week start date (Monday).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "store_id", definition: "Store.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "sku", definition: "Product.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Public" },
  { entity: "SalesWeeklySummary", field: "category", definition: "Product category.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "units", definition: "Units sold in the week.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "gross_revenue", definition: "Gross revenue (GBP).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "returns_value", definition: "Returns value (GBP).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "net_revenue", definition: "Net revenue (GBP).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "orders", definition: "Distinct invoices in the week.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesWeeklySummary", field: "cost", definition: "Cost of goods sold (GBP, simulated).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Confidential" },
  // SalesHourSummary
  { entity: "SalesHourSummary", field: "store_id", definition: "Store.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "weekday", definition: "Day of week (0 = Sunday).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "hour", definition: "Hour of day (0-23).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "net_revenue", definition: "Net revenue (GBP).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "SalesHourSummary", field: "orders", definition: "Distinct invoices.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
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
  // Phase 5: ML / forecasting entities
  { entity: "ForecastRun", field: "run_id", definition: "Forecast run identifier.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "created_by", definition: "User who ran the forecast.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "created_at", definition: "Run timestamp.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "series_count", definition: "Number of series forecast in the run.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "series_total", definition: "Number of series the run attempted.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "skipped_count", definition: "Number of series skipped for lack of history.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "notes", definition: "JSON list of every skipped series with the reason it was skipped.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "run_id", definition: "Forecast run this row belongs to.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "store_id", definition: "Store the series belongs to.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "series_type", definition: "category or sku.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "series_key", definition: "Category or SKU the series tracks.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "model", definition: "Forecasting model used.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Forecast", field: "wape", definition: "Weighted absolute percentage error from backtest.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "bias", definition: "Mean forecast bias from backtest.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "week_start", definition: "Forecast week start date.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "predicted_units", definition: "Predicted units for the week.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Forecast", field: "lower", definition: "Lower 80% band bound.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Forecast", field: "upper", definition: "Upper 80% band bound.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Forecast", field: "is_backtest", definition: "True if this row is a backtest prediction.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "actual_units", definition: "Actual units for the backtest week.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "CustomerSegment", field: "customer_ref", definition: "Customer reference.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "CustomerSegment", field: "store_id", definition: "Store derived from the customer's country.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "CustomerSegment", field: "recency_days", definition: "Days since last purchase before 2011-12-09.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "CustomerSegment", field: "frequency", definition: "Distinct invoices.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "CustomerSegment", field: "monetary", definition: "Net revenue (GBP).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Confidential" },
  { entity: "CustomerSegment", field: "segment", definition: "Champions, Loyal, At risk or Lost.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "ProductClass", field: "store_id", definition: "Store.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ProductClass", field: "sku", definition: "Product.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Public" },
  { entity: "ProductClass", field: "abc_class", definition: "ABC revenue class (A, B or C).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ProductClass", field: "xyz_class", definition: "XYZ variability class (X, Y or Z).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ProductClass", field: "cv", definition: "Coefficient of variation of weekly units.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ProductClass", field: "revenue_share", definition: "Share of store net revenue.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "store_id", definition: "Store.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "category", definition: "Category.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "date", definition: "Flagged trading day.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "expected", definition: "Rolling 28-trading-day mean.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "actual", definition: "Actual daily net revenue.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "z_score", definition: "Standardised deviation from expected.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "direction", definition: "high or low.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "abs_diff", definition: "Absolute deviation in GBP between actual and expected. Days below the minimum deviation are not flagged.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Anomaly", field: "peak_season", definition: "True for November and December trading days, which are labelled Peak season rather than treated as a warning.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Forecast", field: "flag", definition: "Quality flag on the forecast, e.g. Check: rising trend.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "ForecastRun", field: "avg_wape", definition: "Average backtest WAPE across the run's series.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  // Phase 6: Action centre
  { entity: "Recommendation", field: "store_id", definition: "Store the recommendation applies to.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "type", definition: "reorder, markdown, investigate or re_engage.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "sku", definition: "Product the recommendation concerns (reorder, markdown, investigate).", owner: "System", source: "App", source_type: "Derived", sensitivity: "Public" },
  { entity: "Recommendation", field: "category", definition: "Category the recommendation concerns.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "customer_ref", definition: "Customer the re-engage recommendation concerns.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "title", definition: "Short recommendation title.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "reason", definition: "Plain-English reason built from the metrics.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Recommendation", field: "metrics", definition: "JSON of the numbers used to build the recommendation.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "confidence", definition: "High when backtest WAPE is under 25%, medium between 25% and 45%, low above 45% or with no forecast; a trust score under 90% drops the level by one.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "expected_impact_gbp", definition: "Value affected (GBP) under the type's own definition: reorder = shortfall units x unit price; markdown = on-hand units x unit cost; investigate = absolute actual-versus-expected deviation; re-engage = the customer's historic monetary value.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
  { entity: "Recommendation", field: "status", definition: "new, accepted or rejected.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "decided_by", definition: "User who accepted or rejected the recommendation.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "decided_at", definition: "Decision timestamp.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "decision_note", definition: "Optional note recorded with the decision.", owner: "Owner", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "generated_at", definition: "Generation timestamp.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "run_id", definition: "Generation run identifier.", owner: "System", source: "App", source_type: "Derived", sensitivity: "Internal" },
  { entity: "Recommendation", field: "ai_explanation", definition: "Saved AI explanation, generated only on request.", owner: "System", source: "App", source_type: "Simulated", sensitivity: "Internal" },
];

// Create only the (entity, field) pairs not already present. Returns counts.
async function readAllDict(b) {
  const existing = [];
  let cursor;
  do {
    const page = await b.entities.DataDictionaryEntry.filter({}, { limit: 1000, cursor });
    existing.push(...(page.items ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return existing;
}

// Create only the (entity, field) pairs not already present, and repair existing
// entries whose Owner/Source are blank or whose Source is wrong (summary tables are
// built by the app, not Python). Returns counts.
export async function seedDictionary(b) {
  const existing = await readAllDict(b);
  const have = new Set(existing.map((x) => `${x.entity}|${x.field}`));
  const missing = DICTIONARY_CATALOG.filter((c) => !have.has(`${c.entity}|${c.field}`));
  if (missing.length) await b.entities.DataDictionaryEntry.bulkCreate(missing);

  const catMap = new Map(DICTIONARY_CATALOG.map((c) => [`${c.entity}|${c.field}`, c]));
  const SUMMARY_ENTITIES = ["SalesWeeklySummary", "SalesHourSummary"];
  const toUpdate = [];
  for (const x of existing) {
    const cat = catMap.get(`${x.entity}|${x.field}`);
    const patch = {};
    if ((!x.owner || x.owner === "") && cat?.owner) patch.owner = cat.owner;
    if ((!x.source || x.source === "") && cat?.source) patch.source = cat.source;
    if (SUMMARY_ENTITIES.includes(x.entity) && x.source !== "App") patch.source = "App";
    if (Object.keys(patch).length) toUpdate.push({ id: x.id, ...patch });
  }
  if (toUpdate.length) {
    for (let i = 0; i < toUpdate.length; i += 500) await b.entities.DataDictionaryEntry.bulkUpdate(toUpdate.slice(i, i + 500));
  }
  return { created: missing.length, repaired: toUpdate.length, total: existing.length + missing.length };
}