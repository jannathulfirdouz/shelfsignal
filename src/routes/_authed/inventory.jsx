import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getInventoryAnalytics } from "@/lib/analytics-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SimulatedTag } from "@/components/SimulatedTag";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, PackageX, Boxes } from "lucide-react";

export const Route = createFileRoute("/_authed/inventory")({
  ssr: false,
  validateSearch: (s) => ({ store: typeof s.store === "string" ? s.store : undefined }),
  loaderDeps: ({ search }) => ({ store: search.store }),
  loader: ({ deps }) => getInventoryAnalytics({ data: deps }),
  head: () => ({ meta: [{ title: "Inventory · ShelfSignal" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const lockStore = role === "store_manager";
  const search = Route.useSearch();

  const dead = data.rows.filter((r) => r.deadStock);
  const totalStockValue = data.rows.reduce((a, c) => a + (c.stockValue || 0), 0);
  const stockoutTotal = (data.outOfStock?.length || 0) + (data.belowLeadTime?.length || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Latest stock positions. All stock figures are simulated. Values in GBP (£)."
        filters={
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={search.store || ""}
            disabled={lockStore}
            onChange={(e) => navigate({ search: { store: e.target.value } })}
          >
            <option value="">All stores</option>
            {(data.filters?.stores || []).map((s) => <option key={s.store_id} value={s.store_id}>{s.name || s.store_id}</option>)}
          </select>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SimulatedTag />
        <span className="text-sm text-muted-foreground">All on-hand, cover and stock-value figures are simulated.</span>
      </div>

      {!data.latestDate ? (
        <Card><CardContent className="p-8"><Empty text="No inventory snapshots imported yet." /></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Latest snapshot" value={data.latestDate} />
            <Mini label="Store-SKU positions in stock" value={data.positionsInStock.toLocaleString("en-GB")} />
            <Mini label="Stockout-risk positions" value={stockoutTotal.toLocaleString("en-GB")} tone="amber" />
            <Mini label="Total stock value (cost)" value={fmtGbp(totalStockValue)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-500" /> Out of stock</CardTitle>
              <CardDescription>On-hand is zero. Sorted by last 12 weeks' net revenue, highest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {(data.outOfStock?.length || 0) === 0 ? <Empty text="No out-of-stock positions." /> : (
                <StockoutTable rows={data.outOfStock} kind="out" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Below lead time</CardTitle>
              <CardDescription>Stock cover days below the supplier lead time. Sorted by last 12 weeks' net revenue, highest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {(data.belowLeadTime?.length || 0) === 0 ? <Empty text="No positions below lead time." /> : (
                <StockoutTable rows={data.belowLeadTime} kind="below" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PackageX className="h-5 w-5 text-rose-500" /> Dead stock</CardTitle>
              <CardDescription>Days since last sale over 90, with stock value at cost.</CardDescription>
            </CardHeader>
            <CardContent>
              {dead.length === 0 ? <Empty text="No dead stock." /> : <Table rows={dead} kind="dead" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-accent" /> Latest stock by store & SKU</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? <Empty text="No rows." /> : <Table rows={data.rows} kind="all" />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Mini({ label, value, tone }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${tone === "amber" ? "text-amber-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StockoutTable({ rows, kind }) {
  const cols = ["Store", "SKU", "Category", "Status", "On-hand", "Cover days", "Lead time", "Last 12w revenue"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-2 pr-4">{r.store_id}</td>
              <td className="py-2 pr-4">{r.sku}</td>
              <td className="py-2 pr-4">{r.category}</td>
              <td className="py-2 pr-4">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.stockoutType === "out_of_stock" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                  {r.stockoutType === "out_of_stock" ? "Out of stock" : "Below lead time"}
                </span>
              </td>
              <td className="py-2 pr-4">{r.on_hand}</td>
              <td className="py-2 pr-4">{r.coverDays ?? "—"}</td>
              <td className="py-2 pr-4">{r.leadTime ?? "—"}</td>
              <td className="py-2 pr-4">{fmtGbp(r.rev12)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Table({ rows, kind }) {
  const cols = kind === "dead"
    ? ["Store", "SKU", "Category", "Days since sale", "On-hand", "Stock value (cost)"]
    : ["Store", "SKU", "Category", "On-hand", "On-order", "Cover days", "Sell-through %"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {kind === "dead" ? <>
                <td className="py-2 pr-4">{r.store_id}</td><td className="py-2 pr-4">{r.sku}</td><td className="py-2 pr-4">{r.category}</td>
                <td className="py-2 pr-4">{r.daysSinceLastSale ?? "—"}</td><td className="py-2 pr-4">{r.on_hand}</td><td className="py-2 pr-4">{fmtGbp(r.stockValue)}</td>
              </> : <>
                <td className="py-2 pr-4">{r.store_id}</td><td className="py-2 pr-4">{r.sku}</td><td className="py-2 pr-4">{r.category}</td>
                <td className="py-2 pr-4">{r.on_hand}</td><td className="py-2 pr-4">{r.on_order}</td><td className="py-2 pr-4">{r.coverDays ?? "—"}</td><td className="py-2 pr-4">{r.sellThrough != null ? `${r.sellThrough}%` : "—"}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtGbp(v) { return v == null ? "—" : Number(v).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }); }
function Empty({ text }) { return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>; }