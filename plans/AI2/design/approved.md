# AI2 — Approved design: the `Dialog` primitive

**Chosen:** Variant B (Portal stack) + A's inline-guard interaction + C's internal-hook escape
hatch for the 3 non-box surfaces. One public design-system primitive: **`Dialog`**.

---

## 1. The dismissal/guard rule (locked — do not re-decide)

> A dialog guards dismissal **iff** it holds dirty user input. Escape, backdrop-click, and the
> close affordance (✕ / Cancel) are *dismissal intents*.
> - **Clean** → any dismissal intent closes immediately.
> - **Dirty** (`isDirty===true`) → first dismissal intent intercepted; footer is replaced by an
>   inline discard strip. "Keep editing" is the safe default (second Esc picks it); "Discard"
>   closes and drops input.
> - **Non-modal** (`modal={false}`) → no scrim, no backdrop-dismiss, page interactive, focus
>   moves in but not trapped; Escape still closes (guarded if dirty).

The consumer owns its form state and passes `isDirty`. The primitive owns the consequence. No
per-surface guard logic anywhere.

## 2. Layering — the documented z-scale (the spec deliverable)

New tokens in `tokens.css` (⚠️ coordinate with AI1 — concurrent edits to this file). Define
once, consume by name; no raw `z-[N]` on any overlay after migration.

```
--z-base:    0    /* app content (default) */
--z-sticky:  10   /* sticky table/section headers, in-flow anchored popovers */
--z-drawer:  30   /* TaskSheet, mobile nav drawer (non-modal slide-ins) */
--z-overlay: 40   /* AssistantOverlay, NotificationPopover (anchored non-modal popovers) */
--z-scrim:   50   /* the modal scrim */
--z-dialog:  60   /* modal dialogs + GlobalSearch palette (sit on their own scrim) */
--z-toast:   70   /* toasts — always on top, never blocked */
```
Plus a scrim color token: `--scrim: rgba(26,21,16,0.45)` (light) / matching warm value (dark).
Reuses the mobile-drawer's existing `rgba(26,21,16,0.55)` family — pick one value, document it.

All `Dialog` instances render through one portal node `#overlay-root` (appended to `body`).
Two simultaneously-open dialogs stack by **mount order within their band**, independent of
source DOM position — satisfies "stack predictably regardless of DOM order."

## 3. Component composition & API

Public export: **`Dialog`** (design-system, `packages/design-system/src/Dialog.tsx`).

```ts
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;                 // chrome heading — fixes off-scale 14px + undefined font-heading
  children: ReactNode;           // the consumer's body (form / confirmation)
  footer?: ReactNode;            // action buttons (DS Button); omitted for content-only surfaces
  isDirty?: boolean;             // default false — drives the guard
  modal?: boolean;               // default true; false ⇒ Assistant-style non-modal
  layer?: "drawer" | "overlay" | "dialog";  // default "dialog"
  size?: "sm" | "md" | "lg";     // default "md" — desktop max-width; phone always bottom-sheet
  discardCopy?: { prompt: string; keep: string; discard: string }; // defaults provided
  "aria-label"?: string;         // when title is visually present, label derives from it
}
```

- Internals (private, not exported): `useDialogBehavior(opts)` hook owns the Esc listener,
  backdrop handler, `focus-trap-react` wiring, guard sub-state, scroll-lock, layer resolution,
  and `inert` on background siblings while modal. `Dialog` consumes it.
- The **3 non-box surfaces** (`TaskSheet`, `AssistantOverlay`, `GlobalSearchPanel`) consume the
  *same* `useDialogBehavior` internally and render their own bodies — gaining the uniform
  contract without inheriting centered-box chrome. The hook is an internal of the primitive,
  **not** a second public export (keeps "exactly one primitive").
- A private `<DiscardConfirmStrip>` sub-component renders the guard strip identically wherever
  it appears (prevents C's drift risk).

Chrome reuses DS `Button` for footer + guard actions. Header/footer chrome = the AgentAddDialog
pair's, promoted verbatim (the reference implementation).

## 4. Information hierarchy

1. **Title** — `--text-primary`, **15px / 600**, left-aligned, in a header row with ✕ on the
   right. (Fixes the knowledge/bet dialogs' off-scale 14px + undefined `font-heading`.)
2. **Body** (children) — padding `--space-6` (18px) desktop, `--space-4` (12px) phone.
3. **Footer** — right-aligned action pair above a 1px `--border-subtle` rule + 18px top margin.
   When dirty + dismissal intent fires, the footer region is **replaced** by `DiscardConfirmStrip`
   (amber-tinted, "Discard your changes? · Keep editing · Discard").

## 5. States (with copy)

| State | Chrome | Behavior |
|---|---|---|
| Populated (default) | full chrome | the common case — a form or confirmation |
| Clean + dismissal intent | unchanged | closes immediately |
| Dirty + dismissal intent | footer → `DiscardConfirmStrip` | "Discard your changes?" · ghost "Keep editing" (safe default) · danger "Discard" |
| Non-modal (`modal=false`) | no scrim | Assistant; page interactive; Esc closes |
| Loading / empty / error | consumer's body | chrome identical; not the primitive's concern |

## 6. Behavior

- **Focus**: `focus-trap-react` (already a dependency) traps on open, `returnFocusOnDeactivate`
  restores to trigger on close — uniform across all surfaces. Replaces TaskSheet's
  activeElement-snapshot, Assistant's querySelector, and the native trap with one path.
  Carry `tabbableOptions.displayCheck:"none"` for JSDOM (existing lore) into the hook.
- **Keyboard**: Esc → dismissal intent (guarded). Tab trapped, Shift-Tab wraps. Enter submits a
  single-field confirm.
- **Scroll-lock**: `body` locked while any modal `Dialog` is open.
- **Motion**: scrim opacity `--motion-fast` (120ms); box `translateY(8px)→0` + opacity
  `--motion-fast`; guard strip cross-fades `--motion-fast`. Honor `prefers-reduced-motion`.
  Only `transform`/`opacity` animated.

## 7. Mobile adaptation

- `size` resolves to desktop `max-width`. At ≤480px **every** dialog becomes full-width-minus-
  12px-gutter bottom-sheet, `max-height: 85vh`, internal scroll — owned by the primitive, no
  consumer touches it. Generalizes TaskSheet's existing sheet↔drawer responsive split.
- Inputs ≥16px font (AQ-005) — already true in the dialogs; the primitive enforces it for chrome.
- Maps to the three-tab mobile layout as a portal surface over the active tab.

## 8. Component mapping per surface (migration targets)

| Surface | Uses | `modal` | `layer` | `isDirty` source |
|---|---|---|---|---|
| AgentAddDialog / AgentEditDialog | `Dialog` | true | dialog | name/soul/config touched |
| KnowledgeCreateDialog | `Dialog` (+ fix 15/600 title) | true | dialog | title/body non-empty |
| ScopeChangeDialog | `Dialog` | true | dialog | selection changed |
| BetCreateDialog (AG3 not started — IN scope) | `Dialog` (+ fix title) | true | dialog | pitch non-empty |
| RoutineCreateDialog | `Dialog` | true | dialog | fields touched |
| WorkBet kill-confirm | `Dialog` | true | dialog | reason non-empty (replaces hard Esc-block) |
| WorkBet appetite | `Dialog` | true | dialog | value changed |
| TaskSheet | `useDialogBehavior` (bespoke drawer chrome) | false | drawer | n/a |
| AssistantOverlay | `useDialogBehavior` (bespoke popover, L21 no-click-outside) | false | overlay | composer dirty |
| NotificationPopover | `useDialogBehavior` (bespoke popover) | false | overlay | n/a |
| GlobalSearchPanel | `useDialogBehavior` (palette chrome) | true | dialog | n/a (transient query) |
| AppShell mobile drawer | `useDialogBehavior` (drawer chrome) | true | drawer | n/a |

## 9. Open questions for the architect

1. **Portal mount point**: where is `#overlay-root` created — a one-time `App.tsx` mount, or
   lazily by the primitive? (Recommend: a `<DialogPortalRoot/>` mounted once in `AppShell`.)
2. **AI1 token overlap**: the 7 z-tokens + `--scrim` land in `tokens.css` while AI1 edits it
   concurrently. Architect decides merge sequencing + whether AI1's dead-token gate should also
   assert the z-scale resolves. Flag in the plan.
3. **`isDirty` ergonomics**: confirm consumers can cheaply derive `isDirty` (trim-compare to
   initial) without new state plumbing.
4. **JSDOM**: `focus-trap-react` + portal + `inert` behavior under JSDOM — verify the existing
   `displayCheck:"none"` lore covers it; decide test strategy (component tests for guard/dismiss
   logic, Playwright for layer/screenshot ACs).
5. **`.stories.tsx` coverage**: which states are story-pinned (clean, dirty/guarding, non-modal,
   sm/md/lg, mobile sheet) — architect lists for the red phase.
6. **Migration order**: recommend the Agent pair first (reference chrome → validates parity),
   then the bare-`<dialog>` family (deletes the most boilerplate), then the hand-rolled
   `fixed` surfaces (proves the non-box hook path), then GlobalSearch/drawer last.
