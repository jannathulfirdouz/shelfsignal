// Shared filter bar for analytics pages: store, category, and a date-range preset.
// Presets are relative to the data's latest week (maxDate), not today, since the
// UCI dataset covers 2010-2011.
export function PageFilters({ value, onChange, options, lockStore }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Store">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={value.store || ""}
          disabled={lockStore}
          onChange={(e) => set({ store: e.target.value })}
        >
          <option value="">All stores</option>
          {options.stores.map((s) => (
            <option key={s.store_id} value={s.store_id}>{s.name || s.store_id}</option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={value.category || ""}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">All categories</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Date range">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={value.range || "all"}
          onChange={(e) => set({ range: e.target.value })}
        >
          <option value="all">All time</option>
          <option value="4w">Last 4 weeks</option>
          <option value="12w">Last 12 weeks</option>
          <option value="ytd">Year to date</option>
        </select>
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}