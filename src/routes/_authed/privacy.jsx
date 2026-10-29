import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getPrivacySetting, updatePrivacySetting, previewEmailMasking, applyEmailMasking } from "@/lib/governance-fns";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, Eye, Check } from "lucide-react";

export const Route = createFileRoute("/_authed/privacy")({
  ssr: false,
  loader: () => getPrivacySetting({ data: {} }),
  head: () => ({ meta: [{ title: "Privacy · ShelfSignal" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const setting = Route.useLoaderData();
  const { user } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const getSetting = useServerFn(getPrivacySetting);
  const updateSetting = useServerFn(updatePrivacySetting);
  const preview = useServerFn(previewEmailMasking);
  const apply = useServerFn(applyEmailMasking);

  const [months, setMonths] = useState(setting?.retention_months ?? 24);
  const [lastApplied, setLastApplied] = useState(setting?.last_applied_at || "");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => { setMonths(setting?.retention_months ?? 24); setLastApplied(setting?.last_applied_at || ""); }, [setting]);

  if (role !== "owner") {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Only owners can manage privacy settings.</CardContent></Card>;
  }

  const runPreview = async () => {
    setPreviewing(true);
    try {
      await updateSetting({ data: { retentionMonths: Number(months) } });
      const r = await preview({ data: { retentionMonths: Number(months) } });
      setPreviewResult(r);
    } finally { setPreviewing(false); }
  };

  const runApply = async () => {
    setApplying(true);
    try {
      const r = await apply({ data: { retentionMonths: Number(months) } });
      setApplyResult(r.writes);
      setConfirmOpen(false);
      const fresh = await getSetting({ data: {} });
      setLastApplied(fresh?.last_applied_at || "");
    } finally { setApplying(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy" subtitle="Customer email retention and masking. Owners only." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /> Email retention</CardTitle>
          <CardDescription>Customer emails are retained for this many months from their first purchase, then masked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Retention (months)</label>
              <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value)} className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <Button variant="outline" onClick={runPreview} disabled={previewing || !months}>
              <Eye className="mr-2 h-4 w-4" />{previewing ? "Previewing…" : "Preview"}
            </Button>
          </div>
          {previewResult != null && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p><span className="font-semibold">{previewResult.count.toLocaleString("en-GB")}</span> customer emails would be masked (first purchase before {previewResult.cutoff}).</p>
            </div>
          )}
          <Button onClick={() => setConfirmOpen(true)} disabled={previewResult == null}>
            <Check className="mr-2 h-4 w-4" />Apply masking
          </Button>
          <p className="text-xs text-muted-foreground">
            Last applied: {lastApplied ? new Date(lastApplied).toLocaleString("en-GB") : "never"}
            {applyResult != null ? ` · last run masked ${applyResult.toLocaleString("en-GB")} emails` : ""}
          </p>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Designed with the NZ Privacy Act 2020 principles in mind: collect only what is needed, limit access, and do not keep personal data longer than necessary.
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm email masking</DialogTitle></DialogHeader>
          <p className="text-sm">
            This will replace <span className="font-semibold">{(previewResult?.count ?? 0).toLocaleString("en-GB")}</span> customer email addresses with <code>[removed]</code>. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={runApply} disabled={applying}>{applying ? "Applying…" : "Apply"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}