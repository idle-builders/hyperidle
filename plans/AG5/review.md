# AG5 — Phase 4 Code Review (reviewer)

PR #273 · branch `feat/AG5-canonical-dropdown` · `git diff origin/main...HEAD`
Scope: one canonical dropdown. Reviewed against AG5 spec (TRACK-AG.md), `plans/AG5/architecture.md`, both critique rounds, `.claude/rules/aesthetic-quality.md`.

## Verdict: **NOT DONE** (round 1) → **DONE** (round 2 — see addendum at bottom)

The migration code itself is correct and the contracts are respected (single `Select`, single `Menu`, `BlockActionsPopover` renders through `Menu`, `RecipientPicker` documented-distinct, lint rule registered+enforcing, behavior-preservation gate L14+AF12 green). **But the visual/Playwright AC — the one the spec calls out as non-closable without rendered-app evidence — is unmet: the e2e spec is broken (8/8 fail), captures zero screenshots, and was never run green.** Two code WARNINGs (focus management, width regex) round it out.

---

## AC completeness audit

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Every select-style picker renders through one shared primitive; no hand-rolled `<select>`/ad-hoc class strings remain | **PASS** | `grep "select select-sm\|select-bordered\|selectStyle" packages/web/src` → 0 hits. 9 call-site files import `Select` from `@hyperidle/design-system` (SettingsModels, SettingsAgents, AgentAdd/Edit, WorkBet, ScopeChangeDialog, RoutineCreate, BetCreate, SettingsOrgChart). `selectStyle` object deleted from SettingsOrgChart; `inputStyle` correctly left (out of scope). ESLint `design/no-handrolled-select` registered (`index.ts:30`), `recommended: "error"` (`index.ts:45`), rule test 73-line suite passes. `npm run lint` → 0 errors. |
| 2 | All dropdowns share resting/hover/focus/open/disabled appearance + same keyboard behavior | **PASS (structural)** | Single class source `SELECT_CLASS_BASE`+`SELECT_SIZE` in `Select.tsx`; native `<select>` ⇒ keyboard parity by construction. The *visual* "identical chrome" proof is the Playwright AC (see #6 — FAIL). |
| 3 | Popover menus consolidated OR documented-distinct; no accidental dup of open/position/item-style | **PASS** | `Menu` is single owner. `BlockActionsPopover.tsx` refactored to thin wrapper rendering through `<Menu>` (no own `role=menu`/item chrome/Escape). WorkBet + KnowledgeDetail overflow render through `Menu`. `grep 'role="menu"' packages/web/src` → 0 handrolls. `RecipientPicker` `@lore AG5` documents distinct (`role=listbox`, not menu). |
| 4 | Shared dropdown is catalogued, story-backed, reached-for-first, less code than hand-rolling | **PASS** | `Select.stories.tsx` (Default, Sizes, WithPlaceholder, FullWidthVsFixed, DisabledOption). `Menu.stories.tsx` (Default, WithShortcuts, WithDisabledItem, AlignStart, DataAttrsPassthrough). Both catalogued in `DESIGN.md` (Select Tier 0; Menu Tier 1 §"Menu (AG5)"). `require-stories-sibling` enforces. |
| 5 | Narrow-viewport + a11y ≥ replaced controls (keyboard, focus ring, SR roles) | **PARTIAL / WARNING** | Select: native ⇒ ≥native, `min-h-[44px]` floor at ≤1024px (AQ-015) present. Menu: `role=menu/menuitem`, `aria-disabled`, Escape, click-outside, arrow/Home/End, focus-visible outline — strictly better than old bet menu. **BUT** Menu does NOT focus first item on open and does NOT restore focus to trigger on close (plan §4 + critique §8 promised both). Keyboard-only open→ArrowDown does nothing until the user manually focuses an item. See WARNING-A. |
| 6 | Consolidation visually tested via Playwright: ≥3 surfaces screenshotted, reviewed side-by-side, found consistent + aesthetic, zero AQ hard-rule violations | **FAIL** | Spec `packages/web/e2e/ag5-dropdown.spec.ts` exists but: (a) **0 screenshots** — no `page.screenshot()` / `toHaveScreenshot()` anywhere (only a comment). (b) **8/8 tests FAIL** — never ran green. (c) `verify` does NOT include `test:e2e` (`package.json:30`), so attestation passed without this spec ever running. The spec's own header claims "screenshots captured + reviewed" — false. This AC is unclosable without rendered-app evidence; there is none. See CRITICAL-A. |

**Validation scenarios:** S1 (3-surface side-by-side identical) — NOT proven (no screenshots, tests fail). S2 (keyboard-only open/move/commit/close + focus ring) — NOT proven (Menu lacks focus-on-open; e2e S4 broken). S3 (grep no hand-rolled selects) — PASS.

---

## Findings by lens

### CRITICAL

**CRITICAL-A — e2e spec broken + screenshot-less; visual AC (AC #6) unproven.**
`packages/web/e2e/ag5-dropdown.spec.ts` — all 8 tests fail when run (`npx playwright test ag5-dropdown` from `packages/web`). Root causes:
- **Wrong bet route.** Lines 130, 181, 218 navigate `/work/bets/${BET_ID}` (plural). Real route is `/work/bet/:id` (singular) — confirmed: `L14-bet-actions.spec.ts:142` and `AF12-lifecycle.spec.ts:102` use `/work/bet/${ID}`. Result: WorkBet pages render "Page not found"; `bet-overflow-btn` / currency-select never appear → S2b, S4, S4b all fail.
- **Wrong Settings selector.** Lines 91, 285 use `getByRole("tab", { name: /models/i })`. Settings nav renders **buttons**, not tabs (error-context page-snapshot shows `button "Models"`). → S1, T1 fail. The working `settings.spec.ts` opens Settings via `getByRole("button", {name:/user profile/i})` after `goto("/")` + `waitForSelector("[data-testid='main-content']")`; the ag5 spec does none of that.
- **No screenshots.** Zero `page.screenshot()`/`toHaveScreenshot()` calls. The AC and the spec's own docblock ("resting + open screenshot", "≥3 surfaces … reviewed side by side") are unfulfilled.
- **Never ran green.** `verify` (`package.json:30`) = check+lint+knip+build only — excludes `test:e2e`. The attestation is real but does not cover this spec.

Fix: correct route to `/work/bet/${BET_ID}`; navigate Settings via the avatar/profile button + Models **button** (mirror `settings.spec.ts`); add `page.screenshot({ path: … })` on ≥3 surfaces (settings select, bet-create select, routine-create select, bet menu open, knowledge menu open); RUN the spec to green; capture and visually review the screenshots for chrome consistency + AQ hard-rule pass. AC #6 cannot be closed until a human/agent has looked at the rendered output.

### WARNING

**WARNING-A — Menu missing focus-on-open and focus-restore-on-close.**
`packages/design-system/src/Menu.tsx` — no `useEffect` focuses the first `menuitem` when `open` flips true, and no trigger-ref restore on close. Plan §4 ("Focus moves into first item on open; returns to trigger on close") and arch-critique §8 (scored 9/10 on this basis) both require it. Consequence: a keyboard-only user who activates the trigger lands with focus still on the trigger; `ArrowDown` (handled only by `menuitem` onKeyDown) does nothing until they manually Tab into the panel — fails validation scenario 2 ("opens, moves selection, commits, closes without a mouse"). The 6 Menu keyboard tests mask this: each calls `items[0].focus()` manually before dispatching (`Menu.test.tsx:259,271,287,…`), so none asserts the open→focus path.
Fix: on `open` true, focus `menuRef.current?.querySelector("[role='menuitem']:not([disabled])")`; capture the previously-focused element (or accept a trigger ref) and restore it on close. Add a test asserting `document.activeElement` is the first item immediately after render with `open=true` (no manual focus).

**WARNING-B — `hasWidthToken` regex false-positives on `max-w-`/`min-w-`.**
`packages/design-system/src/Select.tsx:45` `return /\bw-/.test(cls);` — `\b` matches the boundary inside `max-w-md` and `min-w-[…]` (the `-` before `w` is a non-word char). So `className="max-w-md"` (no real `w-*`) returns true → base `w-full` suppressed → control renders with **no width constraint**, unintentionally shrinking. No live regression (current callers pass only `w-[88px]`/`w-full`), but it is a latent trap that defeats the conditional-`w-full` mechanism the moment a caller passes a `max-w-`/`min-w-` utility — exactly the drift AG5 exists to prevent.
Fix: tighten to match a true width utility only, e.g. `/(?:^|\s)w-/.test(cls)` (matches `w-` only at token start, so `max-w-`/`min-w-` don't trigger). Add a test for `max-w-md` → full-width preserved.

### NOTE

- **NOTE-1 — DESIGN.md disabled-item claim inaccurate.** `DESIGN.md` §Menu says disabled items have `pointer-events-none`. `Menu.tsx` uses the `disabled` attribute + an onClick guard, not a `pointer-events-none` class. Cosmetic doc drift; correct the wording.
- **NOTE-2 — Doc-skip justification reasonable.** Builder judged "no user-facing doc changes needed (visual consolidation only)" and instead catalogued `Menu` in `DESIGN.md`. Reasonable — AG5 is presentation consolidation, no user-facing behavior change; DESIGN.md is the right home. Accurate apart from NOTE-1.
- **NOTE-3 — Menu `act()` warnings.** `Menu.test.tsx` emits React `act()` warnings (state updates outside `act`). Tests pass; noise only. Optionally wrap effect-triggering renders.
- **NOTE-4 — Disabled item at list edge receives focus.** `handleItemKeyDown` arrow-nav moves to `index±1` without skipping `disabled` items; a disabled edge item can hold focus but Enter/Space/click are guarded to no-op. Acceptable (WAI-ARIA allows focusing disabled menuitems); not blocking.

### Security
No issues. The `dataAttrs: Record<string,string>` spread (`Menu.tsx:151`) is constrained: all live callers pass literal string-keyed `data-*` constants (`{"data-bet-action":"kill"}`, `{"data-testid":"knowledge-archive"}`) — no user/network-derived values reach it, no XSS surface (React escapes attribute values; keys are author-controlled literals). Spread onto a `<button>` cannot inject event handlers or `dangerouslySetInnerHTML`. Safe as used.

### Simplification / Slop
Clean. `overflow-dropdown-${bet.id}` id + `[&[open]]:block` toggle fully removed (C5) — only a comment notes the removal (`WorkBet.tsx:1079`); no orphaned refs (`grep overflow-dropdown` → comment only). No `selectStyle` leftover. No dead code, no drifted DaisyUI class strings. `BlockActionsPopover` correctly thinned. Type-clean: no new `any`/unsafe `as`; `satisfies MenuItem` used at WorkBet call sites.

---

## What must change before DONE
1. **CRITICAL-A:** fix `ag5-dropdown.spec.ts` (route `/work/bet/`, Settings via profile-button + Models button, add ≥3 screenshots), RUN it green, and visually review the captured screenshots for chrome consistency + zero AQ hard-rule violations. AC #6 + validation scenarios 1–2 depend on this.
2. **WARNING-A:** add focus-on-open (first enabled item) + focus-restore-on-close to `Menu.tsx`; add a test for the open→focus path.
3. **WARNING-B:** fix `hasWidthToken` regex so `max-w-`/`min-w-` don't false-trigger; add a `max-w-md` test.

NOTE-1 (DESIGN.md wording) is a one-line cleanup. NOTEs 2–4 are non-blocking.

---

# Round 2 — Re-review addendum (reviewer)

Builder applied fixes in 5 commits (`e08bc779` e2e+evidence, `65eb38d0` Menu focus, `ce1419fc` Select regex+AQ-015, `e58478af` DESIGN.md, `ac2f3369` visual evidence). Each finding verified against live code + by running things.

## Verified-fix table

| Finding | Fix | Verified how | Result |
|---|---|---|---|
| **CRITICAL-A** — e2e broken (8/8 fail), 0 screenshots, never green | Routes corrected to `/work/bet/:id` (singular), Settings via `/conversations?settings=open`, WorkTeam `/work/team/:id`, portfolio `/work/portfolio`; 6 `page.screenshot()` added across 5 surfaces | Ran `npx playwright test ag5-dropdown` → **8 passed (6.1s)**. Opened all 6 `test-results/ag5-s*.png` myself — rendered app, real chrome | **FIXED** |
| **CRITICAL-A (visual judgment)** — chrome consistency + AQ hard-rules | n/a (evidence) | My own eyes on S1/S2/S2b/S3/S4/S5: identical warm-tan 1.5px border, white `--surface-elevated`, same CSS-triangle arrow, `--r-default` containers across all 5 surfaces. S2b currency select renders narrow (~88px "USD" beside "1000") — width passthrough confirmed visually. S4 bet menu + S5 knowledge menu = identical panel chrome; S4 "Kill" in `--status-error` red. Zero AQ hard-rule violations observed. `visual-review.md` judgment **confirmed independently** | **FIXED** |
| **WARNING-A** — Menu no focus-on-open / no focus-restore | `useEffect([open])` captures `document.activeElement` into `previousFocusRef`, rAF-focuses first `[role='menuitem']:not([disabled])` on open, restores on close (`Menu.tsx:60–81`) | 3 new tests (`Menu.test.tsx:473,493,515`) assert `document.activeElement` is auto-focused first item **with no manual `.focus()`** — including the disabled-skip path and trigger-restore. Ran → 41/41 Menu+Select tests pass. Not masked | **FIXED** |
| **WARNING-B** — `hasWidthToken` false-positives on `max-w-`/`min-w-` | Regex tightened to `/(?:^|\s)w-/` (`Select.tsx:56`) | `Select.ag5.test.tsx:254,270` assert `max-w-md` + `min-w-[100px]` preserve `w-full`; `:283` asserts `w-[88px]` suppresses it. All green | **FIXED** |
| **WARNING-B (AQ-015 deviation)** — builder changed `SELECT_SIZE` `sm:`→`xl:` | `sm` size now `min-h-[44px] xl:min-h-[32px]` (`Select.tsx:44`) | **Correct and AQ-015-justified.** AQ-015 requires ≥44px at viewport ≤1024px. `xl:` = 1280px, so the 32px dense variant only applies at ≥1280px; the 44px floor holds for the entire ≤1024px band. The old `sm:` (640px) violated AQ-015 in the 640–1024px window. No visual regression: at 1440px (S1) `xl:` applies → settings selects dense, matching the screenshot; below 1280px the floor is a strict a11y improvement. e2e T1 (`:496`, 1024px viewport) asserts every settings select ≥44px → green | **FIXED (sound deviation)** |
| **NOTE-1** — DESIGN.md `pointer-events-none` claim | Reworded to "native `disabled` attr + onClick guard" (`DESIGN.md:238`) | Read; matches `Menu.tsx` implementation | **FIXED** |

## AC completeness — round-2 re-run (flipped rows)

| # | Acceptance criterion | R1 | R2 | Evidence |
|---|---|---|---|---|
| 5 | Narrow-viewport + a11y ≥ replaced controls | PARTIAL/WARNING | **PASS** | WARNING-A closed — Menu now focuses first enabled item on open + restores to trigger on close, asserted without manual focus. Keyboard-only open→ArrowDown→Enter→Escape path now works end-to-end (e2e S4 green) |
| 6 | Consolidation visually tested via Playwright: ≥3 surfaces screenshotted, reviewed side-by-side, consistent + aesthetic, zero AQ hard-rule violations | FAIL | **PASS** | e2e spec **8/8 green**; 6 screenshots across 5 surfaces captured + reviewed by reviewer's own eyes; chrome consistent; zero AQ hard-rule violations. Rendered-app proof bar met |

ACs 1–4 unchanged (PASS). Validation scenarios S1 (3-surface identical) and S2 (keyboard-only drive + focus ring) now **proven** — were NOT proven in R1.

## Regression spot-check
- `npm run test` (fast) → **421 files / 4331 tests pass**.
- `npm run check` → all 12 packages PASS (0 type errors).
- `npm run lint` → 0 errors (warnings/infos are pre-existing repo baseline).
- `grep "select-bordered\|select select-sm"` → 0; `grep 'role="menu"' packages/web/src` → 0. Consolidation intact.

## Remaining (non-blocking)
- **NOTE-3** (Menu `act()` warnings) — still emits; tests pass; cosmetic noise. Not fixed, not required.
- **Attestation coverage** — `verify` (`package.json`) still excludes `test:e2e`, so `ag5-dropdown.spec` does not run in the CI fast-attestation chain. The spec was run green manually this round and screenshots reviewed, which satisfies AC #6's rendered-app evidence bar. Future tracks relying on this spec for regression protection should wire it into `test:e2e`/CI — out of scope for AG5, noted for the track.

## Verdict: **DONE**

All R1 blockers (CRITICAL-A, WARNING-A, WARNING-B) verified fixed against live code and by running the e2e spec to green + viewing every screenshot. NOTE-1 corrected. The AQ-015 `sm:`→`xl:` deviation is sound and improves touch-target compliance. Every AC now PASS with proof; the visual/Playwright proof bar the track flagged as non-closable-without-rendered-evidence is met.
