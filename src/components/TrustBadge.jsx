export function TrustBadge({ score }) {
  if (score == null || Number.isNaN(score)) {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">No data</span>;
  }
  const tone =
    score >= 90
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : score >= 70
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-rose-50 text-rose-700 ring-rose-200";
  const label = score >= 90 ? "High trust" : score >= 70 ? "Moderate" : "Low trust";
  const dot = score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label} · {score}%
    </span>
  );
}