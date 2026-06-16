# AJ7 — Annotator v2 (devtools inspector): Code Review (Phase 4)

REVIEW-VERDICT: DONE  score=8.5/10  blocking=0  should-fix=3  nice=4
Reviewed: `git diff origin/main...HEAD` commits `4bd6431a` (tasks 1–10), `239e2097` (task 11), `174a6971` (artifact exclusion).
Gates: `npm run check` PASS (13/13 pkgs) · `npm run lint` exit 0 (warnings/infos only, all pre-existing classes) · AJ7 tests 89/89 PASS · live `:8098` proof confirmed.

**Verdict: DONE.** Every AC is MET; the founder's load-bearing no-occlusion + no-drift principles are honored structurally (engine stores `HTMLElement`, never a `Rect`); all prior design-critique and architecture-critique CRITICAL/WARNING findings are resolved in code. Three SHOULD-FIX items are quality/robustness, none block the build or a merge.

---

## AC audit (15/15 MET)

| # | AC | Status | Proof |
|---|---|---|---|
| AC1 | Non-null `storyRoot` reaches overlay after mount (wiring fix) | MET | `main.tsx:455-456,482-483` callback-ref→state; `wiring.test.tsx` asserts `storyRootCb` invoked with non-null `.demo-grid`; live: select works (annotation saved). |
| AC2 | `useElementRect` re-measures on scroll(capture)+resize; null for null el; removes listeners on unmount | MET | `use-element-rect.ts:55-86`; `use-element-rect.test.tsx` "re-measures on scroll/resize", "removes scroll+resize listeners on unmount". |
| AC3 | Held + re-highlight boxes driven by `useElementRect`; no frozen rect in engine | MET | `use-picker.ts` exports no `Rect` field (Picker iface = elements only); `HighlightLayer` calls `useElementRect`; `use-picker.test.tsx` AC3 anchor-not-rect; `highlight-overlay.test.tsx` box style follows measured rect. |
| AC4 | Inspector never mutates inspected element's classList | MET (runtime) | `annotation-overlay.test.tsx` AC4 className byte-identical after hover+select+save; no `classList.add/remove` anywhere in `annotations/*`. Grep-half of plan correctly dropped (arch-critique WARNING) — runtime assertion covers the hard rule. |
| AC5 | `computeAnchor`→`resolveAnchor` round-trips; path-shift→component+element fallback; unresolvable→null | MET | `resolve-anchor.test.tsx` 4 tests incl. betcards[0]≠[1] by path + path-shift fallback. |
| AC6 | Handler accepts POST with/without `target.anchor`; malformed anchor→400 | MET | `request-handler.ts:48-49,57-65`; `request-handler.test.ts` AC6 (valid anchor 200+persisted, AJ5-shape 200, path-not-number[]→400, component-not-string→400). |
| AC7 | Off-screen→`scrollIntoView` before drawing; not-in-DOM/anchor-less→"not visible", never errors | MET | `annotation-overlay.tsx:101-109` scrollIntoView effect; `use-picker.ts:172-190` missing split; `use-picker.test.tsx` AC7 (absent-anchor, not-in-DOM never throws). *Geometry half (real scroll) is jsdom-blind → live-proof scope.* |
| AC8 | Crumbs deduped (no identical consecutive labels), each a focusable `<button>`, click re-selects | MET | `use-picker.ts:73-102` deterministic dedupe (component→element→collapse); `use-picker.test.tsx` distinct labels + exactly-one current + selectCrumb; `inspector-rail.tsx:97-103` crumbs are `<button>`. |
| AC9 | "Saving…" disabled during POST; inline `.anno-error` on failure; Save re-enables | MET | `inspector-rail.tsx:125-130`; `annotation-overlay.tsx:112-136`; `inspector-rail.test.tsx` AC9 + `annotation-overlay.test.tsx` "failed POST renders .anno-error and re-enables Save". |
| AC10 | Esc closes selection then disarms→focus arm button; note rows keyboard-focusable, re-highlight on focus | MET | `annotation-overlay.tsx:147-166`; `inspector-rail.tsx:161-169` (`onFocus`/`onBlur`→re-highlight); `annotation-overlay.test.tsx` AC10 focus-return. |
| AC11 | Notes list bounded height + scroll | MET | `viewer.css:533-541` `.anno-notes{overflow-y:auto;flex:1;min-height:0}`; `inspector-rail.test.tsx` AC11. |
| AC12 | Rail collapsible to thin strip hiding comment+notes; expand one click | MET | `inspector-rail.tsx:63,88` `collapsed` gate; `viewer.css:329-332`; `inspector-rail.test.tsx` AC12; live chevron present. |
| AC13 | Overlay+rail render ONLY on a component page; never in snapshot net | MET | `main.tsx:482` `isComponentPage && storyRoot` guard; snapshot enumeration guards intact (`≥59`/`≥58`); overlay renders from `App`, not story render. |
| AC14 | No production-bundle leak; Vite plugin stays `configureServer`-only | MET | `vite-plugin-annotations.ts` unchanged (verbatim reuse); modules imported only by viewer + the dev-only story; `@lore DEV-ONLY` on every module. See note on `AnnotatorV2.stories.tsx` below — acceptable. |
| AC15 | Full live loop on `:8098` with a real POST landing in `.annotations/` | MET | Live: `:8098` 200; `.annotations/annotations.json` holds AJ7 notes with populated `anchor:{path:[0,1,0],component,element}` + variant `AllVariants` derived from `.demo-section`. Rail screenshot confirms docked, non-occluding, toolbar-cleared. |

---

## Prior critique resolution — ALL resolved in code (yes)

**Design-critique (8/10):**
- CRITICAL #1 held-box drift on scroll/resize → **YES.** Engine holds refs (`use-picker.ts:9-13` lore); `useElementRect` scroll-capture+resize+rAF. Frozen rect is unrepresentable.
- CRITICAL #2 off-screen vs not-in-DOM → **YES.** `annotation-overlay.tsx:101-109` split.
- WARNING a11y mouse-only → **YES.** Note rows are `<button>` with `onFocus`/`onBlur` re-highlight; Esc→arm focus.
- WARNING no save/error state → **YES.** `saving`/`error` restored, AJ5 parity.
- WARNING rail eats 320px → **YES (with caveat, see SF-1).** Collapsible (AC12).
- WARNING duplicate-crumb → **YES.** Deterministic dedupe `use-picker.ts:73-102`.
- NICE label clamp / 20-note overflow → **YES.** `max-width:360px`+ellipsis; `max-height`+scroll.

**Architecture-critique (8/10):**
- WARNING `activeVariant` hardcoded to `variants[0]` (silent AJ5 data-correctness bug) → **YES.** `annotation-overlay.tsx:51-58` `variantForElement` derives from `.demo-section[data-variant]`; live proof shows variant `AllVariants` recorded correctly; `annotation-overlay.test.tsx` "variant derives from enclosing .demo-section" (asserts `Compact`).
- WARNING snapshot-net guards count modules not variants → **YES.** Guards untouched (`≥59`/`≥58`); `AnnotatorV2` is one file → module count unchanged; one `.snap` entry re-blessed.
- WARNING live-track failure modes under-enumerated → **PARTIAL (see SF-2).** Rail-reflow case resolved (ResizeObserver, `annotation-overlay.tsx:90-99`); transformed-ancestor acknowledged as blind spot (`use-element-rect.ts:14-21` lore). **Element-unmount-while-held (`!isConnected` → 0×0 ghost) NOT implemented** — accepted in the plan resolution but absent in code.
- WARNING AC4 grep-as-test forbidden → **YES.** Runtime-only assertion.
- SUGGESTION listener-lifecycle ownership → **YES.** `usePicker` owns all listener lifecycle (`use-picker.ts:111-159`, idempotent `detach` + unmount effect); overlay never touches story-root listeners.
- SUGGESTION StrictMode double-invoke → **YES (structurally).** `cleanupRef` idempotent detach (`use-picker.ts:9-19` lore); `useElementRect` cleanup symmetric; live viewer runs under `<StrictMode>` (`main.tsx:497`) and selection works.
- SUGGESTION crumb collapse-vs-relabel determinism → **YES.** "relabel to element descriptor; collapse only when byte-identical" implemented exactly (`use-picker.ts:90-97`).

---

## Findings

### MUST-FIX
(none)

### SHOULD-FIX

**SF-1 [Design / no-occlusion] Default rail overlaps the canvas; canvas is not reflowed away from it.**
`ComponentWrapper` is `maxWidth:1024; margin:0 auto` (centered) and `.anno-rail` is `position:fixed; right:12px; width:320px` (`viewer.css:308-317`). On a 1440px viewport the centered canvas (~208–1232px) and the rail (~1108–1428px) **overlap ~120px**; wider stories (token tables, app-shell, full-bleed grids that ignore the 1024 cap) overlap more. Live screenshot confirms the "ALL VARIANTS" rows run full-width *behind* the rail. An element in the right strip cannot be hovered/clicked while the rail is expanded. approved.md §interaction-model #1 says "Canvas at full rail-minus width" — the canvas does not shrink. **Why not blocking:** the editor itself is fully docked and never floats over the canvas (the founder's binding principle is met); collapse is the founder-sanctioned remedy for wide stories (decision 1), and a right-edge element is reachable after one collapse click. **Fix:** add a right margin/padding to the component-page wrapper equal to the rail width (collapsing to the strip width when `collapsed`), e.g. a `body`/main-content right gutter driven by the rail state, so the canvas reflows instead of hiding behind the rail. Note: any such reflow must bump `measureKey` (it already does via the ResizeObserver on `storyRoot`).

**SF-2 [Adversarial / drift — "never lies" bar] Held / re-highlight box does not clear when its element unmounts (`!isConnected`).**
`useElementRect` calls `measureRect(el)` → `el.getBoundingClientRect()` unconditionally. When the held element is detached (story re-render, variant nav, conditional sibling removal), `getBoundingClientRect()` on a detached node returns all-zeros, so `HighlightLayer` renders a **0×0 box + label at viewport origin (top-left)** instead of disappearing. This is the exact failure the architecture-critique WARNING named and the plan accepted ("specify that `useElementRect`/overlay treats `!el.isConnected` as null → renders nothing, and the picker clears `selected`/`reHighlightEl` when its held element is no longer connected") — but no `isConnected` check exists anywhere (grep: 0 hits). **Fix:** in `useElementRect.onChange` (and the initial measure), if `!el.isConnected` → `setRect(null)`; and/or have `usePicker` clear `selected`/`reHighlightEl` when the held element disconnects (a MutationObserver on `storyRoot`, or the same ResizeObserver tick checking `isConnected`). Add the AC: "a held selection whose element unmounts clears the box (no 0×0 ghost)." Low frequency in static stories but trivially reproducible by switching variants while a selection is held.

**SF-3 [Adversarial / performance + correctness] `resolveAnchor` fallback scans `root.querySelectorAll("*")` and returns the FIRST component+element match — ambiguous on duplicate-component trees.**
`resolve-anchor.ts:67-72`: when the path walk misses, it linearly scans every descendant and returns the first whose `(component, element)` matches. On the stories AJ7 explicitly targets (three identical `BetCard`s — the WHY-CHILD-INDEX-PATH lore at `resolve-anchor.ts:8-13`), if the path shifts (a sibling removed) the fallback will re-highlight `betcards[0]` even when the note was on `betcards[2]`, because their `(component, element)` descriptors are byte-identical. The hard-rule guarantee ("never the wrong element") is technically violated in the duplicate case — though it lands on a same-component sibling, not a random element, and the worst real-world case is a one-card-off highlight, never a crash. **Why not blocking:** best-effort + dev-only + the common case (unchanged DOM) hits the exact path; the test only covers the *distinct*-content fallback (Beta survives). **Fix (cheap):** when >1 candidate matches `(component, element)`, prefer the one whose own child-index path is closest (smallest edit distance) to `anchor.path`, or return null rather than guess. At minimum add a test for the duplicate-identical-sibling fallback so the behavior is a decision, not an accident.

### NICE-TO-HAVE

**N-1 [Slop] `anno-crumb-sep` rendered via `i > 0` index check inside `.map` (`inspector-rail.tsx:94-96`)** is fine, but the separator could be a CSS `::before` on `.anno-crumb-wrap:not(:first-child)` — removes the JS index branch. Cosmetic.

**N-2 [Simplification] Two effects bump `measureKey` (`annotation-overlay.tsx:90-99`):** the ResizeObserver on `storyRoot` already fires on the rail-collapse grid reflow if the canvas reflows (SF-1). The separate mount-only `setMeasureKey` effect (`:97-99`) is a no-op redundancy (runs once at mount when there's nothing to re-measure). If SF-1 lands (canvas reflows), the standalone collapse-bump effect is fully covered by the observer and can be deleted.

**N-3 [Slop] `key={`hover-${measureKey}`}` remounts `HighlightLayer` on every reflow** to force re-measure. Works, but remount-to-re-measure is a heavier hammer than needed — `useElementRect` already re-measures on its own events; the key churn discards the box's React subtree each reflow. Acceptable for a dev tool; flag only.

**N-4 [Design] Arm button copy "Inspect"/"Selecting…"** deviates from AJ5's "Select"/"Selecting…" and the vocab table (design-critique NICE-TO-HAVE). "Inspect" is devtools-truer and the design-critique accepted it — confirm it's the intended single choice (it is, per approved.md state table). No action; noted for the vocab ledger.

---

## Out-of-scope items (confirmed genuinely out of AJ7 scope — do NOT block)

- **Density toggle in viewer Toolbar** (`main.tsx:374-428`): pre-exists on `origin/main` (4 refs); AJ7's diff does not add/modify it (the two `density` lines in the diff are unchanged context around the wiring fix). This is the separate MEMORY `project_density_removal` cleanup — correctly out of AJ7 scope.
- **Pre-existing AJ5 biome infos** (`useLiteralKeys` on `b["story"]`/`t["component"]` in `request-handler.ts`): the literal-key style pre-exists in AJ5 on `origin/main`; the builder followed the established pattern when additively extending `validateBody` + adding `validateAnchor`. Out of scope; `npm run lint` exits 0 (infos, not errors).

---

## Lens summary

- **Architecture (9):** clean module split; engine/chrome/rect-hook separation is exactly the right seam; `usePicker` owns all listener lifecycle idempotently; additive persisted contract (store unchanged — `target: input.target` spreads `anchor`); wiring fix correct. The frozen-rect bug is made *unrepresentable*, not merely avoided.
- **Design (8):** docked editor never floats over canvas (binding principle met); collapsible rail; non-occluding `pointer-events:none` highlight; deterministic deduped breadcrumb; all Hearth tokens; reduced-motion honored. Docked SF-1 (default overlap).
- **Security (9):** dev-only enforced (`@lore DEV-ONLY` + viewer-only imports + `configureServer` plugin unchanged); `validateAnchor` rejects non-number[] paths / non-string fields → 400; `anchor.path` is integer indices only, never used to build a filesystem path (path is fixed server-side, AJ5 lore); no injection / traversal / SSRF surface (localhost dev middleware, single founder).
- **Adversarial (7):** scroll/resize/rail-reflow drift all covered; save-500 → `.anno-error` + re-enable; off-screen scrollIntoView; one-shot detach prevents double-select. Gaps: SF-2 (`!isConnected` ghost), SF-3 (duplicate-sibling fallback ambiguity).
- **Simplification (8):** thin overlay composition; no premature generics; N-2/N-3 minor redundancy.
- **Slop (9):** no dead code, no copy-paste, no `toBeDefined`-only tests (every test asserts real behavior — distinct labels, exact rects, persisted anchor, focus target); lore is high-quality and load-bearing (SCROLL-CAPTURE, NO-FROZEN-RECT, RAIL-REFLOW, WHY-CHILD-INDEX-PATH). `b["story"]` literal-key style is inherited AJ5, not new.

Live-only ACs (AC7 geometry, AC15): covered by the `:8098` run — real POST with `anchor` landed in `.annotations/annotations.json`; rail render verified docked + toolbar-cleared via screenshot. AC2/AC3 geometry that jsdom cannot lay out is the documented blind spot, routed to live correctly.
