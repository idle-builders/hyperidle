# AG5 — Architecture Critique (reviewer, Phase 2)

Scope: `plans/AG5/architecture.md` against the 9-dimension architecture rubric. Checked for AC→verification mapping, single-primitive constraint, zero-behavior-change, visual-test coverage, a11y plan, migration ordering, and the lint-vs-test tool choice. Live code cross-checked.

## Required checks (from task brief)

| Check | Result |
|---|---|
| Every spec AC maps to a verification method | YES — §5 table covers all six ACs + the three validation scenarios. One mapping is weak (see C2). |
| Exactly one canonical dropdown primitive | YES for Select (extend in place, no second dropdown). Menu side is conditional — see C1. |
| Zero behavior change at call sites | MOSTLY — §3 says value/handler/options copied verbatim. **One real gap:** width passthrough (C3). |
| Playwright visual plan ≥3 surfaces | YES — §6 lists 5 surfaces (Settings, BetCreate, RoutineCreate, Bet menu, Knowledge menu) + a ≤1024px touch pass. Exceeds the ≥3 bar. |
| Keyboard/a11y plan ≥ native | YES — §4. Select native ⇒ ≥native by construction; Menu adds arrow/Home/End nav beyond what BlockActionsPopover has today. |
| Migration ordering sane; bet menu last | YES — §3 orders selects first, menus last, and §8 explicitly flags bet overflow as highest-risk "do last, run its tests immediately." Correct. |
| Static "no hand-rolled selects" AC → lint not test | YES and correct per CLAUDE.md. `eslint-plugin-design` exists with 13 sibling rules (`no-off-grid-spacing`, `require-stories-sibling`, etc.); `no-handrolled-select` fits the established pattern exactly. `require-stories-sibling` already auto-enforces the Menu `.stories.tsx` AC. |

## Per-dimension scores

**1. Type/interface design — 8/10.** `SelectProps` extension (`size`, `placeholder`, `options[].disabled`) is clean and additive; `Omit<…,"size">` correctly resolves the HTML `size` collision. `MenuProps`/`MenuItem` are well-shaped. Caller-owned trigger + `open`/`onClose` matches the existing BlockActionsPopover contract. **WARNING (C3):** no width affordance on the interface despite §3 requiring `w-[88px]`/`w-full` to "keep working via className" — see C3.

**2. API/contract correctness — 7/10.** Barrel export, alpha-ordering, and the verbatim-copy migration contract are right. **C1 (single-primitive):** §1.2 + the §1.2 reviewer-note default ("keep both to avoid the rename ripple") risks duplicating menu anatomy — see cross-cutting C1.

**3. Data-model / spec field fidelity — 9/10.** No data model; presentation-only, correctly. Option-set mapping (`<option>` → `options[]`) preserves `value`/`disabled`. OrgChart team-empty disabled-option handled via `options[].disabled` (matches live `SettingsOrgChart.tsx:438` need). Good.

**4. AC → verification completeness — 8/10.** §5 maps every AC. **WARNING (C2):** the AC "all dropdowns share resting/hover/focus/open/disabled appearance + same keyboard behavior" is verified by "render in each size, assert single shared class source" + visual — but asserting a "single shared class source" is closer to a lint/structural assertion than a behavioral test; the *behavioral* keyboard-parity claim for Select rests on "it's native" rather than an actual keyboard test. Acceptable (native is native) but the doc should state that explicitly rather than implying a component test proves keyboard behavior.

**5. Migration ordering / risk sequencing — 9/10.** Selects (low-risk, verbatim) → menus (consolidation) → bet overflow last (highest-risk, E2E-selector-bearing). §8 names the AH2 overlap ("apply presentation on top of AH's landed shape; if AH2 hasn't landed, migrate as-is"), the AI5 boundary (don't touch scope pill / RecipientPicker rows), and the `inputStyle` orphan (leave for AI-track, don't expand scope). Disciplined boundary handling. Strong.

**6. Test/proof strategy — 9/10.** Lint for the static AC (correct tool), component tests for Menu keyboard + touch-target floor, Playwright for ≥3-surface visual + keyboard-driven E2E. The behavior-preservation guard (§5 bottom: existing `WorkBet.AF12`, `W3-settings`, knowledge, RoutineCreate/BetCreate tests must still pass; update only selector strings, never asserted behavior) is exactly the right red-phase gate for a consolidation. Excellent.

**7. File-path / structure correctness — 9/10.** All paths verified against the worktree. New: `Menu.tsx`/`.stories.tsx`/`html/Menu.html`/`Menu.test.tsx`; edits to the 9 select files + 2 menu files + barrel + RecipientPicker lore. `html/Select.html` exists (parity anchor); `html/Menu.html` correctly net-new. Lint-rule location (`eslint-plugin-design`) is real.

**8. a11y plan — 9/10.** §4 is concrete and ≥native for both primitives. Bet menu's current state (no roles/Escape/click-outside) → Menu's full role=menu/menuitem/arrow-nav/focus-restore is a strict improvement. `aria-haspopup="menu"`+`aria-expanded` to be added to the WorkBet trigger (KnowledgeDetail already has them) — correctly identified.

**9. Risk register honesty — 8/10.** §8 is candid (AH2 overlap, AI5 boundary, E2E selectors, inputStyle orphan). Misses the width-passthrough behavior risk (C3) and under-specifies the testId/attr-name reconciliation (C4).

## Cross-cutting findings

**C1 — WARNING (single-primitive / "no accidental duplication" AC).** §1.2's *default* plan — "introduce additive `Menu`; **leave `BlockActionsPopover` as-is**" — leaves two components each owning a full, independent `role=menu` container + item chrome + Escape effect rendering the *same anatomy*. That is precisely the "two menus duplicate the same open/position/item-style logic" the spec AC forbids; renaming the duplication "general vs specialized" does not dissolve it. **Test (per task brief): wrapper SHARES ⇒ fine; wrapper DUPLICATES ⇒ not.** As written it duplicates. The fix is one line of intent, not appetite: `BlockActionsPopover` must be refactored to **render through `<Menu>`** (copy-feedback as an opt-in item), so the menu anatomy lives in exactly one place — or strict-rename to `Menu`. The architecture's "default keeps both to avoid the rename ripple" is acceptable *only* with the wrapper-renders-Menu refinement; the doc currently allows the non-sharing reading. Must commit to share-or-rename before green phase.

**C2 — NOTE.** Keyboard-parity verification for Select leans on "it's native"; make the doc say so explicitly rather than implying `Select.test.tsx` proves keyboard behavior (it cannot, jsdom doesn't drive native select keyboard). The Playwright keyboard E2E in §6 item 4 covers Menu, not Select — fine, but state that Select keyboard parity is by-construction, not test-proven.

**C3 — WARNING (zero-behavior-change violation, carried from design).** The live `Select` applies `className` to the **outer wrapper `<div>`** (`flex flex-col gap-[6px] ${className}`); the inner `<select>` is hard-coded `w-full`. So `className="w-[88px]"` (WorkBet currency, :574) sizes the wrapper, leaving the control full-width — a visible behavior change for the currency picker. §3 step 5 and §1.1 both assume `className` reaches the control. The interface needs an explicit control-width path (forward `className` to the inner `<select>`, or add a `controlClassName`/width prop), and the currency + `w-full` sites must be verified rendering at the intended width. Add to the §5 behavior-preservation gate.

**C4 — WARNING (E2E selector preservation, designer-flagged risk b).** Verified: bet e2e selects on **`data-bet-action="…"`** (a custom attr name) across `AF12-lifecycle.spec.ts` + `L14-bet-actions.spec.ts`; knowledge uses **`data-testid`**. §3's `MenuItem.testId → "data-testid or data-bet-action"` is ambiguous — a single `testId` emitting `data-testid` would break the bet e2e (which queries `[data-bet-action="kill"]`, not `[data-testid]`). The arch must specify that the bet items emit the literal attribute `data-bet-action` (not `data-testid`), e.g. a `dataAttrs?: Record<string,string>` passthrough or a dedicated `data-bet-action` slot, and that `data-testid="bet-overflow-btn"` (trigger, caller-owned) survives unchanged. Also: the trigger stays caller-owned (`bet-overflow-btn` button is not migrated), so only the panel + items move — call this out so the migrator doesn't touch the trigger selector. Resolve the attr-name ambiguity before implementing step 10.

**C5 — NOTE.** §3 step 10 replaces `toggleAttribute("open")` with React `useState` — correct, and it removes a DOM-mutation anti-pattern. Ensure the per-bet `id={\`overflow-dropdown-${bet.id}\`}` and the `hidden [&[open]]:block` CSS toggle are fully removed (no orphaned id refs). Low risk; flag for the migrator.

## Overall: 8.0/10 — REVISE

A disciplined, path-accurate, correctly-sequenced plan with the right tool choices (lint for the static AC, Playwright for visual/keyboard, component tests for Menu) and honest boundary handling (AH2/AI5/inputStyle). Three issues must be closed before the plan is buildable without regression:

- **WARNING C1:** commit `BlockActionsPopover` to render *through* `Menu` (share) or strict-rename — the current "leave as-is" default duplicates menu anatomy and violates the "no two menus duplicate item-style" AC.
- **WARNING C3:** `Select` `className` lands on the wrapper, not the control; `w-[88px]` currency width regresses. Add an explicit control-width path and add it to the behavior-preservation gate.
- **WARNING C4:** disambiguate `MenuItem.testId` → bet items must emit literal `data-bet-action` (not `data-testid`); preserve the caller-owned `bet-overflow-btn` trigger. Otherwise bet E2E breaks.

C2 and C5 are NOTEs — fold into the doc, not blocking. No CRITICALs.

---

## Round 2 addendum (re-critique after designer revision)

Re-read `architecture.md` against C1/C3/C4 (WARNINGs) and C2/C5 (NOTEs). Live code + the load-bearing Tailwind claim independently verified.

**C1 (Menu single-owner) — RESOLVED.** §1.2a now COMMITS `BlockActionsPopover` to refactor into a thin wrapper that renders through `<Menu>` — no own `role=menu` container, no own item chrome, no own Escape effect; copy-feedback/`liveRegionId`/`aria-controls` kept as local specialization. §7 moves it from "unchanged" to **edited (refactor)**. §5 adds the SHARE gate (component test: `BlockActionsPopover` produces a `Menu`-owned container, e.g. `data-ds-component="Menu"`, and defines no own `role=menu`/item classes) + lint (no `role=menu` hand-roll outside `Menu`). The non-sharing reading is gone. Committed across all three docs.

**C4 (E2E selector preservation) — RESOLVED.** `MenuItem.testId` ambiguity replaced by `dataAttrs?: Record<string,string>` verbatim passthrough (§1.2 line 46, §3 steps 10/11, §3 mechanism para, §8). Cross-checked against live code: `[data-bet-action="activate|adjust-appetite|unblock|kill"]` is queried verbatim in `AF12-lifecycle.spec.ts:106/141/164` and `L14-bet-actions.spec.ts:133/412/413/422`; live values at `WorkBet.tsx:1097–1131` are exactly those four. Bet items emit `data-bet-action`, knowledge items emit `data-testid` — both through the one passthrough. Caller-owned `data-testid="bet-overflow-btn"` (`WorkBet.tsx:1079`) correctly marked untouched. `knowledge-overflow-menu` panel (`KnowledgeDetail.tsx:380`) preserved. Airtight.

**C2 / C5 — folded.** C2: §4 line 114 + §5 line 124 state Select keyboard parity is by-construction (jsdom can't drive native select), `Select.test.tsx` asserts native-element, Playwright covers real keyboard, Menu keyboard IS test-proven. C5: §3 step 10 + §8 mandate deleting `overflow-dropdown-${bet.id}` + `[&[open]]:block` toggle (live at `WorkBet.tsx:1082/1089`), replace with `useState`, grep for orphans. Both correctly absorbed.

**C3 (control width) — WARNING downgraded to NOTE, with a correction the builder MUST heed.** The behavior risk is real and the arch now names the fix path and a hard gate (§5 #1/#2 currency=88px & full-width sites; §6 item 2b Playwright bbox ≈88px). **But the *primary* mechanism the arch states is provably WRONG.** §1.1 line 21/26 proposes `${SELECT_CLASS_BASE} ${SELECT_SIZE[size]} ${className}` and claims "later utility wins under Tailwind's same-specificity last-wins ordering for `w-*`." That assumes class-*attribute* order drives the cascade. It does not — CSS specificity is **stylesheet** order, not class-attribute order. Verified empirically against this repo's Tailwind 3.4.19:

```
.w-\[88px\] { width: 88px }   ← emitted FIRST in the generated stylesheet
.w-full     { width: 100% }   ← emitted LAST → WINS
```

Both selectors have equal specificity, so the later rule (`w-full`) wins regardless of class-attribute order. With base `w-full` present, the currency control renders **full-width**, not 88px — the exact regression C3 is meant to prevent. No `tailwind-merge`/`cn` exists in the repo (raw template-string concat), so nothing resolves the conflict at the class level.

The arch's saving grace: line 28 flags the claim `⚠️ UNVERIFIED` and names the **correct fallback** — "strip `w-full` from the base and apply it conditionally only when `className` contains no `w-` token." That fallback is verified correct (single `w-[88px]` rule with no competing `w-full` → renders 88px). The §5 gate + §6 2b Playwright bbox proof would catch the wrong primary at the visual gate. So the plan **does not break on contact** — it self-corrects via a named, proven fallback — which downgrades this from WARNING to NOTE per the contract (wrong-primary-but-concrete-fallback ⇒ NOTE). 

**Builder NOTE (mandatory):** do NOT implement the last-class-wins primary. Go straight to the conditional `w-full`: emit `w-full` in the base **only when** the caller `className` contains no `w-` token; when a width override is present, omit base `w-full` and let the caller class be the sole width rule. Keep §5 #1/#2 + §6 2b as the proof.

### Round-2 scores (revised)
- Dim 1 (Type/interface): 8 → **9** (C3 width path explicit on the interface contract; `dataAttrs` cleanly typed).
- Dim 2 (API/contract correctness): 7 → **9** (C1 committed share-through-Menu; no duplication reading remains).
- Dim 9 (Risk register honesty): 8 → **9** (C3 width risk + Tailwind-ordering caveat + C4 attr-name + C5 toggle-removal all now in §8; the `⚠️ UNVERIFIED` flag on the width mechanism is exactly the right honesty).
- All other dimensions unchanged.

### Round-2 overall: 9.0/10 — **PASS**
No CRITICAL, no WARNING remaining. One builder NOTE: implement the conditional-`w-full` width fallback (the stated last-class-wins primary is empirically false in TW 3.4.19); the §5/§6 gates are correct and will prove it either way.

