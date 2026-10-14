import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { estimateChecks, runChecks } from "@/lib/dq-fns";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Play } from "lucide-react";

// Run checks -> show estimated writes -> confirm -> run. Stops with a clear message at the daily limit.
export function RunChecksPanel({ batchId, onDone }) {
  const estimate = useServerFn(estimateChecks);
  const run = useServerFn(runChecks);
  const [phase, setPhase] = useState("idle"); // idle | estimating | confirm | running
  const [est, setEst] = useState(null);
  const [message, setMessage] = useState(null);

  const start = async () => {
    setMessage(null);
    setPhase("estimating");
    try {
      setEst(await estimate({ data: { batchId } }));
      setPhase("confirm");
    } catch (e) {
      setMessage({ tone: "error", text: e?.message || "Could not estimate the checks" });
      setPhase("idle");
    }
  };

  const confirm = async () => {
    setPhase("running");
    try {
      const res = await run({ data: { batchId } });
      setMessage(
        res.complete
          ? { tone: "ok", text: `Checks complete: ${res.rowsChecked.toLocaleString("en-GB")} rows checked, ${res.writes.toLocaleString("en-GB")} records written, trust score ${res.score}%.` }
          : { tone: "error", text: res.error }
      );
      onDone?.();
    } catch (e) {
      setMessage({ tone: "error", text: e?.message || "Checks failed" });
    }
    setPhase("idle");
  };

  const busy = phase === "estimating" || phase === "running";
  return (
    <div className="space-y-3">
      <Button onClick={start} disabled={!batchId || busy || phase === "confirm"}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {phase === "estimating" ? "Estimating…" : phase === "running" ? "Running checks…" : "Run checks"}
      </Button>

      {phase === "confirm" && est && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Confirm before running</p>
          <p>
            This will check {est.rowsChecked.toLocaleString("en-GB")} rows and write an estimated{" "}
            <span className="font-semibold">{est.estimatedWrites.toLocaleString("en-GB")}</span> records
            ({est.rowsToQuarantine.toLocaleString("en-GB")} newly quarantined, {est.rowsToRelease.toLocaleString("en-GB")} released,{" "}
            {est.ruleSummaries} rule summaries, 1 batch score). The app allows 100,000 record writes per day.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm}>Confirm and run</Button>
            <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>Cancel</Button>
          </div>
        </div>
      )}

      {message && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {message.tone === "error" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}