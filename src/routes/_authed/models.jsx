import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { RunCard } from "@/components/models/RunCard";
import {
  getModelsStatus, prepareForecast, runForecastChunk, logModelRun,
  prepareSegmentation, runSegmentation, upsertSegmentChunk,
  prepareAbcXyz, runAbcXyzStore,
  prepareAnomaly, runAnomalyStore,
} from "@/lib/ml-fns";

export const Route = createFileRoute("/_authed/models")({
  ssr: false,
  loader: () => getModelsStatus({ data: {} }),
  head: () => ({ meta: [{ title: "Models · ShelfSignal" }] }),
  component: ModelsPage,
});

const CHUNK = 10;
const RATE_RE = /rate limit|too many requests|retry after|requests per/i;
const isRateErr = (e) => e?.status === 429 || RATE_RE.test(e?.data?.message || e?.message || "");
const waitSeconds = (e) => { const m = /retry after (\d+)\s*s/i.exec(e?.data?.message || e?.message || ""); return m ? Number(m[1]) : 10; };
// Retry a server call on a 429, waiting the seconds in the message (up to 5×).
async function withRetry(fn, onWait) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!isRateErr(e) || i >= 5) throw e;
      const s = waitSeconds(e);
      onWait?.(true, s);
      await new Promise((r) => setTimeout(r, s * 1000));
      onWait?.(false, null);
    }
  }
}

function ModelsPage() {
  const status = Route.useLoaderData();
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const canRun = role === "owner" || role === "analyst";
  const [busy, setBusy] = useState(null);
  const busyFor = (name) => (b) => setBusy((cur) => (b ? name : cur === name ? null : cur));
  const lock = (name) => !canRun || (!!busy && busy !== name);

  const fPrepare = useServerFn(prepareForecast);
  const fChunk = useServerFn(runForecastChunk);
  const fLog = useServerFn(logModelRun);
  const sPrepare = useServerFn(prepareSegmentation);
  const sRun = useServerFn(runSegmentation);
  const sUpsert = useServerFn(upsertSegmentChunk);
  const aPrepare = useServerFn(prepareAbcXyz);
  const aStore = useServerFn(runAbcXyzStore);
  const nPrepare = useServerFn(prepareAnomaly);
  const nStore = useServerFn(runAnomalyStore);

  const refresh = () => router.invalidate();

  const forecastRun = async (onProgress) => {
    const wait = (w, s) => onProgress({ waiting: w, seconds: s });
    const { series } = await withRetry(() => fPrepare({ data: {} }), wait);
    const slices = Math.ceil(series.length / CHUNK);
    let writes = 0;
    for (let i = 0; i < slices; i++) {
      const slice = series.slice(i * CHUNK, (i + 1) * CHUNK);
      const r = await withRetry(() => fChunk({ data: { series: slice, sliceIndex: i, totalSlices: slices, totalSeries: series.length } }), wait);
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: slices, waiting: false });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_forecast", entity: "Forecast", detail: `${series.length} series, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const segmentRun = async (onProgress) => {
    const wait = (w, s) => onProgress({ waiting: w, seconds: s });
    const { segments } = await withRetry(() => sRun({ data: {} }), wait);
    const chunks = Math.ceil(segments.length / 500);
    let writes = 0;
    for (let i = 0; i < chunks; i++) {
      const rows = segments.slice(i * 500, (i + 1) * 500);
      const r = await withRetry(() => sUpsert({ data: { rows } }), wait);
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: chunks, waiting: false });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_segmentation", entity: "CustomerSegment", detail: `${segments.length} customers, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const abcRun = async (onProgress) => {
    const wait = (w, s) => onProgress({ waiting: w, seconds: s });
    const { stores } = await withRetry(() => aPrepare({ data: {} }), wait);
    let writes = 0;
    for (let i = 0; i < stores.length; i++) {
      const r = await withRetry(() => aStore({ data: { storeId: stores[i] } }), wait);
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: stores.length, waiting: false });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_abcxyz", entity: "ProductClass", detail: `${stores.length} stores, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const anomalyRun = async (onProgress) => {
    const wait = (w, s) => onProgress({ waiting: w, seconds: s });
    const { stores } = await withRetry(() => nPrepare({ data: {} }), wait);
    let writes = 0;
    for (let i = 0; i < stores.length; i++) {
      const r = await withRetry(() => nStore({ data: { storeId: stores[i] } }), wait);
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: stores.length, waiting: false });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_anomaly", entity: "Anomaly", detail: `${stores.length} stores, ${writes} writes` } });
    refresh();
    return { writes };
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Models" subtitle="Run demand forecasts, segmentation, ABC-XYZ and anomaly detection. Owners and analysts only." />
      <div className="grid gap-6 lg:grid-cols-2">
        <RunCard title="Demand forecasting" description="Naive, 4-week MA, exponential smoothing and Holt's trend per store × category and top-20 SKUs. 8-week forecast with 80% band." lastRun={status.forecast} prepare={() => withRetry(() => fPrepare({ data: {} }))} run={forecastRun} disabled={lock("forecast")} onBusyChange={busyFor("forecast")} />
        <RunCard title="Customer segmentation" description="RFM k-means (k = 4): Champions, Loyal, At risk, Lost. Reads non-quarantined sales." lastRun={status.segmentation} prepare={() => withRetry(() => sPrepare({ data: {} }))} run={segmentRun} disabled={lock("segmentation")} onBusyChange={busyFor("segmentation")} />
        <RunCard title="ABC-XYZ classification" description="ABC by cumulative revenue share, XYZ by coefficient of variation of weekly units. Per store × SKU." lastRun={status.abcxyz} prepare={() => withRetry(() => aPrepare({ data: {} }))} run={abcRun} disabled={lock("abcxyz")} onBusyChange={busyFor("abcxyz")} />
        <RunCard title="Anomaly detection" description="Daily net revenue per store × category, rolling 28-trading-day stats, |z| > 3 flagged." lastRun={status.anomaly} prepare={() => withRetry(() => nPrepare({ data: {} }))} run={anomalyRun} disabled={lock("anomaly")} onBusyChange={busyFor("anomaly")} />
      </div>
    </div>
  );
}