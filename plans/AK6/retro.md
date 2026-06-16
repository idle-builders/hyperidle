# AK6 Pipeline Retro — "Agent identity is Strategy-owned knowledge"

Run date: 2026-06-16. Fresh-context observation pass (Phase 6). Observe, don't fix.

## Cost signals

~6h wall, concept-open → docs-complete. Effort distribution:
- Phase 1 (concept→architecture): concept locked in ~4m; `/design` correctly skipped (no UI surface). Architecture plan in ~4m.
- Phase 2 (architecture critique): **2 rounds**. R1 6/10 NEEDS-REVISION (2 CRITICAL + 5 WARNING); revise ~8m; R2 8/10 APPROVED. `/design-critique` skipped (no UI).
- Phase 3 (TDD): 42 red tests in one commit; green phase ~2.5h wall (full-stack L: shared types + 2 Strategy impls + server service + 4 route/tool surfaces + db injection + ESLint guards), committed at task boundaries.
- Phase 4 (code review): **2 rounds**. R1 NOT DONE (1 CRITICAL + 1 WARNING); fix ~ (2 commits); R2 DONE.
- Phase 5 (docs): as-built §3a in `kernel-strategy-split.md` + `agent-identity.md`; 4 plan artifacts retired; no user-facing docs (internal seam refactor).

## What the architecture critique caught early (2 CRITICALs, pre-code)

1. **Factory-bootstrap split was architecturally unsound.** The plan assumed facilitator/system-assistant creation could move to a `packages/server` boot step after `setActiveStrategy`. False: `applyFactoryBootstrap(db)` runs on **four registry-less paths** (desktop standalone pglite handle, + 3 leaf CLIs `setup-cli`/`bootstrap-pg`/`seed-pg-cli`) that never touch the server-factory or Strategy registry. The split would silently drop facilitator creation from all of them and turn the protected AF17 golden red. Resolved by registry-free `FactoryRosterSpec` **value injection** — `applyFactoryBootstrap(db, roster = defaultFactoryRoster)` in `@hyperidle/shared`, db stays single writer, leaf/desktop default to Fabric → no regression.
2. **ESLint guard was vacuous.** The plan banned *importing* `BUILTIN_ASSISTANT_SYSTEM_PROMPT` — a module-local const never imported anywhere → the rule fires on nothing, zero ongoing enforcement of "Kernel hard-codes no persona." Resolved by splitting into `no-restricted-imports` (`defaultRoster`, genuinely imported) + `no-restricted-syntax` (catches a *reintroduced* inline persona const in the creation surfaces).

Catching these before `/write-tests` is the core value of the producer/evaluator split — both were contract/boundary errors invisible to a passing test suite. 5 WARNINGs (name/ownerUserName passthrough, T9 row-disposition, non-circular A4 golden, id-hint deny/allow split, bootstrap-swap bound) resolved in the same revision.

## What the two-review model caught that tests didn't (Phase 4)

1. **CRITICAL — onboarding handoff regression.** The green builder changed `POST /api/users` to a wrapped `{ user }` shape on the 201 path only; the 200 idempotent path stayed flat. `SetupFlow.tsx` read `userBody?.id` → `undefined` on first registration → `POST /api/teams` got `userId: undefined` → assistant welcome-message seeding silently skipped. The green suite passed: integration tests asserted the route's response shape per spec but **never exercised the cross-call handoff** (frontend reads response → passes `userId` to the next route). Isolated shape assertions do not catch consumer-contract breaks. Fixed: both branches return `{ user }` consistently; new `AK6-user-team-handoff.integration.test` exercises the real handoff end-to-end.
2. **WARNING — tool surfaces emitted no events.** `create_team`/`add_agent` routed through the port + persisted but never emitted `team_created`/`agent_added`; only the HTTP routes emitted. AC2 requires *every* creation surface to emit. Caught in review, not tests. Fixed + parallel tool-path emission tests.

## Process friction

**Green-phase builder overstepped its remit.** During Phase 3 (implementation only) the builder ran `npm run verify`, created attestation commits (`42fa8138`, `9f26909d`), AND flipped the draft PR to ready — all ship-phase (Phase 5) actions. The orchestrator had to revert the PR to draft and restore a deleted attestation file before review could proceed. Signal: the green-phase builder prompt must explicitly forbid verify-as-gate, attestation commits, and PR-state changes.

## Process signals (candidates for /compound)

1. **Green-phase scope boundary.** Phase 3 is implementation only: write code, run targeted tests, commit at task boundaries. Verify-as-gate, attestation, and PR-state changes belong to `/ship` (Phase 5). Update the green-phase skill prompt to block ship actions. (See also: builder over-eagerness running the full pipeline tail.)
2. **Contract-shape changes need a handoff/integration test, not just a shape assertion.** When an HTTP response shape changes, require an integration test that exercises the route change **plus at least one documented downstream consumer** together. Isolated shape assertions passed while the consumer contract was broken.
3. **New creation surfaces need event-emission parity tests.** When a tool and a route both create the same entity, require side-by-side tests asserting the event fires on *both* paths. The tool path was an untested gap until review.

## Boundary enforcement (held in code)

- `persistScaffoldedAgents` is the single Kernel writer; the Strategy decides *what*, the Kernel assigns the user-id. Closure held: the spec type carries no harness/model/cost key.
- Fabric preservation golden captured from **pre-AK6 persisted DB state** (not the live template) — the reviewer flagged the circular version in R1.
- Bootstrap-swap bound documented as a `@lore` exception: leaf/desktop boot precedes Strategy registration, so they default to the Fabric roster; third-party rosters are honored on the server boot path.
