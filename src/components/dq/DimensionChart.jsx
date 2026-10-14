import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DimensionChart({ dimensions }) {
  if (dimensions.length === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No results yet</div>;
  }
  const data = dimensions.map((d) => ({ name: d.dimension, passRate: d.passRate }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => `${v}%`} />
          <Bar dataKey="passRate" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.name === "accuracy" ? "hsl(var(--chart-4))" : "hsl(var(--chart-2))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}