# AI2 — One dialog experience — Phase 4 code review

**Reviewer:** single-evaluator persona, Phase 4. **Branch:** `feat/AI2-one-dialog-experience` @ d08780f2.
**Diff reviewed:** `merge-base(44c61be8)..HEAD` excluding `plans/` + `.pipeline/` (the true AI2 change; see Finding C-0 on base drift).
**Verdict: NOT DONE.** Two CRITICAL proof gaps on the workpackage's two headline ACs (AC-1 scenario 1, AC-3 scenario 3), plus a CRITICAL doc-accuracy inversion. The primitive itself is well-built and the migration is faithful; the failure is in *proof*, not construction.

---

## What is solid (verified)

- **`Dialog` / `useDialogBehavior` / `DiscardConfirmStrip` / `DialogPortalRoot`** — clean, single primitive + the sanctioned internal-hook escape hatch (D3). Exports match plan (`Dialog`, `DialogPortalRoot`, `useDialogBehavior`, `ensureOverlayRoot`) — hook exported as the "compose with flags, not forks" hatch, not a second box primitive. ✅
- **Dismissal rule logic** — `useDialogBehavior.test.tsx` (38 unit tests incl. Dialog.test) proves the full grammar: clean closes, dirty guards, 2nd-Esc=Keep-editing, confirmation(`isDirty=false`)-always-closes, confirm/cancel discard, layer→zIndex, scrim props. Meaningful assertions, not tautologies. ✅
- **Confirmation-never-dirty (§1.1)** — WorkBet ConsequencePreview + kill-confirm pass `isDirty={false}` (WorkBet.tsx:360); AppetiteDialog passes truthful `isDirty` (WorkBet.tsx:480/504). Correct authoring-vs-decision boundary. ✅
- **Sanctioned protected-test changes** — all three match the plan exactly: #1 L14 Esc-closes (e2e runs, non-skippable, passes), #2 cmdk selector+z migration, #3 AssistantOverlay/Coc `z-30`→`data-dialog-layer="overlay"`. No weakening beyond the carve-outs. ✅
- **tokens.css** — z-scale (`--z-base..--z-toast`) + `--scrim` light (`rgba(26,21,16,0.45)`) **and** dark (`rgba(20,16,12,0.62)`), with the AI6 color-mix comment. ✅
- **Chrome consistency (AC-6)** — screenshots of BetCreate, kill-confirm, appetite show one identical chrome family (15/600 title, ✕ + header divider, footer divider + right-aligned actions, warm scrim, `--r-default`). Proven by looking. ✅
- **Mobile bottom-sheet (AC-4)** — BetCreate at 375px is bottom-anchored, gutter-inset, top-corners rounded, footer at bottom, no horizontal overflow. Proven by looking. ✅
- **`npm run check`** PASS (12 pkgs). **`npm run lint`** exit 0. **100 migrated-surface unit tests** pass. **38 DS dialog unit tests** pass.

---

## AC table

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** One dismissal grammar; dirty input never lost to one Esc/backdrop; confirmations always close | **PARTIAL / NOT PROVEN** | Hook logic fully proven by unit tests (useDialogBehavior.test.tsx:73-216). Confirmation-close proven by e2e (dialog-dismissal scenario 2 — 2 pass; L14 Esc-closes passes). **BUT scenario 1 — the headline "half-typed pitch never lost to one Esc" — has ZERO runtime proof: all 3 e2e tests (dialog-dismissal.spec.ts:66/112/140) `test.skip()` because no create-bet button renders in mocked portfolio. The `ai2-guard-strip-visible.png` proof screenshot the spec promises is never produced.** See C-1. |
| **AC-2** Focus in on open, trapped, returns to trigger on close — uniformly | **PARTIAL / NOT PROVEN** | "Focus moves in" proven (Dialog.test.tsx:349-380). **"Returns to trigger on close" is NOT asserted** — the test removes the trigger before closing; the comment claims return but no assertion exists (W-1). Relies on `returnFocusOnDeactivate:true` (wired, Dialog.tsx:124) but unverified by any executed test. |
| **AC-3** Layering deterministic + documented; no two compete; 2 stack predictably regardless of DOM order | **NOT PROVEN (runtime)** | Static half done (lint rule + tokens + DESIGN.md). Doc done. **Runtime scenario 3 — TaskSheet+NotificationPopover stack in BOTH orders — BOTH tests SKIP (dialog-layering.spec.ts:138/176)**; `makeBetResponse` has `tasks:[]` so no task card ever renders → guaranteed skip. The one passing layering test (line 202) checks a single dialog's z≥60 in isolation — it never co-renders two surfaces. See C-2. |
| **AC-4** Every dialog fits 375px; bottom-anchored sheet | **PARTIAL** | Spec/plan demand ≥4 dialogs at 375px. **Only 1 of 4 passes** (BetCreate); KnowledgeCreate, ConsequencePreview, Appetite all SKIP (dialog-mobile.spec.ts:146/168/192). Bottom-anchoring proven for the 1 surface that renders. MobileSheet story exists. See W-2. |
| **AC-5** New dialog built by composing the primitive; boilerplate gone | **MET (logic) / GATE TOOTHLESS** | Migration verified: all 13 surfaces consume `Dialog`/`useDialogBehavior`; no `showModal`/`setAttribute("open")`/`cancel`-event boilerplate survives. `no-dialog-boilerplate` rule exists and code is clean against it. **But the rule is `warn`, not `error` — among 372 lint warnings it gates nothing** (C-3). |
| **AC-6** Chrome consistent across ≥4 dialogs (side-by-side Playwright) | **MET** | 4 chrome tests pass (BetCreate desktop+375px, kill-confirm, appetite); screenshots inspected — one consistent chrome, no overflow. (KnowledgeCreate ×2 skip, but ≥4 distinct surfaces proven.) |

---

## Findings by lens

### CRITICAL

**C-1 (Adversarial / AC-completeness) — The workpackage's headline AC has zero runtime proof.**
`packages/web/e2e/dialog-dismissal.spec.ts:66,112,140` — the three scenario-1 tests (guard strip visible on Esc with dirty pitch; focus lands on Keep editing; Tab+Enter discards) every one ends at a `test.skip(true, "No create-bet button…")` guard. In CI (mocked portfolio, no real bet-create button) **all three skip**. This is the exact behavior the entire workpackage exists to fix ("a half-typed pitch is never lost to one Escape"); the spec's validation scenario 1 explicitly demands "a screenshot captures the guard state" — `ai2-guard-strip-visible.png` is never written because the test never runs. The hook unit tests prove the *logic*, but the spec's proof-by-looking bar for scenario 1 is unmet. **Fix:** drive the guard flow against a surface that actually renders in the mocked harness — open BetCreate by direct route/seeded mock so the create button or dialog is present, OR exercise the guard on a different authoring dialog (KnowledgeCreate) that the mocks can open. Remove the `test.skip` fallbacks; a skip is not a pass. Produce the guard-state screenshot.

**C-2 (Adversarial / AC-completeness) — Validation scenario 3 (two-overlay stacking, both orders) never executes.**
`packages/web/e2e/dialog-layering.spec.ts:138,176` — both stacking tests gate on `page.locator("[data-testid='task-card']")` which never exists: `makeBetResponse()` (line 20) returns `tasks: []`, so the portfolio renders no task cards → `test.skip(true, …)` always fires. The remaining test (line 202) asserts `dialogZ >= 60` for one dialog in isolation — it does NOT open TaskSheet and NotificationPopover simultaneously, so "two surfaces that can be open together stack predictably regardless of DOM order" is unproven at runtime. The orchestrator flagged this; the builder's defense ("skips gracefully, static lint gate is the enforcement") is invalid — the spec scenario is *verbatim* "TaskSheet and the notification overlay open together … stack in the documented order at both opening sequences," and that is a runtime/visual claim the lint gate cannot satisfy. **Fix:** mock a portfolio that renders ≥1 task card (give `makeBetResponse` a task, or seed the route the portfolio reads for cards), open both surfaces in each order, assert `overlayZ > drawerZ` both times, screenshot the stack.

**C-3 (Architecture / Security gate) — AC-3 and AC-5 static gates are registered at `warn`, enforcing nothing.**
`packages/eslint-plugin-design/src/index.ts:54-55` and `eslint.config.ts:122,125` wire `design/no-raw-overlay-z` and `design/no-dialog-boilerplate` at `"warn"`. `npm run lint` exits 0 with **372 pre-existing warnings**, so a future raw `z-50` on an overlay or a re-introduced `showModal()` would add a warning and **still pass CI**. The plan defines these as the *static half* of AC-3/AC-5 — "this is a static codebase property → lint" — which only satisfies the AC if violation *fails verification*. The K8 block (eslint.config.ts:210-223) already establishes the precedent: design-system rules that are clean post-migration get promoted to `error`. Current code is clean against both rules, so promotion costs nothing. **Fix:** promote both rules to `"error"` (in `index.ts` recommended set and/or the `eslint.config.ts` web block + a design-system block). Without this the AC-3/AC-5 static gates are decorative.

**C-4 (Architecture / Doc staleness) — The user doc inverts the second-Escape behavior.**
`docs/guides/user/the-interface.md` (Dialogs and Overlays): "if you have unsaved typed input, Escape shows a discard confirmation strip… **Press Escape again (or click "Discard") to confirm closing.**" This is wrong and dangerous: per design §1.2 and the implementation (`useDialogBehavior.ts:128-132`), a second Escape while guarding calls `cancelDiscard` (= Keep editing) — it **keeps your work, it does not discard**. The doc tells users the opposite of the safety behavior the whole feature exists to provide. **Fix:** correct to "Press Escape again (or Enter / click *Keep editing*) to keep your work; click *Discard* to drop it." Discard is reachable only by Tab→Enter or clicking Discard, never by a second Escape.

### WARNINGS

**W-1 (AC-completeness) — AC-2 "returns to trigger on close" is unproven.** `Dialog.test.tsx:349-380` asserts focus moves *in*; it never closes the dialog and asserts `document.activeElement === trigger`. The plan (§253) specified that assertion. The `accessibility.spec.ts` e2e was the other half — confirm it actually exercises return-focus on a migrated dialog and isn't itself skipping. **Fix:** add a close-then-assert-trigger-focus case to Dialog.test.tsx (or prove it in a non-skipping e2e).

**W-2 (AC-completeness) — AC-4 proven for only 1 of the required 4 dialogs.** `dialog-mobile.spec.ts:146/168/192` skip for KnowledgeCreate/ConsequencePreview/Appetite — same render-not-found skip pattern. The bottom-anchored claim is structurally identical across surfaces (the primitive owns it), but the AC text and plan say "≥4 migrated dialogs … no viewport overflow." **Fix:** ensure at least 4 of these open in the mocked harness, or consolidate the proof onto surfaces that do render (kill-confirm + appetite render fine on the bet page, per the chrome spec — mirror that setup here).

**W-3 (Adversarial) — `test.skip(true, …)` as a CI escape valve is systemic (30 occurrences across the 4 specs).** 10 of 18 dialog e2e tests skip. A spec that silently skips when its fixture doesn't render is indistinguishable from a passing spec in the run summary, and gives false confidence. The pattern hides C-1/C-2/W-2. **Fix:** specs whose proof is load-bearing for an AC must *fail* (not skip) when their target surface is absent — convert the guard `count()===0` branches into `expect(...).toBeGreaterThan(0)` after fixing the mocks so the surface renders.

**W-4 (Architecture / base drift) — branch is not rebased onto current `origin/main`.** `git diff origin/main..HEAD` shows ~30 unrelated files as "deleted" (Menu, Select, AG5 dropdown, AI1 token-resolution-guard, etc.) because merge-base (44c61be8) predates `origin/main` (9123e8e1, AG5 PR #273). These are not AI2 deletions — they are files added on main after AI2 branched. **The branch must rebase onto `origin/main` before merge** or the PR will revert AG5/AI1 work. Flagging now so `/ship` doesn't merge a stale base. (Reviewed against merge-base..HEAD accordingly.)

### NOTES / OBSERVATIONS

- **N-1 (Simplification, Dialog.tsx:82-95)** — manual `useEffect` that queries the first tabbable and `.focus()`es it duplicates what FocusTrap (`active`, `fallbackFocus`) already does. The lore comment justifies it (act()/setTimeout in jsdom), but in production this is a redundant focus call racing FocusTrap. Low risk; consider gating the manual call to test env or removing once FocusTrap's initial focus is verified under Playwright.
- **N-2 (Architecture, useDialogBehavior.ts:49-55)** — `getOverlayProps()` returns a `ref` field that `Dialog.tsx` ignores (uses its own `boxRef`); only the non-box surfaces would consume it, and they manage their own refs too. The `ref` in the contract is currently dead for every consumer. Either wire it in `Dialog` or drop it from the returned shape.
- **N-3 (AppShell.tsx unreviewable via `git diff`)** — the file is flagged binary ("data") by git/`file` due to a pre-existing control-char-rejecting regex (line 86-87) that predates AI2 (confirmed binary at merge-base). The drawer migration (lines 114-149: `useDialogBehavior` modal=true layer="drawer", scrim via `getScrimProps`, document-level Esc) is correct on inspection. Not an AI2 defect, but reviewers/`/ship` should know the AppShell diff can't be read with plain `git diff`.
- **N-4 (Slop, low)** — `useNotifications.ts:51` `setRows(body.rows ?? [])` null-coalesce was added in green (out-of-spec but defensible: it fixes a real `rows.length` throw when a stale mock returns `{notifications}` not `{rows}`). The mock-shape mismatch it guards is the same one that should be fixed in the layering spec's fixture (C-2). Acceptable as defensive hardening; the lore comment is honest.
- **N-5 (AC-3 / design)** — AssistantOverlay + NotificationPopover moved from z-30 to `--z-overlay` (40), now above TaskSheet drawer (30). Matches design §2 intent (overlay > drawer). Consistent.

---

## Doc rubric (`docs/guides/user/the-interface.md` "Dialogs and Overlays", /write-docs 10 dimensions)

The section is short (11 lines) and scannable, but contains a factual inversion (C-4) which caps several dimensions.

| Dimension | Score | Note |
|---|---|---|
| Attention capture / lede | 3 | Opens with the user-facing promise ("consistent dismissal grammar"). Fine for a reference doc. |
| Scannability | 4 | Bold-led bullets, one idea each. |
| Progressive disclosure | 3 | Escape → backdrop → guard → confirmation is a sensible order. |
| Accuracy / correctness | **1** | C-4: "Press Escape again to confirm closing" is the **opposite** of the implemented behavior. A correctness-1 is disqualifying for an accuracy-bearing doc. |
| Concision | 4 | No filler. |
| Activation / actionability | 3 | Tells the user the keys; the wrong key mapping undermines it. |
| Terminology consistency | 3 | "discard confirmation strip" matches the UI; "drawers (task sheets)" matches the layer doc. |
| Audience fit | 3 | End-user guide; appropriately non-technical. |
| Structure / placement | 3 | Logical addition under app-shell anatomy. |
| Completeness | 3 | Covers Esc/backdrop/guard/confirmation/stacking. Doesn't mention focus-return (minor for a user doc). |
| **Total** | **30 / 50** | **Below the ≥35 bar, and the accuracy dimension is below the all-≥3 floor (it's 1).** Must fix C-4 before this doc passes. |

---

## Verdict

**NOT DONE.** The `Dialog` primitive and the 13-surface migration are correctly built, faithfully follow the approved design and architecture, and pass typecheck/lint/unit tests with sanctioned protected-test changes applied exactly. But the track's proof bar — *consistency and behavior proven by LOOKING and by runtime e2e* — is unmet for the two headline ACs:

1. **AC-1 scenario 1 (the entire reason AI2 exists)** has no executing runtime proof — all three guard-flow e2e tests skip.
2. **AC-3 scenario 3** (the verbatim two-overlay stacking) never executes — both order tests skip.
3. **C-3** leaves the AC-3/AC-5 static gates at `warn` (toothless), and **C-4** ships a user doc that inverts the guard's safety behavior.

Fix C-1, C-2, C-3, C-4 (and W-1, W-2 to clear the AC-2/AC-4 proof gaps; rebase per W-4 before `/ship`). Re-run `npm run test:e2e -- e2e/dialog-` and confirm zero skips on the AC-bearing tests, with the guard-state and two-overlay-stack screenshots produced and inspectable.
