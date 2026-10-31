import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getRecommendations, decideRecommendation } from "@/lib/recommendations-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecommendationCard } from "@/components/actions/RecommendationCard";

export const Route = createFileRoute("/_authed/actions")({
  ssr: false,
  loader: () => getRecommendations({ data: {} }),
  head: () => ({ meta: [{ title: "Action centre · ShelfSignal" }] }),
  component: ActionsPage,
});

const TYPES = [["reorder", "Reorders"], ["markdown", "Markdowns"], ["investigate", "Investigate"], ["re_engage", "Re-engage"]];
const TYPE_OPTS = [["", "All types"], ["reorder", "Reorder"], ["markdown", "Markdown"], ["investigate", "Investigate"], ["re_engage", "Re-engage"]];
const CONF_OPTS = [["", "All confidence"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
const STATUS_OPTS = [["", "All status"], ["new", "New"], ["accepted", "Accepted"], ["rejected", "Rejected"]];

function ActionsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { user } = useAuth();
  const decide = useServerFn(decideRecommendation);
  const [showClassC, setShowClassC] = useState(false);
  const [f, setF] = useState({ store: "", type: "", confidence: "", status: "" });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const stores = useMemo(() => [...new Set(data.recommendations.map((r) => r.store_id))].sort(), [data.recommendations]);
  const matching = useMemo(() => data.recommendations.filter((r) =>
    (!f.store || r.store_id === f.store) && (!f.type || r.type === f.type) && (!f.confidence || r.confidence === f.confidence) && (!f.status || r.status === f.status)
  ), [data.recommendations, f]);
  // Reorders are prioritised to ABC class A and B products; class C reorders are
  // low value and stay hidden behind a toggle so they do not crowd the list.
  const classC = useMemo(() => matching.filter((r) => isClassCReorder(r)), [matching]);
  const filtered = useMemo(() => (showClassC ? matching : matching.filter((r) => !isClassCReorder(r))), [matching, showClassC]);

  const onDecide = async (id, status, note) => {
    setBusy(id); setErr(null);
    try { await decide({ data: { id, status, note: note || undefined } }); await router.invalidate(); }
    catch (e) { setErr(e?.data?.message || e?.message || "Could not save the decision."); }
    finally { setBusy(null); }
  };

  const groups = TYPES.map(([type, label]) => ({ type, label, items: filtered.filter((r) => r.type === type) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      <PageHeader title="Action centre" subtitle="Recommended actions from inventory, forecasts and customer segments." />

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Outcome tracking would compare decisions with later sales. This dataset ends on 9 December 2011, so outcomes cannot be measured here.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Sel label="Store" value={f.store} onChange={(v) => setF({ ...f, store: v })} options={[["", "All stores"], ...stores.map((s) => [s, s])]} />
        <Sel label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={TYPE_OPTS} />
        <Sel label="Confidence" value={f.confidence} onChange={(v) => setF({ ...f, confidence: v })} options={CONF_OPTS} />
        <Sel label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={STATUS_OPTS} />
        <Button size="sm" variant={showClassC ? "default" : "outline"} onClick={() => setShowClassC((v) => !v)}>
          {showClassC ? "Hide class C reorders" : `Show ${classC.length} class C reorder${classC.length === 1 ? "" : "s"}`}
        </Button>
        <span className="pb-2 text-xs text-muted-foreground">{filtered.length} recommendation{filtered.length === 1 ? "" : "s"}{data.role === "store_manager" ? " · your store only" : ""}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Reorders are prioritised to ABC class A and B products. Class C reorders are low value and hidden unless you ask for them.
      </p>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {data.recommendations.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No recommendations yet — generate them from the Models page.</CardContent></Card>
      ) : groups.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No recommendations match these filters.</CardContent></Card>
      ) : (
        groups.map((g) => (
          <section key={g.type} className="space-y-3">
            <h2 className="text-lg font-semibold">{g.label} <span className="text-sm font-normal text-muted-foreground">({g.items.length})</span></h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.items.map((r) => <RecommendationCard key={r.id} rec={r} canDecide={data.canDecide} canExplain={Boolean(user)} onDecide={onDecide} busy={busy === r.id} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// A reorder for a product that is not ABC class A or B (unclassified counts as low value).
function isClassCReorder(r) {
  if (r.type !== "reorder") return false;
  const abc = r.metrics?.abc_class;
  return abc !== "A" && abc !== "B";
}

function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}