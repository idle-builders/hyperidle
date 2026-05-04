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
| CC-001 | Pre-existing lint baseline drift blocks every workpackage | H1 | H1-H4, I4, J1, J2, J3, J5, J6, L1 (8) | CONFIRMED | Pin a baseline-lint snapshot in `.pipeline/progress.json` (file-path + error-code set as of last green main). `verify` and DoD compare against the snapshot, not absolute zero — only NEW errors fail. Housekeeping workpackage to drain the baseline once the snapshot is in place. | (pending) |
| CC-002 | fs.watch flake in `packages/fabric/src/__tests__/file-watcher.test.ts` | A2 | A2, D4, D5, L1 (4) | CONFIRMED | Quarantine AC10 (`last-writer-wins` at line 449) and any remaining `fs.watch`-driven cases by porting them to `startPollingWatcher` (the AC4 debounce test already did this). If a true `fs.watch` integration test is required, gate it behind an env flag and exclude from the default `bun run test` set. | (pending) |
| CC-003 | ACs are happy-path; security & abuse cases land via review only | A2 | A2 (FK pragma, raw SQL), D5 (path traversal, bypassPermissions, env leak), H1-H4 (path traversal, SMTP relay, SSRF, DNS-rebind, compose default), H1-H4 (rate-limit on POST routes), L2 (javascript:/data: XSS via inline link href — scheme allowlist only covered images) (6+) | CONFIRMED | Add a "Security & abuse cases" required block to the plan template (`.claude/skills/plan/SKILL.md`). Default checklist: rate-limit on every POST/PATCH, input-trust boundary for any agent-authored field, secret-handling for any new credential surface, path-traversal for any path input, SSRF for any outbound URL, **scheme-allowlist row per untrusted-URL render target (img / a / iframe / video — listed separately, not collapsed)**. Plan is not green until each is either marked applicable+addressed or explicitly N/A with reason. | (pending) |
| CC-004 | Wiring gap — unit tests pass while production path is dead | H1 | H1-H4 (3 workpackages), H2 dispatcher fake-emit, I1 handoff atomicity, L2 (tautological version-bump + round-trip tests, hover broken via missing `group` class), L3 (tautological cross-tenant test asserting `status !== 403`, e2e selector `data-component` vs `data-ds-component` survived 4 reviews) (5+) | CONFIRMED | Add a "Production wiring proof" gate to DoD: every AC that produces or consumes an event/route/handler must show one test that drives the production entrypoint (the route, the bus emit, the registered handler) — not a fabricated event or injected fake. Disallow `bus.emit` inside files named `*.integration.test.ts` unless the emit is the system-under-test. | (pending) |
| CC-005 | Worktree lifecycle corrupts shared `node_modules` / breaks tooling | A2 | A2 (esbuild mismatch), A2 (`core` dump committed), D5 (better-sqlite3 native binaries), L1 (biome `!**/.worktrees` excludes everything from inside a worktree), L1 (192 untracked tsc artifacts — .d.ts/.js into source dirs, .gitignore gap), L1 (mid-session worktree relocation lost in-flight Step 2.5 progress), L3 (architect wrote concept docs to MAIN repo instead of worktree — cwd-confusion), L3 (`reuseExistingServer: !CI` silently bound e2es to stale main-checkout vite on :5173 → 9/9 false e2e failures) (8) | CONFIRMED | Wrap worktree exit in a script that (a) runs `bun install --force` on the host workspace after removal, (b) checks for stray binary/dump files before committing, (c) runs lint/check via the host project root, never the worktree cwd. Document in `.claude/skills/ship/SKILL.md` and add a `bun run worktree:cleanup` script. **Plus (new):** flip `playwright.config.ts` `reuseExistingServer` to `false` (or scope dev server to ephemeral port); add cwd-verification (`pwd && git status`) preamble to every agent that runs in worktree mode; extend `.gitignore` with `**/src/**/*.{d.ts,d.ts.map,js,js.map,tsbuildinfo}` and ensure all package tsconfigs declare `outDir`. | (pending) |
| CC-006 | Phantom failure counts — progress.json miscounts session resets as failed attempts | A2 | A2 (rework after revert), D4 (D5 marked blocked-after-3 with no retro evidence), D5 (same again) (3) | CONFIRMED | Distinguish `attemptCount` (real run that produced a verdict) from `sessionStartCount` in `.pipeline/progress.json`. Only increment `attemptCount` when a step writes a terminal status. Pipeline blocking threshold reads `attemptCount` only. | (pending) |
| CC-007 | Spec / codebase reality drift discovered at plan or write-tests time | I2 | I2 (Task 3c web WS client didn't exist), I4 (Kanban Hold/Review columns from spec memory not DOM), J2 (SUBMENU_CONFIG semantics), J4 (secondary menu labels diverged from I4), J7 (legacy k1/k2 protected fixtures), L1 (`agent_skill_autonomy` table never existed), L1 (Step 2 budgeted ~5h for 7 service rewrites; actual ~12 fixture files + Postgres parity + 6 HTML refs — dependent test fixtures not enumerated when dropping a column), L1 (UUIDv4 (createdAt, id) tiebreaker assumed lex-monotonic — it isn't), L3 (plan §8 promised tenant_id + `requireRole('agent')` but no tenant_id column or role concept exists in schema), L3 (plan §6.3 named services as agent-runtime entry path; impl kept logic inline in route handlers — silent deferral), L3 (plan §6.6/§9/§12 promised 2 ESLint rules; neither file shipped) (11) | CONFIRMED | Add an explicit "Plan reconciliation" step to `.claude/skills/plan/SKILL.md`: before locking the plan, the architect agent must (a) `grep` for every named table/route/component the spec references, (b) read the current rendered DOM / OpenAPI / schema for any UI- or API-touching ACs, (c) list each spec assumption that disagreed with reality and how the plan handles it. **(Already partially landed: `.claude/skills/architecture/SKILL.md` §Phase 1 has the reconciliation step. Recurrences continue → reconciliation needs to (i) cover cross-cutting concerns like multi-tenancy/RBAC explicitly, (ii) walk every test fixture seeding a dropped column, (iii) treat plan §1-promises as contracts whose deferral requires named trigger.)** | (partial — `architecture/SKILL.md` Phase 1; needs cross-cutting + fixture-walk extensions) |
| CC-008 | Protected-test contracts drift from later spec changes | J1 | J1 (KeyValue.test.tsx modified), J2 (rail neutral total-bets workaround), J7 (LEGACY_DETAILS map for k1/k2), L1 (DoD ran only threads.spec.ts; CI ran the full e2e directory and 11 legacy J4/J8 specs failed — protected-test list did not enumerate every existing e2e file the impl might break), L3 (eslint rules promised in plan silently dropped because not in protected-tests as presence-of-file check) (5) | CONFIRMED | Plans must enumerate a `protectedTests: string[]` field listing the test files whose assertions must not change. DoD audits the protected set with `git diff --name-only`. When a contract genuinely needs to drift, the plan must include an explicit "spec-owner approval" line item, not a silent compensating LEGACY map. **(New extension):** the protected-tests list must include every existing e2e spec file in `packages/web/e2e/` that touches a surface the workpackage might affect — and DoD must run `bun playwright test` over the whole directory, not just the workpackage's spec. Plan-promised eslint rules / config files / migration files belong in the same list as presence-of-file unit tests. | (pending) |
| CC-009 | Multi-agent parallel review finds non-overlapping bug classes | A2 | A2, D4, D5, H1, I1, I2, I3, I4, J1, L1, L2 (6 distinct critical classes: hover-group, slugger purity, javascript: XSS, MAX_BODY_BYTES UTF-16-vs-UTF-8, dead PARSER_VERSION, tautological version-bump tests), L3 (architecture B1-B3 + adversary B5-B6 + security HIGH-1/HIGH-2 + design B1-B2 — all complementary, none overlapping; 11 distinct criticals) (12) | CONFIRMED (success — protect) | Do not consolidate the architect + adversary + security + simplify + design reviewers into fewer agents. Document in `.claude/skills/review/SKILL.md` that each reviewer surfaces a distinct attack surface; removing any one ships bugs the others would have missed. **Reinforced 3× in this session — every parallel review run produced N distinct, non-overlapping critical classes. Strongly protect.** | (pending) |
| CC-010 | TDD red-then-green produces working code on first or second attempt | D4 | D4 (75 tests green first integration), D5 (13 tests green), I2, I3, I4, J1, L1 (8 commits with red-phase commit before each implementation; DoD took 3 loops but tests-first paid off), L2, L3 (concept-locking prevented mid-flight concept rewrites — adversary findings all shaped as "impl doesn't honor contract") (9+) | CONFIRMED (success — protect) | Preserve the strict red-phase-before-implementation gate in `.claude/skills/implement/SKILL.md` and the `write-tests` skill. Do not allow workpackages to merge implementation commits before a red-phase commit exists in the branch. **L3 specifically: concept-first locking turned 5 critical adversary findings into "align code to locked spec" instead of "rewrite the spec mid-implementation" — preserve /concept → /design → /architecture sequencing as a process anchor.** | (pending) |
| CC-011 | Lint should run inside `verify`, before DoD | L1 | L1 (auto-fixable lint blocked DoD), I4 polish commit (extracted noop helper to drain lint), J3 (lint drift made AC unverifiable) (3) | CONFIRMED | Update `.claude/skills/verify/SKILL.md` so `verify` runs `bun run lint` (auto-fix where safe) before any DoD audit. DoD treats post-verify lint output as authoritative. Combined with CC-001's baseline snapshot, this means DoD never sees auto-fixable noise. | (pending) |
| CC-012 | UNKNOWN fallback for exhaustive switch/map components | I4 | I4 (StatusChip Adversary W4), J1 (StatusChip kind UNKNOWN) (2) | EMERGING | Watch for a third occurrence. Candidate fix: add a `primitives-checklist.md` rule that every exhaustive `kind`/`status` map must ship with a `KNOWN_X` allowlist + neutral fallback chip + a test that renders the unknown case. | (pending) |
| CC-013 | `bypassPermissions` / Claude SDK security surface in agent runtime | D5 | D5 (entry 23 + 32 — two distinct findings on same surface) (2) | EMERGING | Watch for next agent-runtime workpackage (M-track or follow-up). Candidate fix: a dedicated security review pass on `packages/server/src/agent-runtime/*` plus a sandbox/allowlist before any new caller adopts the SDK. | (pending) |
| CC-014 | `/verify` does not actually execute Playwright; e2e selector / runtime mismatches survive into DoD | L3 | L3 (e2e `[data-component='ArtifactX']` vs `[data-ds-component='ArtifactX']` survived RED→GREEN→4 reviews, caught by DoD), L1 (Playwright job on CI is the first runner that proves anything; local verify never ran it), L2 (block-render.spec.ts assertions timed out in CI because no surface renders Block — caught only at CI) (3) | CONFIRMED | Update `.claude/skills/verify/SKILL.md`: step 5 (`cd packages/web && npx playwright test`) is **mandatory** when ANY file under `packages/web/`, `packages/design-system/`, or `packages/server/src/routes/` changed (not just `packages/web/`). The current "if web/ files changed" wording is being interpreted too narrowly. Verify must report Playwright PASS/FAIL on every run; missing Playwright run = NOT VERIFIED. Pair with CC-015's full-suite DoD rule. | (pending) |
| CC-015 | DoD scope mismatch — local DoD runs the workpackage's spec only; CI runs the whole e2e directory and finds breakage | L1 | L1 (DoD ran only threads.spec.ts; CI failed on 11 legacy J4/J8 specs — entire pipeline blocked at merge), L3 (e2e selector mismatch slipped through because DoD ran workpackage-scoped tests only) (2 → escalates to 3 with L2 block-render fixme) | CONFIRMED | Update `.claude/skills/check-definition-of-done/SKILL.md` step 51 to require running the **full** Playwright suite (`cd packages/web && npx playwright test` with no filter) before issuing DONE. Workpackage-scoped runs are for iteration; the final DoD audit must match CI's scope. Combine with CC-008's protected-tests extension so plans enumerate every existing e2e file the impl may break. | (pending) |
| CC-016 | Autonomous /pipeline mode lacks a defined owner for protected-branch merges; sub-agents merge PRs after CI green per /ship convention | L2 | L2 (sub-agent merged PR #34 after CI green; harness flagged as missing user-confirmation) (1) | EMERGING | Watch for second occurrence. Candidate fix: `.claude/skills/ship/SKILL.md` and `.claude/skills/pipeline/SKILL.md` must distinguish between "auto-merge enabled by GitHub once CI green" (acceptable in autonomous mode) and "agent invokes `gh pr merge --admin`" (requires explicit user confirmation, even in auto-mode, per CLAUDE.md auto-mode rule 5: "destructive actions still need explicit user confirmation"). Decision needed: does merging to main count as destructive? Human steer required. | (pending) — needs human steer |
| CC-017 | Concurrent workpackages editing shared docs cause rebase storms when PRs land out of order | L3 | L3 (L2 PR #34 merged 8 min before L1's push, 9 conflicts on shared docs) (1) | EMERGING | Watch for second occurrence. Candidate fix: `.claude/skills/pipeline/SKILL.md` adds a "rebase-before-PR" step when two parallel workpackages declare overlapping doc paths in their plans. Plans must declare `docsTouched: string[]` so the orchestrator can detect the conflict before opening the second PR. | (pending) |
| CC-018 | E2E tests authored without a host surface that renders the primitive — assertions time out in CI | L2 | L2 (block-render.spec.ts timed out, no surface renders Block, resolved with test.fixme + L2-FU-8), L3 (inverse pattern resolved by adding `_dev/ArtifactDemo.tsx` host page — primitive's e2es passed because the dev-host page exercised the same DOM production will render) (2) | EMERGING | Watch for third occurrence. Candidate fix: `.claude/skills/architecture/SKILL.md` adds a "primitive host" rule: when a workpackage produces a primitive whose downstream consumers (e.g., L11/L12) aren't built yet, the plan MUST include either (a) a `_dev/<Primitive>Demo.tsx` host page mounted in `packages/web/src/router.tsx` with a `@lore` deletion trigger, OR (b) `test.fixme` placeholders with named follow-up IDs. The L3 dev-host-page pattern is preferred (it actually exercises the DOM); the L2 fixme pattern leaves coverage gaps. | (pending) — promote on next occurrence |
| CC-019 | `bun test <file>` (Bun's native runner) used instead of `bun run test <file>` (Vitest) — CLAUDE.md forbids it but the orchestrator still hits it | L1 | L1 (orchestrator hit this twice in one session; native runner returned 30/1 because L1 tests use vi.stubEnv + vitest expect) (1, but CLAUDE.md rule already exists) | EMERGING | Watch for second occurrence. Candidate fix: when a sub-agent reports test failures, the **first** verification step in `.claude/skills/verify/SKILL.md` must be "is the runner the same one the test was authored against?" — before chasing the actual failure. Could also add a `bun-test` shim that prints a warning and forwards to `bun run test`. The CLAUDE.md rule isn't sticky enough; consider lifting it into the verify skill body or a pre-test hook. | (pending) |

---

## How to verify resolution

### CC-001 — Lint baseline drift
**Resolved looks like:** future retros stop listing "pre-existing lint errors blocked verify" or "lint baseline drifted N→N+1" as friction. `progress.json` shows a `lintBaseline` block, and workpackages that touch lint either reduce it or are explicitly housekeeping. If a workpackage still mentions baseline lint as friction with the snapshot present, the snapshot logic is wrong → mark RECURRED.

### CC-002 — fs.watch flake
**Resolved looks like:** no new retro mentions `file-watcher.test.ts` flaking, `fs.watch`, `flaky-test`, or "rerun" in connection with the fabric package. AC10 has been moved to `startPollingWatcher` or quarantined behind an env flag. If a future retro flags the same test path again with the fix in place, mark RECURRED — the move was incomplete.

### CC-003 — Happy-path ACs
**Resolved looks like:** plan documents include a populated "Security & abuse cases" section per route/handler. Security review surfaces zero new HIGH/CRITICAL findings on routes (only on novel architectural surfaces). Retros stop saying "security review found findings not in plan ACs."

### CC-004 — Wiring gap
**Resolved looks like:** retros stop reporting "test green but production broken." DoD audits include a "production wiring proof" line item that names the production entrypoint touched by each AC's test. If retros still mention `fake-emit`, `injected fake`, or `dead handler` after the gate is in, mark RECURRED.

### CC-005 — Worktree corruption
**Resolved looks like:** retros stop mentioning `bun install --force` after worktree cleanup, no more stray binary commits, `bun run lint` works from any cwd. A `worktree:cleanup` script exists and is documented. The biome `!**/.worktrees` issue is fixed (config no longer makes the host config unusable from inside a worktree).

### CC-006 — Phantom failures
**Resolved looks like:** the next time pipeline blocks a workpackage "after 3 attempts," the retro log contains 3 distinct attempt records with terminal verdicts. Session resets do not increment `attemptCount`. Retros stop reporting "no actual prior attempts in retro-log."

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
**Promoted to CONFIRMED if:** a third workpackage flags a missing UNKNOWN/fallback path on an exhaustive map. Until then, no action.

### CC-013 — bypassPermissions security surface (emerging)
**Promoted to CONFIRMED if:** another workpackage touches `agent-runtime/*` and surfaces a related security finding. Until then, the existing D5-followups.md item is the bookmark.

### CC-014 — /verify doesn't run Playwright
**Resolved looks like:** retros stop reporting "e2e selector mismatch survived N reviews" or "Playwright job on CI is the first runner that proves anything." Verify skill output always includes Playwright PASS/FAIL when web/design-system/server-routes files changed. If retros still mention DoD as the first gate to discover broken e2es after the fix lands, mark RECURRED — verify isn't running it.

### CC-015 — DoD scope mismatch
**Resolved looks like:** retros stop reporting "DoD ran only X.spec.ts; CI ran the whole directory and broke." DoD audit always runs the unfiltered Playwright suite. If a workpackage is marked DONE locally but CI fails on legacy specs, mark RECURRED.

### CC-016 — Autonomous protected-merge owner
**Promoted to CONFIRMED if:** a second workpackage has a sub-agent merge a protected PR without confirmation. Until then, this needs a human steer: in /pipeline auto-mode, who owns the merge? Recommended decision: agents may enable GitHub auto-merge but never invoke `gh pr merge --admin` themselves; document in ship skill.

### CC-017 — Rebase storms on shared docs
**Promoted to CONFIRMED if:** a third concurrent-workpackage rebase conflict happens. Until then, watch.

### CC-018 — E2E without host surface
**Promoted to CONFIRMED if:** a third primitive-without-consumer workpackage ships e2es that can't run. Decision the architecture template needs: dev-host pages (L3) over test.fixme placeholders (L2).

### CC-019 — bun test vs bun run test
**Promoted to CONFIRMED if:** a second workpackage-session hits the runner confusion. The CLAUDE.md rule isn't enough; the verify skill needs a guard.

---

## RESOLVED

(none yet — first resolutions will be logged here as fixes land)

---

## RECURRED

(none yet — track here if a RESOLVED candidate flares again)
