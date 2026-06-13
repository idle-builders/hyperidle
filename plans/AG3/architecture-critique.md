# Architecture Critique: AG3 — Bet authoring is block editing

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:10 AC:9 DM:10 N:9 MD:8 FMC:8 S:9 V:8

**Verdict: PASS (8/10).** Frontend-only experience-parity port. The plan is tight, well-reconciled against reality, and correctly identifies the no-API-change / no-migration / single-editor-reuse story. The reconciliation table is honest and I verified every cited line. One CRITICAL (a second, unenumerated entry point that will break the build or leave dead code) and two WARNINGs. The CRITICAL is a missing task, not a wrong decision — cheap to fix in the plan.

---

## Verification of plan claims (done cold, against code)

| Plan claim | Verified | Evidence |
|---|---|---|
| POST `/api/bets` `createBetSchema.strict()` accepts `teamId`, `description`, optional `costAppetite` (WireMoney\|null), `doneCondition?`, `hypothesis?` | YES | `bets.ts:47-65`. `.strict()` at :65. |
| POST seeds `costAppetite` + returns 201 with structured `costAppetite`; team-existence → 400 | YES | `bets.ts:577-625`. No change needed. |
| `KnowledgeCreate` chassis to copy (header + 2-col body + editor frame + aside) | YES | `KnowledgeCreate.tsx:112-263`. |
| Bet edit at `WorkBet.tsx:1391-1464` is full-page BodyEditor + autosave | YES | `WorkBet.tsx:1431-1451` (`minHeight="200px"`, `pitch-save-indicator`). |
| `BetCreateDialog` is the modal to delete | YES | `BetCreateDialog.tsx` (`Dialog size="md"`, `minHeight="160px"`). |
| `router.tsx` has `work/bet/:betId`; no `work/bet/new` | YES | `router.tsx:80`. `knowledge/new` precedes `knowledge/:knowledgeId` at :84-85 (precedent confirmed). |
| `WorkPortfolio` uses `useTeams()`; "New bet" opens dialog | YES (but see CRITICAL — TWO call sites) | `WorkPortfolio.tsx:39,72,247,411`. |
| `scaleForCurrency`/`CURRENCY_CODES`/`WireMoney` exported, used in `WorkBet` | YES | `shared/src/index.ts:309,314,319`; `WorkBet.tsx:43,48`. |
| `deriveTitleFromPitch(pitch, betId)` exists | YES | `shared/src/format/bet.ts:42`. |
| e2e specs live at `packages/web/e2e/*.spec.ts` | YES | confirmed (`AG1/AG2/L14/L16...spec.ts`). Risk #1 in plan resolves: dir is correct. |

The plan reconciliation section is accurate — no CC-007 spec/codebase drift. Layer integrity perfect (frontend-only, server untouched, asserted). Data model: N/A (no schema change), correctly stated.

---

## CRITICAL

- **[plan §Files "Modified" + §Ordered tasks #5 + §route-checklist] The plan enumerates ONE "New bet" entry point; there are TWO, and the second is covered by a protected e2e test the plan does not list.** `WorkPortfolio.tsx` calls `setDialogOpen(true)` at **two** sites: the toolbar button (`:247`, `data-testid="new-bet-btn"`) AND the **empty-state CTA** (`:411`, inside `data-testid="create-bet-cta"`, label exactly "Create bet"). The plan §Modified says only: *"'New bet' onClick → navigate(...); remove dialogOpen state + dialog render."* If the builder removes `dialogOpen`/`setDialogOpen` but re-points only `:247`, then `:411` references a deleted setter → **TypeScript build failure** (best case) or a dead second handler (worse). Furthermore `:411`'s CTA is asserted by `R2-work-first-landing.spec.ts` (per the `@lore AG2 CRITICAL-2/3` comment at `WorkPortfolio.tsx:402-405`: label must match `/create bet/i`, selector `create-bet-cta`). That e2e is **not in §protectedTests**. → Fix the plan: (a) §Modified must say BOTH call sites (`:247` toolbar + `:411` empty-state CTA) re-point to `navigate("/work/bet/new")`; (b) add `R2-work-first-landing.spec.ts` (and any AG2 portfolio e2e asserting `create-bet-cta`) to §protectedTests with a note that the CTA must still navigate (its assertion may need updating from "opens dialog" to "navigates to /work/bet/new"); (c) note in task #5 that `teams.map(...)` prop-passing at `:499` and `refreshBets()` in `onCreated` go away with the dialog — the new page navigates to detail instead, so portfolio no longer needs to refresh on create (verify no other consumer of that refresh path breaks).

---

## WARNING

- **[plan §AC3 verification + Risks] AC3 "editing matches knowledge edit" is verified by "existing tests stay green + screenshot" — but bet-edit and knowledge-edit use structurally different frames, so the AC8 side-by-side review can fail on an untested gap.** Bet edit (`WorkBet.tsx:1431-1451`) is a `<section>` inside the detail page, `minHeight="200px"`, **no bordered editor frame**. `KnowledgeCreate` (and presumably `KnowledgeDetail` edit) uses `minHeight="260px"` in a `border-[1.5px] ... p-[18px]` frame. The plan declares bet-edit "already at parity — preserve untouched," but never reads the knowledge *edit* surface to confirm they actually match. AC3 + AC8 require the reviewer to find them "matching." → Either (a) add a verification step that reads `KnowledgeDetail` edit mode and confirms bet-edit genuinely matches its chassis, or (b) explicitly scope AC3 to "both are full-page BodyEditor + autosave indicator" (experience-parity, not pixel-parity) so the AC8 reviewer isn't held to a frame-identity the plan never engineered. Don't let "already done" hide an unverified parity claim. (Mirrors design-critique W1.)

- **[plan §"Plan reconciliation" appetite row + §Component contract] Re-introducing `costAppetite` at create reverses `@lore R2` with no rationale captured in the plan.** `BetCreateDialog.tsx:18-19` (`@lore R2`) explicitly removed appetite from create per a prior spec: "Submit payload no longer includes costAppetite." The plan adds it back (correct per AC4 + API support) but records no *why*, so a future cleanup agent may re-remove it citing R2. → Add a `@lore` directive to the task (and have the builder place it in `WorkBetCreate.tsx`): R2 stripped appetite from the cramped dialog; AG3 restores it because the full-page aside has room and AC4/spec name it; `createBetSchema` already accepts optional `costAppetite`. Also confirm the empty-appetite path sends nothing (omit / `null`) — the contract block (`architecture.md:98-104`) only adds `costAppetite` when `amt > 0`, which is correct; state explicitly that empty ⇒ uncapped ⇒ field omitted, matching the `.strict()` schema's `.optional()`.

---

## SUGGESTION

- **[plan §Mobile / design §Mobile vs copied chassis] The copied `KnowledgeCreate` body is a flat `flex gap-[24px]` with a fixed `w-[240px]` aside — it has NO responsive collapse (`KnowledgeCreate.tsx:176`).** The design promises a mobile single-column stack (commitments below editor). Copying the chassis verbatim will NOT deliver that. → Note in task #3 that the mobile stack (`flex-col` under `sm`, AQ-005/AQ-015 inputs ≥16px / 44px targets) must be *added*, not inherited — and verify whether `KnowledgeCreate` itself has the same mobile gap (if so, flag it but don't fix knowledge here — out of scope).

- **[plan §"Component contract" `canCreate`] `canCreate = resolvedTeamId.trim() && body.trim() && !submitting` returns a string, not a boolean, when truthy.** `resolvedTeamId.trim()` is a string; `&&` chains return the last operand. For a `disabled={!canCreate}` attribute this works, but TS strict + the design-system button prop may expect `boolean`. → Wrap in `Boolean(...)` or use `.length > 0` like `KnowledgeCreate.tsx:69` does (`title.trim().length > 0 && ... && !submitting`). Match the proven `KnowledgeCreate` idiom to avoid a type-narrowing surprise.

- **[plan §AC6 verification] AC6 abandon test asserts "bet count unchanged" via integration + "POST fired only in handleCreate" via unit — good. But the design left Cancel-when-dirty confirm as an open question.** If the builder omits the confirm, ensure the unit test still proves no POST on Cancel/navigate-away. If the builder adds the confirm (recommended — the old dialog had `isDirty` guard at `BetCreateDialog.tsx:113`), add a test for it. → State the decision in the plan rather than leaving it to the builder mid-green; pick "add lightweight confirm on Cancel-with-content, do not block browser-back" (the design's own recommendation) so it's a planned task, not an ad-hoc choice.

- **[plan §Component contract `useTeams` in tests] Plan says inject `overrideTeams` to avoid network — good (mirrors `WorkBet.overrideBet`).** Confirm `useTeams()` is not called unconditionally when `overrideTeams` is provided: the snippet `props?.overrideTeams ?? (useTeams().data?.teams ?? [])` **always calls the `useTeams()` hook** (it's evaluated regardless of `??`), violating the rules-of-hooks-free intent and still hitting network/MSW in tests. → Either always call `useTeams()` and only use its data when no override (acceptable — hook runs but tests mock the fetch), or document that tests must still provide an MSW/QueryClient stub. The `??` does NOT skip the hook call; the plan's "skip useTeams fetch" comment (`architecture.md:74`) is misleading. Clarify.

---

## What's Working Well

- **Reconciliation honesty (CC-007 clean).** Every "spec assumption ⇆ reality" row is backed by a real line I verified. The plan correctly catches that the spec's "bet editing needs parity work" is already satisfied, narrowing scope to create-only — exactly the kind of spec/reality drift the architect should surface before code.
- **No-change discipline.** API, schema, storage, derivation, render pipeline all correctly identified as untouched, with the backward-compat AC (AC7) verified by "existing portfolio/team tests stay green" + structural sameness. Security block is appropriately all-N/A-with-reason (no new endpoint, reuses existing `requireBoundary`), which is the right answer for a frontend-only port — not theatre.
- **Design-it-twice is real, not straw.** The `useTeams()`-in-page vs route-state/context tradeoff (§"Design-it-twice") genuinely engages both options and rejects B for a concrete reason (breaks deep-link/refresh on hard load). Verifiability ordering is correct (red tests named before green tasks).

---

## Round 2 (re-critique of revised plan, 2026-06-13)

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 LI:10 AC:10 DM:10 N:9 MD:9 FMC:9 S:9 V:9

**Verdict: PASS (9/10). All R1 findings resolved. APPROVED.** Verified each fix cold against code.

| R1 finding | Status | Evidence in revised plan + code |
|---|---|---|
| CRITICAL — second unenumerated entry point + missing protected e2e | **RESOLVED** | Both call sites enumerated: §Modified `:59-62`, §Summary `:20`, task #5 `:123`, AC2 `:41`, route-checklist. Code confirms BOTH `setDialogOpen(true)` at `WorkPortfolio.tsx:247` (toolbar `new-bet-btn`) AND `:411` (empty-state `create-bet-cta`). Both `R2-work-first-landing.spec.ts` and `AG2-portfolio-arrival.spec.ts` now in §protectedTests `:157-160` with precise re-target directives (dialog→navigate). Plan correctly flags the obsolete "no appetite fields" assertion (`R2:261`) must be replaced since appetite returns. Dead-wiring (`refreshBets()` `:497`, `teams` prop `:499`, `dialogOpen` state) all enumerated with "verify no other consumer" guard. |
| WARNING 1 — AC3 parity asserted not verified | **RESOLVED** | Scoped to experience-parity. Verified cold: bet edit `WorkBet.tsx:1431-1451` = bare `<div>` → `BodyEditor variant="full" minHeight="200px"` + `bet-save-indicator`, NO frame. Knowledge edit `KnowledgeDetail.tsx:823-833` = bare `<div>` → `BodyEditor variant="full" minHeight="200px"`, NO frame. They genuinely match; bordered `260px` frame is create-only (`KnowledgeCreate.tsx:190-202`). AC3 row `:42` + Risk #5 `:176` scope "matches" to experience-parity, not create-frame identity. |
| WARNING 2 — appetite reverses @lore R2 without rationale | **RESOLVED** | `@lore` directive in task #3 `:120` with full restoration rationale + "Do not re-remove citing R2." Reconciliation row `:28`. Empty⇒omit⇒uncapped stated in AC4 `:43` + payload contract `:104`. API unchanged confirmed. |
| WARNING 3 (R1 suggestion) — responsive collapse not inherited | **RESOLVED** | Explicit task #3 `:119`: `flex flex-col sm:flex-row gap-[24px]`, aside `w-full sm:w-[240px]`, AQ-005/AQ-015 cited, "do NOT fix KnowledgeCreate's own gap — out of scope." |
| SUGGESTION — useTeams snippet misleading `??`-skip | **RESOLVED** | Contract `:89-91` now calls `useTeams()` unconditionally (rules of hooks), no `overrideTeams` prop. Risk #3 documents MSW/QueryClient stub. |
| SUGGESTION — `canCreate` returns string not boolean | **RESOLVED** | `:97` uses `.length > 0` chain, matches `KnowledgeCreate.tsx:69` idiom. |
| SUGGESTION — Cancel-when-dirty left open | **RESOLVED** | Decided in Risk #2 `:173` + AC6 `:45`: lightweight confirm on Cancel-with-content, browser-back never intercepted, unit-tested. Now a planned task. |

No remaining CRITICAL or WARNING. Every cited line number (`:247`, `:411`, `:72`, `:86`, `:491-500`, `WorkBet:1431-1451`, `KnowledgeDetail:823-833`, e2e assertion lines) verified accurate against actual code.
