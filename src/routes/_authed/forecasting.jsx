import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getForecastData } from "@/lib/ml-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ComposedChart, Line, Area, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authed/forecasting")({
  ssr: false,
  validateSearch: (s) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    seriesType: s.seriesType === "sku" ? "sku" : undefined,
    seriesKey: typeof s.seriesKey === "string" ? s.seriesKey : undefined,
  }),
  loaderDeps: ({ search }) => ({ storeId: search.store, seriesType: search.seriesType, seriesKey: search.seriesKey }),
  loader: ({ deps }) => getForecastData({ data: deps }),
  head: () => ({ meta: [{ title: "Forecasting · ShelfSignal" }] }),
  component: ForecastingPage,
});

function ForecastingPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const lockStore = role === "store_manager";
  const search = Route.useSearch();

  const set = (patch) => navigate({ search: { ...search, ...patch } });

  const chartData = useMemo(() => {
    const map = new Map();
    for (const a of data.actuals) map.set(a.week_start, { week: a.week_start, actual: a.units });
    for (const b of data.backtest) { const e = map.get(b.week_start) || { week: b.week_start }; e.backtest = b.predicted; e.actualBT = b.actual; map.set(b.week_start, e); }
    for (const f of data.forecast) { const e = map.get(f.week_start) || { week: f.week_start }; e.forecast = f.predicted; e.lower = f.lower; e.upper = f.upper; map.set(f.week_start, e); }
    return [...map.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Forecasting" subtitle="Weekly demand forecasts with backtest. Units per week." />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <Field label="Store">
            <select disabled={lockStore} value={search.store || ""} onChange={(e) => set({ store: e.target.value || undefined, seriesKey: undefined })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select a store</option>
              {data.stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          {search.store && (
            <Field label="Series">
              <select value={(search.seriesType || "category") + "|" + (search.seriesKey || "")} onChange={(e) => { const [t, ...k] = e.target.value.split("|"); set({ seriesType: t === "sku" ? "sku" : undefined, seriesKey: k.join("|") || undefined }); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select a series</option>
                {[["category", "Categories"], ["sku", "Top SKUs"]].map(([type, label]) => {
                  const group = data.series.filter((s) => s.series_type === type);
                  if (!group.length) return null;
                  return (
                    <optgroup key={type} label={label}>
                      {group.map((s) => (
                        <option key={`${s.series_type}|${s.series_key}`} value={`${s.series_type}|${s.series_key}`} disabled={s.notEnough}>
                          {s.label}{s.notEnough ? " — not enough data" : ""}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </Field>
          )}
        </CardContent>
      </Card>

      {search.store && search.seriesKey ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Actuals, backtest and 8-week forecast</CardTitle>
              <CardDescription>Winner model: {data.winner || "—"}. Band = forecast ± 1.28 × backtest error σ, floored at zero.</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? <Empty text="Not enough data (fewer than 16 weeks) for this series." /> : (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="hsl(var(--accent))" fillOpacity={0.12} name="Band upper" />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--background))" fillOpacity={1} name="Band lower" />
                    <Line type="monotone" dataKey="actual" stroke="hsl(var(--chart-3))" dot={false} name="Actual" />
                    <Scatter dataKey="backtest" fill="hsl(var(--chart-4))" name="Backtest" />
                    <Line type="monotone" dataKey="forecast" stroke="hsl(var(--accent))" strokeDasharray="5 5" dot={false} name="Forecast" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Model comparison</CardTitle><CardDescription>Backtest WAPE and bias over the last 8 complete weeks. Winner highlighted.</CardDescription></CardHeader>
            <CardContent>
              {data.comparison.length === 0 ? <Empty text="No run yet — use the Models page to forecast first." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground"><tr>{["Model", "WAPE", "Bias", ""].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr></thead>
                    <tbody>
                      {data.comparison.map((m) => (
                        <tr key={m.model} className="border-t border-border">
                          <td className="py-2 pr-4 font-medium">{m.model}{m.isWinner ? <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">Winner</span> : null}</td>
                          <td className="py-2 pr-4">{(m.wape * 100).toFixed(1)}%</td>
                          <td className="py-2 pr-4">{m.bias.toFixed(1)}</td>
                          <td className="py-2 pr-4">{m.isWinner ? "Selected for forecast" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Trained on one year of data, so yearly seasonality such as the Christmas peak cannot be learned. Forecasts beyond December 2011 will not anticipate the January drop.
          </div>
        </>
      ) : (
        <Card><CardContent className="p-8"><Empty text="Select a store and series to view its forecast." /></CardContent></Card>
      )}
    </div>
  );
}

function Field({ label, children }) { return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>; }
function Empty({ text }) { return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>; }