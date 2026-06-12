# AG5 — Phase 4 Code Review (reviewer)

PR #273 · branch `feat/AG5-canonical-dropdown` · `git diff origin/main...HEAD`
Scope: one canonical dropdown. Reviewed against AG5 spec (TRACK-AG.md), `plans/AG5/architecture.md`, both critique rounds, `.claude/rules/aesthetic-quality.md`.

## Verdict: **NOT DONE**

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
