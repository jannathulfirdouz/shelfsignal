import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRefreshPlan, refreshWeek, finalizeHourly } from "@/lib/summary-fns";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

const MAX_WAITS = 5;

const friendlyError = (e) => {
  const m = String(e?.message || e || "");
  if (/preview is starting|<!doctype|<html|unexpected token|failed to fetch|networkerror|load failed/i.test(m)) return "The app was restarting, please try again.";
  return m || "Something went wrong.";
};

// Seconds to wait when Base44 reports a rate limit, or null when it is not one.
function rateLimitSec(e) {
  const m = String(e?.data?.message || e?.message || "");
  if (!(e?.status === 429 || /rate limit|too many requests/i.test(m))) return null;
  const after = /retry after (\d+)\s*s/i.exec(m);
  return after ? Number(after[1]) : 10;
}

// Chunked refresh of the sales summary tables. Scans one week at a time (each
// request self-contained), accumulates the small hourly table on the client,
// then finalizes hourly. Shows estimated writes and asks for confirmation first;
// only changed rows are written. A rate limit is waited out and retried up to
// five times; any other stop leaves a resume point, so the next click carries on
// from the week it stopped at instead of starting over.
export function RefreshSummariesPanel({ onDone, lastRefreshedAt }) {
  const getPlan = useServerFn(getRefreshPlan);
  const runWeek = useServerFn(refreshWeek);
  const finishHourly = useServerFn(finalizeHourly);

  const [phase, setPhase] = useState("idle"); // idle | plan | running | done
  const [plan, setPlan] = useState(null);
  const [pct, setPct] = useState(0);
  const [waiting, setWaiting] = useState(null); // seconds left in a rate-limit wait
  const [message, setMessage] = useState(null);
  const hourRef = useRef(new Map());
  const monthRef = useRef(new Map());
  const catRef = useRef(new Map());
  const countryRef = useRef(new Map());
  const writesRef = useRef(0);
  // Where a stopped run got to: the next click continues from here.
  const resumeRef = useRef(null);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForLimit(secs) {
    for (let left = Math.max(1, Math.round(secs)); left > 0; left--) {
      setWaiting(left);
      await sleep(1000);
    }
    setWaiting(null);
  }

  async function start() {
    setMessage(null); setPhase("plan"); setPct(0);
    try {
      const p = await getPlan({ data: {} });
      setPlan(p); setPhase("plan");
    } catch (e) {
      setMessage({ tone: "error", text: friendlyError(e) }); setPhase("idle");
    }
  }

  function saveResume(weekIndex) {
    resumeRef.current = {
      weekIndex,
      hour: hourRef.current,
      month: monthRef.current,
      cat: catRef.current,
      country: countryRef.current,
      writes: writesRef.current,
    };
  }

  async function confirm() {
    setPhase("running"); setMessage(null);
    const weeks = plan.weeks || [];
    const resume = resumeRef.current;
    if (resume) {
      hourRef.current = resume.hour; monthRef.current = resume.month;
      catRef.current = resume.cat; countryRef.current = resume.country;
      writesRef.current = resume.writes;
    } else {
      writesRef.current = 0;
      hourRef.current = new Map(); monthRef.current = new Map();
      catRef.current = new Map(); countryRef.current = new Map();
    }
    const startIdx = resume ? resume.weekIndex : 0;
    setPct(Math.round((startIdx / (weeks.length || 1)) * 90));
    let stopped = false;

    for (let i = startIdx; i < weeks.length; i++) {
      const weekStart = weeks[i];
      let res = null;
      let waits = 0;
      for (;;) {
        try {
          res = await runWeek({ data: { weekStart } });
        } catch (e) {
          const secs = rateLimitSec(e);
          if (secs !== null && waits < MAX_WAITS) { waits += 1; await waitForLimit(secs); continue; }
          saveResume(i);
          setMessage({ tone: "error", text: friendlyError(e) + " Stopped at " + weekStart + ". Click Refresh summaries again to continue from there." });
          setPhase("idle"); return;
        }
        // The server hands back a wait instead of stopping when it is still limited.
        if (res?.rateLimited && waits < MAX_WAITS) { waits += 1; await waitForLimit(res.retryAfterSec || 10); continue; }
        break;
      }

      writesRef.current += res.weeklyWrites || 0;
      for (const h of res.hourly || []) {
        const k = `${h.store_id}|${h.weekday}|${h.hour}`;
        const ex = hourRef.current.get(k);
        if (ex) { ex.net_revenue += h.net_revenue; ex.orders += h.orders; }
        else hourRef.current.set(k, { store_id: h.store_id, weekday: h.weekday, hour: h.hour, net_revenue: h.net_revenue, orders: h.orders });
      }
      // Sales page figures accumulate the same way the hourly table does.
      for (const m of res.monthly || []) monthRef.current.set(m.key, (monthRef.current.get(m.key) || 0) + (m.net_revenue || 0));
      for (const c of res.category || []) {
        const ex = catRef.current.get(c.category);
        if (ex) {
          ex.net_revenue += c.net_revenue || 0; ex.gross_revenue += c.gross_revenue || 0;
          ex.returns_value += c.returns_value || 0; ex.out_returns += c.out_returns || 0; ex.out_gross += c.out_gross || 0;
        } else catRef.current.set(c.category, { ...c });
      }
      for (const c of res.country || []) countryRef.current.set(c.key, (countryRef.current.get(c.key) || 0) + (c.orders || 0));
      saveResume(i + 1);
      setPct(Math.round(((i + 1) / (weeks.length || 1)) * 90));

      if (res.stopped) {
        stopped = true;
        // This week's rows may be partly written, so the next click re-runs it
        // (only changed rows are rewritten) instead of skipping past it.
        saveResume(i);
        setMessage({ tone: "error", text: res.error || "Stopped at the daily write limit. Click Refresh summaries again to continue from here." });
        break;
      }
      if (res.rateLimited) {
        stopped = true;
        saveResume(i);
        setMessage({ tone: "error", text: "Still rate limited at " + weekStart + " after five waits. Click Refresh summaries again to continue from there." });
        break;
      }
    }

    if (!stopped) {
      setPct(95);
      const payload = {
        rows: [...hourRef.current.values()],
        monthly: [...monthRef.current.entries()].map(([key, net_revenue]) => ({ key, net_revenue })),
        category: [...catRef.current.values()],
        country: [...countryRef.current.entries()].map(([key, orders]) => ({ key, orders })),
      };
      let fin = null;
      let waits = 0;
      for (;;) {
        try {
          fin = await finishHourly({ data: payload });
        } catch (e) {
          const secs = rateLimitSec(e);
          if (secs !== null && waits < MAX_WAITS) { waits += 1; await waitForLimit(secs); continue; }
          setMessage({ tone: "error", text: friendlyError(e) });
          saveResume(weeks.length); setPct(100); setPhase("done"); return;
        }
        if (fin?.rateLimited && waits < MAX_WAITS) { waits += 1; await waitForLimit(fin.retryAfterSec || 10); continue; }
        break;
      }
      if (fin?.rateLimited) {
        saveResume(weeks.length);
        setMessage({ tone: "error", text: "Still rate limited while writing the hourly summary. Click Refresh summaries again to finish." });
      } else {
        writesRef.current += fin?.writes || 0;
        if (fin?.stopped) setMessage({ tone: "error", text: fin.error || "Stopped at the daily write limit. Click Refresh summaries again to continue." });
        else {
          resumeRef.current = null;
          setMessage({ tone: "ok", text: `Summaries refreshed: ${weeks.length} weeks processed, ${writesRef.current.toLocaleString("en-GB")} records written.` });
        }
      }
    }
    setPct(100); setPhase("done"); onDone?.();
  }

  const busy = phase === "running";
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={start} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh summaries
        </Button>
        {lastRefreshedAt && (
          <span className="text-xs text-muted-foreground">
            Last refreshed {new Date(lastRefreshedAt).toLocaleString("en-GB")}
          </span>
        )}
      </div>

      {phase === "plan" && plan && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Confirm before writing</p>
          <p>
            This will scan {plan.rowCount.toLocaleString("en-GB")} non-quarantined rows across {plan.weekCount} weeks and write
            an estimated <span className="font-semibold">{plan.estimatedWrites.toLocaleString("en-GB")}</span> summary rows
            (only changed rows are rewritten). The app allows 100,000 writes per day.
          </p>
          <p className="text-muted-foreground">
            Rate limits are waited out automatically. If it stops for another reason, clicking Refresh summaries again
            continues from the week it reached.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm}>{resumeRef.current ? "Continue refresh" : "Confirm and refresh"}</Button>
            <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>Cancel</Button>
          </div>
        </div>
      )}

      {busy && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{waiting ? `Waiting for rate limit… ${waiting}s` : "Refreshing summaries…"}</span>
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