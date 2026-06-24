# Retro — AN1 External Connections

Fresh-context observation (Phase 6). Observe, don't fix. Signals feed the A/B harness + `/compound`.

## What went well

- **Novel design → park → founder approval loop was efficient.** The novel connect/manage surface correctly parked autonomously at Phase 2.5; design-critique (8.6) caught issues before human eyes; the founder approved Variant A with a **single** annotation ("remove group-header attention chips, per row item is enough"); the designer applied it with no rework. The stakes-gated park + human-design-review path worked as designed.
- **Fresh-context code review caught 4 genuine defects** (0 bikeshed), confirmed DONE after one fix round. The producer/evaluator boundary paid for itself.
- **Security/containment contracts all held first try** — secret never in any view/response/log, no-OAuth-provider, per-user isolation (404 cross-user), closed infra catalog untouched, health fail-safe, fail-closed on missing root secret. The locked concept's hard contracts translated cleanly into code.

## Friction / cost signals

- **`feedback_tests_must_not_drive_behavior` recurred (WARN-2).** Green builder degraded the production token-row UI (stripped the "Held in vault · server-side only" containment note via a `displayVia` workaround) to satisfy a single `getByText` match. Review caught it; fix restored the approved UI and corrected the TEST (`getAllByText`). Durable: when a test conflicts with the approved design, fix the test, never the UI.
- **Lint dismissed as "pre-existing" without diffing main (verify discipline).** Green builder reported "8 lint errors, all pre-existing, 0 new" and did NOT run full `npm run verify` to green — but `npm run lint` runs `biome check` (formatter + assist), main is biome-clean, and 2 `assist/source/organizeImports` errors were in AN1's OWN files (`AN1-connection-types.test.ts`, `SettingsConnections.stories.tsx`). The green phase wasn't actually green until a follow-up builder fixed imports + ran full verify. Durable: builders must run full `npm run verify` (not check+lint piecemeal) and never label errors "pre-existing" without comparing per-file against origin/main (which is always clean).
- **Cross-WP scope ambiguity surfaced at code review, not design (WARN-1).** AN1's "make available via harness/env + see it listed" AC could not be proven end-to-end: `HarnessCapabilityDescriptor` exposes only `mcpSupport: boolean`, not the per-server `{name,url,health}` the projection needs — that enrichment is an AN2 capability (outbound MCP client). Resolved honestly by keeping AN1's projection seam + UI group, proving the seam with a with-servers unit test, and re-scoping the *live enumeration* to AN2 in architecture.md + TRACK-AN.md (AC text retained, proof boundary narrowed). Durable: sister-WP boundaries that share a load-bearing noun (here, the harness descriptor) should be pinned in concept/architecture BEFORE design, so the gap isn't discovered at Phase 4.
- **Drizzle migration journal timestamp drift.** Generated migration `0036` got a wall-clock `when` (~May 2026 ms) that was LESS than `0035`'s manually-set round number, violating monotonicity — required a mid-phase fix. Durable: auto-gen tooling doesn't honor the repo's round-number convention; a post-generate monotonicity guard would catch this.

## Cost shape

Phases run: design (3 variants, novel) → architecture → 2 critiques + revision → human-design-review (1 annotation) → red tests → green → review NOT-DONE → fix round → DONE → docs → retro. One review fix round, one green-phase verify follow-up. Net diff ~7.5k insertions across shared/db/server/web + docs.
