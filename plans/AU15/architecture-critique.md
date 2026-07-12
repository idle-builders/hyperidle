# AU15 — Architecture Critique (round 1)

Reviewer: fresh evaluator (did not author the plan). Scored independently against the
9-dimension architectural rubric. Every factual claim below was source-verified against the
worktree at `backend/AU15-routine-intent-queue` (base = origin/main @ #442/#441/#440), not
against the plan's prose.

## Verdict: NEEDS REVISION (round 1)

No CRITICAL findings. The core decision (move routine agent-selection fire-time → drain-time,
remove the `agent-selection.ts` import from `routine-scheduler.ts`) is correct, well-justified,
and factually grounded — it genuinely routes around AU11's objection rather than reframing it.
But four WARNING-level findings must go back to the planner before this clears: a coalescing-
signal divergence with real double-run teeth, a reaper-coverage gap for the new "running run
with no session" state, a prose-only (unregistered) deferral of the `agent_work_intents` guard,
and a DoD that assumes an `au6 --fixtures` harness that does not yet exist.

## Founder-directive answers (the non-negotiables)

1. **routines / routineRuns read+write ownership — SATISFIED, mechanism is real.**
   `scripts/au13-work-routine-ownership-guard.ts` is a genuine zero-allowlist AST scan over
   every production `.ts/.tsx` under `packages/server/src` (owners = `work-service.ts` +
   `routine-service.ts` only), flagging `.from/.insert/.update/.delete(routines|routineRuns)`
   by bare-identifier primary operand — reads AND writes (verified lines 40-56, 95-122, and its
   `--fixtures` self-test asserts both a `.from(bets)` read and a `.update(routines)` write from
   a non-owner file are findings). AU15's new reads all route through the service
   (`findRunningRoutineRun` @ `routine-service.ts:205`; `getRoutineRunById`/`getRoutineById` in
   the resolver). `routine-scheduler.ts` and `agent-work-intent-worker.ts` are NOT allowlisted,
   so any raw regression is caught. This is the AU13-style mechanism the directive demands and it
   already covers AU15's blast radius. (Caveat, not a blocker: the guard keys on `.from(TABLE)`
   primary operand + bare identifier and deliberately excludes joins/aliased vars — AU15
   introduces none of those evasion shapes, so coverage holds for this WP.)

2. **agent_work_intents — file-scoped closure is real; the *deferral* is not durably tracked.**
   Verified: the sanctioned write helper is `recordAgentWorkIntent` (`services/agent-work-intents.ts`);
   raw non-owner accessors that block a full zero-allowlist guard today are real —
   `routes/threads.ts:1277` (insert), `routes/sessions-routes.ts:402` (read),
   `services/agent-layer-boot.ts:56` (read) (plus the drain worker's own reads/writes). So the
   plan is factually right that the broad guard cannot land in AU15. The proposed two file-scoped
   `au6` rules (no `agent-selection` import; no raw `agentWorkIntents` access in
   `routine-scheduler.ts`) DO mechanically close the specific chartered edge — see W1, W4 below
   for the two gaps in *how* that landing is described.

3. **Drain-time genuinely resolves AU11's WIP-staleness objection — YES, not a reframe.**
   Verified `session-provisioning.ts:783` throws `ConcurrencyLimitError` when active-session count
   `>= maxConcurrentSessions`; `agent-session-runtime.ts:306-308` releases the claim back to
   *pending (retryable)* on that error; `agent-layer-boot.ts:198-200` re-drains
   intents + requests every 1s (not just at boot). So WIP is authoritatively enforced at the
   point closest to execution and a WIP-blocked routine defers-and-retries at runtime. The
   fire-time WIP check the plan removes was a redundant advisory pre-filter. Claim holds.

4. **All 5 built-ins — same outcome, VERIFIED.** The poll loop branches at
   `routine-scheduler.ts:558`: `isBuiltinRoutineId` → `runBuiltinRoutine`; else →
   `checkAndFireRoutine`. The WIP/delegate block lives only inside `checkAndFireRoutine`
   (generic path), so `practice-meeting`/`post-bet-retro`/`portfolio-retro`/`knowledge-decay`/
   `knowledge-promotion` never touched fire-time selection and are structurally unaffected. (Minor:
   AC-2 literally names `isAgentAtWipLimit`/`selectAgentByAppDefaults` "for every built-in routine"
   though built-ins call neither; the DoD's reinterpretation to an owner-attribution assertion is
   the correct reading.)

5. **Race — concrete mechanisms present (§8), but partly undercut by W2.** Idempotency key,
   CAS-lease claim, and provision-retry are real and correctly described. The third leg
   ("fire-time coalescing → one in-flight run per routine") is weaker than stated — see W2.

6. **DoD → real tests/guards, no grep-as-test — SATISFIED with one hole.** Every AC maps to a
   service-integration test or a lint/type guard; nothing uses `readFileSync`/grep as a test.
   The hole is the missing terminal-failure finalization test (W3).

## WARNING findings (return to planner)

### W1 — The `agent_work_intents` full-guard deferral is prose-only; register it as a real WP.
The plan defers the broad single-owner guard "as a separate future WP" (§5, §9, dod §37) but
creates no actual `.pipeline/work-packages/` or manifest entry. `plans/AU15/` is retired at
`/pipeline:write-docs`, so the only record of this debt vanishes with it. This is the exact
silent-vanish pattern that has already bitten this track (Settings/Notification raw-write gap
"confirmed twice, never registered"; AU12 shipped with named carve-outs still open). AU13 became
a real guard precisely because it was a registered WP, not a footnote. **Action:** register a
concrete backlog/manifest entry (e.g. "AU-future: `agent_work_intents` single-owner guard —
migrate `routes/threads.ts`, `routes/sessions-routes.ts`, `services/agent-layer-boot.ts`
accessors, then land the zero-allowlist guard") and cite its ID in the plan before acceptance.

### W2 — Coalescing-signal divergence between the two fire entry points → real double-run risk.
An existing coalescing helper `shouldCoalesce(db, routineId)` (`routine-scheduler.ts:303`) already
exists, keyed on an **active session**, and is called by the manual-trigger endpoint
(`routes/routines-routes.ts:497`). The plan does not mention it and introduces a **second,
different** signal — `findRunningRoutineRun` (a `running` routine_run row) — for the poll path.
Consequences the plan does not address:
- The poll path (new: run-row signal) and the manual-trigger path (existing: session signal) will
  coalesce on **different** conditions. A poll-created run that is fired-but-not-yet-provisioned
  (running run, no active session yet — exactly the new WIP-deferral window) does NOT block a
  concurrent manual trigger, which only checks `shouldCoalesce` (no session ⇒ false) → **two
  concurrent runs / two intents** for one routine.
- The plan's §2 claims to be "source-verified in worktree" yet misses that `checkAndFireRoutine`
  currently calls **no** coalescing at all, and that `shouldCoalesce`'s own doc comment
  (line 298) falsely asserts `checkAndFireRoutine` calls it. That stale lore should be corrected.
**Action:** unify the coalescing signal across both entry points (prefer the run-row signal — it
covers the fire→session-active window the session signal misses), or explicitly justify the
divergence and prove non-interference with a test. Update the stale line-298 lore.

### W3 — New "running run with no session" state class escapes the AF6 §4 reaper; no test for
the terminal-failure finalization path. The existing reaper (`routine-session-reaper.ts`) self-
heals stuck coalescing by iterating **stale active sessions** and finalizing their running run.
The plan's drain-time deferral creates a steady state the old fire-time SKIP never produced: a
`running` routine_run with **no session** (fired, intent pending at WIP). The AA2 lore is explicit
that an unfinalized running run "bricks the routine itself." Analysis:
- Retryable path (`ConcurrencyLimitError`, permanent WIP) — the plan discloses and accepts this
  (§9); self-heals when capacity frees. Acceptable.
- **Non-retryable terminal provision failure** (`MISSING_CREDENTIAL` / `NO_ELIGIBLE_HARNESS` /
  `INTERNAL_ERROR`) — must finalize the run via `projectRoutine`
  (`agent-lifecycle-projectors.ts:66`, `state !== completed → error`) or the run stays `running`,
  no session ever exists for the reaper to key on, and coalescing bricks the routine permanently.
  The DoD tests only the retryable owner-at-WIP deferral (AC-2 case b), **not** the terminal-
  failure→run-finalized path.
**Action:** add a service-integration test asserting a terminally-failed routine request finalizes
its routine_run (via the routine-sourced lifecycle fact → `projectRoutine`) so coalescing self-
heals — or extend the reaper to finalize session-less stale running runs. Deferring the only
cleanup for a known brick-forever regression to "flagged for retro" (§9) is too thin.

### W4 — DoD assumes an `au6 --fixtures` self-test harness that does not exist.
`scripts/au6-agent-boundary-guard.ts` today is a plain regex scan with only a `--check` flag and
**no `--fixtures` self-test** (unlike au13). DoD §9 and §5 describe the new rules' `--fixtures`
positive/negative self-test as if the harness exists. **Action:** the green phase (G4) must build
the `--fixtures` harness (au13-style), not assume it. Also confirm the two new rules are genuinely
**file-scoped to `routine-scheduler.ts`** — a repo-wide "no `agent-selection` import" rule would
break the legitimately agent-owned files that import it (`agent-work-intent-worker.ts` included).

## LOW / notes (no revision required)
- Generic-path semantic change **skip → defer**: under old fire-time, owner-at-WIP-no-delegate
  dropped the occurrence; under new drain-time it creates a running run that defers. Disclosed in
  §9, within spec (spec permits documented intentional change; AC-2 "same outcome" is scoped to
  built-ins, which are unaffected). Acceptable — surface for conscious founder sign-off.
- `delegatedTo` removal from `FireResult` is safe: verified no external consumer reads it (only
  set/returned within `routine-scheduler.ts` itself).
- Delegation-repair (making generic-routine delegation work end-to-end for the first time) is a
  relocation of existing logic to the layer where it takes effect, not new complexity — the plan's
  recommendation to repair (over the owner-only fallback) is reasonable.

## 9-dimension scores
1. Problem framing & context — 5/5
2. Alternatives & decision justification (AU11 route-around) — 5/5
3. Boundary / ownership integrity — 4/5 (au13 solid; au6 deferral + fixtures gaps: W1, W4)
4. Correctness & failure modes — 3/5 (coalescing divergence + reaper/terminal-failure gap: W2, W3)
5. Testability / DoD mapping — 4/5 (strong; missing terminal-failure finalization test: W3)
6. Scope discipline — 4/5 (well-scoped; deferral needs registration: W1)
7. Simplicity / proportionality — 4/5 (2nd coalescing signal instead of reusing/unifying: W2)
8. Risk / trade-off honesty — 4/5 (honest on permanent-WIP; misses terminal-failure + divergence)
9. Factual accuracy of current-state claims — 4/5 (load-bearing claims verified; missed existing
   `shouldCoalesce` + its stale lore)

**Aggregate: sound decision, must revise for W1–W4 before build.**
