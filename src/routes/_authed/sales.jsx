import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getSalesAnalytics } from "@/lib/analytics-fns";
import { getAnomalies } from "@/lib/ml-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { PageFilters } from "@/components/PageFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComposedChart, Bar, Line, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Scatter } from "recharts";

export const Route = createFileRoute("/_authed/sales")({
  ssr: false,
  validateSearch: (s) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    range: ["4w", "12w", "ytd", "all"].includes(s.range) ? s.range : undefined,
  }),
  loaderDeps: ({ search }) => ({ store: search.store, category: search.category, range: search.range }),
  loader: ({ deps }) => getSalesAnalytics({ data: deps }),
  head: () => ({ meta: [{ title: "Sales · ShelfSignal" }] }),
  component: SalesPage,
});

function SalesPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const lockStore = role === "store_manager";
  const search = Route.useSearch();
  const filters = { store: search.store, category: search.category, range: search.range || "all" };

  const [excludeUK, setExcludeUK] = useState(false);
  const [includeOutliers, setIncludeOutliers] = useState(false);

  const getAnoms = useServerFn(getAnomalies);
  const [anoms, setAnoms] = useState([]);
  useEffect(() => { getAnoms({ data: { storeId: search.store } }).then(setAnoms).catch(() => setAnoms([])); }, [search.store]);
  const anomalyMarks = anoms.map((a) => ({ month: String(a.date).slice(0, 7), anomaly: a.actual }));

  const countriesAll = data.topCountries || [];
  const countriesShown = (excludeUK ? countriesAll.filter((c) => c.country !== "United Kingdom") : countriesAll).slice(0, 10);
  const countryTotal = countriesShown.reduce((a, c) => a + (c.orders || 0), 0) || 1;
  const countryRows = countriesShown.map((c) => ({ ...c, sharePct: Math.round((c.orders / countryTotal) * 1000) / 10 }));

  const rrData = (data.returnRateByCategory || []).map((r) => ({ category: r.category, returnRate: includeOutliers ? r.returnRateIncl : r.returnRateExcl }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle="Revenue trends and mix. All figures in GBP (£)."
        filters={<PageFilters value={filters} onChange={(v) => navigate({ search: v })} options={data.filters || { stores: [], categories: [] }} lockStore={lockStore} />}
      />

      <Card>
        <CardHeader><CardTitle>Monthly net revenue (MoM change %)</CardTitle></CardHeader>
        <CardContent>
          {data.monthly.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" domain={[0, "auto"]} tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v, n) => (n === "MoM change %" ? `${v}%` : fmtGbp(v))} />
                  <Bar yAxisId="l" dataKey="netRevenue" name="Net revenue" radius={[4, 4, 0, 0]}>
                    {data.monthly.map((m) => (
                      <Cell key={m.month} fill={m.month === data.partialMonth ? "hsl(var(--accent) / 0.4)" : "hsl(var(--accent))"} />
                    ))}
                  </Bar>
                  <Line yAxisId="r" dataKey="momChange" stroke="hsl(var(--chart-3))" name="MoM change %" />
                  {anomalyMarks.length > 0 && <Scatter yAxisId="l" data={anomalyMarks} dataKey="anomaly" fill="hsl(var(--destructive))" name="Anomaly" />}
                </ComposedChart>
              </ResponsiveContainer>
              {data.partialMonth && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.partialMonth} is a partial month (1 to 9 Dec only) — shown with a lighter bar.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue by category</CardTitle></CardHeader>
          <CardContent>
            {data.revenueByCategory.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.revenueByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v) => fmtGbp(v)} />
                  <Bar dataKey="netRevenue" fill="hsl(var(--accent))" name="Net revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Return rate by category</CardTitle>
              <Button size="sm" variant={includeOutliers ? "default" : "outline"} onClick={() => setIncludeOutliers((v) => !v)}>
                {includeOutliers ? "Including outliers" : "Excluding outliers"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rrData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rrData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="returnRate" fill="hsl(var(--destructive))" name={`Return rate ${includeOutliers ? "(incl. outliers)" : "(excl. outliers)"}`} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pareto: top 20 SKUs by revenue</CardTitle></CardHeader>
        <CardContent>
          {data.pareto.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data.pareto}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="sku" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} interval={0} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v, n) => (n === "Cumulative %" ? `${v}%` : fmtGbp(v))} />
                <Bar yAxisId="l" dataKey="revenue" fill="hsl(var(--accent))" name="Revenue" />
                <Line yAxisId="r" dataKey="cumulativePct" stroke="hsl(var(--chart-3))" name="Cumulative %" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top 10 countries by orders</CardTitle>
              <Button size="sm" variant={excludeUK ? "default" : "outline"} onClick={() => setExcludeUK((v) => !v)}>
                {excludeUK ? "UK excluded" : "Exclude United Kingdom"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {countryRows.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={countryRows} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => `${v} orders`} />
                  <Bar dataKey="orders" fill="hsl(var(--chart-4))" name="Orders" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="sharePct" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Orders by weekday and hour</CardTitle></CardHeader>
          <CardContent>
            <Heatmap data={data.heatmap} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Anomalies</CardTitle></CardHeader>
        <CardContent>
          {anoms.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr>{["Store", "Category", "Date", "Expected", "Actual", "z", "Direction"].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr></thead>
                <tbody>
                  {anoms.map((a, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 pr-4">{a.store_id}</td>
                      <td className="py-2 pr-4">{a.category}</td>
                      <td className="py-2 pr-4">{a.date}</td>
                      <td className="py-2 pr-4">{fmtGbp(a.expected)}</td>
                      <td className="py-2 pr-4">{fmtGbp(a.actual)}</td>
                      <td className="py-2 pr-4">{a.z_score}</td>
                      <td className="py-2 pr-4"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.direction === "high" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{a.direction}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Heatmap({ data }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cell = new Map(data.map((d) => [`${d.weekday}|${d.hour}`, d.orders]));
  const max = Math.max(1, ...data.map((d) => d.orders || 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr><th className="p-1" />
            {Array.from({ length: 24 }, (_, h) => <th key={h} className="p-1 text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((d, wd) => (
            <tr key={wd}>
              <td className="p-1 font-medium text-muted-foreground">{d}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const v = cell.get(`${wd}|${h}`) || 0;
                const intensity = v / max;
                return <td key={h} className="p-0.5"><div className="h-5 w-full rounded-sm" style={{ background: v ? `rgba(20,140,140,${0.15 + intensity * 0.85})` : "hsl(var(--muted))" }} title={`${d} ${h}:00 — ${v} orders`} /></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtGbp(v) { return v == null ? "—" : Number(v).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }); }
function Empty() { return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No data for the selected filters.</div>; }