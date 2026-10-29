import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getGovernanceData, updateDictionaryEntry, getAuditLog, exportAuditLogCsv, getLineage } from "@/lib/governance-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, Download, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authed/governance")({
  ssr: false,
  loader: () => getGovernanceData({ data: {} }),
  head: () => ({ meta: [{ title: "Governance · ShelfSignal" }] }),
  component: GovernancePage,
});

const METRIC_PAGES = {
  "Net revenue": ["Home", "Dashboard", "Sales"],
  "Gross margin %": ["Home"],
  "Units sold": ["Home"],
  Orders: ["Home"],
  "Average order value": ["Home"],
  "Return rate": ["Home", "Sales"],
  "Stock cover days": ["Inventory"],
  "Sell-through %": ["Inventory"],
  "Trust Score": ["Home", "Dashboard"],
};

function GovernancePage() {
  const data = Route.useLoaderData();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  if (role !== "owner" && role !== "analyst") {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">You do not have access to governance.</CardContent></Card>;
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Governance" subtitle="Data dictionary, metric definitions, lineage and audit." />
      {data.seed?.created ? <p className="text-xs text-muted-foreground">Seeded {data.seed.created} new dictionary entries.</p> : null}
      <Tabs defaultValue="dictionary">
        <TabsList>
          <TabsTrigger value="dictionary">Data dictionary</TabsTrigger>
          <TabsTrigger value="metrics">Metric definitions</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="dictionary"><DictionaryTab rows={data.dictionary} role={role} /></TabsContent>
        <TabsContent value="metrics"><MetricsTab metrics={data.metrics} /></TabsContent>
        <TabsContent value="lineage"><LineageTab /></TabsContent>
        <TabsContent value="audit"><AuditTab rows={data.auditLog} /></TabsContent>
      </Tabs>
    </div>
  );
}

function sensTag(s) {
  const cls = s === "PII" ? "bg-rose-50 text-rose-700" : s === "Confidential" ? "bg-amber-50 text-amber-700" : s === "Public" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{s}</span>;
}
function srcTypeTag(s) {
  const cls = s === "Simulated" ? "bg-purple-50 text-purple-700" : s === "Derived" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{s}</span>;
}

function DictionaryTab({ rows, role }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sensitivity, setSensitivity] = useState("");
  const [edit, setEdit] = useState(null);
  const [def, setDef] = useState("");
  const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const update = useServerFn(updateDictionaryEntry);

  const entities = [...new Set(rows.map((r) => r.entity))].sort();
  const filtered = rows.filter((r) =>
    (!q || (r.entity + " " + r.field + " " + (r.definition || "")).toLowerCase().includes(q.toLowerCase())) &&
    (!entity || r.entity === entity) &&
    (!sourceType || r.source_type === sourceType) &&
    (!sensitivity || r.sensitivity === sensitivity));

  const openEdit = (row) => { setEdit(row); setDef(row.definition || ""); setOwner(row.owner || ""); };
  const save = async () => {
    setSaving(true);
    try { await update({ data: { id: edit.id, definition: def, owner } }); await router.invalidate(); setEdit(null); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-sm" />
          </div>
          <Select value={entity} onChange={setEntity} options={entities} all="All entities" />
          <Select value={sourceType} onChange={setSourceType} options={["Real", "Derived", "Simulated"]} all="All source types" />
          <Select value={sensitivity} onChange={setSensitivity} options={["Public", "Internal", "Confidential", "PII"]} all="All sensitivities" />
          <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length} fields</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>{["Entity", "Field", "Definition", "Owner", "Source", "Type", "Sensitivity", ""].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 pr-4 font-medium">{r.entity}</td>
                  <td className="py-2 pr-4">{r.field}</td>
                  <td className="py-2 pr-4 max-w-xs">{r.definition}</td>
                  <td className="py-2 pr-4">{r.owner || "—"}</td>
                  <td className="py-2 pr-4 text-xs">{r.source || "—"}</td>
                  <td className="py-2 pr-4">{srcTypeTag(r.source_type)}</td>
                  <td className="py-2 pr-4">{sensTag(r.sensitivity)}</td>
                  <td className="py-2 pr-4">{(role === "owner" || role === "analyst") && <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {edit?.entity}.{edit?.field}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Definition</label>
              <Textarea value={def} onChange={(e) => setDef(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Owner</label>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                <option>Owner</option><option>Analyst</option><option>System</option>
              </select>
            </div>
          </div>
          <DialogFooter><Button onClick={save} disabled={saving || !def}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Select({ value, onChange, options, all }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
      <option value="">{all}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MetricsTab({ metrics }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>{["Metric", "Formula", "Owner", "Notes", "Used on"].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-t border-border align-top">
                  <td className="py-2 pr-4 font-medium">{m.name}</td>
                  <td className="py-2 pr-4 max-w-sm">{m.formula}</td>
                  <td className="py-2 pr-4">{m.owner || "—"}</td>
                  <td className="py-2 pr-4 max-w-xs text-muted-foreground">{m.notes || "—"}</td>
                  <td className="py-2 pr-4">{(METRIC_PAGES[m.name] || []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LineageTab() {
  const getLineageFn = useServerFn(getLineage);
  const [kpi, setKpi] = useState("net_revenue");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (k) => { setKpi(k); setLoading(true); try { const r = await getLineageFn({ data: { kpi: k } }); setData(r); } finally { setLoading(false); }; };
  useState(() => { load("net_revenue"); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI lineage</CardTitle>
        <CardDescription>Trace a KPI from source file through quality rules to the pages that display it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">KPI</label>
          <select value={kpi} onChange={(e) => load(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="net_revenue">Net revenue</option>
            <option value="gross_margin">Gross margin %</option>
            <option value="return_rate">Return rate</option>
            <option value="stock_cover">Stock cover days</option>
          </select>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : data ? (
          <div className="flex flex-wrap items-stretch gap-2">
            <Step title="Source" main={data.source ? data.source.file : "No batch"} sub={data.source ? `${data.source.rowsIn.toLocaleString("en-GB")} rows imported` : ""} />
            <Arrow />
            <Step title="Data quality" main={`${data.quarantined.toLocaleString("en-GB")} quarantined`} sub={`${data.used.toLocaleString("en-GB")} used`} tone="amber" />
            <Arrow />
            <Step title="Summary table" main={data.summaryTable} sub="" />
            <Arrow />
            <Step title="Formula" main={data.label} sub={data.formula} />
            <Arrow />
            <Step title="Displayed on" main={data.pages.join(", ")} sub="" tone="accent" />
          </div>
        ) : null}
        {data?.rules?.length ? (
          <div>
            <p className="mb-2 text-sm font-medium">Quality rules applied (latest batch)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr>{["Rule", "Dimension", "Severity", "Failed", "Checked"].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr></thead>
                <tbody>
                  {data.rules.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 pr-4">{r.rule_name}</td>
                      <td className="py-2 pr-4">{r.dimension}</td>
                      <td className="py-2 pr-4">{r.severity}</td>
                      <td className="py-2 pr-4">{r.failed_count}</td>
                      <td className="py-2 pr-4">{r.checked_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Step({ title, main, sub, tone }) {
  const ring = tone === "amber" ? "border-amber-300 bg-amber-50" : tone === "accent" ? "border-accent/40 bg-accent/5" : "border-border bg-muted/30";
  return (
    <div className={`min-w-[140px] rounded-lg border p-3 ${ring}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-semibold">{main}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
function Arrow() { return <ArrowRight className="mt-8 h-4 w-4 shrink-0 text-muted-foreground" />; }

function AuditTab({ rows: initial }) {
  const getLog = useServerFn(getAuditLog);
  const exportCsv = useServerFn(exportAuditLogCsv);
  const [rows, setRows] = useState(initial);
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const apply = async () => { setLoading(true); try { const r = await getLog({ data: { user, action, from, to } }); setRows(r); } finally { setLoading(false); }; };
  const download = async () => {
    const csv = await exportCsv({ data: { user, action, from, to } });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "audit-log.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const actions = [...new Set(initial.map((r) => r.action))].sort();

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="User"><input value={user} onChange={(e) => setUser(e.target.value)} className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm" /></Field>
          <Field label="Action"><select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">All</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" /></Field>
          <Button size="sm" onClick={apply} disabled={loading}>{loading ? "Filtering…" : "Apply"}</Button>
          <Button size="sm" variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr>{["Time", "User", "Role", "Action", "Entity", "Detail"].map((c) => <th key={c} className="pb-2 pr-4 font-medium">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{r.timestamp ? new Date(r.timestamp).toLocaleString("en-GB") : "—"}</td>
                  <td className="py-2 pr-4">{r.user}</td>
                  <td className="py-2 pr-4 capitalize">{r.role}</td>
                  <td className="py-2 pr-4 font-medium">{r.action}</td>
                  <td className="py-2 pr-4">{r.entity}</td>
                  <td className="py-2 pr-4 max-w-md text-muted-foreground">{r.detail}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="py-4 text-muted-foreground">No entries.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
function Field({ label, children }) { return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>; }