# Compound Candidates Tracker

This file is the durable cross-retro index of recurring patterns surfaced by the compound agent. Each row represents a distinct friction or systemic behaviour observed in `.pipeline/retro-log.jsonl`.

**Status legend**
- `CONFIRMED` — 3+ occurrences, evidence threshold met. Fix proposed.
- `EMERGING` — 2 occurrences. Watching, no action yet.
- `RESOLVED` — fix landed and recent retros no longer flag it.
- `RECURRED` — was RESOLVED but reappeared. Indicates the original fix did not stick.

**Use:** before adding a `compoundCandidates` array to a retro entry, scan this file. If a friction matches an existing row, reference its `ID` rather than re-stating it.

---

## CONFIRMED & EMERGING

| ID | Title | First seen | Recurrence | Status | Proposed fix | Resolved by |
|----|-------|------------|------------|--------|--------------|-------------|
| CC-001 | Pre-existing lint baseline drift blocks every story | H1 | H1-H4, I4, J1, J2, J3, J5, J6, L1 (8) | CONFIRMED | Pin a baseline-lint snapshot in `.pipeline/progress.json` (file-path + error-code set as of last green main). `verify` and DoD compare against the snapshot, not absolute zero — only NEW errors fail. Housekeeping story to drain the baseline once the snapshot is in place. | (pending) |
| CC-002 | fs.watch flake in `packages/fabric/src/__tests__/file-watcher.test.ts` | A2 | A2, D4, D5, L1 (4) | CONFIRMED | Quarantine AC10 (`last-writer-wins` at line 449) and any remaining `fs.watch`-driven cases by porting them to `startPollingWatcher` (the AC4 debounce test already did this). If a true `fs.watch` integration test is required, gate it behind an env flag and exclude from the default `bun run test` set. | (pending) |
| CC-003 | ACs are happy-path; security & abuse cases land via review only | A2 | A2 (FK pragma, raw SQL), D5 (path traversal, bypassPermissions, env leak), H1-H4 (path traversal, SMTP relay, SSRF, DNS-rebind, compose default), H1-H4 (rate-limit on POST routes) (5+) | CONFIRMED | Add a "Security & abuse cases" required block to the plan template (`.claude/skills/plan/SKILL.md`). Default checklist: rate-limit on every POST/PATCH, input-trust boundary for any agent-authored field, secret-handling for any new credential surface, path-traversal for any path input, SSRF for any outbound URL. Plan is not green until each is either marked applicable+addressed or explicitly N/A with reason. | (pending) |
| CC-004 | Wiring gap — unit tests pass while production path is dead | H1 | H1-H4 (3 stories), H2 dispatcher fake-emit, I1 handoff atomicity (3) | CONFIRMED | Add a "Production wiring proof" gate to DoD: every AC that produces or consumes an event/route/handler must show one test that drives the production entrypoint (the route, the bus emit, the registered handler) — not a fabricated event or injected fake. Disallow `bus.emit` inside files named `*.integration.test.ts` unless the emit is the system-under-test. | (pending) |
| CC-005 | Worktree lifecycle corrupts shared `node_modules` / breaks tooling | A2 | A2 (esbuild mismatch), A2 (`core` dump committed), D5 (better-sqlite3 native binaries), L1 (biome `!**/.worktrees` excludes everything from inside a worktree) (4) | CONFIRMED | Wrap worktree exit in a script that (a) runs `bun install --force` on the host workspace after removal, (b) checks for stray binary/dump files before committing, (c) runs lint/check via the host project root, never the worktree cwd. Document in `.claude/skills/ship/SKILL.md` and add a `bun run worktree:cleanup` script. | (pending) |
| CC-006 | Phantom failure counts — progress.json miscounts session resets as failed attempts | A2 | A2 (rework after revert), D4 (D5 marked blocked-after-3 with no retro evidence), D5 (same again) (3) | CONFIRMED | Distinguish `attemptCount` (real run that produced a verdict) from `sessionStartCount` in `.pipeline/progress.json`. Only increment `attemptCount` when a step writes a terminal status. Pipeline blocking threshold reads `attemptCount` only. | (pending) |
| CC-007 | Spec / codebase reality drift discovered at plan or write-tests time | I2 | I2 (Task 3c web WS client didn't exist), I4 (Kanban Hold/Review columns from spec memory not DOM), J2 (SUBMENU_CONFIG semantics), J4 (secondary menu labels diverged from I4), J7 (legacy k1/k2 protected fixtures), L1 (`agent_skill_autonomy` table never existed) (6) | CONFIRMED | Add an explicit "Plan reconciliation" step to `.claude/skills/plan/SKILL.md`: before locking the plan, the architect agent must (a) `grep` for every named table/route/component the spec references, (b) read the current rendered DOM / OpenAPI / schema for any UI- or API-touching ACs, (c) list each spec assumption that disagreed with reality and how the plan handles it. | (pending) |
| CC-008 | Protected-test contracts drift from later spec changes | J1 | J1 (KeyValue.test.tsx modified), J2 (rail neutral total-bets workaround), J7 (LEGACY_DETAILS map for k1/k2) (3) | CONFIRMED | Plans must enumerate a `protectedTests: string[]` field listing the test files whose assertions must not change. DoD audits the protected set with `git diff --name-only`. When a contract genuinely needs to drift, the plan must include an explicit "spec-owner approval" line item, not a silent compensating LEGACY map. | (pending) |
| CC-009 | Multi-agent parallel review finds non-overlapping bug classes | A2 | A2, D4, D5, H1, I1, I2, I3, I4, J1, L1 (10) | CONFIRMED (success — protect) | Do not consolidate the architect + adversary + security + simplify + design reviewers into fewer agents. Document in `.claude/skills/review/SKILL.md` that each reviewer surfaces a distinct attack surface; removing any one ships bugs the others would have missed. | (pending) |
| CC-010 | TDD red-then-green produces working code on first or second attempt | D4 | D4 (75 tests green first integration), D5 (13 tests green), I2, I3, I4, J1, L1 (7+) | CONFIRMED (success — protect) | Preserve the strict red-phase-before-implementation gate in `.claude/skills/implement/SKILL.md` and the `write-tests` skill. Do not allow stories to merge implementation commits before a red-phase commit exists in the branch. | (pending) |
| CC-011 | Lint should run inside `verify`, before DoD | L1 | L1 (auto-fixable lint blocked DoD), I4 polish commit (extracted noop helper to drain lint), J3 (lint drift made AC unverifiable) (3) | CONFIRMED | Update `.claude/skills/verify/SKILL.md` so `verify` runs `bun run lint` (auto-fix where safe) before any DoD audit. DoD treats post-verify lint output as authoritative. Combined with CC-001's baseline snapshot, this means DoD never sees auto-fixable noise. | (pending) |
| CC-012 | UNKNOWN fallback for exhaustive switch/map components | I4 | I4 (StatusChip Adversary W4), J1 (StatusChip kind UNKNOWN) (2) | EMERGING | Watch for a third occurrence. Candidate fix: add a `primitives-checklist.md` rule that every exhaustive `kind`/`status` map must ship with a `KNOWN_X` allowlist + neutral fallback chip + a test that renders the unknown case. | (pending) |
| CC-013 | `bypassPermissions` / Claude SDK security surface in agent runtime | D5 | D5 (entry 23 + 32 — two distinct findings on same surface) (2) | EMERGING | Watch for next agent-runtime story (M-track or follow-up). Candidate fix: a dedicated security review pass on `packages/server/src/agent-runtime/*` plus a sandbox/allowlist before any new caller adopts the SDK. | (pending) |

---

## How to verify resolution

### CC-001 — Lint baseline drift
**Resolved looks like:** future retros stop listing "pre-existing lint errors blocked verify" or "lint baseline drifted N→N+1" as friction. `progress.json` shows a `lintBaseline` block, and stories that touch lint either reduce it or are explicitly housekeeping. If a story still mentions baseline lint as friction with the snapshot present, the snapshot logic is wrong → mark RECURRED.

### CC-002 — fs.watch flake
**Resolved looks like:** no new retro mentions `file-watcher.test.ts` flaking, `fs.watch`, `flaky-test`, or "rerun" in connection with the fabric package. AC10 has been moved to `startPollingWatcher` or quarantined behind an env flag. If a future retro flags the same test path again with the fix in place, mark RECURRED — the move was incomplete.

### CC-003 — Happy-path ACs
**Resolved looks like:** plan documents include a populated "Security & abuse cases" section per route/handler. Security review surfaces zero new HIGH/CRITICAL findings on routes (only on novel architectural surfaces). Retros stop saying "security review found findings not in plan ACs."

### CC-004 — Wiring gap
**Resolved looks like:** retros stop reporting "test green but production broken." DoD audits include a "production wiring proof" line item that names the production entrypoint touched by each AC's test. If retros still mention `fake-emit`, `injected fake`, or `dead handler` after the gate is in, mark RECURRED.

### CC-005 — Worktree corruption
**Resolved looks like:** retros stop mentioning `bun install --force` after worktree cleanup, no more stray binary commits, `bun run lint` works from any cwd. A `worktree:cleanup` script exists and is documented. The biome `!**/.worktrees` issue is fixed (config no longer makes the host config unusable from inside a worktree).

### CC-006 — Phantom failures
**Resolved looks like:** the next time pipeline blocks a story "after 3 attempts," the retro log contains 3 distinct attempt records with terminal verdicts. Session resets do not increment `attemptCount`. Retros stop reporting "no actual prior attempts in retro-log."

### CC-007 — Spec/reality drift
**Resolved looks like:** plan documents include a "Plan reconciliation" section listing every spec-vs-reality disagreement and how the plan handles each. Retros stop reporting "spec mentioned X but X doesn't exist" / "Kanban columns from spec memory not DOM." Architect adversary review on the plan catches disagreements before write-tests starts.

### CC-008 — Protected-test drift
**Resolved looks like:** plans carry a machine-checkable `protectedTests` list and DoD verifies it. No future retro reports "developer modified a protected test" or "compensating LEGACY map added silently." When contracts must change, the change is approved explicitly in the plan.

### CC-009 — Multi-agent review (success)
**Resolved (i.e., still working) looks like:** retros continue to report each reviewer finding a distinct class of bug. If a retro starts saying "consolidated single-agent review missed X," that's a regression of the protected practice — mark RECURRED with a note about which review was skipped.

### CC-010 — TDD red-green (success)
**Resolved (i.e., still working) looks like:** retros continue to report tests-first paid off, first-pass green, or red-phase commits before implementation. If a retro reports "tests written after the fact" or "no red-phase commit," mark RECURRED.

### CC-011 — Lint inside verify
**Resolved looks like:** retros stop noting that DoD blocked on auto-fixable lint. `verify` skill runs lint (with auto-fix) before DoD. Combined with CC-001, neither baseline drift nor auto-fixable lint reach DoD review.

### CC-012 — UNKNOWN fallback (emerging)
**Promoted to CONFIRMED if:** a third story flags a missing UNKNOWN/fallback path on an exhaustive map. Until then, no action.

### CC-013 — bypassPermissions security surface (emerging)
**Promoted to CONFIRMED if:** another story touches `agent-runtime/*` and surfaces a related security finding. Until then, the existing D5-followups.md item is the bookmark.

---

## RESOLVED

(none yet — first resolutions will be logged here as fixes land)

---

## RECURRED

(none yet — track here if a RESOLVED candidate flares again)
