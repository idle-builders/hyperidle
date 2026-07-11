# AU11 — Refine Critique (Reviewer, Phase 2, round 2)

**Verdict: PASS.** Score **9.0/10** (round 1: 7.5; planner self-scored 8.5). 0 CRITICAL, 0 WARNING,
3 NOTE (all cosmetic/informational). The two round-1 WARNINGs are closed with source-verified
decisions; the three NOTEs are addressed. `.pipeline/plans/AU11.md` is approved for the builder.

Independent re-verification against real source (not the planner's self-report) below.

## Round-1 WARNINGs — both RESOLVED

### WARNING 1 (routine-scheduler) → RESOLVED
Plan commits to **option (b)**: `routine-scheduler.ts` stays Core Routine, fire-time agent-selection
call kept, no push into the drain-time resolver. Verified against source myself:
- `routine-scheduler.ts:379-386` — `isAgentAtWipLimit(db, targetAgentId)` + `selectAgentByAppDefaults(...)`
  run at **fire-time**. Confirmed.
- `agent-work-intent-worker.ts` `routine_run` branch (lines 198-229) — uses `routine.ownerAgentId`
  directly as `defaultAgentId`; **no** agent selection at drain. Confirmed.
- Therefore option (a) (push selection into the resolver) WOULD be a fire-time→drain-time behavioral
  relocation (WIP state can differ) violating §5's import-path-only invariant. The plan's rejection of
  (a) is correct and source-grounded. Option (b) preserves behavior.
The behavior-preservation reasoning is sound. See NOTE 3 for a cosmetic imprecision in how the move is
described.

### WARNING 2 (cross-package export) → RESOLVED
- `packages/db` refs are **comments** — verified: `factory-bootstrap.ts:14-15` and
  `seed-fixtures.ts:29-30` are `@lore`/prose warnings against db importing server; `packages/db` has
  **zero** real production import of the export. db needs only comment-text refresh. Confirmed.
- Real consumers = **4 `packages/eval` scenario files, 5 import statements**: `checkAndFireRoutine`
  (`scenarios/routine-sessions.ts:13`, `skill-autonomy.ts:12`, `delegation.ts:12`),
  `provisionTeamRoutines`+`runBuiltinRoutine` (`scenarios/builtin-routines.ts:15` static + `:400`
  dynamic `await import`). Grepped and confirmed exactly — the `seeding.ts` hits are JSDoc comments,
  not imports. Count/sites match the plan's claim.
- New export `@hyperidle/server/routines` → `./src/routines.ts` re-exporting exactly the 3 functions.
  Idiomatic: `packages/server/package.json` already exposes `./tools`→`src/tools/index.ts`,
  `./services/session-provisioning`, etc. — a curated `./routines` subpath fits the pattern; it is not
  the app-runtime barrel and not an old-path alias.
- Mechanically specified in **AU11.md task 9**: create `src/routines.ts` (exact re-exported names +
  source homes given), add `"./routines": "./src/routines.ts"` to package.json, repoint all 4 eval
  files incl. the dynamic import at `:400`. Not just prose — concrete file/name/site list.
- Feasibility confirmed: `builtin-routines.ts` exposes `provisionTeamRoutines` (:260),
  `runBuiltinRoutine` (:326), `registerBuiltinRoutineHandlers` (:425) as handlers and `BUILTIN_SPECS`
  (:173) as the default records — the data/handler split is real, and both re-exported functions land
  in the one handler-split file so `routines.ts` pulls them from a single home.

## Round-1 NOTEs — addressed

- **NOTE 3 (guard allowlist)** — now a concrete list: the agent-owned allowlist = AU9's landed set
  ∪ this WP's agent-destined files (enumerated) + the builtin-routines handler-split file. Verified the
  AU9 set is a real reusable constant: `scripts/au9-direct-handoff-guard.ts:12` pins an `agentFiles`
  Set of 9 files. The union is derivable and checkable, not a vague "existing set."
- **NOTE 4 (type-only contracts)** — the guard spec now explicitly allows `import type {...}` of the
  agent-owned `contracts.ts` as a distinct mechanism ("distinguishes type-only specifiers from value
  imports"). Verified `resolvers.ts` contracts import is in fact `import type {` (lines 1-10);
  `composeRoster`/`selectAgentByAppDefaults` are value imports but are NOT in AC-2's forbidden set
  (harness/mcp/provisioning/context/tool/lifecycle), so they are guard-clean regardless.
- **NOTE 5 (no-local-status-builder)** — corrected to a trivial doc-comment update folded into task 9,
  no rule-path change. No longer overstated.

## Round-1 verified-strong items — no regression
- Owner table still exhaustive over the real tree: `find app-runtime -type f` = **67** files; §2 still
  classifies every one (Core/Agent/Config/Delete). Spot-checked tricky entries land correctly
  (`agent-lifecycle-projectors`→Core, `provision-registry`→Agent, `git-export-config`→Config).
- AC → verification still First-Principle-correct (static props → guard, behavior → repointed suites +
  one live builtin-harness run).

## Remaining NOTEs (cosmetic, non-blocking)
- **N1 — count label.** The agent-layer bucket enumerates **16** files (context-assembly,
  context-assembly-prompt, session-context, writeback, file-watcher, polling-watcher, roster,
  contracts, agent-selection, task-dispatcher, assistant-dispatcher, cost-cap, cost-sentinel,
  routine-session-reaper, sandbox-reaper, provision-registry) but is repeatedly labeled "~13"/"13
  agent files." The enumerated list (what the guard actually uses) is correct; only the numeric label
  is off. Cosmetic.
- **N2 — "repoint" over-description.** `routine-scheduler.ts` imports `./agent-selection.js`
  (relative). Both files currently sit in `app-runtime/services/` and both land in
  `server/src/services/`, so the relative specifier is **unchanged** — there is nothing to "repoint."
  Harmless (even safer than described); the byte-identical/behavior-preserving conclusion holds.
- **N3 — per-route AdapterPool classification** (carried from round 1) still resolves per-file at build
  under the stated rule (dead→delete / composition→server-factory / direct→agent-module). Acceptable
  for a mechanical cleanup; not an unresolved architecture decision.

**Result:** PASS. No CRITICAL/WARNING. The destructive decisions a builder cannot be handed
(routine-scheduler behavior, eval cross-package seam) are now decided in-plan and source-verified.
