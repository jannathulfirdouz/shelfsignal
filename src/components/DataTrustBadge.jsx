import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { getTrustSummary } from "@/lib/dq-fns";

function toneFor(score) {
  if (score > 95) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (score >= 85) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
}

function formatChecked(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

// Header badge for every analytics page: score, rows excluded, last checked.
export function DataTrustBadge({ refreshKey }) {
  const fetchSummary = useServerFn(getTrustSummary);
  const [state, setState] = useState({ loading: true, summary: null });

  useEffect(() => {
    let cancelled = false;
    fetchSummary().then((summary) => !cancelled && setState({ loading: false, summary }));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (state.loading) return <div className="h-9 w-64 animate-pulse rounded-full bg-muted" />;
  const s = state.summary;
  if (!s || s.score == null) {
    return (
      <Link to="/data-quality" className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
        <ShieldCheck className="h-3.5 w-3.5" />
        Not checked yet
      </Link>
    );
  }
  return (
    <Link
      to="/data-quality"
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${toneFor(s.score)}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Data Trust {s.score}%
      </span>
      <span>{s.rowsExcluded.toLocaleString("en-GB")} rows excluded</span>
      <span>Checked {formatChecked(s.lastCheckedAt)}</span>
    </Link>
  );
}