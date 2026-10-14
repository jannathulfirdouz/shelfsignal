import { Button } from "@/components/ui/button";

const SEV = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
};
const STATUS = {
  open: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  accepted: "bg-sky-50 text-sky-700 ring-sky-200",
};

function Pill({ tone, children }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}>{children}</span>;
}

export function RuleResultsTable({ issues, canAct, busyId, onSetStatus }) {
  if (issues.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No results yet. Run the checks to see rule results.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            {["Rule", "Dimension", "Severity", "Failed", "Pass rate", "Sample txn_ids", "Status", ...(canAct ? ["Actions"] : [])].map((h) => (
              <th key={h} className="pb-2 pr-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => {
            const pass = i.checked_count ? Math.round((1 - i.failed_count / i.checked_count) * 1000) / 10 : null;
            return (
              <tr key={i.id} className="border-t border-border align-top">
                <td className="py-2.5 pr-3 font-medium">{i.rule_name}</td>
                <td className="py-2.5 pr-3 capitalize">{i.dimension}</td>
                <td className="py-2.5 pr-3"><Pill tone={SEV[i.severity]}>{i.severity}</Pill></td>
                <td className="py-2.5 pr-3">{(i.failed_count ?? 0).toLocaleString("en-GB")}</td>
                <td className="py-2.5 pr-3">{pass == null ? "—" : `${pass}%`}</td>
                <td className="max-w-[180px] py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                  {(i.sample_record_refs ?? []).length ? i.sample_record_refs.join(", ") : "—"}
                </td>
                <td className="py-2.5 pr-3"><Pill tone={STATUS[i.status] || STATUS.open}>{i.status || "open"}</Pill></td>
                {canAct && (
                  <td className="py-2.5">
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" disabled={busyId === i.id || i.status === "resolved"} onClick={() => onSetStatus(i.id, "resolved")}>Resolve</Button>
                      <Button size="sm" variant="outline" disabled={busyId === i.id || i.status === "accepted"} onClick={() => onSetStatus(i.id, "accepted")}>Accept</Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}