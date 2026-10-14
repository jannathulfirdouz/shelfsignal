import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getColumnProfile } from "@/lib/dq-fns";
import { Loader2 } from "lucide-react";

const show = (v) => (v == null || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("en-GB") : String(v));

export function ColumnProfile({ refreshKey }) {
  const load = useServerFn(getColumnProfile);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    load().then(setData);
  }, [refreshKey]);

  if (!data) return <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Profiling columns…</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>{["Column", "Null %", "Distinct", "Min", "Max"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.columns.map((c) => (
            <tr key={c.column} className="border-t border-border">
              <td className="py-2.5 pr-3 font-mono text-xs">{c.column}</td>
              <td className="py-2.5 pr-3">{c.nullPct}%</td>
              <td className="py-2.5 pr-3">{show(c.distinct)}</td>
              <td className="py-2.5 pr-3">{show(c.min)}</td>
              <td className="py-2.5 pr-3">{show(c.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}