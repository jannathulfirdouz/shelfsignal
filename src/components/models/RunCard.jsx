import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Reusable card that estimates writes, asks for confirmation, then runs a model
// with a progress bar. `prepare()` returns { estimatedWrites, ...meta }. `run(onProgress)`
// performs the chunked run, calling onProgress({ done, total, waiting, seconds }).
// `onBusyChange(bool)` lets the parent disable the other models while one is working.
export function RunCard({ title, description, lastRun, prepare, run, forceRun, disabled, onBusyChange }) {
  const [phase, setPhase] = useState("idle"); // idle | estimating | ready | running | done
  const [meta, setMeta] = useState(null);
  const [prog, setProg] = useState({ done: 0, total: 0, waiting: false, seconds: null });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const est = async () => {
    setPhase("estimating"); setErr(null); setResult(null);
    onBusyChange?.(true);
    try { const e = await prepare(); setMeta(e); setPhase("ready"); }
    catch (e) { setErr(msg(e)); setPhase("idle"); }
    finally { onBusyChange?.(false); }
  };
  const confirm = async (fn = run) => {
    setPhase("running"); setErr(null); setProg({ done: 0, total: 0, waiting: false, seconds: null });
    onBusyChange?.(true);
    try { const r = await fn((p) => setProg((cur) => ({ ...cur, ...p }))); setResult(r); setPhase("done"); }
    catch (e) { setErr(msg(e)); setPhase("ready"); }
    finally { onBusyChange?.(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Last run: {lastRun ? new Date(lastRun).toLocaleString("en-GB") : "never"}</p>
        {phase === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={est} disabled={disabled}>Estimate &amp; run</Button>
            {forceRun && <Button variant="outline" onClick={() => confirm(forceRun)} disabled={disabled}>Force rewrite</Button>}
          </div>
        )}
        {phase === "estimating" && <p className="text-sm text-muted-foreground">Estimating writes…</p>}
        {phase === "ready" && (
          <div className="space-y-2">
            <p className="text-sm">Estimated writes: <span className="font-semibold">{(meta?.estimatedWrites ?? 0).toLocaleString("en-GB")}</span></p>
            {meta?.count != null && <p className="text-xs text-muted-foreground">{meta.count.toLocaleString("en-GB")} customers</p>}
            {meta?.series?.length != null && <p className="text-xs text-muted-foreground">{meta.series.length} forecast series</p>}
            {meta?.skuCount != null && <p className="text-xs text-muted-foreground">{meta.skuCount.toLocaleString("en-GB")} store × SKU rows</p>}
            {meta?.stores?.length != null && <p className="text-xs text-muted-foreground">{meta.stores.length} stores to process</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => confirm()} disabled={disabled}>Run now</Button>
              {forceRun && <Button variant="outline" onClick={() => confirm(forceRun)} disabled={disabled}>Force rewrite</Button>}
              <Button variant="outline" onClick={() => setPhase("idle")}>Cancel</Button>
            </div>
          </div>
        )}
        {phase === "running" && (
          <div className="space-y-2">
            <Progress value={prog.total ? (prog.done / prog.total) * 100 : 5} />
            <p className="text-xs text-muted-foreground">
              {prog.waiting
                ? `Waiting for rate limit…${prog.seconds ? ` (~${prog.seconds}s)` : ""}`
                : prog.total ? `Processing ${prog.done}/${prog.total}…` : "Working…"}
            </p>
          </div>
        )}
        {phase === "done" && (
          <p className="text-sm">Done — {result?.writes != null ? `${result.writes.toLocaleString("en-GB")} writes` : "complete"}.</p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}

function msg(e) { const raw = e?.data?.message || e?.message || String(e); if (/<html/i.test(raw)) return "The server restarted (saved a new version). Try again in a moment."; return raw; }