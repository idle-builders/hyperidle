# AJ7 — Annotator v2: devtools-style element inspector (architecture)

**Reads:** `plans/AJ7/concept.md`, `plans/AJ7/design/approved.md` (LOCKED decisions 1-7),
`plans/AJ7/design/critique.md`. This plan is what the builder executes — it does not re-derive design.

**Scope:** A dev-only (`:8098` viewer) rebuild of the AJ5 annotation overlay's *interaction surface*.
The persisted domain (`Annotation`, `Round`, `AnnotationTarget`, `AnnotationState`) and its server-side
machinery (`annotation-store`, `request-handler`, `vite-plugin-annotations`) are reused. One additive
optional field (`anchor`) joins `AnnotationTarget`. No production-bundle code, no new framework, no new
domain primitive. Three-layer boundary: this is all dev-tool chrome — it touches no product layer.

---

## 1. Module / component breakdown

All new client modules live under `packages/design-system/viewer/annotations/`. The rail + overlay are
React; the rect hook + anchor are framework-light pure helpers (jsdom-testable).

```
viewer/annotations/
  types.ts                 (EXTEND: AnnotationTarget gains optional `anchor`; new AnnotationAnchor)
  resolve-component.ts     (REUSE verbatim — fiber walk + data-ds + "unknown")
  resolve-anchor.ts        (NEW: computeAnchor(el, root) + resolveAnchor(anchor, root))
  use-element-rect.ts      (NEW: live-tracking rect hook — scroll(capture)+resize, rAF-throttled)
  highlight-overlay.tsx    (NEW: HighlightLayer — pointer-events:none box+label, mutually-exclusive sources)
  inspector-rail.tsx       (NEW: InspectorRail — collapsible rail chrome: arm, breadcrumb, comment, notes)
  use-picker.ts            (NEW: usePicker engine — armed/hover/selected/notes/re-highlight + handlers)
  annotation-overlay.tsx   (REWRITE: AnnotationOverlay composes usePicker + InspectorRail + HighlightLayer;
                            wires to /__annotations; retires the AJ5 pill + element-mutating classes)
  annotation-store.ts      (REUSE — appendAnnotation/startRound/readState/renderMarkdown unchanged)
  request-handler.ts       (EXTEND validateBody: accept optional target.anchor; render anchor-aware md? no)
  vite-plugin-annotations.ts (REUSE verbatim)
viewer/main.tsx            (FIX: storyRoot callback-ref → state, so overlay receives the live root)
viewer/viewer.css          (EXTEND: .anno-hl-*, .anno-rail*, .anno-crumb*, .anno-note-row; RETIRE
                            .anno-hover/.anno-selected/.anno-saved/.anno-pill/.anno-popover/.anno-list-panel)
```

**Why split `use-picker.ts` and `use-element-rect.ts` out of `annotation-overlay.tsx`:** the engine and the
rect hook are the two pieces with non-trivial runtime behavior that the red-phase tests assert against
(import + render in jsdom). Keeping them as separate exported modules lets tests target them directly
without mounting the whole overlay. The overlay file becomes thin composition.

**Component budget:** `HighlightLayer` is the one NEW visual shape (box+label). It is used in 3 contexts
(live hover, held selection, re-highlight) → earns its budget per the design-system rule. `InspectorRail`
is dev-chrome, not a catalogued product component (it never enters `src/` or the snapshot net), so it does
not consume product component budget. The AJ5 element-mutating outline classes are retired (net negative).

---

## 2. Types

### 2.1 Persisted contract (extend `types.ts`)

```ts
/** NEW: a re-resolvable descriptor so a saved note can re-find its element later.
 *  Best-effort only (concept hard-rule #5): a miss degrades to "not visible", never errors. */
export interface AnnotationAnchor {
  /** Child-index path from the story root down to the element, root-most first.
   *  e.g. [0, 2, 1] = root.children[0].children[2].children[1]. Stable across re-render
   *  as long as sibling order is unchanged. */
  path: number[];
  /** Resolved component name at capture time (corroboration; resolveAnchor prefers path,
   *  falls back to nearest-by-component if the path no longer resolves). */
  component: string;
  /** Element descriptor at capture time (tag.class "text") — last-resort match + display. */
  element: string;
}

export interface AnnotationTarget {
  component: string;
  dsComponent: string | null;
  element: string;
  /** NEW, OPTIONAL. Absent on all AJ5 annotations (back-compat). Present → re-highlight can
   *  re-resolve the element. Absent → re-highlight is honestly "not visible". */
  anchor?: AnnotationAnchor;
}
```

`Annotation`, `Round`, `AnnotationState`, `AnnotationInput` are **unchanged in shape** — `AnnotationInput`
carries the extended `AnnotationTarget` transitively, so its `target.anchor` is optional automatically.

### 2.2 `use-element-rect.ts` (NEW)

```ts
export interface Rect { top: number; left: number; width: number; height: number; }

/** Live-tracking rect for a DOM element. Re-measures getBoundingClientRect() on window
 *  `scroll` (CAPTURE phase, so it fires for scroll inside any nested scroll container) and
 *  `resize` while `el` is non-null. Updates are rAF-throttled (one measure per frame max).
 *  Returns null when el is null. (Resolves critique CRITICAL #1.) */
export function useElementRect(el: HTMLElement | null): Rect | null;

/** Pure, exported for tests: viewport-coord rect of an element. */
export function measureRect(el: HTMLElement): Rect;

/** Pure, exported: is this rect fully or partly outside the current viewport? */
export function isRectOffscreen(rect: Rect, viewportW: number, viewportH: number): boolean;
```

`useElementRect` contract (the load-bearing fix):
- On `el` change → measure immediately (sync, via `useLayoutEffect` so the first paint isn't a frame behind).
- Attach `window.addEventListener("scroll", onChange, true)` (capture) + `window.addEventListener("resize", onChange)`.
- `onChange` schedules a single rAF that calls `setRect(measureRect(el))`; coalesces multiple events per frame.
- Cleanup: remove both listeners + cancel any pending rAF on `el` change / unmount.

### 2.3 `resolve-anchor.ts` (NEW)

```ts
import type { AnnotationAnchor } from "./types.js";

/** Build the re-resolvable anchor for an element, bounded by the story root.
 *  path = child-index chain root→el (excludes root itself). component+element from resolveComponentTarget. */
export function computeAnchor(el: HTMLElement, root: HTMLElement): AnnotationAnchor;

/** Re-find the element a saved anchor points to, within the current story root.
 *  Strategy (best-effort, in order):
 *   1. Walk `path` from root; if every index resolves to an element → return it.
 *   2. ELSE fall back: querySelectorAll within root, pick the first whose resolved
 *      component === anchor.component AND element descriptor === anchor.element.
 *   3. ELSE return null. (Caller renders "not visible".) */
export function resolveAnchor(anchor: AnnotationAnchor, root: HTMLElement): HTMLElement | null;
```

`@lore`-worthy: the child-index path is chosen over a CSS selector because the inspected stories have
generated class names and repeated structures (three identical `BetCard`s) — a positional path is the
only descriptor that distinguishes `betcards[0]` from `betcards[2]`. The component+element fallback covers
the case where the story re-renders with one fewer sibling (path shifts) but the target still exists.

### 2.4 `use-picker.ts` (NEW)

```ts
import type { AnnotationTarget, Annotation } from "./types.js";

/** Resolved hover/selection: the live element + its AnnotationTarget (incl. computed anchor). */
export interface PickTarget { target: AnnotationTarget; el: HTMLElement; }

/** A breadcrumb crumb — already DEDUPED by the engine (decision 5). */
export interface Crumb { el: HTMLElement; label: string; isCurrent: boolean; }

export interface Picker {
  armed: boolean;
  arm(): void;
  disarm(): void;            // detaches one-shot listeners; returns focus to arm button (caller wires)
  hover: PickTarget | null;  // live hover target while armed
  selected: PickTarget | null;
  crumbs: Crumb[];           // ancestor chain of `selected`, deduped; [] when none selected
  selectCrumb(el: HTMLElement): void;
  reHighlightEl: HTMLElement | null;   // element a hovered note row resolves to (live), or null
  reHighlightMissing: boolean;         // true when a hovered note's anchor did NOT resolve ("not visible")
  beginReHighlight(a: Annotation): void;
  endReHighlight(): void;
  clearSelection(): void;
}

/** Engine. `storyRoot` is the live (non-null) story content element — the overlay only renders the
 *  picker once main.tsx provides it (the wiring fix). One-shot capturing click listener on storyRoot
 *  (AJ5 lore preserved). The picker holds ELEMENT references (HTMLElement), not frozen rects — rects
 *  are computed live by useElementRect in the overlay/layer (decision 3). */
export function usePicker(storyRoot: HTMLElement): Picker;
```

Note: the picker deliberately stores `HTMLElement` refs, **never** `Rect`. This is the structural guard
against the frozen-box drift — there is no rect in the engine to go stale. Rects live only in the overlay's
`useElementRect` calls. **SUPERSEDES PROTOTYPE** (`usePicker` stored `{ target, rect }`).

### 2.5 Component props

```ts
// highlight-overlay.tsx
type HighlightTone = "hover" | "selected" | "rehighlight";
interface HighlightLayerProps {
  /** The element to frame; the layer calls useElementRect on it (live-track). null → renders nothing. */
  el: HTMLElement | null;
  label: string;
  tone: HighlightTone;
}
function HighlightLayer(props: HighlightLayerProps): React.JSX.Element | null;

// inspector-rail.tsx
interface InspectorRailProps {
  picker: Picker;
  round: number;
  annotations: Annotation[];
  note: string;
  onNoteChange(v: string): void;
  onSave(): void;            // overlay owns the POST + saving/error state
  saving: boolean;
  error: string | null;
  onNewIteration(): void;
  collapsed: boolean;
  onToggleCollapsed(): void;
  armButtonRef: React.RefObject<HTMLButtonElement | null>; // for focus-return (AJ5 parity)
}
function InspectorRail(props: InspectorRailProps): React.JSX.Element;
```

---

## 3. Re-resolvable anchor strategy (full)

**Save path:** on click-select, `usePicker` resolves the target via `resolveComponentTarget(el)` AND
computes `anchor = computeAnchor(el, storyRoot)`. The POST body's `target` carries `{ component,
dsComponent, element, anchor }`. `request-handler.validateBody` accepts `anchor` when present (validates
`path` is a number[], `component`/`element` are strings) and accepts its absence (back-compat). The store
persists it verbatim — `annotation-store` needs no change (it spreads `input.target`).

**Re-highlight path:** on note-row hover, `beginReHighlight(annotation)`:
1. If `annotation.target.anchor` is absent → `reHighlightMissing = true` (AJ5 notes; "not visible").
2. Else `el = resolveAnchor(anchor, storyRoot)`.
   - `el === null` → `reHighlightMissing = true` ("not visible" — in spec, this is "not in DOM").
   - `el !== null` → `reHighlightEl = el`. The overlay then: if `isRectOffscreen(measureRect(el), …)`,
     `el.scrollIntoView({ block: "center", behavior: "auto" })` THEN render `HighlightLayer` (which
     live-tracks via `useElementRect`). (Resolves critique CRITICAL #2 — off-screen vs not-in-DOM split.)

**When it can't re-find:** never an error, never a crash. The row shows a muted "not visible" affordance.
This honors concept hard-rule #5 (anchor best-effort, never load-bearing for correctness).

---

## 4. Breadcrumb dedupe (decision 5 / critique WARNING)

`usePicker` builds `crumbs` by walking `selected.el.parentElement` up to (not past) `storyRoot`, resolving
each via `resolveComponentTarget`. Dedupe rule applied while building, root-most first:
- Compute each crumb's label as `component` (e.g. `"BetCard"`).
- If a crumb's `component` **equals the previous kept crumb's `component`**, do NOT add a second
  `"BetCard"` crumb — instead set that crumb's label to its **element descriptor** (`div.betcard-head`)
  so it is visually distinct, OR (when even the descriptor is uninformative) collapse it out entirely.
- Result: `BetCard › div.betcard-head › span.title` instead of `BetCard › BetCard › BetCard`.
- `isCurrent` flags the crumb whose `el === selected.el`. Clicking any crumb → `selectCrumb(el)` re-points
  `selected` to that ancestor (held box live-tracks the new element).

This is a pure transform on the resolved chain — testable in jsdom by asserting `picker.crumbs` labels are
distinct given a nested same-component DOM.

---

## 5. The wiring fix (task #1 — load-bearing, blocks everything)

`main.tsx` today: `const storyRootRef = useRef(null)` then `storyRoot={storyRootRef.current}` (line 473).
`.current` is `null` on the render that mounts the overlay; mutating a ref never re-renders → `arm()` hits
`if (!storyRoot) return` and attaches no listeners. **Selection does nothing today.**

**Fix:** replace the ref with a **callback ref → state** so the overlay re-renders once the element exists.

```tsx
const [storyRoot, setStoryRoot] = useState<HTMLDivElement | null>(null);
const storyRootCb = useCallback((node: HTMLDivElement | null) => setStoryRoot(node), []);
// TsxComponentView: <div ref={storyRootCb} className="demo-grid"> … </div>
// overlay: {isComponentPage && storyRoot && (
//   <AnnotationOverlay story={route} variant={activeVariant} storyRoot={storyRoot} />
// )}
```

`TsxComponentView`'s prop changes from `storyRootRef: RefObject<…>` to `storyRootCb: (n) => void` (callback
ref). `AnnotationOverlay`'s `storyRoot` prop tightens from `HTMLElement | null` to `HTMLElement` (the
overlay only mounts once the root is non-null — the guard moves to the call site). `usePicker(storyRoot)`
then always has a live root.

`@lore` to leave in `main.tsx`: a callback ref re-renders the parent when the node attaches; a `useRef` does
not. The overlay needs the *element*, so it must be state, not a ref.

---

## 6. Persistence wiring (reuse AJ5 middleware)

- `AnnotationOverlay` owns `note`, `saving`, `error`, `state` (fetched from `GET /__annotations` on mount,
  exactly as AJ5). `onSave` POSTs `{ story, variant, note, target }` to `/__annotations`; on `!res.ok` →
  `setError("Couldn't save — the viewer middleware may be down. Retry?")`; while in flight → `saving=true`
  ("Saving…", Save disabled). On success → re-set state from the response, clear selection + note. **This
  is verbatim AJ5 parity** (resolves critique WARNING "no save/error state").
- `onNewIteration` → `POST /__annotations/round` (unchanged).
- `request-handler.validateBody` extended to accept optional `target.anchor` (see §3). All other validation
  (string fields, no path-traversal shapes) unchanged.

---

## 7. CSS (extend `viewer.css`)

Retire (delete the rules): `.anno-hover`, `.anno-selected`, `.anno-saved`, `.anno-pill`, `.anno-popover*`,
`.anno-list-panel`. Add (mapped from the prototype's `aj7-` fallbacks to real Hearth tokens — the critique
notes tokens are judged on correctness, not the prototype literals):
- `.anno-hl-box` / `.anno-hl-label` (`position:fixed; pointer-events:none; z-index` above story, below rail
  header per NICE-TO-HAVE clamp note). Tones via `data-tone` (`--accent-primary` solid for hover, dashed
  for selected/rehighlight). Label uses `--font-mono`, `--r-subtle`, clamped within viewport (NICE-TO-HAVE).
- `.anno-rail` (sticky right column) + `.anno-rail--collapsed` (thin strip) + `.anno-rail-toggle` (chevron).
- `.anno-crumbs` / `.anno-crumb` (deduped breadcrumb, crumbs are `<button>`).
- `.anno-notes` / `.anno-note-row` (`<button>` rows — focusable, `:focus` re-highlights) with `max-height` +
  `overflow-y:auto` (decision 6). `.anno-note-row[data-missing]` → "not visible" muted treatment.
- Reuse the AJ5 `.anno-target*`, `.anno-error`, textarea, `.anno-save` styles for the docked comment block.
All values from Hearth tokens; motion via `--motion-fast`/`--motion-ease`; respect `prefers-reduced-motion`
(no transition on the overlay box; rail blocks fade only).

---

## 8. Ordered task list (builder)

1. **Wiring fix (`main.tsx`)** — callback-ref → state for `storyRoot`; `TsxComponentView` prop + overlay
   call-site guard (`storyRoot && …`). *Blocks every other behavior.* Red test: render `App` on a component
   route in jsdom, assert `AnnotationOverlay` receives a non-null `storyRoot` after mount.
2. **`use-element-rect.ts`** — `measureRect`, `isRectOffscreen`, `useElementRect` (scroll-capture + resize,
   rAF-throttled). Red tests: `measureRect` maps `getBoundingClientRect`; hook re-measures on dispatched
   `scroll`/`resize`; returns null for null el; cleans up listeners on unmount. *(CRITICAL #1.)*
3. **`highlight-overlay.tsx`** — `HighlightLayer` consuming `useElementRect`, three tones, label, viewport
   clamp. Red test: renders box+label when `el` set; renders nothing when `el === null`; box style follows
   the (mocked) rect.
4. **`resolve-anchor.ts`** — `computeAnchor` + `resolveAnchor` (path walk → component/element fallback →
   null). Red tests: round-trip on a nested DOM; path-shift falls back to component match; unresolvable →
   null. Reuse `resolveComponentTarget`.
5. **`types.ts` + `request-handler.ts`** — add `AnnotationAnchor`, optional `target.anchor`; extend
   `validateBody` to accept-but-not-require it. Red tests: POST with anchor → 200 + persisted; POST without
   anchor (AJ5 shape) → 200; malformed anchor → 400.
6. **`use-picker.ts`** — engine over a live `storyRoot`: one-shot capturing click (AJ5 lore), hover, select
   (stores `el`, computes target+anchor — no rect), deduped `crumbs`, `selectCrumb`, `beginReHighlight`/
   `endReHighlight` with off-screen→scrollIntoView + not-in-DOM→missing split. Red tests: arm attaches one
   listener; click selects + detaches; crumbs are deduped+distinct on same-component nesting (decision 5);
   re-highlight of an absent-anchor annotation sets `reHighlightMissing`. *(CRITICAL #2 + WARNING dedupe.)*
7. **`inspector-rail.tsx`** — collapsible rail chrome: arm button (+ `armButtonRef`), `Round N · M notes`,
   docked comment block (target echo + textarea + Save/Cancel + `Saving…`/error), deduped breadcrumb,
   always-visible notes list (`max-height`+scroll, focusable `<button>` rows that re-highlight on hover AND
   focus), collapse chevron. Red test: collapsed prop hides the comment/notes; note rows are buttons.
8. **`annotation-overlay.tsx` (rewrite)** — compose `usePicker` + `InspectorRail` + `HighlightLayer`; own
   `note`/`saving`/`error`/`state` + the `/__annotations` GET/POST/round wiring (AJ5 parity, §6); Esc closes
   selection then disarms, returning focus to `armButtonRef` (AJ5 parity); retire the pill + element-mutating
   classes. Red test: Save POSTs and shows "Saving…"; failed POST shows `.anno-error`; Esc returns focus.
9. **`viewer.css`** — add `.anno-hl-*`/`.anno-rail*`/`.anno-crumb*`/`.anno-note-row`; delete retired rules
   (§7). All Hearth tokens.
10. **Snapshot net re-bless** — the catalog gains the changed `AnnotatorV2.stories.tsx` lead variant (the
    prototype's three variants collapse to the one approved `VariantADevtoolsRail` reflecting the live build,
    or the story is updated to mirror the shipped chrome). Run `npm run test`, READ the DOM diff, confirm it
    matches intent, then `npm run ds:bless`. Keep the enumeration guards (`≥58`/`≥59`) intact — adjust the
    threshold only if the variant count genuinely changes, and only after reading the diff. *(Builder phase —
    designer does NOT bless.)*
11. **Live proof** — `npm run ds:serve`, open a component page at `:8098`, run the full loop:
    arm → hover (box tracks pointer) → click select (held box live-tracks while scrolling) → type → Save
    (real POST lands in `.annotations/annotations.json`) → hover the new note row (re-highlight; scroll a
    long story so the element is off-screen and confirm scrollIntoView fires) → click a breadcrumb crumb
    (confirm crumbs are distinct, not `BetCard › BetCard › BetCard`) → collapse the rail. Screenshot/observe
    each state. *(Definition-of-done proof; see §10.)*

---

## 9. Acceptance criteria (runtime-testable or static)

| # | AC | Verification |
|---|---|---|
| AC1 | `App` mounted on a component route passes a **non-null** `storyRoot` to `AnnotationOverlay` after mount (wiring fix). | Component test: render `App`, assert overlay prop / armed-click selects. |
| AC2 | `useElementRect(el)` re-measures on window `scroll` (capture) and `resize`; returns null for null el; removes listeners on unmount. | Unit/component test: dispatch events, assert returned rect updates; spy on remove. *(CRITICAL #1)* |
| AC3 | The held selection box and the re-highlight box are driven by `useElementRect` (no frozen rect anywhere in `use-picker`/overlay). | Static: `use-picker.ts` exports no `Rect` field (type check). Component test: scroll moves the rendered box. |
| AC4 | The inspector NEVER adds/removes a class on the inspected element (no `classList.add/remove` against story DOM). | Static lint/grep over `annotations/*.tsx` for `classList` mutation on non-overlay nodes; component test: inspected element's `className` unchanged after hover+select+save. *(concept hard-rule #1)* |
| AC5 | `computeAnchor`→`resolveAnchor` round-trips to the same element on an unchanged DOM; path-shift falls back to component+element match; unresolvable → `null`. | Unit test (jsdom). |
| AC6 | `request-handler` accepts a POST with `target.anchor` (200, persisted) AND a POST without it (AJ5 shape, 200); malformed `anchor` → 400. | Handler unit test. *(back-compat)* |
| AC7 | Re-highlight of an in-DOM-but-off-screen element calls `scrollIntoView` before drawing; a not-in-DOM (or anchor-less) note sets a "not visible" state, never errors. | Component test: spy `scrollIntoView` on off-screen el; assert missing state for absent anchor. *(CRITICAL #2)* |
| AC8 | Breadcrumb crumbs are deduped — no two consecutive crumbs render the identical label for the same-component ancestor chain; each crumb is a focusable `<button>`; clicking re-selects that ancestor. | Component test: nested same-component DOM → assert distinct labels + role=button + selectCrumb effect. *(WARNING dedupe)* |
| AC9 | The docked comment block shows `Saving…` (disabled) during the POST and an inline `.anno-error` on failure; Save re-enables after error. | Component test with mocked fetch (ok + reject). *(AJ5 parity)* |
| AC10 | Esc closes an open selection then disarms, returning focus to the arm button; note rows are keyboard-focusable and re-highlight on focus. | Component test: keydown Escape → focus on arm button; Tab to a note row → re-highlight fires. *(a11y WARNING)* |
| AC11 | Notes list has a bounded height with scroll (always-visible promise holds on long rounds); comment block stays on screen. | Component test: many annotations → list has `max-height`/overflow; static class assertion. *(decision 6)* |
| AC12 | The rail is collapsible: a control toggles to a thin strip that hides comment+notes and reclaims canvas width; expand is one click. | Component test: toggle `collapsed`, assert comment/notes hidden + control present. *(decision 1)* |
| AC13 | The overlay + rail render ONLY on a component page (`isComponentPage` guard) and never inside a story render → not in the snapshot net. | Existing AJ5 AC10 pattern: assert overlay absent on catalog route; snapshot enumeration guard unchanged. *(concept hard-rule #3)* |
| AC14 | No production-bundle leakage: annotation modules are imported only by the dev viewer; the Vite plugin stays `configureServer`-only. | Existing AJ5 AC9 lint/grep. *(concept hard-rule #4)* |
| AC15 | The full live loop works end-to-end on `:8098` (arm→hover→select→comment→save→re-highlight incl. off-screen→breadcrumb→collapse) with a real POST landing in `.annotations/`. | **Live proof** (manual run + observed output); not a unit test. *(DoD)* |

---

## 10. Must be proven LIVE (not by tests alone)

Per project DoD ("looked at the actual painted output"), AC15 is proven by running `:8098`, not by jsdom
(jsdom does not lay out — `getBoundingClientRect` is zero, `scrollIntoView` is a no-op). The builder must:
- Observe the hover box tracking the pointer and the held box **staying glued to the element while the page
  scrolls** (the founder's load-bearing requirement — frozen-box would visibly drift here).
- Save a real note and confirm it appends to `.annotations/annotations.json` with the `anchor` field.
- Re-highlight a note whose element is scrolled off-screen and confirm the page scrolls to it first.
- Confirm the breadcrumb shows distinct crumbs on the nested sample card (no `BetCard › BetCard › BetCard`).
The unit/component tests (AC1-AC14) gate the logic; the live run (AC15) gates the paint/geometry that jsdom
cannot see.

---

## 11. Risks / trade-offs

- **`scrollIntoview` + `useElementRect` interplay:** scrolling fires `scroll` events that the hook listens
  for (capture) — the box re-measures *during* the programmatic scroll, which is correct (it lands on the
  settled rect). `behavior:"auto"` (instant) avoids a multi-frame animation race; chosen over `"smooth"`.
- **rAF throttle vs. fast scroll:** one measure per frame can lag the box ~1 frame behind a flung scroll.
  Acceptable for a dev tool; the box re-settles the instant scrolling stops. Cheaper than measuring per
  event. (If it visibly lags in the live run, drop the throttle for `scroll` — measure synchronously — and
  keep rAF only for `resize`.)
- **Anchor path brittleness:** a story that conditionally renders siblings shifts indices; the component+
  element fallback covers it, and the worst case is an honest "not visible" — never a wrong element, never a
  crash (hard-rule #5).
- **Snapshot net churn:** rewriting the lead story variant changes one `.snap` entry; the net is *supposed*
  to catch that. Re-bless after reading the diff (task 10) — do not blind `-u`.
- **Story-count guard:** if collapsing three prototype variants to one changes the enumerated count, the
  `≥58`/`≥59` guards may trip; adjust the threshold deliberately, never by lowering it to silence a vacuous
  glob.

---

## 12. What this plan does NOT do (scope guard)

No new domain primitive; no persisted geometry; no pins; no multi-select; no cross-round history; no inline
note edit/delete; no mobile layout; no Chrome extension; no production-bundle code; no change to
`annotation-store`'s round model or markdown rendering. All per concept Phase 2 + Phase 4.
