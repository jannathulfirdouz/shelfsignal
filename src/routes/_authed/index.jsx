import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getHomeData, getMetricDefinitions } from "@/lib/analytics-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { PageFilters } from "@/components/PageFilters";
import { KpiCard } from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  validateSearch: (s) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    range: ["4w", "12w", "ytd", "all"].includes(s.range) ? s.range : undefined,
  }),
  loaderDeps: ({ search }) => ({ store: search.store, category: search.category, range: search.range }),
  loader: ({ deps }) => getHomeData({ data: deps }),
  head: () => ({ meta: [{ title: "Home · ShelfSignal" }] }),
  component: HomePage,
});

function HomePage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const getMetrics = useServerFn(getMetricDefinitions);
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const lockStore = role === "store_manager";
  const [metricMap, setMetricMap] = useState({});

  const search = Route.useSearch();
  const filters = { store: search.store, category: search.category, range: search.range || "all" };
  const setFilters = (v) => navigate({ search: { store: v.store, category: v.category, range: v.range } });

  useEffect(() => {
    getMetrics({ data: {} }).then((ms) => { const m = {}; for (const x of ms) m[x.name] = x; setMetricMap(m); }).catch(() => {});
  }, [getMetrics]);

  const k = data.kpis;
  const p = data.prevKpis;
  const chg = (cur, prev) => (prev != null && prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 1000) / 10 : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        subtitle="Retail performance overview. All figures in GBP (£)."
        filters={<PageFilters value={filters} onChange={setFilters} options={data.filters || { stores: [], categories: [] }} lockStore={lockStore} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Net revenue" value={fmtGbp(k.netRevenue)} change={p ? chg(k.netRevenue, p.netRevenue) : null} metric={metricMap["Net revenue"]} />
        <KpiCard label="Gross margin %" value={k.grossMargin != null ? `${k.grossMargin}%` : "—"} change={p ? chg(k.grossMargin, p.grossMargin) : null} metric={metricMap["Gross margin %"]} simulated />
        <KpiCard label="Units sold" value={k.units?.toLocaleString("en-GB")} change={p ? chg(k.units, p.units) : null} metric={metricMap["Units sold"]} />
        <KpiCard label="Orders" value={k.orders?.toLocaleString("en-GB")} change={p ? chg(k.orders, p.orders) : null} metric={metricMap["Orders"]} />
        <KpiCard label="Average order value" value={fmtGbp(k.aov)} change={p ? chg(k.aov, p.aov) : null} metric={metricMap["Average order value"]} />
        <KpiCard label="Return rate" value={k.returnRate != null ? `${k.returnRate}%` : "—"} change={p ? chg(k.returnRate, p.returnRate) : null} metric={metricMap["Return rate"]} />
        <KpiCard label="Trust Score" value={k.trustScore != null ? `${k.trustScore}%` : "—"} metric={metricMap["Trust Score"]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Weekly net revenue</CardTitle></CardHeader>
          <CardContent>
            {data.weeklyTrend.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v) => fmtGbp(v)} />
                  <Area dataKey="netRevenue" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.2} name="Net revenue" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Revenue by store</CardTitle></CardHeader>
          <CardContent>
            {data.revenueByStore.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.revenueByStore}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="store" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v) => fmtGbp(v)} />
                  <Bar dataKey="netRevenue" fill="hsl(var(--accent))" name="Net revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-accent" /> Top 5 actions</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Actionable recommendations will appear here once forecasting and replenishment rules are configured.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function fmtGbp(v) { return v == null ? "—" : Number(v).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }); }
function Empty() { return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No data for the selected filters.</div>; }