# Architecture Critique: AI2 — One dialog experience

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:n/a N:9 MD:8 FMC:7 S:8 V:6

The plan is strong on structure, reuse, and spec-tracing: every one of the 6 ACs maps to a verification
row, the 4 validation scenarios are covered, the route/surface checklist enumerates all 13 migration
targets, scope creep into AG3/AG5 is explicitly fenced, and the design-it-twice decisions (D1/D2/D3) are
real, not theatre. It is held back to a 7 by **two CRITICAL protected-test gaps** the plan either
under-specifies (cmdk `z-50` assertion) or leaves in textual conflict with the spec (L14 / kill-confirm
guard), plus a **self-contradicting `inert` mount decision** (Risk #4 warns of exactly what D3 causes).
All six designer-flagged risks were verified against real code; results inline below. Fix the three
CRITICALs and this is an 8–9.

---

## Verification of the six designer-flagged risks (against real code)

1. **focus-trap-react move into DS** — CONFIRMED accurate. `focus-trap-react@^12.0.0` is in
   `packages/web/package.json`, used only in `GlobalSearchPanel.tsx`; DS `package.json` does NOT list it.
   D1 (add to DS deps) is correct. DS test env is `jsdom` + `pool:'forks'` + `createRoot`/`act` precedent
   (`vitest.config.ts` @lore R4) — the plan's claim (recon table line 43) is accurate.
2. **`#overlay-root` sibling-of-`#root` for `inert`** — **PLAN IS SELF-CONTRADICTORY.** See C-1.
   `index.html` has only `<div id="root">`; `main.tsx` mounts React into `#root`. D3 mounts
   `DialogPortalRoot` *inside `AppShell`* — i.e. inside the React tree, inside `#root`. That makes
   `#overlay-root` a **child** of `#root`, not a sibling. Risk #4 warns "verify `#overlay-root` is a
   sibling of `#root`, not a child, or `inert` will disable the dialog too" — D3 causes the exact failure
   the risk names.
3. **L14 protected-test flip** — CONFIRMED. `e2e/L14-bet-actions.spec.ts:151` asserts "pressing Escape
   does NOT close the dialog" (its AC-8, line 7). Plan flags this flip. But the flip collides with spec
   validation scenario 2 — see C-2.
4. **GlobalSearchPanel cmdk vs focus trap** — **PROTECTED TEST WILL BREAK, UNDER-FLAGGED.** See C-3.
   `GlobalSearchPanel.cmdk.test.tsx:40` asserts `overlay.className` matches `/z-50/`, and line 50 asserts
   `max-w-[640px]`. The migration removes raw `z-50` (→ `--z-dialog`) and AC-3's grep gate *forbids* `z-50`
   on overlays. This protected test's assertions directly contradict the migration. The plan lists the file
   as protected ("assertions must not change") but never flags that these two assertions MUST change.
5. **AC-5 boilerplate gate as static, not runtime** — CONFIRMED CORRECT. Plan §AC-5 + task 10 implement it
   as eslint-plugin-design rule OR a `scripts/` grep in `verify:quick`, per CLAUDE.md. `verify:quick` =
   `check && lint && knip` (no tests) — correct home. `eslint-plugin-design` has 13 rules already and a
   `require-stories-sibling` rule, so the plumbing exists.
6. **AI1 concurrent tokens.css / z-token landing order** — CONFIRMED handled. Plan Risk #1 + task 3 land
   the token block in the *first* migration commit (before any consumer references it), satisfying AI1's
   "unknown token = build failure" gate ordering. Correct.

---

## Dimension scores

| Dim | Score | Note |
|---|---|---|
| 1. Spec Alignment | 8 | All 6 ACs → verification rows; all 4 validation scenarios covered; matches `approved.md` contract; AG3/AG5 fenced. Loses 2 for inheriting the design's unresolved kill-confirm/scenario-2 conflict (C-2) into the plan unflagged. |
| 2. Layer Integrity | 9 | Pure Human-Interface presentation; no data/process-layer touch; DS owns primitive, web consumes. focus-trap-react into DS is correct layering (primitive owns focus). |
| 3. API Contracts | 8 | `DialogProps` + `UseDialogBehavior` fully typed with closed enums (`DialogLayer`, `DialogSize`). Prop-getter return shapes specified. See W-2 (getOverlayProps `role` is `string`, not closed). |
| 4. Data Model | n/a | No schema. Correctly N/A. |
| 5. Naming | 9 | `Dialog` / `useDialogBehavior` / `DiscardConfirmStrip` / `DialogPortalRoot` honestly describe; no clash with closed primitives (Bet/Task/Thread/Block). `--z-*` band names are self-documenting. |
| 6. Module Depth | 8 | One public component + one deliberately-exported hook (the escape hatch) hiding scrim/focus/inert/scroll-lock/guard. Small surface for the complexity. The hook export is justified (non-box surfaces), not per-consumer sprawl. |
| 7. Failure-Mode Coverage | 7 | Security block present, every class marked N/A-with-reason (presentation-only — correct). DoS-via-stuck-lock and focus-escape addressed. Loses points for C-1 (inert can disable dialog) and the jsdom portal-target gap (W-1). |
| 8. Simplicity | 8 | No speculative abstraction; 2-deep stacking explicitly out of scope; guard is in-place strip not second dialog. D2's TS-constant-map alternative was a real (not straw-man) second option. |
| 9. Verifiability | 6 | Red-tests-first ordering is correct (tasks 1–2 before impl). But: protected-tests list is populated yet **two of its entries carry assertions that must change and the plan only flags one** (CC-008). AC-3 static-vs-Playwright method waffles mid-row. jsdom portal-root mounting unspecified in test (W-1). |

---

## CRITICAL

- **C-1 [plan §D3 + §"Type signatures" `inert` line + Risk #4 — the `inert` mount decision contradicts
  itself].** D3 mounts `<DialogPortalRoot/>` *inside `AppShell`*, which renders inside `#root`. The plan
  then says `inert` is set "on `#root` siblings of `#overlay-root` while a modal is open." If
  `#overlay-root` is a child of `#root` (which D3 produces), then `#root` has no sibling to inert except
  `<body>`'s other children — and worse, inerting `#root` would inert the dialog itself (it lives inside
  `#root`). Verified: `index.html` ships only `<div id="root">`; nothing else under `<body>`. → **Fix:**
  `DialogPortalRoot` must append `#overlay-root` to `document.body` as a **sibling of `#root`** (a
  `useEffect` that creates/appends to `body`, not a JSX child of `AppShell`), OR `index.html` must add a
  static `<div id="overlay-root">` sibling. The plan must pick one and state which element receives `inert`
  (it should be `#root`, with `#overlay-root` as its sibling). As written, the `inert` AC (AC-2 focus,
  security "focus-trap escape") cannot pass.

- **C-2 [plan §recon line 41 + Route checklist #7 + Protected tests note — kill-confirm dirty-guard
  conflicts with spec validation scenario 2, and the plan adopts the conflict without resolving it].**
  Spec validation scenario 2 (binding): *"Given any confirmation dialog, when Escape is pressed, then it
  closes — same as every other confirmation."* The plan maps WorkBet kill-confirm to `isDirty = reason
  non-empty`, so a **typed** reason → Esc **guards (does not close)** → fails scenario 2 verbatim. This is
  the same conflict raised as C-2 in the design critique; the architecture plan inherits it and adds a
  protected-test flip (L14:151) on top, but resolves neither. → **Fix:** the plan must state the resolution
  explicitly: either (a) confirmation `reason` fields are classified **clean** (`isDirty=false` always) so
  Esc always closes a confirm — satisfies scenario 2 + the L14 flip is then simply "empty-or-typed, Esc
  closes" — OR (b) flag that spec scenario 2 needs amendment to "clean confirmation" and get sign-off. The
  plan currently says L14's assertion flips to "Esc on a typed reason guards" — which is choice (b)
  *without* the spec amendment, leaving the build to fail scenario 2. Pick (a) or escalate (b); do not
  leave it implicit.

- **C-3 [plan §Protected tests — `GlobalSearchPanel.cmdk.test.tsx` assertions WILL break and are not
  flagged].** The file is listed as protected ("assertions must not change"), but verified at source:
  line 40 asserts `overlay.className` matches `/z-50/` and line 50 asserts `max-w-[640px]`. The migration
  (checklist #12: "replaces `modal-open z-50`") removes `z-50`, and AC-3's grep gate forbids `z-50` on
  overlays — so this protected test's `z-50` assertion is in direct contradiction with the change. → **Fix:**
  add `GlobalSearchPanel.cmdk.test.tsx` to the same "sanctioned assertion change" carve-out as L14: the
  `z-50` assertion updates to assert the resolved `--z-dialog`/zIndex 60 (or the `data-` layer attribute),
  and confirm the `max-w-[640px]` palette-width assertion survives the chrome migration (the palette is
  `useDialogBehavior`, not boxed `Dialog`, so its max-width may legitimately stay — state it). Currently
  the plan promises this file's assertions won't change while the migration guarantees two of them must.

---

## WARNING

- **W-1 [plan §task 2 + "Type signatures" — `Dialog.test.tsx` "portals into `#overlay-root`" but no test
  precedent for `createPortal` or a mounted overlay-root exists in DS jsdom].** Verified: zero `createPortal`
  usage anywhere in DS today; zero `inert` usage anywhere in the repo. In a bare DS jsdom test, `#overlay-root`
  won't exist unless the test mounts `DialogPortalRoot` first or `Dialog`/the hook lazily creates the node.
  The plan says `DialogPortalRoot` "mounts #overlay-root once" but task 2's `Dialog.test.tsx` may render
  `Dialog` without that root. → State the test setup: either Dialog/hook lazily ensures `#overlay-root` (so
  it's self-sufficient in tests) or the test harness mounts `DialogPortalRoot`. Also confirm `inert` is
  feature-detected (the plan says "no-op fallback") since jsdom may not implement it.

- **W-2 [plan §"Type signatures" `getOverlayProps` returns `role: string`].** `role` is typed as open
  `string`; the spec cares about `role="dialog"` vs the non-modal case. A non-modal popover (Notification)
  and a modal dialog have different `role`/`aria-modal` pairings. → Close the type:
  `role: "dialog"` (and document the `aria-modal` boolean already present). Open `string` lets a consumer
  pass a wrong role and defeats the "wire dismissal can't-go-wrong" goal.

- **W-3 [plan §AC-3 verification row — method waffles between static grep and Playwright in one cell].**
  The AC-3 row literally reads "Static: grep asserts no z-[30]... (lint-style check in a *.test.ts reading
  source? NO — use a Playwright assertion on computed z-index)." The plan argues itself out of one method
  mid-sentence. Per CLAUDE.md, "no raw `z-[N]` on overlays" is a **static** property → eslint rule (the
  AC-5 gate can subsume it), while "TaskSheet stacks below Popover in both orders" is **runtime** →
  Playwright. → Split AC-3 cleanly: static no-raw-z gate (lint) + Playwright computed-z stacking assertion.
  As written a builder won't know which to implement.

- **W-4 [plan §Migration order task 8 — "update each file's component tests in lockstep (assertions
  unchanged; only open/close plumbing differs)"].** For the bare-`<dialog>` family this is mostly true, but
  any component test asserting on `showModal`, the `open` attribute, or a raw `z-`/`font-heading`/`text-sm`
  class will need assertion changes (the migration deletes `showModal`, drops `font-heading`/`text-sm`
  titles). → Audit the 6 migrated files' existing `*.test.tsx` for assertions on those exact tokens before
  declaring "assertions unchanged"; list any that must change alongside L14 and cmdk (C-3).

---

## SUGGESTION

- **S-1 [plan §task 3 / Z-layer block — `--scrim` is a hardcoded rgba, AI6 wants it tokenized].** Mirrors
  design-critique W-2: AI6 explicitly lists "the AppShell scrim" as a missing semantic token. AI2 minting
  `--scrim: rgba(26,21,16,0.45)` as a literal pre-empts AI6's token shape. → One line stating whether AI2's
  `--scrim` is final or a placeholder AI6 reshapes, and give it a proper dark-mode value in the
  `[data-theme]` block (the plan says "dark-mode variant in the [data-theme] block" — make sure task 3
  actually adds it, not just the light value).

- **S-2 [plan §task 11 — AC-1 Playwright references `Q3-bet-creation`/`L16-bet-pitch` for the Esc-guard
  capture, but the guard's *keyboard discard path* is unspecified].** Ties to design-critique C-1: there's
  no documented keyboard route to "Discard" (only Keep-editing via second Esc). The Playwright test should
  assert the discard path the design lands on (focus moves to the strip; Tab+Enter reaches Discard), so the
  test pins the resolution of design C-1.

- **S-3 [plan §Phase 0.2 — portal mount "after content" — confirm ordering vs DialogPortalRoot-in-body
  fix].** If C-1 is fixed by appending `#overlay-root` to `body`, the "mounted once inside AppShell"
  language in D3/§Phase-0.2 should be reworded so the builder doesn't re-introduce the child-of-`#root`
  bug.

---

## What's Working Well

- **The plan reconciliation table is exemplary CC-007 defense.** Every spec assumption is checked against a
  real grep result ("Confirmed `grep` → NONE in tokens.css", "In `packages/web` only, NOT in design-system").
  This is exactly the spec/codebase-drift discipline the rubric rewards — and it let me verify all six risks
  in minutes because the claims were already pinned to file:line. Three of the six risk-flags (focus-trap
  placement, AI1 ordering, AC-5-as-static-gate) are fully correct and need no change.
- **Scope discipline.** AG3 (verified not-started: no progress file, BetCreateDialog still at
  `pages/work/BetCreateDialog.tsx`) → BetCreate correctly kept in scope; AG5 popovers and toast positioning
  explicitly excluded; security block honestly N/A'd rather than padded. The plan delivers exactly the 13
  surfaces, nothing more.

---

## Re-critique round 1 (commit 52aac41d, designer claimed 12/12 resolved)

ARCHITECTURE-SCORE: 8/10  rounds=2  score-line: SA:9 LI:9 AC:9 DM:n/a N:9 MD:8 FMC:8 S:8 V:8

Verified all source-grounded claims against real files: `packages/web/index.html` (only
`<div id="root">` under `<body>`), `main.tsx` (mounts into `#root`),
`GlobalSearchPanel.cmdk.test.tsx` (`:40` `/z-50/`, `:47` `max-w-[640px]`, `:38` `.modal.modal-open`,
`:45` `.modal-box`), `AD8b-AssistantOverlay.test.tsx` (`:108` `/z-30/`), `CocOverlay.test.tsx`
(`:108` `/z-30/`), `WorkBet.L14-actions.test.tsx` (AC-8 `:5` "Escape doesn't close"),
`KnowledgeRow.factory.test.tsx` (`:40` `.not.toContain("font-heading")`), `L14-bet-actions.spec.ts`
(`:151` "pressing Escape does NOT close the dialog"). The §task-8 audit's per-file claims are
**accurate** — every cited line/assertion exists exactly as described, and the files claimed
clean (Knowledge/Bet/Routine/Scope/af13/TaskSheet) carry no z-/showModal/font-heading/text-sm
assertion.

| Finding | Verdict | Evidence |
|---|---|---|
| **C-1** `inert` mount self-contradiction (`#overlay-root` child of `#root`) | **RESOLVED** | D3 corrected: `DialogPortalRoot` renders `null` and *imperatively appends* `#overlay-root` to `document.body` via `useEffect` → true sibling of `#root`; `inert` applied to `#root` only; `#overlay-root` + `body` never inerted. Verified precondition holds: `index.html` ships only `<div id="root">`, `main.tsx` mounts into it — so inerting `#root` inerts exactly the app background and nothing in the overlay tree. Task 6 + Risk #4 + the result-tree diagram all restate it consistently; the `ensureOverlayRoot()` factoring makes it test-self-sufficient (resolves W-1 too). Sound. |
| **C-2** kill-confirm dirty-guard vs validation scenario 2 (adopted unresolved) | **RESOLVED** | Plan recon line + route checklist #7/#8 + sanctioned-change #1 now all state: confirmation passes `isDirty={false}` ALWAYS → Esc closes (empty or typed). The drafted "typed = dirty → guard" rule is explicitly dropped. Scenario 2 satisfied verbatim; L14 flip is now "Esc closes" (not "typed guards"). Matches design §1.1. No residual conflict. |
| **C-3** cmdk protected-test assertions break, unflagged | **RESOLVED** (with a narrow residual — see W-new) | New "Sanctioned assertion changes" section #2 names `GlobalSearchPanel.cmdk.test.tsx` `:40` `/z-50/` (must change → assert `--z-dialog`/zIndex 60 or `data-dialog-layer`) and confirms `:50` `max-w-[640px]` SURVIVES with rationale (palette uses `useDialogBehavior`, not boxed `Dialog`). Carve-out is real and correct. |
| **W-1** jsdom `#overlay-root` / portal precedent absent | **RESOLVED** | Task 2 now specifies `ensureOverlayRoot()` lazily creates/appends `#overlay-root` (idempotent) so a bare DS jsdom test is self-sufficient; `inert` feature-detected (`"inert" in HTMLElement.prototype`), no-op under jsdom, asserted under Playwright instead. Directly addresses the gap. |
| **W-2** `getOverlayProps` `role: string` open type | **RESOLVED** | Type signature changed to `role: "dialog"` (closed literal); `aria-modal` boolean documented as the modal/non-modal differentiator. |
| **W-3** AC-3 method waffles static vs Playwright | **RESOLVED** | AC-3 row split cleanly: (a) static lint gate (no raw `z-[N]`, subsumed by AC-5 gate / `verify:quick`) + (b) Playwright `dialog-layering.spec.ts` computed-z assertion in both open orders. No more in-cell waffle. |
| **W-4** unaudited migrated-file test assertions | **RESOLVED** | Task 8 now carries a concrete grep audit naming every migrated test, separating the 5 clean files from the 3 carve-outs (L14, cmdk, AssistantOverlay/CocOverlay). Spot-checked all named files — audit is accurate. |
| **S-1** `--scrim` AI6 token shape + dark value | **RESOLVED** | Task 3 mints `--scrim` as explicit placeholder, adds dark value `rgba(20,16,12,0.62)`, AI6 finder comment. |
| **S-2** keyboard discard path in AC-1 Playwright | **RESOLVED** | AC-1 row now asserts focus-on-"Keep editing" + Tab+Enter→Discard, pinning design §1.2. |
| **S-3** portal-mount wording vs body-sibling fix | **RESOLVED** | Task 6 + D3 reworded to forbid the JSX-child mount explicitly. |

### WARNING (new this round)

- **W-new [Sanctioned change #2 — cmdk carve-out under-specifies the broken *selectors*, not just the
  `z-50` className].** The cmdk test does more than assert `/z-50/`. Verified at source: line 38
  queries `container.querySelector(".modal.modal-open")` and line 45 queries `.modal-box`. The
  migration of `GlobalSearchPanel` to `useDialogBehavior` deletes the DaisyUI `modal modal-open` /
  `modal-box` chrome — so **both query selectors return `null` and the test throws before reaching
  any className assertion**, regardless of the `z-50`→`--z-dialog` edit the carve-out names. The
  carve-out sanctions the *assertion* (`/z-50/` → zIndex 60) but not the *selector* the assertion
  reads from. A builder following the carve-out literally updates the matcher and leaves the
  `.modal.modal-open` query, and the protected test stays red. → Widen sanctioned-change #2 one
  line: the cmdk overlay/box **selectors** also migrate (e.g. to a `data-dialog-layer`/role-based
  query or the new overlay container class), and `max-w-[640px]` must be re-found via whatever
  selector replaces `.modal-box`. Narrow, but it keeps a protected test green vs red. (This is the
  same class of omission the original C-3 caught, one level deeper.)

**New score: ARCHITECTURE 8/10 (was 7).** All three CRITICALs resolved and verified against real
source; all four WARNINGs + three SUGGESTIONs addressed. Spec Alignment 8→9 (scenario-2 conflict
gone), API Contracts 8→9 (`role` closed), Failure-Mode 7→8 (inert resolved, jsdom portal-root
specified), Verifiability 6→8 (protected-test audit concrete and accurate, AC-3 split). Held off a
9 by the one new WARNING (cmdk selector under-specification) — a narrow build-time correctness gap,
not a design flaw.

**ARCHITECTURE VERDICT: REVISE — one remaining WARNING (W-new). One-line fix; no CRITICAL.**

---

## Re-critique round 2 (commit 0a87de3c — cmdk carve-out widened to selectors)

ARCHITECTURE-SCORE: 9/10  rounds=3  score-line: SA:9 LI:9 AC:9 DM:n/a N:9 MD:8 FMC:8 S:8 V:9

Scope: the one open finding (W-new). Verified the widened carve-out (architecture.md §389-435 +
protectedTests inline comment :386) against `GlobalSearchPanel.cmdk.test.tsx` line-by-line.

**W-new — RESOLVED.** Every line citation in the carve-out is exact against source:
- `:38` `container.querySelector(".modal.modal-open")`, `:39` `not.toBeNull()` guard, `:40`
  `toMatch(/z-50/)`, `:45` `.modal-box`, `:46` `not.toBeNull()` guard, `:50` `/max-w-\[640px\]/`,
  `:56` `[data-testid="search-recent-queries"]` precedent — all verified present at the cited lines.
- The throw mechanism is diagnosed correctly: post-migration both `querySelector` calls return
  `null`, the `:39`/`:46` `not.toBeNull()` guards throw **before** any className matcher runs — so
  a `:40`-only edit leaves the test red. The carve-out now sanctions BOTH selectors (`:38` overlay
  + `:45` box) across BOTH `it()` blocks, the `:40` assertion update, and re-targets the surviving
  `:50` `max-w-[640px]` through the replacement selector. The "both parts required / `:40`-only
  leaves it red" warning is explicit. The two-part sanctioned change is **complete and builder-proof
  on its core promise: no protected test is left red.**

The original C-3 / W-new omission class (assertion sanctioned but feeding selector left broken) is
fully closed.

### SUGGESTION (new, non-blocking — does not reopen W-new)

- **S-4 [carve-out lead selector `[data-dialog-layer="dialog"]` is unbacked by the
  `getOverlayProps` contract].** The carve-out names `[data-dialog-layer="dialog"]` as the primary
  replacement selector in 5 places (:386, :416, :419, :425, :432) and `data-dialog-layer="overlay"`
  for SANCTIONED CHANGE #3 (:440). But the `getOverlayProps()` typed return shape (architecture.md
  :186) emits only `{ role: "dialog"; "aria-modal": boolean; style: { zIndex }; ref; onKeyDown }`
  — **no `data-dialog-layer` key.** approved.md carries no overlay-props contract either (:122 is
  only the `layer` prop enum). So the attribute the carve-out tells the builder to query is not in
  the primitive's contract. This is **not** a reopening of W-new and **not** build-blocking: every
  carve-out location pairs the unbacked attribute with a working fallback — `data-testid`/role, the
  "same container element," or computed `zIndex === "60"`/`"40"` — so a builder always reaches green
  without the attribute. The defect is coherence, not correctness. → One-line fix, pick one:
  (a) add `"data-dialog-layer": DialogLayer` to the `getOverlayProps` return type at :186 (makes the
  lead selector real and is the cleaner test hook), OR (b) demote `data-dialog-layer` to the
  fallback and lead the carve-out with computed-`zIndex`/`data-testid` (which the contract already
  backs). Builder can proceed regardless; flagging so the lead recommendation matches the API.

**New score: ARCHITECTURE 9/10 (was 8).** Verifiability 8→9 (the last protected-test carve-out is
now complete and its throw mechanism correctly diagnosed; both `it()` blocks + both selectors +
re-targeted max-width covered). Held off a 10 by S-4 — a non-blocking coherence gap between the
carve-out's lead selector and the `getOverlayProps` type, with a working fallback already present in
every location.

**ARCHITECTURE VERDICT: APPROVED — W-new resolved and verified against source. The cmdk carve-out
is complete and builder-proof (no protected test left red). One non-blocking SUGGESTION (S-4,
lead-selector coherence); no CRITICAL, no WARNING. Cleared to build.**
