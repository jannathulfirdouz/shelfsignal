import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDqTotal, runDupChunk, runEvalChunk, finalizeChecks } from "@/lib/dq-fns";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Loader2, Play, RotateCcw } from "lucide-react";

const CHUNK = 10000;

// A response that is the "Preview is starting up" HTML page (or any HTML/network blip)
// instead of JSON. TanStack throws when it can't parse it; surface a friendly message.
function friendlyError(e) {
  const m = String(e?.message || e || "");
  if (/preview is starting|<!doctype|<html|unexpected token|failed to fetch|networkerror|load failed/i.test(m)) {
    return "The app was restarting, please try again.";
  }
  return m || "Something went wrong.";
}

function mergePerRule(acc, chunk) {
  for (const [key, s] of Object.entries(chunk || {})) {
    const a = acc[key] || (acc[key] = { checked: 0, failed: 0, samples: [] });
    a.checked += s.checked || 0;
    a.failed += s.failed || 0;
    if (a.samples.length < 10) {
      a.samples.push(...(s.samples || []).slice(0, 10 - a.samples.length));
    }
  }
}

// Chunked run-checks with a progress bar and resume. Two passes:
//  1. Scan all rows to build the global set of duplicate txn_ids (uniqueness needs
//     cross-chunk state, which a stateless server can't keep).
//  2. Evaluate each chunk, quarantine changed rows immediately, accumulate per-rule
//     tallies, then finalize into rule summaries + a batch trust score.
// Progress is persisted to localStorage so a restart mid-run can resume.
export function RunChecksPanel({ batchId, onDone }) {
  const getTotal = useServerFn(getDqTotal);
  const runDup = useServerFn(runDupChunk);
  const runEval = useServerFn(runEvalChunk);
  const finish = useServerFn(finalizeChecks);

  const [phase, setPhase] = useState("idle"); // idle | dup | eval | done
  const [pct, setPct] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [message, setMessage] = useState(null);
  const [canResume, setCanResume] = useState(false);
  const runningRef = useRef(false);

  const totalRef = useRef(0);
  const dupCursorRef = useRef(null);
  const seenKeysRef = useRef(null);
  const dupTxnRef = useRef(null);
  const dupScannedRef = useRef(0);
  const evalCursorRef = useRef(null);
  const perRuleRef = useRef({});
  const writesRef = useRef(0);
  const excludedRef = useRef(0);
  const evalScannedRef = useRef(0);

  const storageKey = batchId ? `dq_progress_${batchId}` : null;

  function save(phaseVal) {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({
      phase: phaseVal, total: totalRef.current,
      dupCursor: dupCursorRef.current, dupTxnIds: [...(dupTxnRef.current || [])],
      dupScanned: dupScannedRef.current,
      evalCursor: evalCursorRef.current, perRule: perRuleRef.current,
      writes: writesRef.current, excluded: excludedRef.current, evalScanned: evalScannedRef.current,
    }));
  }
  function clearSave() { if (storageKey) localStorage.removeItem(storageKey); }
  function loadSave() {
    if (!storageKey) return null;
    try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; }
  }

  useEffect(() => {
    setPhase("idle"); setPct(0); setStatusText(""); setMessage(null);
    totalRef.current = 0; dupCursorRef.current = null; seenKeysRef.current = null;
    dupTxnRef.current = null; dupScannedRef.current = 0; evalCursorRef.current = null;
    perRuleRef.current = {}; writesRef.current = 0; excludedRef.current = 0; evalScannedRef.current = 0;
    const s = loadSave();
    setCanResume(Boolean(s && s.phase && s.phase !== "done"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  function resetRefs() {
    totalRef.current = 0; dupCursorRef.current = null; seenKeysRef.current = new Set();
    dupTxnRef.current = new Set(); dupScannedRef.current = 0;
    evalCursorRef.current = null; perRuleRef.current = {}; writesRef.current = 0;
    excludedRef.current = 0; evalScannedRef.current = 0;
  }

  async function runLoop(startPhase) {
    runningRef.current = true;
    let phaseVal = startPhase;

    try {
      // ---- Pass 1: duplicates ----
      while (runningRef.current && phaseVal === "dup") {
        setPhase("dup");
        setStatusText(`Scanning for duplicates… (phase 1 of 2)`);
        let res;
        try {
          res = await runDup({ data: { cursor: dupCursorRef.current || undefined, chunkSize: CHUNK } });
        } catch (e) {
          // The chunk's rows were not added yet, so the cursor stays at the chunk start.
          setMessage({ tone: "error", text: friendlyError(e) });
          setCanResume(true); setPhase("idle"); runningRef.current = false; return;
        }
        for (const p of res.pairs) {
          if (seenKeysRef.current.has(p.key)) dupTxnRef.current.add(p.txn_id);
          else seenKeysRef.current.add(p.key);
        }
        dupScannedRef.current += res.count;
        dupCursorRef.current = res.nextCursor;
        setPct(totalRef.current ? Math.round((dupScannedRef.current / totalRef.current) * 50) : 0);
        save("dup");
        if (!res.hasMore) { phaseVal = "eval"; setPhase("eval"); }
      }

      // ---- Pass 2: evaluate + quarantine ----
      while (runningRef.current && phaseVal === "eval") {
        setStatusText(`Checking rules… (phase 2 of 2)`);
        let res;
        try {
          res = await runEval({
            data: { cursor: evalCursorRef.current || undefined, chunkSize: CHUNK, dupTxnIds: [...dupTxnRef.current] },
          });
        } catch (e) {
          // Discard this chunk's accumulation; cursor stays at the chunk start for resume.
          setMessage({ tone: "error", text: friendlyError(e) });
          setCanResume(true); setPhase("idle"); runningRef.current = false; return;
        }
        if (!res.stoppedByLimit) {
          mergePerRule(perRuleRef.current, res.perRule);
          writesRef.current += res.writes;
          excludedRef.current += res.excludedInChunk;
          evalScannedRef.current += res.count;
          evalCursorRef.current = res.nextCursor;
        } else {
          writesRef.current += res.writes; // partial writes that did land
        }
        setPct(totalRef.current ? Math.round(50 + (evalScannedRef.current / totalRef.current) * 50) : 50);
        save("eval");
        if (res.stoppedByLimit) {
          setMessage({ tone: "error", text: res.error });
          setCanResume(true); setPhase("idle"); runningRef.current = false; return;
        }
        if (!res.hasMore) break;
      }

      // ---- Finalize ----
      if (!runningRef.current) return;
      setStatusText("Saving results…");
      let fin;
      try {
        fin = await finish({
          data: {
            batchId, perRule: perRuleRef.current, totalRows: evalScannedRef.current,
            writes: writesRef.current, excluded: excludedRef.current,
          },
        });
      } catch (e) {
        setMessage({ tone: "error", text: friendlyError(e) });
        setCanResume(true); setPhase("idle"); runningRef.current = false; return;
      }
      clearSave();
      runningRef.current = false;
      setPhase("done"); setPct(100); setStatusText("");
      if (fin.complete) {
        setMessage({ tone: "ok", text: `Checks complete: ${fin.rowsChecked.toLocaleString("en-GB")} rows checked, ${fin.writes.toLocaleString("en-GB")} records written, trust score ${fin.score}%.` });
      } else {
        setMessage({ tone: "error", text: fin.error || "Stopped before finishing." });
        setCanResume(true);
      }
      onDone?.();
    } finally {
      runningRef.current = false;
    }
  }

  async function start() {
    if (!batchId) return;
    setMessage(null); setCanResume(false);
    resetRefs();
    setPhase("dup"); setPct(0); setStatusText("Counting rows…");
    try {
      totalRef.current = await getTotal({ data: {} });
    } catch (e) {
      setMessage({ tone: "error", text: friendlyError(e) }); setPhase("idle"); return;
    }
    await runLoop("dup");
  }

  async function resume() {
    if (!batchId) return;
    const s = loadSave();
    if (!s) { setCanResume(false); return; }
    totalRef.current = s.total || 0;
    dupCursorRef.current = s.dupCursor ?? null;
    seenKeysRef.current = new Set();
    dupTxnRef.current = new Set(s.dupTxnIds || []);
    dupScannedRef.current = s.dupScanned || 0;
    evalCursorRef.current = s.evalCursor ?? null;
    perRuleRef.current = s.perRule || {};
    writesRef.current = s.writes || 0;
    excludedRef.current = s.excluded || 0;
    evalScannedRef.current = s.evalScanned || 0;
    if (totalRef.current === 0) {
      try { totalRef.current = await getTotal({ data: {} }); } catch (e) { /* keep going */ }
    }
    setMessage(null); setCanResume(false);
    await runLoop(s.phase || "dup");
  }

  const busy = phase === "dup" || phase === "eval";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={start} disabled={!batchId || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          {phase === "dup" ? "Scanning…" : phase === "eval" ? "Checking…" : "Run checks"}
        </Button>
        {canResume && !busy && (
          <Button variant="outline" onClick={resume}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Resume from where it stopped
          </Button>
        )}
      </div>

      {busy && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{statusText}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
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