import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getQualityData, setIssueStatus } from "@/lib/dq-fns";
import { getSummaryStatus } from "@/lib/summary-fns";
import { RefreshSummariesPanel } from "@/components/dq/RefreshSummariesPanel";
import { useAuth } from "@/lib/AuthContext";
import { DataTrustBadge } from "@/components/DataTrustBadge";
import { RunChecksPanel } from "@/components/dq/RunChecksPanel";
import { RuleResultsTable } from "@/components/dq/RuleResultsTable";
import { DimensionChart } from "@/components/dq/DimensionChart";
import { ColumnProfile } from "@/components/dq/ColumnProfile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/_authed/data-quality")({
  ssr: false,
  validateSearch: (s) => ({ batch: typeof s.batch === "string" ? s.batch : undefined }),
  loaderDeps: ({ search }) => ({ batch: search.batch }),
  loader: ({ deps }) => getQualityData({ data: { batchId: deps.batch } }),
  head: () => ({ meta: [{ title: "Data quality · ShelfSignal" }] }),
  component: DataQualityPage,
});

function DataQualityPage() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { user } = useAuth();
  const setStatus = useServerFn(setIssueStatus);
  const getSummary = useServerFn(getSummaryStatus);
  const [busyId, setBusyId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [summariesAt, setSummariesAt] = useState(null);

  useEffect(() => { getSummary({ data: {} }).then(setSummariesAt).catch(() => {}); }, [refreshKey]);
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const canAct = role === "owner" || role === "analyst";
  const batch = data.batch;

  const changeStatus = async (id, status) => {
    setBusyId(id);
    await setStatus({ data: { id, status } });
    await router.invalidate();
    setBusyId(null);
  };

  const done = async () => {
    await router.invalidate();
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Data quality</h1>
          <p className="mt-1 text-muted-foreground">Rule checks, trust score and column profile for imported sales.</p>
        </div>
        <DataTrustBadge refreshKey={refreshKey} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1.5 block text-sm font-medium">Batch</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={batch?.batch_id ?? ""}
              onChange={(e) => navigate({ search: { batch: e.target.value } })}
            >
              {data.batches.length === 0 && <option value="">No sales batches yet</option>}
              {data.batches.map((b) => (
                <option key={b.id} value={b.batch_id}>
                  {b.file_name} · {b.rows_passed?.toLocaleString("en-GB")} rows · {b.batch_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          {canAct && (
            <div className="flex w-full flex-col gap-3">
              <RunChecksPanel batchId={batch?.batch_id} onDone={done} />
              <RefreshSummariesPanel onDone={done} lastRefreshedAt={summariesAt} />
            </div>
          )}
        </CardContent>
      </Card>

      {!canAct && <p className="text-sm text-muted-foreground">Read-only: only owners and analysts can run checks or change issue status.</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Trust Score</CardTitle>
            <CardDescription>Weighted pass rate for this batch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-5xl font-semibold">{batch?.quality_score != null ? `${batch.quality_score}%` : "—"}</p>
            <p className="text-sm text-muted-foreground">
              {batch?.quality_status === "complete" ? `${(batch.rows_excluded ?? 0).toLocaleString("en-GB")} rows excluded` : "Not checked yet"}
            </p>
            {batch?.accuracy_pass_rate != null && (
              <p className="text-sm text-amber-700">Accuracy (warning, not scored): {batch.accuracy_pass_rate}%</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pass rate by dimension</CardTitle>
          </CardHeader>
          <CardContent>
            <DimensionChart dimensions={data.dimensions} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Rule results</CardTitle></CardHeader>
        <CardContent>
          <RuleResultsTable issues={data.issues} canAct={canAct} busyId={busyId} onSetStatus={changeStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Column profile</CardTitle>
          <CardDescription>Key sales columns, within your store access</CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnProfile refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}