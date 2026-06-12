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
| Kill-confirm hard-blocks Escape | Confirmed L14 `cancel`-event `preventDefault` in WorkBet | Replaced by the dirty-guard rule: empty reason = clean → Esc closes; typed = dirty → guard |
| `font-heading` utility | **Undefined** — used in KnowledgeCreate/BetCreate `<h2>`; off-scale 14px (`text-sm`) | Dialog title chrome = 15px/600; migration drops `font-heading` + `text-sm` headings |
| DS tests run in jsdom with react-dom createRoot | Confirmed (`@vitest-environment jsdom`, `createRoot` + `act`, `pool:'forks'`) | Portal + focus-trap testable; carry `displayCheck:"none"` lore into the hook |

**No spec/concept contradiction found.** No migration of data shapes; pure presentation.

---

## Phase 0 — Interrogation (resolved, autonomous)

1. **Where does `focus-trap-react` live?** → It must move into the DS package (D1). The
   primitive cannot import a web-only dep. Confirmed by inspection.
2. **Portal mount point?** → A single `#overlay-root` mounted once. Decision D3: a
   `<DialogPortalRoot/>` rendered once inside `AppShell` (both mobile + desktop branches),
   appended after content. Avoids per-dialog `createPortal(document.body)` races and gives a
   deterministic stacking container.
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

### D3 — Public surface: one component, private hook
- **Chosen (from approved.md):** public `Dialog` only. Private `useDialogBehavior` +
  `DiscardConfirmStrip` + `DialogPortalRoot` are internal to the DS, re-exported *only* for
  the 3 non-box surfaces (TaskSheet/Assistant/GlobalSearch/drawer) that need the contract
  without box chrome. Keeps "exactly one primitive" while letting non-box surfaces conform.
  *Note for reviewer:* `useDialogBehavior` IS exported from `index.ts` so web can consume it —
  this is the deliberate "compose with flags, not forks" escape hatch, not a second primitive.

---

## File plan

### New — design-system
```
packages/design-system/src/Dialog.tsx              # public primitive
packages/design-system/src/Dialog.stories.tsx      # states: clean, dirty/guarding, non-modal, sm/md/lg, mobile-sheet
packages/design-system/src/useDialogBehavior.ts    # private-ish hook: esc/backdrop/focus-trap/guard/scroll-lock/layer
packages/design-system/src/DiscardConfirmStrip.tsx # the one guard strip (no .stories needed — rendered inside Dialog story)
packages/design-system/src/DialogPortalRoot.tsx    # mounts #overlay-root once
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
  getOverlayProps: () => { role: string; "aria-modal": boolean; style: { zIndex: string }; ref: Ref<HTMLElement>; onKeyDown: KeyboardEventHandler };
  getScrimProps: () => { style: { zIndex: string; background: string }; onMouseDown: MouseEventHandler } | null; // null when !modal
}
export function useDialogBehavior(o: UseDialogBehaviorOptions): UseDialogBehavior;
```

The **dismissal rule** lives entirely in `requestDismiss()`:
```
requestDismiss(): if (!isDirty) onClose();
                  else setGuarding(true);
confirmDiscard(): setGuarding(false); onClose();
cancelDiscard():  setGuarding(false);   // a second Esc while guarding calls cancelDiscard
```
Focus: `focus-trap-react` with `{ initialFocus, returnFocusOnDeactivate:true,
tabbableOptions:{ displayCheck:"none" } }` (the existing jsdom lore). Scroll-lock: toggle
`document.body.style.overflow` while `modal && open`. `inert`: set on `#root` siblings of
`#overlay-root` while a modal is open (feature-detect; no-op fallback).

---

## Z-layer scale (tokens.css addition — the documented deliverable)

```css
/* AI2 — overlay z-layer scale. Single source of truth for every overlay surface.
   ⚠️ AI1 overlap: this block is added to tokens.css concurrently with AI1's token work. */
--z-base: 0; --z-sticky: 10; --z-drawer: 30; --z-overlay: 40;
--z-scrim: 50; --z-dialog: 60; --z-toast: 70;
--scrim: rgba(26, 21, 16, 0.45);   /* dark-mode variant in the [data-theme] block */
```
Documentation location: a `## Overlay layering` section in
`packages/design-system/DESIGN.md` + the inline token comment. No raw `z-[30/40/50]` may
remain on any overlay after migration (enforced by AC-7's grep).

---

## Acceptance criteria → verification

| # | Criterion | Verification |
|---|---|---|
| AC-1 | One dismissal grammar; dirty input never lost to one Esc/backdrop | `useDialogBehavior.test.tsx`: dirty+`requestDismiss` keeps open & sets `guarding`; clean+`requestDismiss` calls `onClose`. Playwright `Q3-bet-creation`/`L16-bet-pitch`: type pitch, press Esc once → guard strip visible, input intact (screenshot). |
| AC-2 | Focus in on open, trapped, returns to trigger on close — uniformly | `Dialog.test.tsx`: focus moves into dialog on open; `document.activeElement` returns to trigger after close. Playwright `accessibility.spec.ts` keeps passing on ≥2 migrated dialogs. |
| AC-3 | Layering deterministic + documented; no two compete; 2 stack predictably regardless of DOM order | Static: grep asserts no `z-[30]`/`z-[40]`/`z-50`/`modal-open z-50` on overlay surfaces (lint-style check in a `*.test.ts` reading source? NO — use a Playwright assertion on computed `z-index`). Playwright: open TaskSheet + NotificationPopover, assert TaskSheet(`--z-drawer`) below Popover(`--z-overlay`) in **both** open orders (the spec scenario). |
| AC-4 | Every dialog fits 375px | Playwright at 375px on ≥4 migrated dialogs: no horizontal overflow (`scrollWidth<=clientWidth`), screenshot. `touch-targets.spec.ts` keeps passing. |
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
7. `WorkBet.tsx` ConsequencePreviewDialog — Dialog, dialog (Esc-hard-block → dirty-guard)
8. `WorkBet.tsx` AppetiteDialog — Dialog, dialog
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
   focus-in/return, dirty→`DiscardConfirmStrip` swap, mobile-sheet class at narrow width.
3. Add `--z-*` + `--scrim` to `tokens.css`; document in `DESIGN.md`. (Before any consumer
   references them — AI1 gate ordering.)
4. Add `focus-trap-react` to DS `package.json`; `npm install`.
5. **(green)** Implement `useDialogBehavior.ts`, `DiscardConfirmStrip.tsx`,
   `DialogPortalRoot.tsx`, `Dialog.tsx`; export from `index.ts`. Write `Dialog.stories.tsx`.
6. Mount `<DialogPortalRoot/>` once in `AppShell` (both branches).
7. Migrate the **reference pair** first (AgentAdd/Edit) — validates chrome parity against the
   promoted reference. Keep their existing tests green.
8. Migrate the **bare-`<dialog>` family** (Knowledge, ScopeChange, Bet, Routine, WorkBet×2) —
   deletes the most boilerplate; fix `font-heading`/`text-sm` titles. Update each file's
   component tests in lockstep (assertions unchanged; only open/close plumbing differs).
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
  - packages/web/e2e/L14-bet-actions.spec.ts        # kill-bet flow — behavior preserved, only Esc semantics change (empty=clean)
  - packages/web/e2e/Q3-bet-creation.spec.ts        # bet create — extend for Esc-guard, don't weaken existing asserts
  - packages/web/e2e/L16-bet-pitch.spec.ts
  - packages/web/e2e/knowledge-q2-create.spec.ts
  - packages/web/e2e/L21-coc-overlay.spec.ts         # AssistantOverlay no-click-outside MUST stay (L21 lore)
  - packages/web/e2e/global-search.spec.ts
  - packages/web/e2e/touch-targets.spec.ts
  - packages/web/e2e/accessibility.spec.ts
  - packages/web/e2e/accessibility-K8.spec.ts
  - packages/web/src/__tests__/AD8b-AssistantOverlay.test.tsx
  - packages/web/src/__tests__/TaskSheet.test.tsx
  - packages/web/src/__tests__/GlobalSearchPanel.cmdk.test.tsx
```
Note: `L14-bet-actions` asserts Esc does NOT close the kill dialog. Under the new rule, Esc on
an **empty-reason** kill dialog (clean) WILL close. This assertion changes — it is a
*deliberate behavior correction* named in the spec ("the bet-kill confirmation blocks Escape"
is the bug). Flag to reviewer: this single protected assertion is updated in lockstep, with a
new assert that Esc on a **typed** reason guards instead. Document as the one sanctioned change.

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
4. **`inert` background while modal.** Setting `inert` on `#root` siblings assumes a single
   app root; verify `#overlay-root` is a sibling of `#root`, not a child, or `inert` will
   disable the dialog too. `DialogPortalRoot` mount point matters.
5. **AssistantOverlay `modal=false` + composer dirty.** Non-modal means no backdrop-dismiss,
   but Esc still applies the guard. Confirm the composer's dirty state is cheap to derive so
   an accidental Esc mid-message doesn't nuke a draft — matches the headline UX goal.
6. **GlobalSearchPanel was DaisyUI `modal`.** Moving it to `useDialogBehavior`+portal must
   preserve cmdk keyboard nav (`GlobalSearchPanel.cmdk.test.tsx`) — the focus trap must not
   eat the palette's arrow-key handling.
