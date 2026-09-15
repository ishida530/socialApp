// TASK-6.5 / TASK-10.4 (2026-09-15): a real, technically-enforced feature-flag gate for
// gradually-rolled-out UI, not a documentation-only convention. No new dependency (no
// LaunchDarkly/GrowthBook) - this reads a comma-separated allowlist from an env var. Uses the
// NEXT_PUBLIC_ prefix deliberately so the same check works in both server and client components
// without a server/client split (client bundles only ever see NEXT_PUBLIC_ vars, inlined at
// build time).
//
// Not applied to any UI shipped in this EPIC 10 pass (see UX_AUDIT.md "Feature flagi") - those
// changes are purely additive (same fields, same capabilities, just organized differently) and
// this app has one owner in `personal` mode today, so there's no real population to stage a
// rollout across. This exists as ready infrastructure for the next EPIC 10 phase (the /schedule
// redesign), where the blast radius genuinely justifies staged rollout.
export function isFeatureEnabled(flag: string): boolean {
  const raw = process.env.NEXT_PUBLIC_FEATURE_FLAGS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(flag);
}
