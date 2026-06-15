# Architecture Critique: AH4 — Teams and agents land in the org chart

ARCHITECTURE-SCORE: 8/10 rounds=0 score-line: SA:9 LI:9 AC:9 DM:9 N:8 MD:8 FMC:6 S:9 V:8

Verdict: **APPROVED** (8/10, no unresolved CRITICAL).

## CRITICAL
- None.

## WARNING

- **[§Design-it-twice / org-edges.ts:76-94] TOCTOU in `upsertOrgEdge`.** Select-then-insert with no `onConflict` and no catch. The composite unique index prevents duplicate *rows* but not a *thrown* unique-constraint violation when two writers race (real on the pg Pool). The plan's claim "the unique index guarantees no duplicate even if creation runs twice" is true for rows, false for not-throwing. Acceptable to ship (exactly mirrors the existing protected `PUT /edges` pattern; single-founder low-concurrency path that short-circuits on first-existing-team), but the plan must stop claiming race-safety it lacks. Recommended fix: add `.onConflictDoNothing({target:[fromUserId,mechanism,target]})` + re-select — cheap, closes the window for BOTH call sites (org.ts gets refactored onto the helper), genuinely idempotent.

- **[§Founder resolution / §Security] Best-effort edge write can silently reproduce the orphan AH4 exists to kill.** If `resolveFounderId` returns null, the edge is silently skipped and the team is orphaned — the exact AC3 failure mode. The welcome-message best-effort precedent is a weak analogy (cosmetic vs load-bearing). Near-zero in practice (requires a DB with zero human users), but the skip must be LOUD: `observability.warn(...)` (not console) on null founder. Keep creation non-fatal; make the skip detectable. Update §Failure-Mode accordingly.

- **[§AC verification AC5/AC6] Playwright proof tier unspecified vs AH5.** Plan says these "ride AH5 live-lane infra" but AH5 is separate and not-yet-built. No LLM is on the org-edge path, so these specs should assert against the real Hono app + real SQLite (integration-style E2E), NOT block on the AH5 real-model lane. Reinterpreting "open the org chart" → Settings → Org Chart edge table is legitimate (verified: no standalone graph view exists). Clarify the tier so AH4 doesn't block on AH5.

## SUGGESTION

- **[§Security bullet 2 / Risk 4] FK 500 on bad teamId — fix, don't defer.** Verified: `POST /api/agents` (agents.ts:279-294) inserts `teamId` with no existence pre-check → 500 on a stale/deleted `teamMembers.id`. AH4 introduces the first user-controlled picker feeding this. Add a ~4-line existence check returning 422. Adjudicating Risk 4: fix on this surface.
- **[Risk 3] Zero-teams explicit-orphan: allow, but make it active.** Don't hard-block; make "create unassigned agent" an explicit affordance rather than a fall-through past a disabled option. Design refinement, not an arch blocker.
- **[§Founder resolution path 2 / Risk 2] Body-userId fallback: acceptable.** `c.get("userId")` (typed non-optional, auth.ts:48) always wins in shared mode; body path only reachable in local single-founder mode (no adversary). Not a regression.
- **[§Ordered tasks 2] Preserve 201/200 split in PUT /edges refactor.** Map `created ? 201 : 200` from the helper's flag; protected test `org.routes.integration.test.ts` will catch drift — call it out in Task 2's proof line.

## What's Working Well
- Design-it-twice is real, not theatre. Shared `upsertOrgEdge` helper + keep org.ts's mechanism-specific target validation at its own untrusted boundary is the correct factoring. Security reasoning (server-derived `teamMembersId` → no injection surface) verified.
- Spec-vs-reality reconciliation is rigorous and accurate. Every spot-checked claim held: agents.ts:57 teamId, org.ts:58-64 teams shape, schema.ts:528 unique index tuple, org.ts:119-132 team→teamMembers.id validation, SettingsAgents.tsx:246-253 orphan path, no standalone graph view. Strongest part of the plan.

## Builder must-heed
1. Resolve the Select label-source contradiction (design WARNING 1) — pass `label="Team"` to Select.
2. Add `onConflictDoNothing` to `upsertOrgEdge` insert (race + true idempotency).
3. Log a warning (observability, not console) when founderId is null instead of silent skip.
4. Add a 422 existence check for `teamId` in POST /api/agents.
5. Preserve 201-on-create / 200-on-existing in the PUT /edges refactor.
6. Playwright specs run against real Hono+SQLite (not AH5 real-model lane); don't block AH4 on AH5.
