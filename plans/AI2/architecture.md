# AI2 — One dialog experience — Architecture plan

## Concept check (no /concept run — justification for the reviewer)

`Dialog` is a **UI-layer presentation primitive**, not a domain noun. It introduces no
Thread/Block/Bet-class concept and reshapes none: it owns backdrop, dismissal, focus, layer,
and mobile sizing — pure Human-Interface-layer mechanics. No data model, no process-layer
primitive, no canonical-store shape is touched. Per `.claude/rules/skill-discovery.md` the
`/concept` gate is for "a primitive / domain concept / load-bearing noun in the system";
"dialog" is a chrome shape, the kind explicitly handled by `/design` → `/architecture`
without `/concept`. Confirmed against the spec: AI2's contracts are "no data-model or
process-layer changes" (track preamble) — concept-free by the spec's own boundary.

## Required reading (before implementing)

- `plans/AI2/design/approved.md` — the locked visual + behavior contract. Do NOT re-decide
  chrome, the dismissal/guard rule, the z-scale, or the API shape.
- `plans/AI2/design/synthesis.md` — the rejection list (don't re-litigate native-top-layer,
  two-public-exports, per-surface guard logic, Esc-hard-block, 2-deep stacking).
- `packages/design-system/AESTHETICS.md` (AQ-005 mobile input, AQ-015 touch, AQ-006 radius,
  AQ-012/013 shadow/motion) + `.claude/rules/aesthetic-quality.md`.
- The reference pair: `packages/web/src/pages/AgentAddDialog.tsx` / `AgentEditDialog.tsx`
  (chrome source). The bare-`<dialog>` family + the `~25-line` boilerplate:
  `KnowledgeCreateDialog.tsx`, `BetCreateDialog.tsx`, `RoutineCreateDialog.tsx`,
  `ScopeChangeDialog.tsx`, and the two inline dialogs in `WorkBet.tsx` (`ConsequencePreviewDialog`,
  `AppetiteDialog`). The non-box surfaces: `TaskSheet.tsx`, `AssistantOverlay.tsx`,
  `NotificationPopover.tsx`, `GlobalSearchPanel.tsx`, `layouts/AppShell.tsx` (mobile drawer).

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "No shared dialog primitive exists" | Confirmed — DS `index.ts` exports no Dialog/Modal/Overlay/Portal | Build new `Dialog.tsx` in DS |
| Migrate 11 surfaces | Confirmed all 11 + GlobalSearchPanel + mobile drawer present at stated paths | 13 migration targets (spec's "eleven" + 2 shell overlays sharing the contract) |
| `focus-trap-react` reusable | **In `packages/web` only (^12.0.0), NOT in design-system** | **Decision D1 below** — add `focus-trap-react` to `packages/design-system/package.json` (`sharedFiles`). It's already in the lockfile; no new transitive surface. |
| Native `<dialog>` + `showModal` boilerplate in 6 files | Confirmed: KnowledgeCreate, BetCreate, RoutineCreate, ScopeChange, WorkBet×2 carry the JSDOM-guarded open/close effect | Approved design = portal, NOT native dialog → the boilerplate is **deleted**, not relocated |
| z-50 collisions, z-30 collisions | Confirmed: GlobalSearchPanel `modal-open z-50`, TaskSheet `z-50`, mobile-drawer `z-50`, mobile-scrim `z-40`, AssistantOverlay `z-30`, NotificationPopover `z-30` | New `--z-*` scale in tokens.css resolves all |
| No z/scrim tokens exist | Confirmed `grep` → NONE in tokens.css | Add 7 z-tokens + `--scrim` (Decision D2; AI1 overlap flagged) |
| Kill-confirm hard-blocks Escape | Confirmed L14 `cancel`-event `preventDefault` in WorkBet | **Replaced by the *confirmation-never-dirty* rule (approved.md §1.1): kill-confirm passes `isDirty={false}` ALWAYS → Esc closes whether the reason is empty or typed.** Satisfies spec scenario 2 verbatim. Removes the hard Esc-block. (NOT "typed = dirty → guard" — that drafted rule contradicted scenario 2; corrected this round.) |
| `font-heading` utility | **Undefined** — used in KnowledgeCreate/BetCreate `<h2>`; off-scale 14px (`text-sm`) | Dialog title chrome = 15px/600; migration drops `font-heading` + `text-sm` headings |
| DS tests run in jsdom with react-dom createRoot | Confirmed (`@vitest-environment jsdom`, `createRoot` + `act`, `pool:'forks'`) | Portal + focus-trap testable; carry `displayCheck:"none"` lore into the hook |

**No spec/concept contradiction found.** No migration of data shapes; pure presentation.

---

## Phase 0 — Interrogation (resolved, autonomous)

1. **Where does `focus-trap-react` live?** → It must move into the DS package (D1). The
   primitive cannot import a web-only dep. Confirmed by inspection.
2. **Portal mount point?** → A single `#overlay-root` that is a **sibling of `#root` under
   `<body>`**, not a child of `#root`. Decision D3 (corrected): `<DialogPortalRoot/>` is rendered
   inside `AppShell` but **imperatively appends the `#overlay-root` node to `document.body`** via
   `useEffect` (it does *not* render `#overlay-root` as a JSX child of `AppShell`, which would
   nest it inside `#root`). `createPortal` targets that body-level node. This keeps a single
   deterministic stacking container while making `#overlay-root` a true sibling of `#root` — the
   precondition for `inert` (see below).
3. **Does the guard need a confirm sub-dialog or in-place strip?** → In-place footer swap
   (approved design; 2-deep stacking is out of scope). One `<DiscardConfirmStrip>`.
4. **AI1 token collision?** → Real. AI1 edits `tokens.css` concurrently (dead-token gate).
   Decision D2: add the new tokens in a clearly-delimited block; flag in `sharedFiles`; if
   AI1's gate asserts referenced tokens resolve, the z-tokens must be defined before any
   surface references them (same PR).

---

## Decisions (design-it-twice where non-trivial)

### D1 — `focus-trap-react` placement
- **Option A:** add `focus-trap-react` to `packages/design-system/package.json` deps; the
  hook lives in DS. *Trade-off:* DS gains a runtime dep (already in lockfile, used by web).
  *Reject reason for B:* —
- **Option B:** keep focus-trap in web; DS `Dialog` accepts a `focusTrap` render-prop the web
  app injects. *Trade-off:* leaks an implementation concern into every consumer; the "one
  primitive owns focus" AC fails. *Reject:* defeats the unification — focus would be wired
  per-consumer again.
- **Chosen: A.** The primitive owns focus; the dep already exists in the monorepo lockfile.

### D2 — z-scale + scrim tokens
- **Option A:** CSS custom properties in `tokens.css` (`--z-drawer:30 … --z-toast:70`,
  `--scrim`), consumed via `z-[var(--z-dialog)]` Tailwind arbitrary or inline style.
  *Trade-off:* arbitrary-value Tailwind; AI1's gate must allow `var(--z-*)`. *Reject for B:* —
- **Option B:** a TS constant map `Z_LAYER = {...}` in `@hyperidle/shared`, spread as inline
  `zIndex`. *Trade-off:* z-values invisible to CSS/theme tooling; can't be themed; splits the
  scale across TS + CSS. *Reject:* the spec wants a *documented* scale; CSS tokens are the
  single source the dead-token gate (AI1) already governs.
- **Chosen: A.** One token block; `Dialog`/hook resolve `layer` → `var(--z-*)`.

### D3 — Public surface: one component, private hook + `#overlay-root` as a `body` sibling
- **Chosen (from approved.md):** public `Dialog` only. Private `useDialogBehavior` +
  `DiscardConfirmStrip` + `DialogPortalRoot` are internal to the DS, re-exported *only* for
  the 3 non-box surfaces (TaskSheet/Assistant/GlobalSearch/drawer) that need the contract
  without box chrome. Keeps "exactly one primitive" while letting non-box surfaces conform.
  *Note for reviewer:* `useDialogBehavior` IS exported from `index.ts` so web can consume it —
  this is the deliberate "compose with flags, not forks" escape hatch, not a second primitive.

- **`#overlay-root` mount — corrected to a `document.body` sibling of `#root` (resolves C-1/arch
  C-1).** Verified: `packages/web/index.html` ships only `<div id="root">`, and `main.tsx` mounts
  React into `#root`. The earlier draft mounted `<DialogPortalRoot/>` *inside `AppShell`* as a JSX
  child — which makes `#overlay-root` a **child of `#root`**. That breaks `inert`: inerting the
  background means inerting `#root`, but if the dialog lives inside `#root`, the dialog gets
  inerted too. **Fix:** `DialogPortalRoot` is still rendered once in `AppShell`, but it
  *imperatively* creates/appends a `<div id="overlay-root">` to `document.body` in a `useEffect`
  (returns `null` from render — it renders nothing into the React tree). `createPortal` targets
  that body-level node. Result tree:
  ```
  <body>
    <div id="root">…AppShell + all app content…</div>   ← receives inert while a modal is open
    <div id="overlay-root">…scrim + dialog + toasts…</div> ← never inerted; siblings, not nested
  </body>
  ```
  **The element that receives `inert` is `#root`** (the single app root, a sibling of
  `#overlay-root`). `inert` is *never* applied to `#overlay-root` or `document.body`. Alternative
  considered and rejected: a static `<div id="overlay-root">` in `index.html` — works, but splits
  the overlay-root's existence across HTML + a React effect and the DS package can't edit the web
  app's `index.html`; the imperative-append keeps the contract inside the DS primitive where it
  belongs.

---

## File plan

### New — design-system
```
packages/design-system/src/Dialog.tsx              # public primitive
packages/design-system/src/Dialog.stories.tsx      # states: clean, dirty/guarding, confirmation(never-dirty), non-modal, sm/md/lg, MobileSheet(375px, BOTTOM-anchored — AC-4 proof)
packages/design-system/src/useDialogBehavior.ts    # private-ish hook: esc/backdrop/focus-trap/guard/scroll-lock/layer
packages/design-system/src/DiscardConfirmStrip.tsx # the one guard strip (no .stories needed — rendered inside Dialog story)
packages/design-system/src/DialogPortalRoot.tsx    # imperatively appends #overlay-root to document.body as a SIBLING of #root (renders null); exposes ensureOverlayRoot() helper
packages/design-system/src/__tests__/Dialog.test.tsx
packages/design-system/src/__tests__/useDialogBehavior.test.tsx
```
Edit: `packages/design-system/src/index.ts` (export `Dialog`, `useDialogBehavior`,
`DialogPortalRoot`, types). `packages/design-system/package.json` (+`focus-trap-react`).

### Edit — tokens
`packages/design-system/src/tokens.css` — add the `--z-*` block + `--scrim` (light + dark).
**sharedFile — overlaps AI1.**

### Edit — web (migration; behavior unchanged except dismissal/focus/layer)
`AppShell.tsx` (mount `DialogPortalRoot`; mobile drawer → `useDialogBehavior`),
`AgentAddDialog.tsx`, `AgentEditDialog.tsx`, `KnowledgeCreateDialog.tsx`,
`ScopeChangeDialog.tsx`, `BetCreateDialog.tsx`, `RoutineCreateDialog.tsx`, `WorkBet.tsx`
(both inline dialogs → `Dialog`), `TaskSheet.tsx`, `AssistantOverlay.tsx`,
`NotificationPopover.tsx`, `GlobalSearchPanel.tsx`.

---

## Type signatures / contracts

```ts
// Dialog.tsx
export type DialogLayer = "drawer" | "overlay" | "dialog";
export type DialogSize = "sm" | "md" | "lg";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  isDirty?: boolean;                 // default false
  modal?: boolean;                   // default true
  layer?: DialogLayer;               // default "dialog"
  size?: DialogSize;                 // default "md"
  discardCopy?: { prompt: string; keep: string; discard: string };
  "aria-label"?: string;
}
export function Dialog(props: DialogProps): JSX.Element | null;

// useDialogBehavior.ts  (the contract every overlay threads)
export interface UseDialogBehaviorOptions {
  open: boolean;
  onClose: () => void;
  isDirty?: boolean;
  modal?: boolean;        // default true
  layer?: DialogLayer;    // default "dialog"
}
export interface UseDialogBehavior {
  guarding: boolean;                         // true while discard-confirm is showing
  requestDismiss: () => void;                // call from Esc / backdrop / ✕ — applies the rule
  confirmDiscard: () => void;                // user chose Discard
  cancelDiscard: () => void;                 // user chose Keep editing (safe default)
  getOverlayProps: () => { role: "dialog"; "aria-modal": boolean; style: { zIndex: string }; ref: Ref<HTMLElement>; onKeyDown: KeyboardEventHandler };
  getScrimProps: () => { style: { zIndex: string; background: string }; onMouseDown: MouseEventHandler } | null; // null when !modal
}
export function useDialogBehavior(o: UseDialogBehaviorOptions): UseDialogBehavior;
```

The **dismissal rule** lives entirely in `requestDismiss()`. The consumer's `isDirty` is the only
input; **confirmation dialogs pass the literal `false`** (approved.md §1.1) so Esc always closes
them — there is no per-surface branch for "confirmation vs form" in the primitive, the distinction
lives in what the consumer passes:
```
requestDismiss(): if (guarding) { cancelDiscard(); return; }  // 2nd Esc while guarding = Keep editing
                  if (!isDirty) onClose();                    // confirmations (isDirty=false) close here
                  else setGuarding(true);                     // authoring forms raise the strip
confirmDiscard(): setGuarding(false); onClose();              // Tab+Enter on Discard, or click
cancelDiscard():  setGuarding(false);                         // Esc/Enter on Keep editing, or click
```
On `setGuarding(true)` the strip mounts with focus on Keep editing (see guard-strip focus above).
`getOverlayProps().role` is the closed literal **`"dialog"`** (not open `string`) so a consumer
can't pass a wrong role and defeat the "dismissal can't-go-wrong" goal; `aria-modal` is the
boolean that differs between modal and non-modal surfaces (W-2 resolved).

Focus: `focus-trap-react` with `{ initialFocus, returnFocusOnDeactivate:true,
tabbableOptions:{ displayCheck:"none" } }` (the existing jsdom lore). Scroll-lock: toggle
`document.body.style.overflow` while `modal && open`. **`inert`: set the `inert` attribute on
`#root`** (the single app root, which is a *sibling* of `#overlay-root` — see D3) while any modal
`Dialog` is open; cleared on every close path. `#overlay-root` and `document.body` are never
inerted, so the scrim, dialog, and toasts (all portaled into `#overlay-root`) stay interactive.
Feature-detect `inert` (`"inert" in HTMLElement.prototype`); no-op fallback when absent (jsdom may
not implement it — the focus trap still contains focus, so the a11y AC degrades gracefully).

### Guard-strip focus + keyboard discard path (design §1.2 — pins design C-1 / arch S-2)
When `guarding` flips true, `DiscardConfirmStrip` mounts with focus on **"Keep editing"** (the
safe default). `requestDismiss` while already guarding (a second Esc) calls `cancelDiscard` (= Keep
editing). **Discard is keyboard-reachable**: the strip is a two-button row inside the trap —
`Tab` → Discard, `Enter` activates it (`confirmDiscard`). No mouse required, including the non-modal
`AssistantOverlay` (dirty composer). The AC-1 Playwright test asserts this path (focus lands on
Keep editing; Tab+Enter discards).

---

## Z-layer scale (tokens.css addition — the documented deliverable)

```css
/* AI2 — overlay z-layer scale. Single source of truth for every overlay surface.
   ⚠️ AI1 overlap: this block is added to tokens.css concurrently with AI1's token work. */
--z-base: 0; --z-sticky: 10; --z-drawer: 30; --z-overlay: 40;
--z-scrim: 50; --z-dialog: 60; --z-toast: 70;

/* AI6: candidate for color-mix(in oklab, var(--text-primary) 45%, transparent) — placeholder rgba for now */
--scrim: rgba(26, 21, 16, 0.45);                    /* light */
/* in [data-theme="hearth-dark"]: */
--scrim: rgba(20, 16, 12, 0.62);                    /* dark — warm, no pure black (AQ-009) */
```
Toasts (`--z-toast: 70`) render into `#overlay-root` (never inerted) so they stay clickable over an
open modal — see §task 3.
Documentation location: a `## Overlay layering` section in
`packages/design-system/DESIGN.md` + the inline token comment. No raw `z-[30/40/50]` may
remain on any overlay after migration (enforced by AC-7's grep).

---

## Acceptance criteria → verification

| # | Criterion | Verification |
|---|---|---|
| AC-1 | One dismissal grammar; dirty input never lost to one Esc/backdrop; **confirmations always close** | `useDialogBehavior.test.tsx`: dirty+`requestDismiss` keeps open & sets `guarding`; clean+`requestDismiss` calls `onClose`; **`isDirty={false}` (confirmation) + Esc → `onClose` (scenario 2)**; second `requestDismiss` while guarding → `cancelDiscard` (Keep editing). Playwright `Q3-bet-creation`/`L16-bet-pitch`: type pitch, press Esc once → guard strip visible, input intact, **focus on "Keep editing"**, then **Tab+Enter → Discard closes** (pins design §1.2 keyboard discard path); screenshot the guard state. |
| AC-2 | Focus in on open, trapped, returns to trigger on close — uniformly | `Dialog.test.tsx`: focus moves into dialog on open; `document.activeElement` returns to trigger after close. Playwright `accessibility.spec.ts` keeps passing on ≥2 migrated dialogs. |
| AC-3 | Layering deterministic + documented; no two compete; 2 stack predictably regardless of DOM order | **Split into two methods (resolves W-3), one static + one runtime:** **(a) Static — lint gate** (`eslint-plugin-design` rule, subsumed by the AC-5 gate / lives in `verify:quick`): no raw `z-[30]`/`z-[40]`/`z-50`/`z-30`/`modal-open z-50` class on any overlay surface; only `var(--z-*)` permitted. This is a static codebase property → lint, not a test (per CLAUDE.md). **(b) Runtime — Playwright** `dialog-layering.spec.ts`: open TaskSheet + NotificationPopover, read **computed `z-index`** off both elements, assert TaskSheet (`--z-drawer`=30) renders below Popover (`--z-overlay`=40) in **both** open orders (open A-then-B and B-then-A — the "regardless of DOM order" spec scenario). No grep-in-a-`.test.ts`. |
| AC-4 | Every dialog fits 375px; mobile = **bottom-anchored** sheet | Playwright at 375px on ≥4 migrated dialogs: no horizontal overflow (`scrollWidth<=clientWidth`), **AND assert bottom-anchoring** — the sheet's `boundingBox().bottom` ≈ viewport height and `top > 0` (resolves W-4; the static mockup's top-anchored render is not binding, the responsive primitive is). Screenshot each. `Dialog.stories.tsx` includes a `MobileSheet` story rendering the bottom-anchored state. `touch-targets.spec.ts` keeps passing. |
| AC-5 | New dialog built by composing the primitive — boilerplate gone | Static grep gate: zero `showModal(`/`setAttribute("open"`/per-file `cancel`-event blocks in the 6 migrated files (a `*.test.ts` that imports nothing but asserts via a build/grep check is a **lint rule**, not a test — implement as an `eslint-plugin-design` check OR a `scripts/` grep in `verify:quick`). Per CLAUDE.md: static property → lint/build script, not test. |
| AC-6 | Chrome consistent across ≥4 dialogs (side-by-side Playwright) | Playwright screenshots 4 migrated dialogs desktop+375px; review judges one chrome (title 15/600, footer divider, ✕). |

## Route / surface checklist (the AC-5 "all surfaces migrated" gate)

The reviewer greps the implementation against this exact list. Each must (a) consume
`Dialog` or `useDialogBehavior`, (b) carry no per-file open/close/`showModal`/cancel
boilerplate, (c) use a named `--z-*` layer not a raw number:

1. `AgentAddDialog.tsx` — Dialog, dialog
2. `AgentEditDialog.tsx` — Dialog, dialog
3. `KnowledgeCreateDialog.tsx` — Dialog, dialog (+ drop `font-heading`/`text-sm` title)
4. `ScopeChangeDialog.tsx` — Dialog, dialog
5. `BetCreateDialog.tsx` — Dialog, dialog (+ drop `font-heading`; AG3 not started → in scope)
6. `RoutineCreateDialog.tsx` — Dialog, dialog
7. `WorkBet.tsx` ConsequencePreviewDialog — Dialog, dialog, **confirmation → `isDirty={false}`
   ALWAYS → Esc closes** (Esc-hard-block removed; satisfies scenario 2). NOT a dirty-guard.
8. `WorkBet.tsx` AppetiteDialog — Dialog, dialog, value-edit form → `isDirty` truthful (guards)
9. `TaskSheet.tsx` — useDialogBehavior, `modal=false`, drawer
10. `AssistantOverlay.tsx` — useDialogBehavior, `modal=false`, overlay (L21 no-click-outside preserved)
11. `NotificationPopover.tsx` — useDialogBehavior, `modal=false`, overlay
12. `GlobalSearchPanel.tsx` — useDialogBehavior, dialog (replaces `modal-open z-50`)
13. `AppShell.tsx` mobile drawer — useDialogBehavior, drawer (replaces `z-50`/`z-40` scrim)

---

## Ordered task list

1. **(red)** `useDialogBehavior.test.tsx` — dismissal rule (clean closes, dirty guards,
   confirm/cancel), layer→zIndex resolution, `modal=false` → no scrim props. Fails (no impl).
2. **(red)** `Dialog.test.tsx` — renders title chrome (15/600), portals into `#overlay-root`,
   focus-in/return, dirty→`DiscardConfirmStrip` swap, bottom-anchored mobile-sheet class at narrow
   width, confirmation (`isDirty={false}`) closes on Esc, guard-strip keyboard discard
   (focus on Keep editing, Tab+Enter → `confirmDiscard`).
   **jsdom portal-root setup (resolves W-1):** there is *no* `createPortal` or mounted overlay-root
   precedent in DS today, and a bare DS jsdom test has no `#overlay-root`. The hook/primitive must
   be **self-sufficient in tests**: `DialogPortalRoot`'s append logic is factored into an
   `ensureOverlayRoot()` helper that `useDialogBehavior` calls on mount — it *lazily creates and
   appends* `#overlay-root` to `document.body` if absent (idempotent; returns the existing node
   otherwise). So `Dialog`/the hook works in a bare test render without the app shell mounting
   `DialogPortalRoot` first. `DialogPortalRoot` in the app just calls the same `ensureOverlayRoot()`
   once for a deterministic eager mount. `inert` is **feature-detected** (`"inert" in
   HTMLElement.prototype`) — jsdom does not implement it, so the test asserts the focus-trap path
   and treats `inert` as a graceful no-op (do NOT assert the `inert` attribute under jsdom; assert
   it under Playwright/AC-2 instead).
3. Add `--z-*` + `--scrim` to `tokens.css`; document in `DESIGN.md`. (Before any consumer
   references them — AI1 gate ordering.) **`--scrim` is a placeholder AI2 mints, not AI2's final
   semantic token (approved.md §2 / resolves S-1):** AI6 owns the eventual `color-mix` derivation;
   AI2 only guarantees it is a single named token in **both** themes and never a raw rgba in a
   component. **Task 3 must add the dark value too**, not just light:
   - light (`:root` / `[data-theme="hearth-light"]`): `--scrim: rgba(26,21,16,0.45);`
   - dark (`[data-theme="hearth-dark"]`): `--scrim: rgba(20,16,12,0.62);` (warm family, no pure
     black per AQ-009, higher opacity so lighter dark surfaces still read as "behind").
   Leave a `/* AI6: candidate for color-mix(in oklab, var(--text-primary) 45%, transparent) */`
   comment so AI6 finds it. **Toasts portal into `#overlay-root`** (approved.md §2 / W-3): the
   `--z-toast: 70` band sits above the modal+scrim, and because `#overlay-root` is never inerted,
   a toast there stays clickable over an open modal. (Toast *positioning* is out of AI2 scope; the
   z-band + the "toasts render into `#overlay-root`" rule are AI2's only toast contract.)
4. Add `focus-trap-react` to DS `package.json`; `npm install`.
5. **(green)** Implement `useDialogBehavior.ts`, `DiscardConfirmStrip.tsx`,
   `DialogPortalRoot.tsx`, `Dialog.tsx`; export from `index.ts`. Write `Dialog.stories.tsx`.
6. Mount `<DialogPortalRoot/>` once in `AppShell` (both branches). **It renders `null` and
   appends `#overlay-root` to `document.body` (sibling of `#root`) — do NOT render `#overlay-root`
   as a JSX child of `AppShell` (that nests it in `#root` and breaks `inert` — see D3/Risk #4).**
7. Migrate the **reference pair** first (AgentAdd/Edit) — validates chrome parity against the
   promoted reference. Keep their existing tests green.
8. Migrate the **bare-`<dialog>` family** (Knowledge, ScopeChange, Bet, Routine, WorkBet×2) —
   deletes the most boilerplate; fix `font-heading`/`text-sm` titles. Update each file's
   component tests in lockstep.

   **Audit of migrated-file component tests for assertions that MUST change (resolves W-4).**
   Ran `grep -nE "showModal|setAttribute\(.open|font-heading|text-sm|z-(30|40|50)|toMatch\(/z-"`
   across the migrated dialogs' `*.test.tsx`. Results — the "assertions unchanged" claim is TRUE
   for the bare-`<dialog>` form family and FALSE for three overlay tests (now carved out above):
   - `KnowledgeCreateDialog.test.tsx`, `BetCreateDialog.test.tsx`, `RoutineCreateDialog.test.tsx`,
     `AD3-KnowledgeCreateDialog-scope.test.tsx`, `KnowledgeCreate.af13.test.tsx` — **no**
     `showModal`/`open`-attr/`font-heading`/`text-sm`/`z-` assertions found → assertions
     **unchanged**; only open/close plumbing differs. ✅
   - `WorkBet.L14-actions.test.tsx` — AC-8 "Escape doesn't close" comment + Esc behavior →
     **SANCTIONED CHANGE #1** (Esc now closes the confirmation).
   - `GlobalSearchPanel.cmdk.test.tsx` (`:40` `/z-50/`) → **SANCTIONED CHANGE #2**.
   - `AD8b-AssistantOverlay.test.tsx` (`:108` `/z-30/`) + `CocOverlay.test.tsx` (`:108` `/z-30/`)
     → **SANCTIONED CHANGE #3**.
   - `KnowledgeRow.factory.test.tsx:40` asserts title `.not.toContain("font-heading")` — this is a
     row (not a dialog), already font-heading-free; the dialog migration does not touch it →
     unchanged.
   No migrated-file test outside the three carve-outs needs an assertion change.
9. Migrate the **non-box surfaces** via `useDialogBehavior` (TaskSheet, Assistant,
   NotificationPopover, GlobalSearch, mobile drawer). Preserve L21 no-click-outside on
   Assistant via `modal=false` (no scrim, no backdrop handler).
10. Add the AC-5 static gate (grep/eslint) proving boilerplate is gone.
11. Write/extend Playwright: AC-1 (Esc-guard), AC-3 (two-overlay stacking both orders), AC-4
    (375px no-overflow ×4), AC-6 (chrome screenshots ×4 desktop+mobile).
12. `npm run check && npm run lint && npm run test && npm run test:e2e`. Visual-verify the
    four screenshots.

---

## Security & abuse cases (required block)

- **Rate-limit on POST/PATCH:** N/A — no new endpoints; dialogs call existing routes
  unchanged (AI2 is presentation-only).
- **Input-trust boundary / agent-authored fields:** N/A — no new fields; payloads identical
  to today's (verified: BetCreate/KnowledgeCreate submit shapes unchanged).
- **Secret handling:** N/A — no credential surface added.
- **Path traversal / SSRF:** N/A — no path or outbound-URL input introduced.
- **DoS via overlay stacking:** the primitive blocks >2-deep stacking by design (out of
  scope); scroll-lock + `inert` are reverted on every close path including `confirmDiscard`
  and error — verify no stuck-locked-body state (test: open→error→close leaves body scrollable).
- **Focus-trap escape (a11y abuse):** `returnFocusOnDeactivate` + `inert` ensure no focus
  leak to inert background; covered by AC-2.

---

## Protected tests (assertions must not change)

```
protectedTests:
  - packages/web/e2e/L14-bet-actions.spec.ts        # SANCTIONED CHANGE #1 — :151 "Esc does NOT close" flips to "Esc closes" (confirmation-never-dirty, §1.1)
  - packages/web/e2e/Q3-bet-creation.spec.ts        # bet create — extend for Esc-guard, don't weaken existing asserts
  - packages/web/e2e/L16-bet-pitch.spec.ts
  - packages/web/e2e/knowledge-q2-create.spec.ts
  - packages/web/e2e/L21-coc-overlay.spec.ts         # AssistantOverlay no-click-outside MUST stay (L21 lore)
  - packages/web/e2e/global-search.spec.ts
  - packages/web/e2e/touch-targets.spec.ts
  - packages/web/e2e/accessibility.spec.ts
  - packages/web/e2e/accessibility-K8.spec.ts
  - packages/web/src/__tests__/AD8b-AssistantOverlay.test.tsx   # SANCTIONED CHANGE #3 — :108 /z-30/ → --z-overlay (40)
  - packages/web/src/__tests__/CocOverlay.test.tsx              # SANCTIONED CHANGE #3 — :108 /z-30/ → --z-overlay (40), or remove if dead (CoC purged)
  - packages/web/src/__tests__/TaskSheet.test.tsx               # audited: role="dialog", no z-/showModal assertion → unchanged
  - packages/web/src/__tests__/GlobalSearchPanel.cmdk.test.tsx  # SANCTIONED CHANGE #2 — :38/:45 selectors .modal.modal-open/.modal-box → [data-dialog-layer="dialog"]/data-testid; :40 /z-50/ → --z-dialog (60); :50 max-w-[640px] SURVIVES (re-found via new selector)
  - packages/web/src/pages/__tests__/WorkBet.L14-actions.test.tsx # SANCTIONED CHANGE #1 — AC-8 "Escape doesn't close" → "Esc closes"
```
### Sanctioned assertion changes (the carve-out — these protected tests MUST change)

Three protected test files carry assertions that the migration *guarantees* must change. They are
listed under `protectedTests` for vigilance, but the assertions below are **explicitly sanctioned
to change** — the reviewer accepts them as spec-driven corrections, not weakenings:

1. **`e2e/L14-bet-actions.spec.ts` (`:151` + `WorkBet.L14-actions.test.tsx` AC-8).** Today asserts
   *"pressing Escape does NOT close the dialog"* (the kill-confirm + ConsequencePreview hard-block).
   Under the **confirmation-never-dirty rule (approved.md §1.1)**, a confirmation passes
   `isDirty={false}` ALWAYS, so **Esc closes the kill-confirm whether the reason is empty or
   typed** — satisfying spec validation scenario 2 verbatim. The `:151` assertion flips from "Esc
   does NOT close" to **"Esc closes"** (both empty and typed reason). This corrects the headline
   bug named in the spec; it is NOT "typed reason guards" (that drafted rule contradicted scenario
   2 and is dropped this round). The `WorkBet.L14-actions.test.tsx` AC-8 comment ("Escape doesn't
   close") and any Esc assertion update in lockstep.

2. **`GlobalSearchPanel.cmdk.test.tsx` (`:38`/`:40` + `:45`/`:50`) (resolves arch C-3 + W-new).**
   Verified at source: `:38` queries `container.querySelector(".modal.modal-open")` and `:40`
   asserts that overlay's `className` matches `/z-50/`; `:45` queries `container.querySelector(".modal-box")`
   and `:50` asserts `max-w-[640px]`. The migration of `GlobalSearchPanel` to `useDialogBehavior`
   **deletes the DaisyUI `modal modal-open` / `modal-box` chrome**, so **both `querySelector`
   calls return `null` and each `it()` throws on the `not.toBeNull()` guard before any className
   matcher runs** — the `z-50`→`--z-dialog` assertion edit alone is insufficient; the **selectors
   that feed those assertions must migrate too**. Sanctioned change is therefore TWO-PART:
   - **Selector migration (both `it()` blocks).** Replace `.modal.modal-open` (`:38`) and
     `.modal-box` (`:45`) with the new dialog-container query the migrated panel emits. Use the
     stable hook-set hook over a class: query the overlay container by
     `container.querySelector('[data-dialog-layer="dialog"]')` (the attribute
     `useDialogBehavior`/`getOverlayProps` sets), and re-find the inner palette box by its own
     `data-testid`/role (the panel already carries `[data-testid="search-recent-queries"]` at
     `:56` as precedent) or by the same `[data-dialog-layer="dialog"]` container element if the
     box and overlay collapse to one node post-migration. No `.modal*` DaisyUI class survives the
     query.
   - **Assertion update (`:40`), max-width preserved (`:50`).** Once the overlay is re-found, the
     `z-50` assertion (`:40`) updates to assert the resolved layer — either computed
     `zIndex === "60"` (`--z-dialog`) on the container **or** the presence of the
     `data-dialog-layer="dialog"` attribute itself (no longer a `/z-50/` className regex).
     **`max-w-[640px]` SURVIVES** (`:50`): GlobalSearchPanel consumes `useDialogBehavior` (not
     boxed `Dialog`), so it keeps its own palette chrome and 640px max-width — but the assertion
     must **re-find** the box via the replacement selector above (NOT `.modal-box`, which is gone),
     then `expect(/max-w-\[640px\]/.test(box.className)).toBe(true)` stays green.

   Sanctioned: the `.modal.modal-open`/`.modal-box` **selectors** (migrate to
   `[data-dialog-layer="dialog"]` / `data-testid` / role) AND the `z-50`→`--z-dialog` **assertion**.
   The `max-w-[640px]` expectation is unchanged in value but re-targeted through the new selector.
   A builder updating only the `:40` matcher (leaving `.modal.modal-open` at `:38`) leaves the
   test red — both parts are required.

3. **`AD8b-AssistantOverlay.test.tsx` (`:108`) and `CocOverlay.test.tsx` (`:108`) (from the §task 8
   audit).** Both assert `dialog.className` matches `/z-30/`. AssistantOverlay migrates to
   `useDialogBehavior` with `layer="overlay"` → `--z-overlay`=40, so the `z-30` assertion **must
   change** to assert `--z-overlay` (computed `zIndex === "40"` or `data-dialog-layer="overlay"`).
   `CocOverlay.test.tsx` is a stale alias of the same surface (CoC purged) — if it still exercises
   the overlay it gets the same update; if it is dead it is removed by the migration, not silently
   left red. Sanctioned: the `z-30` assertion (or file removal if dead).

No other protected-test assertions change (see §task 8 audit results).

## Shared files (concurrent-workpackage overlap)

```
sharedFiles:
  - packages/design-system/src/tokens.css         # ⚠️ AI1 edits concurrently (dead-token gate). Z-scale + --scrim added here.
  - packages/design-system/src/index.ts           # new exports
  - packages/design-system/package.json            # +focus-trap-react
  - packages/web/src/layouts/AppShell.tsx          # DialogPortalRoot mount + mobile drawer
  - packages/web/src/pages/WorkBet.tsx             # large file, two inline dialogs
```

## Risks / ambiguities for the reviewer to probe

1. **AI1 / tokens.css merge order.** The z-scale must exist before any surface references it,
   or AI1's "unknown token = build failure" gate could red the branch mid-migration. Land the
   token block in the first migration commit, not last.
2. **`L14-bet-actions` protected-assertion change.** The Esc-on-kill-dialog behavior is
   *intentionally* corrected (the headline bug). One assertion flips; reviewer must accept it
   as the spec-sanctioned exception, not a weakening.
3. **`focus-trap-react` in DS jsdom.** The `displayCheck:"none"` lore is web-side today;
   verify it carries into DS's `pool:'forks'` jsdom env. If the trap can't init in jsdom,
   gate trap activation behind `open` and test the dismissal rule (pure) separately from the
   trap (Playwright).
4. **`inert` background while modal — RESOLVED (was self-contradictory).** The earlier draft
   mounted `<DialogPortalRoot/>` as a JSX child of `AppShell`, nesting `#overlay-root` *inside*
   `#root` — so inerting the background (`#root`) would have inerted the dialog too. **Fixed in
   D3:** `DialogPortalRoot` imperatively appends `#overlay-root` to `document.body` as a **sibling
   of `#root`** (renders `null`). `inert` is applied to **`#root`** (verified: the only child of
   `<body>` in `index.html`); `#overlay-root` and `body` are never inerted, so scrim + dialog +
   toasts stay interactive. The a11y / focus-escape ACs can now pass. No remaining ambiguity.
5. **AssistantOverlay `modal=false` + composer dirty.** Non-modal means no backdrop-dismiss,
   but Esc still applies the guard. Confirm the composer's dirty state is cheap to derive so
   an accidental Esc mid-message doesn't nuke a draft — matches the headline UX goal.
6. **GlobalSearchPanel was DaisyUI `modal`.** Moving it to `useDialogBehavior`+portal must
   preserve cmdk keyboard nav (`GlobalSearchPanel.cmdk.test.tsx`) — the focus trap must not
   eat the palette's arrow-key handling.
