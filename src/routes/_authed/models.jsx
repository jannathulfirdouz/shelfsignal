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

function ModelsPage() {
  const status = Route.useLoaderData();
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const canRun = role === "owner" || role === "analyst";

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
    const { series } = await fPrepare({ data: {} });
    const slices = Math.ceil(series.length / CHUNK);
    let writes = 0;
    for (let i = 0; i < slices; i++) {
      const slice = series.slice(i * CHUNK, (i + 1) * CHUNK);
      const r = await fChunk({ data: { series: slice, sliceIndex: i, totalSlices: slices, totalSeries: series.length } });
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: slices });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_forecast", entity: "Forecast", detail: `${series.length} series, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const segmentRun = async (onProgress) => {
    const { segments } = await sRun({ data: {} });
    const chunks = Math.ceil(segments.length / 500);
    let writes = 0;
    for (let i = 0; i < chunks; i++) {
      const rows = segments.slice(i * 500, (i + 1) * 500);
      const r = await sUpsert({ data: { rows } });
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: chunks });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_segmentation", entity: "CustomerSegment", detail: `${segments.length} customers, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const abcRun = async (onProgress) => {
    const { stores } = await aPrepare({ data: {} });
    let writes = 0;
    for (let i = 0; i < stores.length; i++) {
      const r = await aStore({ data: { storeId: stores[i] } });
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: stores.length });
      if (r.stopped) throw new Error(r.error || "Stopped");
    }
    await fLog({ data: { action: "run_abcxyz", entity: "ProductClass", detail: `${stores.length} stores, ${writes} writes` } });
    refresh();
    return { writes };
  };

  const anomalyRun = async (onProgress) => {
    const { stores } = await nPrepare({ data: {} });
    let writes = 0;
    for (let i = 0; i < stores.length; i++) {
      const r = await nStore({ data: { storeId: stores[i] } });
      writes += r.writes || 0;
      onProgress({ done: i + 1, total: stores.length });
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
        <RunCard title="Demand forecasting" description="Naive, 4-week MA, exponential smoothing and Holt's trend per store × category and top-20 SKUs. 8-week forecast with 80% band." lastRun={status.forecast} prepare={() => fPrepare({ data: {} })} run={forecastRun} disabled={!canRun} />
        <RunCard title="Customer segmentation" description="RFM k-means (k = 4): Champions, Loyal, At risk, Lost. Reads non-quarantined sales." lastRun={status.segmentation} prepare={() => sPrepare({ data: {} })} run={segmentRun} disabled={!canRun} />
        <RunCard title="ABC-XYZ classification" description="ABC by cumulative revenue share, XYZ by coefficient of variation of weekly units. Per store × SKU." lastRun={status.abcxyz} prepare={() => aPrepare({ data: {} })} run={abcRun} disabled={!canRun} />
        <RunCard title="Anomaly detection" description="Daily net revenue per store × category, rolling 28-trading-day stats, |z| > 3 flagged." lastRun={status.anomaly} prepare={() => nPrepare({ data: {} })} run={anomalyRun} disabled={!canRun} />
      </div>
    </div>
  );
}