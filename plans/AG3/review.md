# AG3 — Phase 4 Code Review

**Verdict: DONE** (zero CRITICAL; 3 WARNINGS, all non-blocking polish/reuse). PR may merge.

Reviewed against `TRACK-AG.md` §AG3 (AC1–AC8), `plans/AG3/architecture.md`, `plans/AG3/design/approved.md`, `.claude/rules/aesthetic-quality.md`, `/write-docs` rubric.

Component tests: 43/43 green (`WorkBetCreate.test.tsx`, `WorkPortfolio.AG3.test.tsx`, `WorkPortfolio.test.tsx`). E2E screenshots captured and inspected (5 PNGs).

---

## AC table

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | Full-page surface, BodyEditor, no dialog | PASS | `WorkBetCreate.tsx:104-273` renders `bet-create-page` + `BodyEditor variant="full"`. Tests `WorkBetCreate.test.tsx:114-145` assert page testid, editor, NO dialog role, Create/Cancel/breadcrumb. `BetCreateDialog.tsx` deleted; no import remains (grep: only comments/lore). |
| AC2 | Both entry points navigate to `/work/bet/new` | PASS | `WorkPortfolio.tsx:246` (toolbar) + `:412` (CTA) → `navigate("/work/bet/new")`. `WorkPortfolio.AG3.test.tsx:106-142` asserts both navigate + no dialog. CTA `data-testid="create-bet-cta"` + label "Create bet" preserved (AG2 contract intact). Route `router.tsx:81` added before `:betId`. |
| AC3 | Bet edit matches knowledge edit (experience parity, untouched) | PASS | `WorkBet.tsx` edit surface untouched (not in diff). Screenshot `ag3-bet-edit-surface.png` shows full-page block render (PITCH: H1 + bullet list) — experience parity per plan Risk #5 definition (frameless `BodyEditor` + indicator, NOT create-chassis frame). |
| AC4 | Team+appetite set without crowding; cannot create without team | PASS | Commitments aside `WorkBetCreate.tsx:193-270`: team (static line single / `Select` multi) + optional appetite. `canCreate` gated on `resolvedTeamId && body` (`:52`). Tests `:164-227`: single-team auto-resolve, multi-team gating, appetite optional, no team combobox single-team. Empty appetite ⇒ field omitted (`:67-73`, test `:198-220`). |
| AC5 | Content renders identically in detail (blocks/headings/discussion) | PASS | No storage change — same markdown `description` field via unchanged POST. Screenshot `ag3-bet-edit-surface.png` shows H1 + list rendered through block pipeline in PITCH section. E2E create flow writes `# Ship faster` → detail. |
| AC6 | Abandon leaves no half-created bet | PASS | POST fires only in `handleCreate` (`:55-91`); no effect/autosave POSTs. Tests `:281-297` (cancel-dirty no POST), `:303-315` (no POST on editor change). E2E `:239-263` navigates away, asserts `postCalls.length === 0`. Dirty-guard confirm `:93-102` (decided, Risk #2). |
| AC7 | New bets appear like pre-change bets | PASS | Payload `{ teamId, description, costAppetite? }` identical to old dialog shape; API unchanged → `status:"draft"`, derived title preserved. `WorkPortfolio.test.tsx` outcome/filter assertions unchanged & green. |
| AC8 | Visually tested at desktop, beside knowledge, zero hard-rule violations | PASS | `AG3-bet-authoring.spec.ts` at 1440×900: 5 screenshots. Side-by-side `ag3-bet-create-surface.png` vs `ag3-knowledge-create-parity.png` = near-identical chassis (breadcrumb, title preview, bordered editor frame, commitments aside). No AQ hard-rule violation found (see Security/Design lenses). |

---

## Lens 1 — Architecture: PASS

- Layer integrity: frontend-only change, no layer reach-past. Route page is self-sufficient (`useTeams()` in-page per design decision #2). Correct.
- API contract preserved: `bets.ts` untouched; payload shape matches `createBetSchema` (`teamId`, `description`, optional `costAppetite`). Backward compatible. Sending `costAppetite` at create already valid.
- Route ordering correct: `work/bet/new` registered before `work/bet/:betId` (`router.tsx:81-82`) — mirrors `/knowledge/new`.
- Dead-code removal clean: `dialogOpen`/`setDialogOpen` state removed, `BetCreateDialog` import removed, render block removed, `refreshBets` dropped (confirmed NO other consumer — grep shows zero remaining refs). Both protected-test specs (`AG2-portfolio-arrival`, `R2-work-first-landing`) re-targeted dialog→navigation as the plan's `protectedTests` section directed.
- Chassis reuse honest: `WorkBetCreate` mirrors `KnowledgeCreate` structure field-for-field (header, breadcrumb, bordered editor frame `border-[1.5px]…rounded-[var(--r-default)] p-[18px]` minHeight 300px/260px, two-column body, aside card). No second editor — single shared `BodyEditor`. Contract `§135` honored.

### WARNING (doc staleness, non-blocking)
- `WorkPortfolio.tsx:10` — stale `@lore` comment still reads `"New bet" button opens BetCreateDialog.` The behavior changed to navigation. Update the lore line to reflect navigation to `/work/bet/new`. Low severity (comment only) but it lies about current behavior — fix in this PR.

### Doc-gap assessment (builder-flagged `three-core-views.md:50`)
- **Not a real gap.** `docs/human-interface-layer/three-core-views.md` does not exist (file not found). The builder's flag cites a stale path. The only doc listing bet "Title" as a field is `docs/human-interface-layer/content-examples-for-design-reference.md:27-28` — those are *example content payloads* (a bet HAS a title), not a UI authoring-field spec, and remain accurate (title is still a property, now auto-derived). No doc change required. `getting-started.md` (the actual authoring-flow doc) was correctly updated.

---

## Lens 2 — Design: PASS (1 polish WARNING)

- Full-page parity achieved — visually confirmed (`ag3-bet-create-surface.png` ≈ `ag3-knowledge-create-parity.png`). Same chassis, breadcrumb landmark, derived-title preview (20px/600, tertiary→primary on content), Cancel ghost / Create accent pills.
- All states present: empty (Create disabled, "Untitled bet"), writing (live title, Create→solid accent — confirmed `ag3-bet-create-with-title.png`), submitting ("Creating…", editor disabled — test `:389-402`), error (`role="alert"` — test `:357-375`), success (navigate). Abandon handled.
- Tokens only — spacing on 6px grid `{6,9,12,18,24}`; radii `--r-default`/`--r-pill`; colors all `var(--…)`; motion `--motion-fast`. No hardcoded colors, no AI-slop tells (no purple/gradient/hero/oversized padding). Single-team static line reads as labelled commitment (uppercase 12px/600 "TEAM") per design row.
- Responsive collapse present and explicit: `flex flex-col sm:flex-row` + aside `w-full sm:w-[240px]` (`:163,:194`) — added as the design note required (KnowledgeCreate has none). Appetite amount input carries `text-base` (16px) for AQ-005.
- A11y: breadcrumb `nav[aria-label="Breadcrumb"]`, error `role="alert"`, appetite controls have `aria-label`, team `Select` has `htmlFor`/`id`. Mount-focus to editor delegated to `BodyEditor`.
- Stories file exists (`WorkBetCreate.stories.tsx`) for all six states.

### WARNING — design-system reuse (non-blocking)
- `WorkBetCreate.tsx:251-262` — appetite amount uses a **raw `<input className="input input-bordered input-sm flex-1 text-base">`** instead of the design-system `Input` (`@hyperidle/design-system`, exported, supports `type=number`/`min`/`step` via `InputHTMLAttributes`). Both `approved.md` (Appetite row: "number `Input`") and `architecture.md:112` ("`Input` … from `@hyperidle/design-system`") specify the DS component. This is the AESTHETICS reinvention tell (hand-rolled DaisyUI input where a DS primitive exists). It matches the legacy `AppetiteDialog` (`WorkBet.tsx:498`) so it is consistent-by-precedent, but the plan called for `Input`. Adopt `Input` or add a `@lore` exception naming the reason. Not blocking — renders correctly, on-token, AQ-005 met.

### WARNING — currency Select clipping (visual polish, non-blocking)
- The `w-[72px]` currency `Select` (`:242`) clips "USD" to "**US**" in all three create screenshots. The 72px width is too narrow for the 3-char code + chevron. Widen (~84px) or shrink chevron padding. Cosmetic; no hard-rule break. Flag to `/visual-polish`.

---

## Lens 3 — Security: PASS

- No new endpoint — reuses POST `/api/bets` with existing `requireBoundary` + `.strict()` schema. No new rate-limit needed (plan §136, correct).
- No agent-input path; body is human markdown sanitized by the existing block render pipeline. No new trust boundary.
- No secrets, no path input, no outbound URL. No `eval`/`innerHTML`/`dangerouslySetInnerHTML` in the diff.
- Frontend gating (`canCreate`) is UX only; server remains authoritative (team existence + `.strict()` rejection). Error path surfaces server `data.error` without leaking internals.
- Currency cast `appetiteCurrency as WireMoney["currency"]` (`:70`) is bounded — value originates from `CURRENCY_CODES` options, never free text. Safe.

---

## Lens 4 — Adversarial: PASS

- **Saboteur:** No backdoor. No weakened test — `WorkPortfolio.test.tsx` dialog assertion correctly *shifted* to navigation assertion (not deleted); both E2E protected specs re-targeted with the user-facing guarantee intact. No race: POST is single-shot guarded by `submitting`; abandon fires nothing.
- **New Hire:** Code reads clearly. One name lies → `WorkPortfolio.tsx:10` lore comment (flagged above). Otherwise honest.
- **Auditor:** All AC claims match the diff. `refreshBets` removal verified safe (grep: zero consumers). Both entry points re-pointed (not just one) — the plan's explicit failure-mode (`:247` re-pointed while `:411` left dangling) did not occur.
- Type safety: zero `any`, zero `@ts-ignore`, zero non-null `!`. Two `as` casts — `payload as Record<string,unknown>` (declared type, fine) and the bounded currency cast (safe, above). `apiFetch` response cast `as { id: string }` / `{ error?: string }` matches the existing project pattern. Acceptable.
- Error paths: non-ok handled (`:81-86`), JSON parse guarded with `.catch(() => ({}))`. Network throw would reject the un-awaited `void handleCreate()` promise — `submitting` would stay true (Create stuck "Creating…"). Minor: a thrown fetch (not non-ok response) is not caught. The old dialog had the same gap; consistent, low-risk for v1. OBSERVATION only.
- Test quality: assertions are meaningful (payload introspection, navigation target, disabled state, confirm-spy call count). Not tautological.

---

## Lens 5 — Simplification: PASS

- No premature abstraction, no single-use helpers, no dead code, no commented-out code. The page is a direct, flat component.
- `isDirty` (`:53`) is a trivial alias of `body.trim().length > 0` used once in `handleCancel` — borderline inline candidate but it documents intent (mirrors old dialog's `isDirty`). Keep.

---

## Lens 6 — AI Slop: PASS

- Comments are load-bearing (`@lore` for appetite restoration + responsive collapse — both required by the plan; the dirty-guard rationale). No restating-the-code filler, no "TODO: implement", no "for now"/"in production" tells.
- No unnecessary async (only `handleCreate` is async and it awaits). No defensive over-engineering. Naming is concise.
- Stories file: all six exports render `<WorkBetCreate />` with no prop variation (states are data-driven via `useTeams`/internal state, not injectable) — so EmptyState/SingleTeam/MultiTeam/Submitting/WithError/Writing render identically at story-time. OBSERVATION: stories are thin (can't show distinct states without prop injection, which the no-props design forbids). Acceptable given the route-page contract, but they add little visual-polish value. Not blocking.

---

## Summary of findings (all non-blocking)

| Severity | File:line | Finding |
|---|---|---|
| WARNING | `WorkPortfolio.tsx:10` | Stale `@lore` comment says "New bet" opens BetCreateDialog — now navigates. Update. |
| WARNING | `WorkBetCreate.tsx:251-262` | Raw `<input>` for appetite amount instead of DS `Input` (plan + design specify `Input`). Adopt or `@lore`-justify. |
| WARNING | `WorkBetCreate.tsx:242` | `w-[72px]` currency Select clips "USD"→"US". Widen for `/visual-polish`. |
| OBSERVATION | `WorkBetCreate.tsx:75-90` | Thrown (non-response) fetch error not caught → Create stuck "Creating…". Matches legacy dialog; low risk. |
| OBSERVATION | `WorkBetCreate.stories.tsx` | Six states render identically (no prop injection possible by design). Thin but acceptable. |

Zero CRITICAL. AC1–AC8 all PASS with code + test + screenshot evidence. The three WARNINGs are polish/consistency, none gate the feature's correctness or the contracts. **DONE.**

---

## Doc score — `docs/guides/user/getting-started.md` §6 (`/write-docs` rubric)

The diff updates the "Create your first Bet" step from dialog→full-page authoring. Scoring the changed section (10 dims, 0–5):

| Dim | Score | Note |
|---|---|---|
| Accuracy / truth-to-code | 5 | Matches implementation exactly: full-page surface, description editor (required), title auto-derived from first heading, team in Commitments aside (multi-team only), appetite optional, navigates to detail on Create. All verifiable against `WorkBetCreate.tsx`. |
| Scannability | 4 | Numbered steps + bolded field names + bolded "Expected". Reads in a glance. |
| Progressive disclosure | 4 | Steps → expected → activation follow-on → troubleshooting. Good funnel. |
| Activation (gets user to success) | 5 | Concrete example pitch, exact button labels, troubleshooting for the two real failure modes (disabled Create, missing team). |
| Concision | 4 | Tight; no filler. |
| Correct terminology | 4 | "Commitments aside", "draft card", "Activate bet" all match product chrome. |
| Structure / headings | 4 | Fits the existing numbered-section flow. |
| Audience fit (end-user) | 5 | Non-technical, task-oriented. |
| No stale claims | 4 | The dialog language is fully removed; "navigated to the new Bet detail page" matches `navigate(/work/bet/:id)`. |
| Examples present | 4 | Inline pitch example + troubleshooting cases. |

**Total: 43/50.** All dimensions ≥3, total ≥35. **PASS.** The doc was correctly updated in-PR; no stale dialog reference survives.
