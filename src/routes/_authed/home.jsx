import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getHomeData, getMetricDefinitions } from "@/lib/analytics-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { PageFilters } from "@/components/PageFilters";
import { KpiCard } from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authed/home")({
  ssr: false,
  validateSearch: (s) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    range: ["4w", "12w", "ytd", "all"].includes(s.range) ? s.range : undefined,
  }),
  head: () => ({ meta: [{ title: "Home · ShelfSignal" }] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const fetchHome = useServerFn(getHomeData);
  const getMetrics = useServerFn(getMetricDefinitions);
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const lockStore = role === "store_manager";
  const [metricMap, setMetricMap] = useState({});
  const [includeOutliers, setIncludeOutliers] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const search = Route.useSearch();
  const filters = { store: search.store, category: search.category, range: search.range || "all" };
  const setFilters = (v) => navigate({ search: { store: v.store, category: v.category, range: v.range } });

  useEffect(() => {
    getMetrics({ data: {} }).then((ms) => { const m = {}; for (const x of ms) m[x.name] = x; setMetricMap(m); }).catch(() => {});
  }, [getMetrics]);

  // One automatic retry, so a slow first query recovers without the visitor
  // pressing anything. A loading state shows until the answer is in.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        let res;
        try {
          res = await fetchHome({ data: filters });
        } catch {
          await new Promise((r) => setTimeout(r, 800));
          res = await fetchHome({ data: filters });
        }
        if (alive) setData(res);
      } catch (e) {
        if (alive) setErr(e?.data?.message || e?.message || "Could not load Home.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.store, filters.category, filters.range, attempt, fetchHome]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" subtitle="Retail performance overview. All figures in GBP (£)." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <p className="text-sm text-muted-foreground">Loading the latest figures…</p>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" subtitle="Retail performance overview. All figures in GBP (£)." />
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">The figures took too long to load.</p>
            {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
            <Button className="mt-4" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const k = data.kpis;
  const p = data.prevKpis;
  const chg = (cur, prev) => (prev != null && prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 1000) / 10 : null);
  const rr = includeOutliers ? k.returnRate?.incl : k.returnRate?.excl;
  const prevRr = p ? (includeOutliers ? p.returnRate?.incl : p.returnRate?.excl) : null;
  const rrChange = prevRr != null ? chg(rr, prevRr) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        subtitle="Retail performance overview. All figures in GBP (£)."
        filters={<PageFilters value={filters} onChange={setFilters} options={data.filters || { stores: [], categories: [] }} lockStore={lockStore} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Return rate:</span>
        <Button size="sm" variant={includeOutliers ? "default" : "outline"} onClick={() => setIncludeOutliers((v) => !v)}>
          {includeOutliers ? "Including outliers" : "Excluding outliers"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Net revenue" value={fmtGbp(k.netRevenue)} change={p ? chg(k.netRevenue, p.netRevenue) : null} metric={metricMap["Net revenue"]} />
        <KpiCard label="Gross margin %" value={k.grossMargin != null ? `${k.grossMargin}%` : "—"} change={p ? chg(k.grossMargin, p.grossMargin) : null} metric={metricMap["Gross margin %"]} simulated />
        <KpiCard label="Units sold" value={k.units?.toLocaleString("en-GB")} change={p ? chg(k.units, p.units) : null} metric={metricMap["Units sold"]} />
        <KpiCard label="Orders" value={k.orders?.toLocaleString("en-GB")} change={p ? chg(k.orders, p.orders) : null} metric={metricMap["Orders"]} />
        <KpiCard label="Average order value" value={fmtGbp(k.aov)} change={p ? chg(k.aov, p.aov) : null} metric={metricMap["Average order value"]} />
        <KpiCard label="Return rate" value={rr != null ? `${rr}%` : "—"} change={rrChange} metric={metricMap["Return rate"]} note={includeOutliers ? "including outliers" : "excluding outliers"} />
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
          {data.topActions?.length ? (
            <div className="space-y-2">
              {data.topActions.map((a) => (
                <Link key={a.id} to="/actions" className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-[11px] capitalize text-muted-foreground">{String(a.type).replace("_", " ")} · {a.confidence} confidence · {a.store_id}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">£{Number(a.expected_impact_gbp || 0).toLocaleString("en-GB")}</span>
                </Link>
              ))}
              <Link to="/actions" className="inline-block pt-1 text-sm font-medium text-accent hover:underline">View all actions →</Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open recommendations yet — generate them from the Models page.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtGbp(v) { return v == null ? "—" : Number(v).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }); }
function Empty() { return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No data for the selected filters.</div>; }