import { DataTrustBadge } from "@/components/DataTrustBadge";

// Shared analytics page header: title, subtitle, the Trust badge, and a slot for filters.
export function PageHeader({ title, subtitle, filters }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {filters}
        <DataTrustBadge />
      </div>
    </div>
  );
}