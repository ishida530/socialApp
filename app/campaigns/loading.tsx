// Shown while this section's code/data loads (2026-10-01) - instead of the previous page
// staying frozen with no feedback.
export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Ładowanie">
      <div className="h-7 w-48 rounded-lg bg-secondary/60" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 rounded-xl bg-secondary/40" />
        <div className="h-28 rounded-xl bg-secondary/40" />
        <div className="h-28 rounded-xl bg-secondary/40" />
      </div>
      <div className="h-64 rounded-xl bg-secondary/30" />
    </div>
  );
}
