# AU11 — Architecture Critique (Reviewer, Phase 2, round 2)

**Verdict: PASS.** Score **9.0/10** (round 1: 7.5). 0 CRITICAL, 0 WARNING, 3 NOTE (cosmetic).
Both round-1 WARNINGs closed with source-verified decisions; all three NOTEs addressed. Task ordering
still dependency-safe; AC-6 review method still concrete and now covers the new `/routines` seam and
the accepted routine-scheduler import. `.pipeline/plans/AU11.md` is the approved, self-contained plan.

Independent re-verification (not trusting the planner's self-report):

## 9-dimension re-scan
1. **Owner-table exhaustiveness — PASS.** `app-runtime` = 67 files (`find -type f`); §2 classifies all.
   No regression from round 1.
2. **Boundary correctness vs should-graph — PASS.** Homes map to should-graph named services. Core and
   Agent share `server/src/services/`; separated by the pinned allowlist (NOTE 3 below), AU9 precedent.
3. **Task ordering — PASS.** Guard-red first (1); leaf/core moves (2-4); agent moves (5); config (6);
   routine-scheduler (7, after agent-selection lands at 5 — safe, byte-identical import); route-import
   fix (8); boot-split + shell-delete + eval-export wiring (9); docs (10); verify (11). AC-2 green at
   8, AC-1 at 9 — correct gating. New task 7 introduces no ordering hazard.
4. **Review-diff method (AC-6) — PASS.** §6 concrete + mechanically executable. Now covers the new
   seam: step 3 verifies eval imports the 3 routine functions from `@hyperidle/server/routines` (not
   `app-runtime`, not deep `src/`) and that `src/routines.ts` re-exports exactly those three; step 4
   flags the routine-scheduler→agent-selection residual (option b) as an accepted AU8 boundary item,
   not an AU11 defect.
5. **AC → verification — PASS.** Static → guard, behavior → repointed suites + one live builtin-harness
   run. First Principle satisfied.
6. **Per-route AdapterPool classification — ACCEPTABLE** (unchanged; concrete per-route rule, sites
   enumerated).
7. **agent-defaults/resolvers repoint — PASS.** Verified `services/agent-defaults/resolvers.ts:1-12`
   imports `contracts` (type-only), `composeRoster` (value), `selectAgentByAppDefaults` (value) from
   app-runtime — repoint to agent-owned homes closes the AU10-deferred edge. Value imports of
   roster/agent-selection are not in AC-2's forbidden set, so guard-clean; the type-only contracts
   import is explicitly allowed (NOTE 4).
8. **routine-scheduler §2 decision — RESOLVED (was WARNING 1).** See below.
9. **cross-package export §3/§7 — RESOLVED (was WARNING 2).** See below.

## Round-1 WARNING 1 (routine-scheduler) → RESOLVED
§2 now DECIDES option (b): scheduler stays Core Routine, fire-time selection kept unchanged, import
repointed to agent-selection's agent-owned home. Source-verified independently:
`routine-scheduler.ts:379-386` selects at fire-time; `agent-work-intent-worker.ts` `routine_run`
(198-229) uses `routine.ownerAgentId` with no selection. Option (a) would have relocated fire-time
selection to drain-time (a real behavior change) — correctly rejected as a §5 violation. The residual
core→agent-selection edge is filed as a `@lore`/AU8 boundary item and is correctly argued to NOT be an
AC-2 violation (agent-selection is a "which agent" contract, not in the forbidden execution-internal
set). Sound.

## Round-1 WARNING 2 (cross-package export) → RESOLVED
§3 drops the false `packages/db` premise (verified: db refs at `factory-bootstrap.ts:14-15` /
`seed-fixtures.ts:29-30` are comments, no real import). Real consumers = 4 `packages/eval` scenario
files / 5 import statements (grepped and confirmed: `checkAndFireRoutine` ×3 files;
`provisionTeamRoutines`+`runBuiltinRoutine` static `:15` + dynamic `:400`). Decision: add curated
public export `@hyperidle/server/routines` → `./src/routines.ts` re-exporting exactly those 3
functions from their new homes. Idiomatic vs the existing package.json export pattern (`./tools`,
`./services/session-provisioning`); not the barrel, not an alias — guard-allowlisted. Mechanically
wired in task 9 (create file with exact names/homes, add package.json entry, repoint all 4 eval files
incl. `:400`). Feasibility confirmed: `builtin-routines.ts` exposes both `provisionTeamRoutines` (:260)
and `runBuiltinRoutine` (:326) as handlers landing in the one handler-split file.

## Round-1 NOTEs — addressed
- **NOTE 3 (allowlist)** — §4 pins the agent-owned allowlist as AU9's landed set ∪ this WP's
  enumerated agent files + builtin handler-split file. Verified AU9's set is real:
  `au9-direct-handoff-guard.ts:12` `agentFiles` Set (9 files). Concrete + checkable; present in both
  architecture.md §4 and AU11.md.
- **NOTE 4 (type-only)** — §4 explicitly allows `import type {...}` of agent-owned `contracts.ts` as a
  guard mechanism (distinguishes type-only from value specifiers). Verified resolvers' contracts import
  is `import type`.
- **NOTE 5 (no-local-status-builder)** — §3 corrected to trivial comment-text update, rides task 9;
  no rule-path change. Confirmed lines ~14/20 are doc comments, check is `WEB_SRC_SEGMENT`.

## Remaining NOTEs (cosmetic, non-blocking)
- **N1 — count label:** agent-layer bucket enumerates 16 files but is labeled "~13"/"13" throughout
  (§4, owner table). Enumerated list is authoritative and correct; the numeric label is off. Cosmetic.
- **N2 — "repoint" imprecision:** `routine-scheduler.ts` imports `./agent-selection.js`; both files
  land in the same `server/src/services/` dir, so the relative specifier is unchanged — nothing to
  "repoint." Harmless; the byte-identical conclusion holds.
- **N3 — per-route classification** resolves at build under the stated rule. Acceptable.

**Result:** PASS. The two architecture-level open/mis-attributed decisions from round 1 are now
decided in-plan, source-verified, and mechanically wired into the task list. `.pipeline/plans/AU11.md`
is self-contained and approved for the builder.
