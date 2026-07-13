# AU15 — Architecture Critique (round 2)

Reviewer: fresh evaluator (did not author the plan). Re-critique of revision `d288f8cf` against
round-1 findings W1–W4. Each claimed fix verified against the actual committed diff AND the real
source it depends on — not the planner's prose.

## Verdict: DONE — clears the bar

All four WARNINGs are resolved with real, mechanically-grounded fixes. No remaining CRITICAL or
WARNING findings. One optional nit (below), non-blocking. The revision is materially stronger than
round 1 — notably, addressing W3 surfaced and closed a genuine brick-forever failure mode
(pre-hand-off terminal-intent failure) that would otherwise have shipped. Pipeline may advance to
Phase 3 (builder).

## W1 — agent_work_intents full-guard deferral registered durably — RESOLVED (verified)
Confirmed the note landed in the **tracked** `.pipeline/work-packages/TRACK-AU.md`, inside AU8's
section (between AU8's "Plan calls" and "Contracts / constraints"), titled "**Follow-on registered
by AU15 (`agent_work_intents` single-owner guard)**". It is substantive: names the table, the two
owner modules (`agent-work-intents.ts` + `agent-work-intent-worker.ts`), the sanctioned write
helper (`recordAgentWorkIntent`), the three pre-existing non-owner accessors that must migrate
first (`routes/threads.ts` insert, `routes/sessions-routes.ts` read, `services/agent-layer-boot.ts`
read), and instructs adding the `agent_work_intents` row to AU8's `TABLE_OWNER` map "same shape as
AU13." A maintainer opening AU8 cannot miss it. This is durable (survives `plans/AU15/` retirement),
exactly the silent-vanish pattern the directive demanded closing.

## W2 — coalescing unified onto the run-row signal — RESOLVED (verified against source)
- Source-confirmed: `routes/routines-routes.ts:497` currently calls `shouldCoalesce` (active-session
  signal, writes `outcome:"skipped"`, `reason:"coalesced"`); `shouldCoalesce` (`routine-scheduler.ts:303`)
  is session-keyed; `findRunningRoutineRun` (`routine-service.ts:205`) is the strictly-broader run-row
  signal covering the fire→session-active window.
- The plan (§4a, §6, G3) now: repoints the manual-trigger route to `findRunningRoutineRun`, deletes the
  now-dead `shouldCoalesce`, corrects the stale line-298 lore, and gates dead-code removal via
  `knip:production` (added to the DoD gate). Both fire paths coalesce on the same predicate — closing
  the double-run window (a fired-but-unprovisioned run now blocks a concurrent manual trigger).
- AC-3b (`R3`) tests exactly the race window: same running run + **no active session** → manual route
  also coalesces, proving the shared signal. The unification is real and the old signal is genuinely
  deleted (not left unused-but-present).

## W3 — terminal-failure finalization of session-less running runs — RESOLVED (real gap found + closed)
The planner did the harder-than-asked thing: enumerated every terminal state (§4c) and found the
genuine gap my round-1 W3 pointed at only generically.
- Source-confirmed the gap is real: `resolveAuthoritativeInput` throws `InvalidAgentWorkSourceError`
  (routine deactivated/deleted between fire and drain, or actor not runnable — worker lines 199/202/72)
  **before** any request/session exists; `failOrRelease` (worker:396) then sets the intent terminal
  `failed`, but no lifecycle fact fires and `projectRoutine` never runs → the `routineRun(running)`
  stays stuck → the new coalescing bricks the routine. Without W2's coalescing this was near-harmless;
  the coalescing amplifies it into a permanent brick. Correctly identified.
- Fix (§4c case 3): in `failOrRelease`, on `terminal === true` && `intent.kind === "routine_run"`,
  finalize via `routineService.updateRoutineRunIfRunning(intent.sourceId, {outcome:"error",...})`.
  Verified sound and race-safe: `updateRoutineRunIfRunning` (`routine-service.ts:85`) writes only
  `WHERE id = ? AND outcome = 'running'` — a no-op if already terminal, so a double-finalize race with
  `projectRoutine` cannot corrupt state. Scoping is correct: post-hand-off intents are `handed_off` and
  never re-enter `failOrRelease`, so the finalize never touches the legitimate retryable-defer path.
  `terminal` also covers `MAX_ATTEMPTS_EXCEEDED`, so a repeatedly-throwing pre-hand-off resolve is also
  finalized. au13-clean (agent-owned worker calling `routineService`).
- AC-3c (post-hand-off provision `INTERNAL_ERROR` → `projectRoutine` finalizes) and AC-3d (pre-hand-off
  deactivation → `failOrRelease` finalizes → subsequent fire does NOT coalesce) both test-cover it.

## W4 — au6 rules file-scoped + fixtures harness acknowledged — RESOLVED (verified)
- File-scoping is now **explicit**, not implied: architecture §5 and DoD AC-1 both state the two rules
  are "scoped to `packages/server/src/services/routine-scheduler.ts` only (`file ===` that exact path —
  NOT repo-wide)", with the concrete rationale that a repo-wide rule would false-positive on legitimate
  agent-owned importers. Source-confirmed that rationale: `services/agent-defaults/resolvers.ts`
  legitimately imports `agent-selection` (and `agent-work-intent-worker.ts` will too) — a repo-wide ban
  would break them.
- The missing `--fixtures` harness is explicitly acknowledged: §6 and G5 say "build a `--fixtures`
  self-test harness (au13-style; none exists today, W4)" — confirmed accurate, au6 today has only
  `--check` with no fixture writer. R5 specifies the negative file-scoping case ("a *different* file
  importing `agent-selection` → NOT a finding") plus the two positive cases.

## Nit (non-blocking, for the builder)
Deleting `shouldCoalesce` leaves a stale reference in `routine-session-reaper.ts:20`'s doc comment
("makes `shouldCoalesce` true forever → the routine bricks itself"). The reaper's behavior is
unchanged and still correct (it finalizes running runs on stale active sessions), but the comment
should be retargeted to the run-row signal alongside the §4e lore cleanup. Not a finding.

## 9-dimension scores (round 2)
1. Problem framing & context — 5/5
2. Alternatives & decision justification — 5/5
3. Boundary / ownership integrity — 5/5 (W1 durable registration; au6 file-scoping explicit)
4. Correctness & failure modes — 5/5 (W2 double-run window closed; W3 pre-hand-off brick closed, idempotent)
5. Testability / DoD mapping — 5/5 (AC-3b/c/d + R5 file-scoping negative case; knip:production gate)
6. Scope discipline — 5/5
7. Simplicity / proportionality — 5/5 (unified onto one coalescing signal; dead code deleted)
8. Risk / trade-off honesty — 5/5 (skip→defer surfaced for sign-off; permanent-WIP pathological case framed correctly)
9. Factual accuracy of current-state claims — 5/5 (all load-bearing claims re-verified against source)

**Aggregate: clears the bar. Advance to build.**
