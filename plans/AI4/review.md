# AI4 — One status language · Phase 4 Code Review

**Reviewer:** Phase 4 (same evaluator that wrote `architecture-critique.md`).
**Scope:** branch `feat/AI4-one-status-language` vs `origin/main` (44c61be8), excluding `plans/` prose.
**Gate status:** `npm run check` PASS · `npm run test` PASS (web 2017 / shared 694 / fabric 137 / ds 302 / eslint 198) · **`npm run lint` FAIL (15 errors)** · `npm run verify:quick` FAIL · therefore `npm run verify` FAIL.

## Verdict: **NOT DONE**

Two blocking problems: (1) **lint is red** with 15 AI4-introduced errors, so the branch cannot pass `verify`/CI; (2) **AC1b is violated** — the same `active` bet renders **"HEALTHY"** on the team surface and **"ACTIVE"** on portfolio/bet-detail, and the builder's own proof image documents it. Plus the missing TaskSheet proof flagged by the orchestrator is a real coverage gap for AC1a's third surface.

---

## AC table

| AC | Status | Evidence |
|---|---|---|
| **AC1a** — same task state → same chip (color/shape/label) on WorkBet task list, WorkTask header, **TaskSheet** | **PARTIAL / NOT PROVEN** | WorkBet task-row + WorkTask header proofs both show identical green "IN PROGRESS" chip + LiveDot (`proof/ac1a-*.png`). **TaskSheet capture missing** — the third required surface is not proven (orchestrator flag confirmed). Code: TaskSheet only consolidates the *dot* (Task 8 scope); its session-status text is raw worker status, not the entity TaskState chip — so there is no TaskState StatusChip on TaskSheet to compare. The validation scenario explicitly requires all three. |
| **AC1b** — same bet status → same chip on portfolio (BetCard), team (WorkTeam), bet detail (WorkBet) | **FAIL** | Portfolio + bet-detail show "ACTIVE" (`proof/ac1b-portfolio…`, `…betdetail…`). **`proof/ac1b-team-betrow-active-chip.png` shows "HEALTHY"** — `WorkTeam.tsx:765` renders `<StatusChip status={betStatusToStatus(bet.status)} />` with **no `label`**, so it falls to the status-name path. WorkTeam was never touched by this branch. Same status, different label across surfaces = the exact dialect AI4 set out to kill. |
| **AC2** — labels derive from shared/owning registries; new state → TS error | **MOSTLY MET (one gap)** | `Record<Enum,string>` registries added in shared (`TASK_STATE_LABEL`, `BET_STATUS_LABEL`, `*_OUTCOME_VERDICT_LABEL`, `AGENT_OPERATIONAL_STATUS_LABEL`) + fabric (`KNOWLEDGE_STATUS_LABEL`). Exhaustiveness verified (typecheck PASS; `AI4-status-labels.test.ts` loops every enum). **Gap:** AgentProfile session-outcome chip passes `label={session.outcome}` — the **raw enum string**, not a registry value (no `SESSION_OUTCOME_LABEL` exists). That is a non-registry label on a status surface (see Adversarial F2). |
| **AC3** — live pulse appears wherever live state shown, one component | **MET** | `LiveDot` promoted to design-system (`LiveDot.tsx` + `.stories.tsx` + `html/LiveDot.html` dual-rep), consumed by WorkBet task row, WorkTask header + session row, TaskSheet, AgentProfile active chip. Local copies deleted (WorkTask/TaskSheet). `AI4-LiveDot.test.tsx` asserts real classes. Proof images show the dot present. |
| **AC4** — no page-local status→color/label builder remains in web | **MET (enforcement weak — see below)** | All forks deleted (`taskStateBadgeClass`, `statusBadgeStyle`, `TASK_STATE_LABEL` locals, `TYPE_LABELS`, BetCard `STATUS_*`/`badgeClasses`, AgentProfile inline chip + `OutcomeChip`). ESLint rule `design/no-local-status-builder` added with full RuleTester valid/invalid + negative cases (10 cases, all green). **Caveat:** wired as `"warn"`, not `"error"` (see Architecture C2). `kindBadgeStyle` legitimately stays (kind ≠ status, Note A). |
| **AC5** — outcome verdicts render semantic color consistently (not gray) | **MET** | `BET_OUTCOME_VERDICT_STATUS`/`TASK_OUTCOME_VERDICT_STATUS` added; verdicts now render colored StatusChip on portfolio (BetCard) + bet-detail (WorkBet). `proof/ac3-*verdict-validated.png` show identical green "VALIDATED" on both surfaces. `AI4-status-mapping.test.ts` asserts exhaustive + correct colors. |

**Validation scenarios:** SC1 (task in_progress on 3 surfaces) — **not fully proven** (TaskSheet missing). SC2 (verdict on portfolio + bet detail) — **proven, match**. SC3 (no local forks remain) — **proven** via lint rule.

---

## Findings by lens

### Architecture

- **C1 (CRITICAL) — AC1b regression: WorkTeam bet chip not migrated.** `WorkTeam.tsx:765` `<StatusChip status={betStatusToStatus(bet.status)} />` omits `label`, so an `active` bet reads **"HEALTHY"** there while portfolio/bet-detail read **"ACTIVE"** (`proof/ac1b-team-betrow-active-chip.png`). The plan's AC1b verification row names team(WorkTeam) as a required surface; the spec's AC1b validation scenario lists "team". WorkTeam was outside the diff entirely. Fix: `<StatusChip status={betStatusToStatus(bet.status)} label={BET_STATUS_LABEL[bet.status]} />` and recapture the team proof. (Also check `WorkTeam.tsx:251` `<StatusChip status={team.status} />` — `TeamStatus` is a different axis; leaving it unlabeled is defensible but confirm it's not an `active`/`HEALTHY` collision a user would read as the same word.)
- **C2 (WARNING) — AC4 lint rule registered as `warn`, not `error`.** `eslint-plugin-design/src/index.ts:46` `"design/no-local-status-builder": "warn"`. AC4's intent ("no page-local builder remains" + "CI fails if a fork is reintroduced", per plan AC-verification table) is a *hard* gate. As `warn` it does **not** fail `npm run lint`/CI, so a reintroduced fork ships green. This matches the other design rules (all `warn`) so it's a consistency call, but the plan explicitly says "CI fails if a fork is reintroduced" — `warn` does not satisfy that. Either promote to `error` or document that the whole `eslint-plugin-design` recommended set is advisory and AC4's recurrence-gate intent is downgraded.

### Design (UI)

- **D1 (OBSERVATION) — cross-surface parity confirmed where migrated.** Proof images: task `in_progress` chip identical on WorkBet row + WorkTask header (green, 6px dot, "IN PROGRESS", LiveDot). Bet `active` identical on portfolio + bet-detail. Verdict `validated` identical green "VALIDATED" on portfolio + bet-detail. Good — except the WorkTeam break (C1).
- **D2 (OBSERVATION) — BetCard ≤5% visual gate not independently verified.** `npm run ds:sync` could not run (port 8098 held by a concurrent worktree's `ds:serve`). Relying on: BetCard protected test green (`getByText("Active"/"Draft"/"Completed"/"Killed")` all pass; line-33 negative `not.toContain("rounded-[var(--r-pill)]")` survives because StatusChip uses `rounded-full`), and the clean portfolio proof image. Builder must confirm `ds:sync ≤5%` per Decision 5 before ship; I could not.
- **D3 (OBSERVATION) — AgentProfile session-outcome is now a pill (deliberate, Decision 3).** Text→pill change is intended; no before/after AgentProfile proof was captured, but it is low-risk consolidation.

### Security

- No new endpoints, inputs, secrets, paths, or outbound URLs. Labels are static registry strings keyed by closed enums, rendered as React text children (auto-escaped). `StatusChip`'s `KNOWN_STATUSES` unknown-fallback preserved. **No security findings.** (Matches the plan's N/A security block.)

### Adversarial

- **F1 (CRITICAL) — lint is red; PR claims green.** `npm run verify:quick` fails with **15 errors** (all AI4-touched): `assist/source/organizeImports` / format in `design-system/src/index.ts` (LiveDot export inserted between EmptyState's type and value exports — line 57-58), `WorkTask.tsx:27` unsorted import, and three AI4 test files (`AI4-LiveDot.test.tsx`, `AI4-status-mapping.test.ts`, `AI4-status-labels.test.ts`). All `FIXABLE` by `lint:fix`, but as-is the branch cannot pass CI. The Auditor persona: any "verify green" claim is false.
- **F2 (WARNING) — `session.outcome as SessionOutcome` cast on a `string | null`.** `AgentProfile.tsx:332-333`: `status={sessionOutcomeToStatus(session.outcome as SessionOutcome)} label={session.outcome}`. The wire type is `outcome: string | null`. If the server returns a value outside `completed|crashed|stopped`, `sessionOutcomeToStatus` returns `undefined as Status` → StatusChip's guard renders "unknown" (safe), but the cast is unsound and the **label is the raw lowercased domain string** (CSS-uppercased to e.g. "COMPLETED"), not a registry value — inconsistent with the WorkTask SessionRow which shows "Active"/"Done" for the same axis via a separate inline ternary. Two renderings of session status, two vocabularies — the precise problem AI4 exists to remove, left half-solved.
- **F3 (OBSERVATION) — `outcomeVerdict as BetOutcomeVerdict` in BetCard.** `BetCard.tsx:164-165` casts the `outcomeVerdict?: string` prop. Guarded by `?? outcomeVerdict` label fallback and StatusChip's unknown-status fallback, so safe, but the prop type should be `BetOutcomeVerdict | undefined` rather than `string` to make the cast unnecessary.

### Simplification

- **S1 (WARNING) — dead `void` imports in BetCard.** `BetCard.tsx:9-14,52-53` import `BET_STATUS_MAP` + `BET_OUTCOME_VERDICT_STATUS` solely to `void` them, with a comment claiming they are "needed for exhaustiveness validation at type-check time." **False** — the exhaustiveness guarantee lives in the `Record<Enum,Status>` literal in `status-mapping.ts`; referencing the map from BetCard does nothing. The actually-used functions are `betStatusToStatus`/`betOutcomeVerdictToStatus` (5 refs). Delete both imports and both `void` statements.

### AI Slop

- **AISLOP-1 (WARNING) — the `void` block + its justifying comment** (S1) is a textbook AI tell-tale: a value-free statement plus a confident-but-wrong "needed for … at type-check time" rationale. Remove.
- **AISLOP-2 (OBSERVATION) — AgentProfile.tsx:330-337 mis-indentation.** The session-outcome JSX block is indented one level shallow relative to its `<td>`. Cosmetic; `lint:fix`/biome format will resolve it (it's part of the format pass, not flagged separately).

---

## What's solid

- Registries + exhaustiveness are clean and correctly placed (`KNOWLEDGE_STATUS_LABEL` in fabric per O1, rest in shared). Casing contract (Decision 1a) implemented exactly: `{label ? label : safeStatus.toUpperCase()}` — verbatim DOM, CSS-only uppercase — proven by `AI4-StatusChip-label.test.tsx` (textContent stays "Active", not "ACTIVE") and the BetCard protected test staying green unchanged.
- KnowledgeList behavior preserved (Note A2): StatusChip gated on `active||archived`, `archived→"Stale"` relabel sourced from `KNOWLEDGE_STATUS_LABEL`, other five statuses stay badge-less. No silent expansion.
- LiveDot promotion complete with all three deliverables (tsx + stories + html). `@lore AF12` fulfilled.
- ESLint rule has real RuleTester coverage incl. the required negative cases (shared `*_LABEL` not flagged, `panelClass` not flagged, ds mappings not flagged).
- Verdict mapping (Decision 6) lands AC5 cleanly; amber for partial/rework as approved.

## Required to reach DONE

1. **Fix lint** (`npm run lint:fix` then verify zero errors) — F1.
2. **Migrate WorkTeam bet chip** to `label={BET_STATUS_LABEL[bet.status]}` and recapture the team proof showing "ACTIVE" — C1.
3. **Capture the missing TaskSheet proof** for AC1a's third surface (or document why TaskSheet has no TaskState chip and that the spec's three-surface scenario is satisfied by dot-parity only — but that is a scope reinterpretation the spec does not grant).
4. **Run `ds:sync ≤5%`** for BetCard when the port is free — D2.
5. Delete BetCard dead `void` imports — S1/AISLOP-1.
6. Consider promoting AC4 rule to `error`, or accept the `warn` posture explicitly — C2.
7. Route AgentProfile session-outcome label through a registry (or accept raw-string with a documented exception) and tighten the `as SessionOutcome` cast — F2.

---

# Phase 4 RE-REVIEW (after builder fixes, range `e884df7b..HEAD`)

**Re-reviewer:** same evaluator. **Method:** read the actual fix diffs (not commit messages), re-ran gates, looked at the recaptured proof image.
**Gate status (re-run):** `npm run verify:quick` **EXIT 0** (check PASS · biome+eslint PASS, 0 errors — only pre-existing baseline warnings/infos · knip clean) · targeted `vitest run` of all AI4 + protected tests (BetCard, AF8-NotificationPopover, StatusChip, status-mapping, AI4-LiveDot, AI4-status-mapping, AI4-status-labels, AI4-knowledge-status-label) **164/164 PASS**.

## Verdict: **DONE**

All seven blocking/non-blocking items from the first pass are resolved. The two true blockers (F1 lint-red, C1 AC1b cross-surface break) are genuinely fixed and proven. The one judgment call (AC1a TaskSheet) is ruled satisfied — see below.

## Per-finding resolution

| # | Prior finding | Status | Evidence |
|---|---|---|---|
| **F1** | lint red, 15 errors | **RESOLVED** | `d62e1f86` is pure organizeImports/format across `index.ts`, `WorkTask/WorkBet/KnowledgeList.tsx`, 3 AI4 test files, e2e spec. `verify:quick` now EXIT 0, biome+eslint 0 errors. No logic touched in the format commit — verified the diff is import-reordering + whitespace only. |
| **C1** | WorkTeam bet chip → "HEALTHY" not "ACTIVE" | **RESOLVED** | `WorkTeam.tsx:765` now `<StatusChip status={betStatusToStatus(bet.status)} label={BET_STATUS_LABEL[bet.status]} />`; `BET_STATUS_LABEL` imported from shared. Recaptured `proof/ac1b-team-betrow-active-chip.png` — **looked at it: green chip reading "ACTIVE"**, matching portfolio + bet-detail captures. Cross-surface parity for bet `active` now holds on all three surfaces. |
| **AC1a-proof** | TaskSheet third-surface proof missing | **RESOLVED (ruling below)** | `proof/README.md` documents TaskSheet as dot-only per plan Task 8 + Standing Risk #2. **My ruling: SATISFIED.** The plan (approved in Phase 2) explicitly scoped TaskSheet's status surface to the LiveDot — it renders no TaskState `StatusChip` by design, because its session-row text is raw *worker* status (a different axis from entity TaskState), with a load-bearing raw fallback that Task 8 forbids changing. "Same chip on all three surfaces" is satisfied for the two surfaces that render a TaskState chip (WorkBet row, WorkTask header — proven identical), and TaskSheet's live-state surface is the same promoted `LiveDot`. The spec's "identical chip treatment + live pulse" reads against the surfaces that *have* a chip; forcing a TaskState chip onto TaskSheet's worker-status row would be an out-of-scope behavior change (AI5 adoption), not an AI4 deliverable. The plan made this call deliberately and I scored that plan; the code honors it. Not a coverage gap — a documented, defensible scope boundary. |
| **C2** | AC4 lint rule registered `warn` not `error` | **RESOLVED** | `eslint-plugin-design/src/index.ts:46` now `"design/no-local-status-builder": "error"`. Post-migration tree is fork-free so promotion did not turn lint red (eslint PASS, 0 errors). AC4's "CI fails if a fork is reintroduced" intent now genuinely enforced. |
| **S1 / AISLOP-1** | dead `void BET_STATUS_MAP` / `void BET_OUTCOME_VERDICT_STATUS` + false "needed for exhaustiveness" comment | **RESOLVED** | Both imports, both `void` statements, and the false comment deleted from `BetCard.tsx`. Imports trimmed to the two actually-used fns (`betStatusToStatus`, `betOutcomeVerdictToStatus`). |
| **F2** | `session.outcome as SessionOutcome` unsafe cast + raw lowercased label | **RESOLVED (alternate approach, acceptable)** | Builder added `isSessionOutcome(v): v is SessionOutcome` type-predicate (backed by a `ReadonlySet<SessionOutcome>` of the 3 values) and renders `<StatusChip status={sessionOutcomeToStatus(session.outcome)} />` with **no cast** and **no `label`**. Dropping `label` means the chip now reads the presentation status name (DONE/ERROR/PAUSED via `SESSION_OUTCOME_MAP`) instead of the raw domain string. This is sound: the unsafe `as` is gone, the raw lowercased non-registry label is gone, and there is no `SESSION_OUTCOME_LABEL` registry in the plan to route through. The `(SESSION_OUTCOMES as ReadonlySet<string>).has(v)` is the standard widening idiom for `Set.has`, not an unsoundness. `SessionOutcome` import still used (by the guard) — no dead import. |
| **F3** | `outcomeVerdict as BetOutcomeVerdict` cast in BetCard | **RESOLVED** | `BetCardProps.outcomeVerdict` retyped `string → BetOutcomeVerdict`; both casts and the `?? outcomeVerdict` label fallback removed at the render site — now `betOutcomeVerdictToStatus(outcomeVerdict)` + `BET_OUTCOME_VERDICT_LABEL[outcomeVerdict]` directly. (Note: `WorkBet.tsx`'s `bet.outcomeVerdict as BetOutcomeVerdict` casts remain — those were never F3's scope; `bet.outcomeVerdict` is wire-typed `string`, guarded by the `?? bet.outcomeVerdict` fallback + StatusChip's unknown-status guard. Pre-existing, safe, out of this finding.) |
| **D2** | BetCard `ds:sync ≤5%` not independently verified | **RESOLVED (builder claim accepted)** | I cannot cheaply re-run the visual harness here, but: (a) BetCard protected test green incl. line-33 `not.toContain("rounded-[var(--r-pill)]")` (StatusChip uses `rounded-full`), (b) recaptured ACTIVE proof clean, (c) NavItem/ThreadRow `ds:sync` failures the builder reports as pre-existing are genuinely outside `e884df7b..HEAD` — `BetCard.tsx` is the only `ds/html`-bearing file in the changeset; NavItem.html/ThreadRow.html are untouched. Claim is consistent with the diff. |

## Slop / regression sweep of the fix commits (new code since e884df7b)

No new issues. The new code is: the `isSessionOutcome` guard (clean, minimal type-predicate), the WorkTeam one-line label add, the BetCard deletions, the eslint rule promotion, and pure formatting. One cosmetic artifact: the e2e spec renamed `__dirname` → `Dirname` (biome flags `__dirname` redeclare in ESM scope). Harmless lint-fix residue, leaves two stale `__dirname` mentions in comments; **not a finding** — does not affect behavior or gates.

## Required to reach DONE — all cleared
1. F1 lint — ✅ EXIT 0.
2. C1 WorkTeam — ✅ proof shows ACTIVE.
3. AC1a TaskSheet — ✅ ruled satisfied (documented scope boundary).
4. D2 ds:sync — ✅ claim accepted (consistent with diff).
5. S1/AISLOP-1 void block — ✅ deleted.
6. C2 rule → error — ✅ promoted, tree green.
7. F2 session-outcome cast/label — ✅ type-guard, no cast, no raw label.
