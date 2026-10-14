// Marks any value backed by simulated data. Use wherever a simulated field is shown.
export function SimulatedTag({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200 ${className}`}
    >
      Simulated
    </span>
  );
}