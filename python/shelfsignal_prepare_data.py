"""
ShelfSignal - Stage 1 data preparation (Python ETL)
====================================================
Source : UCI Online Retail II (online_retail_II.xlsx)
Output : CSV files ready to upload into the ShelfSignal Base44 app

What this script DOES (structural preparation):
  - Loads the chosen sheet(s) and standardises column names, types and text
  - Samples the data to the top N products so Base44 can handle it
  - Derives product category from description keywords
  - Maps countries to 3 "stores" (UK, Europe, Rest of World)
  - Builds Products, Sales, Customers, Stores, Suppliers, Inventory tables
  - Adds SIMULATED fields that the real data does not have (cost, stock,
    suppliers, lead times, emails) and labels them clearly as simulated
  - Writes a data dictionary showing which fields are real vs simulated

What this script deliberately does NOT do:
  - It does NOT remove real data quality problems (cancellations, negative
    quantities, missing customer IDs, zero prices, duplicates, non-product
    codes). These stay in the data so the app's Trust Layer can catch them.

Requirements:  pip install pandas numpy openpyxl
Run:           python shelfsignal_prepare_data.py
Note: reading the Excel file can take a few minutes. That is normal.
"""

import os
import re
import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------
# SETTINGS - change these if needed
# ----------------------------------------------------------------------------
INPUT_FILE = "online_retail_II.xlsx"
SHEETS = ["Year 2010-2011"]          # sheet name in the Excel file; add "Year 2009-2010" for 2 years
OUTPUT_DIR = "shelfsignal_output"
TOP_N_PRODUCTS = 120                 # lower this if Base44 struggles to import
NON_PRODUCT_SAMPLE = 300             # keep some non-product rows for DQ checks
TEST_FILE_ROWS = 500                 # small sales file to test the import first
RANDOM_SEED = 42                     # same seed = same simulated values every run

rng = np.random.default_rng(RANDOM_SEED)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ----------------------------------------------------------------------------
# 1. LOAD
# ----------------------------------------------------------------------------
print("Loading Excel file (this can take a few minutes)...")
frames = []
for sheet in SHEETS:
    df_sheet = pd.read_excel(INPUT_FILE, sheet_name=sheet, dtype={"Invoice": str, "StockCode": str})
    df_sheet["source_sheet"] = sheet
    frames.append(df_sheet)
    print(f"  {sheet}: {len(df_sheet):,} rows")

raw = pd.concat(frames, ignore_index=True)

# The two sheets overlap on 1 to 9 December 2010. Remove the overlap if both are used.
if len(SHEETS) > 1:
    overlap = (raw["source_sheet"] == "Year 2009-2010") & (raw["InvoiceDate"] >= "2010-12-01")
    raw = raw[~overlap]
    print(f"  Removed {overlap.sum():,} overlapping rows between sheets")


# ----------------------------------------------------------------------------
# 2. STANDARDISE (structure only, not quality fixes)
# ----------------------------------------------------------------------------
raw = raw.rename(columns={
    "Invoice": "invoice_no",
    "StockCode": "sku",
    "Description": "description",
    "Quantity": "qty",
    "InvoiceDate": "txn_datetime",
    "Price": "unit_price",
    "Customer ID": "customer_id",
    "Country": "country",
})

raw["invoice_no"] = raw["invoice_no"].astype(str).str.strip()
raw["sku"] = raw["sku"].astype(str).str.strip().str.upper()
raw["description"] = raw["description"].astype(str).str.strip().str.upper().replace("NAN", np.nan)
raw["country"] = raw["country"].astype(str).str.strip()
raw["txn_datetime"] = pd.to_datetime(raw["txn_datetime"], dayfirst=True)

# Real products have 5 digits plus optional letters (e.g. 85123A).
# Codes like POST, M, D, BANK CHARGES are fees or adjustments, not products.
raw["is_product_code"] = raw["sku"].str.match(r"^\d{5}[A-Z]{0,2}$")
raw["is_cancellation"] = raw["invoice_no"].str.startswith("C")


# ----------------------------------------------------------------------------
# 3. SAMPLE: top N products by revenue (judged on clean sales only)
# ----------------------------------------------------------------------------
clean_sales = raw[raw["is_product_code"] & ~raw["is_cancellation"] & (raw["qty"] > 0) & (raw["unit_price"] > 0)]
revenue_by_sku = (clean_sales["qty"] * clean_sales["unit_price"]).groupby(clean_sales["sku"]).sum()
top_skus = revenue_by_sku.sort_values(ascending=False).head(TOP_N_PRODUCTS).index

# Keep ALL rows for the top products, including their real quality problems
sales = raw[raw["sku"].isin(top_skus)].copy()

# Add a small sample of non-product rows so the consistency rule has real cases to catch
non_product = raw[~raw["is_product_code"]]
if len(non_product) > 0:
    sales = pd.concat([sales, non_product.sample(min(NON_PRODUCT_SAMPLE, len(non_product)), random_state=RANDOM_SEED)])

sales = sales.sort_values("txn_datetime").reset_index(drop=True)
print(f"Sampled sales rows: {len(sales):,} for {len(top_skus)} products")


# ----------------------------------------------------------------------------
# 4. STORES: map countries to 3 regional "stores"
# ----------------------------------------------------------------------------
EUROPE = {
    "Germany", "France", "EIRE", "Netherlands", "Spain", "Belgium", "Switzerland",
    "Portugal", "Italy", "Norway", "Finland", "Austria", "Denmark", "Sweden",
    "Poland", "Greece", "Cyprus", "Iceland", "Lithuania", "Malta", "Czech Republic",
    "Channel Islands", "European Community",
}

def country_to_store(country):
    if country == "United Kingdom":
        return "STORE_UK"
    if country in EUROPE:
        return "STORE_EU"
    return "STORE_ROW"

sales["store_id"] = sales["country"].apply(country_to_store)

stores = pd.DataFrame([
    {"store_id": "STORE_UK", "name": "United Kingdom", "region": "UK"},
    {"store_id": "STORE_EU", "name": "Europe", "region": "Europe"},
    {"store_id": "STORE_ROW", "name": "Rest of World", "region": "International"},
])


# ----------------------------------------------------------------------------
# 5. PRODUCT CATEGORY from description keywords (order matters)
# ----------------------------------------------------------------------------
CATEGORY_KEYWORDS = [
    ("Christmas & Seasonal", ["CHRISTMAS", "XMAS", "EASTER", "ADVENT", "SANTA", "REINDEER", "SNOWFLAKE"]),
    ("Candles & Lighting",   ["CANDLE", "T-LIGHT", "TLIGHT", "LANTERN", "LIGHT", "LAMP"]),
    ("Kitchen & Dining",     ["MUG", "CUP", "PLATE", "BOWL", "TEA", "CAKE", "BAKING", "JUG", "NAPKIN",
                              "LUNCH", "KITCHEN", "SPOON", "CUTLERY", "BOTTLE", "JAM", "POPCORN"]),
    ("Bags & Storage",       ["BAG", "BOX", "TIN", "STORAGE", "BASKET", "JAR", "CASE", "SHOPPER"]),
    ("Stationery & Party",   ["CARD", "WRAP", "PAPER", "PENCIL", "NOTEBOOK", "PARTY", "BUNTING",
                              "STICKER", "CHALK", "RIBBON"]),
    ("Toys & Kids",          ["TOY", "DOLL", "CHILDREN", "KIDS", "GAME", "PLAYHOUSE", "SPACEBOY", "DOLLY",
                              "PAINT SET"]),
    ("Garden & Outdoor",     ["GARDEN", "PLANT", "WATERING", "BIRD"]),
    ("Home Decor",           ["SIGN", "FRAME", "CLOCK", "MIRROR", "CUSHION", "DOORSTOP", "HEART",
                              "DECORATION", "WREATH", "HOOK", "VASE", "BUNNY", "DOORMAT", "MEMOBOARD",
                              "COAT RACK", "CABINET", "BLACK BOARD", "BLOCK WORD"]),
    # Last on purpose, so "FAN" does not catch words like "FANCY" first
    ("Fashion & Accessories", ["PARASOL", "FAN", "UMBRELLA", "PURSE", "JEWELLERY", "NECKLACE"]),
]

def assign_category(description):
    if not isinstance(description, str):
        return "Uncategorised"
    for category, words in CATEGORY_KEYWORDS:
        if any(word in description for word in words):
            return category
    return "Other"


# ----------------------------------------------------------------------------
# 6. SUPPLIERS (simulated)
# ----------------------------------------------------------------------------
categories = [c for c, _ in CATEGORY_KEYWORDS] + ["Other", "Uncategorised"]
suppliers = pd.DataFrame({
    "supplier_id": [f"SUP{i:02d}" for i in range(1, 7)],
    "name": ["Northwind Homewares", "Brightside Gifts", "Kettle & Co", "Lumen Trading",
             "Paperleaf Supplies", "Oakfield Imports"],
    "lead_time_days": rng.integers(7, 31, size=6),
    "min_order_qty": rng.choice([12, 24, 48, 96], size=6),
    "is_simulated": True,
})
category_to_supplier = {cat: suppliers["supplier_id"].iloc[i % len(suppliers)] for i, cat in enumerate(categories)}


# ----------------------------------------------------------------------------
# 7. PRODUCTS (real fields + simulated cost)
# ----------------------------------------------------------------------------
product_sales = sales[sales["is_product_code"]]
valid_lines = product_sales[(product_sales["qty"] > 0) & (product_sales["unit_price"] > 0) & ~product_sales["is_cancellation"]]

products = (
    product_sales.groupby("sku")
    .agg(
        name=("description", lambda s: s.dropna().mode().iloc[0] if s.dropna().size else np.nan),
        first_sale_date=("txn_datetime", "min"),
        last_sale_date=("txn_datetime", "max"),
    )
    .reset_index()
)
list_price = valid_lines.groupby("sku")["unit_price"].median().rename("unit_price")
products = products.merge(list_price, on="sku", how="left")
products["category"] = products["name"].apply(assign_category)
products["supplier_id"] = products["category"].map(category_to_supplier)

# Simulated cost: 55 to 65% of list price, fixed per product
products["unit_cost"] = (products["unit_price"] * rng.uniform(0.55, 0.65, size=len(products))).round(2)
products["unit_cost_is_simulated"] = True

# Lifecycle fields (real, calculated from sales history)
end_of_data = sales["txn_datetime"].max()
products["days_since_last_sale"] = (end_of_data - products["last_sale_date"]).dt.days
products["active"] = products["days_since_last_sale"] <= 90
products["first_sale_date"] = products["first_sale_date"].dt.date
products["last_sale_date"] = products["last_sale_date"].dt.date


# ----------------------------------------------------------------------------
# 8. CUSTOMERS (real ID and country + simulated email for PII masking demo)
# ----------------------------------------------------------------------------
known = sales.dropna(subset=["customer_id"]).copy()
known["customer_ref"] = "C" + known["customer_id"].astype(int).astype(str)
customers = (
    known.groupby("customer_ref")
    .agg(country=("country", "first"), first_purchase_date=("txn_datetime", "min"))
    .reset_index()
)
customers["first_purchase_date"] = customers["first_purchase_date"].dt.date
customers["email"] = customers["customer_ref"].str.lower() + "@example.com"
customers["email_is_simulated"] = True


# ----------------------------------------------------------------------------
# 9. SALES TRANSACTIONS (real values, quality problems kept)
# ----------------------------------------------------------------------------
sales["txn_id"] = ["T" + str(i).zfill(7) for i in range(1, len(sales) + 1)]
sales["customer_ref"] = np.where(
    sales["customer_id"].notna(),
    "C" + sales["customer_id"].fillna(0).astype(int).astype(str),
    "",
)
sales["channel"] = np.where(sales["is_cancellation"], "return", "online")
sales["date"] = sales["txn_datetime"].dt.date
sales["batch_id"] = "BATCH_001"

sales_out = sales[[
    "txn_id", "invoice_no", "date", "txn_datetime", "store_id", "sku", "description",
    "qty", "unit_price", "customer_ref", "channel", "country", "batch_id",
]]


# ----------------------------------------------------------------------------
# 10. INVENTORY SNAPSHOTS (simulated, weekly, based on real demand)
# ----------------------------------------------------------------------------
weekly = (
    valid_lines.assign(store_id=valid_lines["country"].apply(country_to_store),
                       week=valid_lines["txn_datetime"].dt.to_period("W").dt.start_time)
    .groupby(["store_id", "sku", "week"])["qty"].sum()
    .reset_index()
)
weekly["avg_4wk_demand"] = weekly.groupby(["store_id", "sku"])["qty"].transform(
    lambda s: s.rolling(4, min_periods=1).mean()
)
cover_weeks = rng.choice([0, 1, 2, 3, 4, 6, 8, 10], size=len(weekly),
                         p=[0.06, 0.12, 0.18, 0.2, 0.18, 0.12, 0.08, 0.06])
weekly["on_hand"] = np.maximum(0, np.round(weekly["avg_4wk_demand"] * cover_weeks + rng.normal(0, 3, len(weekly)))).astype(int)
weekly["on_order"] = np.where(weekly["on_hand"] < weekly["avg_4wk_demand"] * 2,
                              np.round(weekly["avg_4wk_demand"] * 4), 0).astype(int)
inventory = weekly.rename(columns={"week": "date"})[["date", "store_id", "sku", "on_hand", "on_order"]]
inventory["date"] = inventory["date"].dt.date
inventory["is_simulated"] = True


# ----------------------------------------------------------------------------
# 11. DATA DICTIONARY (real vs simulated)
# ----------------------------------------------------------------------------
dictionary = pd.DataFrame([
    ("SalesTransaction", "txn_id", "Unique row ID created during preparation", "Derived", "Internal"),
    ("SalesTransaction", "invoice_no", "Invoice number; starts with C if cancelled", "Real", "Internal"),
    ("SalesTransaction", "qty", "Units sold; negative for returns", "Real", "Internal"),
    ("SalesTransaction", "unit_price", "Price per unit in GBP", "Real", "Internal"),
    ("SalesTransaction", "customer_ref", "Pseudonymised customer ID; blank if missing", "Real", "Internal"),
    ("SalesTransaction", "store_id", "Regional store mapped from country", "Derived", "Internal"),
    ("Product", "category", "Derived from description keywords", "Derived", "Internal"),
    ("Product", "unit_cost", "Cost per unit, 55 to 65% of price", "Simulated", "Confidential"),
    ("Product", "days_since_last_sale", "Days between last sale and end of data", "Derived", "Internal"),
    ("Customer", "email", "Placeholder email for privacy masking demo", "Simulated", "PII"),
    ("Supplier", "lead_time_days", "Days from order to delivery", "Simulated", "Internal"),
    ("InventorySnapshot", "on_hand", "Weekly stock on hand based on real demand", "Simulated", "Internal"),
], columns=["entity", "field", "definition", "source_type", "sensitivity"])


# ----------------------------------------------------------------------------
# 12. WRITE FILES
# ----------------------------------------------------------------------------
outputs = {
    "stores.csv": stores,
    "suppliers.csv": suppliers,
    "products.csv": products,
    "customers.csv": customers,
    "sales_transactions.csv": sales_out,
    "inventory_snapshots.csv": inventory,
    "data_dictionary.csv": dictionary,
}
for name, frame in outputs.items():
    frame.to_csv(os.path.join(OUTPUT_DIR, name), index=False)

sales_out.head(TEST_FILE_ROWS).to_csv(os.path.join(OUTPUT_DIR, "sales_TEST_500_rows.csv"), index=False)


# ----------------------------------------------------------------------------
# 13. SUMMARY: preview of the quality problems the app should catch
# ----------------------------------------------------------------------------
dupes = sales_out.duplicated(subset=["invoice_no", "sku", "qty", "unit_price", "txn_datetime"]).sum()
print("\nFiles written to:", OUTPUT_DIR)
for name, frame in outputs.items():
    print(f"  {name:28s} {len(frame):>8,} rows")

print("\nData quality preview (left in on purpose for the app to catch):")
print(f"  Cancelled invoices (returns):   {sales['is_cancellation'].sum():,}")
print(f"  Negative qty, not cancelled:    {((sales['qty'] < 0) & ~sales['is_cancellation']).sum():,}")
print(f"  Missing customer ID:            {(sales['customer_ref'] == '').sum():,}")
print(f"  Zero or negative price:         {(sales['unit_price'] <= 0).sum():,}")
print(f"  Non-product codes:              {(~sales['is_product_code']).sum():,}")
print(f"  Duplicate rows:                 {dupes:,}")
print(f"\nCategories:\n{products['category'].value_counts().to_string()}")
print("\nTip: upload sales_TEST_500_rows.csv to Base44 first to check the import works.")
