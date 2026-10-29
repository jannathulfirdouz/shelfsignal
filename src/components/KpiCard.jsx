import { Info } from "lucide-react";
import { SimulatedTag } from "@/components/SimulatedTag";
import { Card, CardContent } from "@/components/ui/card";

// A KPI card with the metric formula as a tooltip, optional Simulated tag, and
// change vs the previous period.
export function KpiCard({ label, value, change, metric, simulated, loading, note }) {
  const tooltip = metric ? `${metric.formula}${metric.notes ? `\n${metric.notes}` : ""}` : "";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          {metric && (
            <span title={tooltip} className="text-muted-foreground/70">
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
          {simulated && <SimulatedTag />}
        </div>
        <p className="mt-1 text-2xl font-semibold">{loading ? "—" : value}</p>
        {note && !loading && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        {change != null && !loading && (
          <p className={`mt-0.5 text-xs ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs previous
          </p>
        )}
      </CardContent>
    </Card>
  );
}