# Implementation re-review (post-fix, post-rebase)

Focused re-verification of the applied blocking fix, three non-blocking fixes, and the rebase.
Read-only; every probe reverted and `git status --porcelain` confirmed empty after each.
HEAD `d6659d61`, rebased onto `origin/main` @ `f2552361`.

Persisted by the orchestrator: the reviewer is read-only and returns findings as text.

## Verdict

**DONE — no blocking finding.** One non-blocking defect, four follow-up notes.

---

## 1. The re-homed protected test — VERIFIED LIVE

Assertions are **byte-identical** to the original. Extracted from
`git show 0791c4fd:layers/core-api/src/services/__tests__/agent-work-intent-worker.routine-selection.integration.test.ts`
(case at `:216`) and compared against
`layers/agent-orchestration/session-requests/src/__tests__/agent-session-requests.integration.test.ts:432`.
Identical: two `enqueueWorkIntent` calls with the same five fields, `expect(second.id).toBe(first.id)`,
the `select().from(agentWorkIntents).where(eq(sourceId, runId))`, `expect(rows).toHaveLength(1)`,
the same `runId` literal and `idempotencyKey` template. Only the arrangement changed — `seedRoutineWorld()`
and `insertRoutineRun()` dropped, `ownerAgentId` now a literal.

The FK claim holds: `framework/db/src/schema.ts:366-395` declares exactly one reference on
`agent_work_intents` (`request_id → agent_session_requests.id`). `source_id` (`:373`) and
`requested_by` (`:374`) are bare `text`. The dropped routine world served the four delegate-selection
cases, not this one.

Ownership is right — `governance/table-owners.json:41` maps `agentWorkIntents` to `session-requests`,
so the re-homed case sits in the owning package writing its own table.

## 2. Does it bite? — REPRODUCED; yes

The builder's report is accurate. Commenting out `session-requests/src/service.ts:944-955` (the `existing`
select and early return) leaves the test **GREEN** — `onConflictDoNothing()`, the
`agent_work_intents_identity_uq` index (`schema.ts:396-402`) and the raced-select fallback
(`service.ts:974-985`) reproduce the observable behaviour.

Second probe: early return left in place, identity corrupted at the insert
(`idempotencyKey: input.idempotencyKey + randomUUID()`) → **RED** at the id assertion:

```
AssertionError: expected 'b837ae78-…' to be '0459f98a-…'
  at agent-session-requests.integration.test.ts:448
```

The test fails when the guarantee is genuinely broken and passes when only a redundant implementation
path is removed. That is the correct shape for a behaviour test.

**Judgement on the builder's honest question — the protection is NOT weaker than it looks, and no
distinguishing assertion is needed:**

- The early return's predicate is **three** columns (kind, sourceId, idempotencyKey); the unique index is
  **four** (adds `sourceKind`). They are *not* equivalent in general — the early return dedups strictly more.
- That divergence is unreachable in production. `framework/shared/src/agent-work-intent-recorder.ts:286-340`
  is a discriminated union pinning each `kind` to exactly one `sourceKind`. Every production
  `enqueueWorkIntent` call site hardcodes the union's pair, so with `sourceKind` a function of `kind` the
  three- and four-column identities coincide for every producible input.
- The deleted original had the same (absent) discrimination. Re-homing restored exactly the protection
  AU21 §14 held — no more, no less. Pinning the early return specifically would increase coverage past
  the protected baseline, outside this work package's scope.

Scope discipline was correct.

## 3. The three deleted barrel type exports — VERIFIED LIVE

`rg -a` across `layers/ framework/ applications/ tools/ scripts/`:

| type | remaining occurrences |
|---|---|
| `EndSessionByCasInput` | `run-orchestration/src/session-store.ts:144` (decl), `:184` (param) |
| `RunSummary` | `run-orchestration/src/session-store.ts:118` (decl), `:133` (return type) |
| `LogPropagationEntry` | `policy/src/lifecycle-propagation.ts:187` (decl), `:212` (param) |

Zero consumers outside the defining module, production or test. Each remains exported from its own module,
which its function signature needs. `check` PASS (35 packages), `knip` and `knip:production` exit 0.

## 4. The corrected comments — VERIFIED LIVE

`layers/core-api/src/service-bootstrap.ts:487-492` now states the retention root delegates every per-table
delete to an owner and performs no table access itself. True: the five sweep lines (`:500-513`) call
`reapExpiredCredentials`, `reap`, `reapAccessLog`, `reapTerminalPropagationLog`,
`reapTerminalTaskDispatchAttempts`, and `:23` imports from `@hyperidle/db` as `import type` only — no table
symbol is in scope in the file at all.

`tools/eval/src/scenarios/delegation.ts:12-24` now says delegation no longer exists and
`resolveRoutineRunRequest` always targets `routine.ownerAgentId`. True:
`layers/core-api/routine/src/routine-service.ts:351` is `const selectedAgentId = routine.ownerAgentId;`
with no branch; `selectRoutineDelegate` and `listAgentIdsBySkill` have zero references tree-wide.
See NBD-A — the header is fixed, four statements further down the same file are not.

## 5. The rebase — VERIFIED LIVE, cost nothing

The branch's own changeset before and after the replay:

- pre-rebase `git diff 0791c4fd d4972dbd -- . ':(exclude).verify-attestations'`
- post-rebase `git diff f2552361 0e7ab4bb -- . ':(exclude).verify-attestations'`

Both 94 files; the two patches are **byte-identical** (649,591 bytes each, `diff -q` clean). Every hunk the
branch contributes survived unchanged.

No silent loss of main's content either: files main gained in `0791c4fd..f2552361` (92) versus files the
branch changes (94) — the intersection is **empty**, so no resolution could have dropped a main change.

The attestation validates. `.verify-attestations/` holds exactly one file. Dropping main's is not a
resolution artefact — `scripts/verify-attest.ts:244-250` unlinks every attestation except the one it writes,
by design. The source fingerprint recomputed exactly as `check-attestation.ts:45-57` does yields
`390b92e5304af151cf82fd96d805f899b14c7c053d218253abfae336ce7c019a`, matching the attestation's `srcHash`.
`scope: "affected"`; per-merge CI (`.github/workflows/ci.yml:120`) does not require `full` (only
`release-guard.yml:111` does). Timestamp is after the replay, so verify genuinely re-ran post-rebase.

`package-lock.json` is absent from `git diff --name-only f2552361 HEAD` — genuinely unchanged.

## 6. The fixture linter — VERIFIED LIVE, proven red

Correction to the framing: `governance-lint --fixtures` is a **self-test of the detector against a synthetic
tree** (63 cases), not a scan of real fixtures. What catches a fixture arranging an impossible state is the
companion clause (`governance/decided-rules.json:739,776` — Ruling 13's `write-the-whole-row-set`),
implemented at `scripts/lib/crossing-detectors.ts:366` and enforced by the default pass over all 2,573
development files.

Both new test files arrange the companion pair (`session-store.integration.test.ts:48-55`,
`task-dispatch-attempt-store.integration.test.ts:62-69`). Proved covered rather than skipped by deleting the
`teamMembers` insert:

```
ERROR  [crossing-table-write] …/session-store.integration.test.ts:48:
  service → db:table (other) [table:write] development — `insert(teams)` — writes the table.
  writing teams without teamMembers builds a state production cannot produce
governance-lint: FAIL — 1 error(s).
```

Restored; PASS returns. The re-homed case writes only its own package's table, so it carries no companion
obligation.

## 7. Governance — RE-MEASURED LIVE, every figure exact

`npx tsx scripts/governance-lint.ts` → **PASS**, 3,361 tracked files (788 production, 2,573 development),
34 packages, 8,138 crossings, 19 rules.

- **90 production + 0 development** known violations across 34 files
- **13 rule groups**, **zero `db:table` groups**
- `layer → service (other layer) [import]` = **35 across 24 files**

## Other checks

- **A3 still distinguishes count-based from max-based.** Replacing `existing.length + 1` with
  `max(ordinal) + 1` at `work-service.ts:86-97` → `FAIL … expected 10 to be 2`. Identity-addressing bought
  stability without costing the distinction.
- **No work-package id leakage.** Eleven `AU30` occurrences outside `.pipeline/**`, all inside `@lore`
  comments (the sole exemption). No identifier, filename, or commit message across the fifteen replayed
  commits.

| gate | result |
|---|---|
| `npm run check` | PASS — 35/35 packages, 0 errors |
| `npm run lint` | PASS (biome + eslint + all three governance passes) |
| `knip` / `knip:production` / `deps:check` / `mock-inventory:check` | exit 0 each |
| `npm run test:integration:service` | 323 files passed, 1 skipped; 2,795 tests passed, 4 skipped |
| `npm run test:full` | 563 files passed; 6,209 tests passed |

---

## NON-BLOCKING DEFECT

### NBD-A — the delegation-eval fix corrected the header and left four copies of the same falsehood in the same file

`tools/eval/src/scenarios/delegation.ts`. Commit `7f704cbe` rewrote the header precisely because it pointed
at a deleted suite and implied delegate selection still happens. Four in-file statements still claim it:

- `:93` — `description:` string: "delegate resolution moved to drain-time (not observable from this eval —
  see the real integration suite)". The suite is deleted; there is no delegate resolution.
- `:177` — dimension `label`: "Intent Recorded With Owner Hint (delegate resolution deferred to drain)".
- `:180-182` — comment: "the drain resolver (`agent-work-intent-worker.ts`) is the only place that ever picks
  the delegate." That module does not exist on disk, and nothing anywhere picks a delegate.
- `:377` — judge note: "expected fire — delegationAllowed is drain-time only now".

**Impact.** `description` and `label` are eval-report **output**, not just comments, so a reader of a run
report is told the system does something it cannot do. Governing authority: `architecture.md:880-881` —
"fix the comment at every file this pull request already edits" — and this pull request edits this file
twice, for exactly this reason.

---

## Follow-up notes (not assigned)

- `layers/core-api/src/services/__tests__/routine-scheduler.au15.integration.test.ts:8` still
  cross-references the deleted routine-selection suite as a live "sibling". The branch does not edit this
  file, so the fix-what-you-touch rule does not reach it.
- `tools/eval/src/scenarios/delegation.ts:111-117` still seeds a `"Delegate Agent"` no assertion can observe.
  Harmless fixture; the header now discloses the names are historical.
- `session-stream-hub.ts:72` still answers an existence question through `findSessionById`'s 18-column
  select. Filed non-blocking in the first review; correctly not fixed.
- The dedup guarantee rests on two mechanisms with **different predicate widths** (3-column early return,
  4-column index). They agree for every reachable input because `AgentWorkIntentRecorderInput` pins
  `sourceKind` to `kind` — but `WorkIntentInput` (`session-requests/src/service.ts:1381-1395`) is a flat type
  that does not. If the early return is ever removed as "redundant", that equivalence is what needs
  re-checking.
