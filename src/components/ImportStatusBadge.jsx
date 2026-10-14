const TONES = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function ImportStatusBadge({ status }) {
  const tone = TONES[status] || "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}>
      {status || "unknown"}
    </span>
  );
}