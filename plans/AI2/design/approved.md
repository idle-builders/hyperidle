# AI2 — Approved design: the `Dialog` primitive

**Chosen:** Variant B (Portal stack) + A's inline-guard interaction + C's internal-hook escape
hatch for the 3 non-box surfaces. One public design-system primitive: **`Dialog`**.

---

## 1. The dismissal/guard rule (locked — do not re-decide)

> A dialog guards dismissal **iff** it holds dirty *authoring* input. Escape, backdrop-click, and
> the close affordance (✕ / Cancel) are *dismissal intents*.
> - **Clean** → any dismissal intent closes immediately.
> - **Dirty** (`isDirty===true`) → first dismissal intent intercepted; footer is replaced by an
>   inline discard strip. "Keep editing" is the safe default; "Discard" closes and drops input.
> - **Non-modal** (`modal={false}`) → no scrim, no backdrop-dismiss, page interactive, focus
>   moves in but not trapped; Escape still closes (guarded if dirty).

The consumer owns its form state and passes `isDirty`. The primitive owns the consequence. No
per-surface guard logic anywhere.

### 1.1 Confirmation dialogs are *never dirty* (resolves the scenario-2 conflict)

> **A confirmation dialog never sets `isDirty=true`.** Its body is a decision gate, not authored
> work. Any text it collects (the kill-bet *reason*, an appetite override note) is re-typed
> trivially; losing it is not the headline harm the guard exists to prevent. Therefore Escape on
> **any** confirmation closes immediately — empty reason *or* typed reason, both close.

**Rationale.** Spec validation scenario 2 is binding and unqualified: *"Given any confirmation
dialog, when Escape is pressed, then it closes — same as every other confirmation."* The earlier
draft mapped `WorkBet` kill-confirm to `isDirty = reason non-empty`, which made Escape on a typed
reason *guard* — contradicting scenario 2 verbatim and failing the protected `L14-bet-actions`
intent. This pipeline is autonomous; no founder is available to amend the spec, so the design
conforms to the spec text exactly.

The boundary is **authoring surface vs decision gate**, not "has a text field":

- **Authoring surfaces** (create/edit forms — Knowledge, Bet, Routine, Agent, Scope, appetite
  *value-edit*) hold work the user is composing. These pass `isDirty` truthfully and **guard**.
  This is the unsaved-input AC: a half-typed pitch is never lost to one Escape.
- **Confirmation surfaces** (kill-bet confirm, any yes/no gate, the consequence-preview) hold a
  *decision*, optionally annotated. These pass `isDirty={false}` **always** and **close** on
  Escape. This is scenario 2.

Both ACs are satisfied simultaneously because they govern *different surface kinds*. The rule that
encodes this (no per-surface logic) is: **`isDirty` reflects authored work, and a confirmation has
none — so a confirmation passes the literal `false`, not a derived expression.** See §8 for the
per-surface `isDirty` column updated to this rule.

### 1.2 Keyboard path to Discard (resolves the no-keyboard-discard gap)

> When the guard strip appears, **focus moves to "Keep editing"** (the safe default). From there:
> - **Esc** (or **Enter** on the focused button) re-selects Keep editing → strip closes, dialog
>   stays open with input intact. Esc is never a discard.
> - **Tab → Enter** reaches and activates **Discard** → dialog closes, input dropped. The strip is
>   a two-button row; one Tab moves from Keep editing to Discard. This is the keyboard discard path.
> - **Mouse click** on either button does the same.

This holds for the **non-modal `AssistantOverlay`** too: a dirty composer + Esc raises the strip,
focus lands on Keep editing, Tab+Enter discards the draft. There is no three-press dead-end — the
sequence is *intentional* (Esc protects, Tab+Enter is the deliberate discard). Discard is reachable
by keyboard alone; it is never mouse-only.

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
Plus a scrim color token: `--scrim: rgba(26,21,16,0.45)` (light). Reuses the mobile-drawer's
existing `rgba(26,21,16,0.55)` warm family — picks `0.45` for the modal scrim, documented as the
single value every modal uses.

**`--scrim` is a *placeholder* AI2 mints, not the final semantic token (resolves W-2).** AI6
explicitly lists "the AppShell scrim" as a *missing* semantic token that consumers currently
hardcode. AI2 introduces `--scrim` to unblock this workpackage and stop the per-surface rgba
copies; AI6 owns the eventual derivation (e.g. `color-mix(in oklab, var(--text-primary) 45%,
transparent)`) and may reshape the value/name. AI2's obligation is only to (a) define it as a
single named token both light **and** dark, never a raw rgba in a component, and (b) leave a
`/* AI6: candidate for color-mix derivation — see AI6 */` comment so AI6 finds it. The dark-mode
value lives in the `[data-theme="hearth-dark"]` block: `--scrim: rgba(0,0,0,0.55)` is **not**
used (AQ-009 forbids pure black); dark uses the same warm family at higher opacity:
`--scrim: rgba(20,16,12,0.62)` (warm, ≥0.55 so the lighter dark-mode surfaces still read as
"behind"). Both values are in §2's token block; the architecture task that lands them defines both.

All `Dialog` instances render through one portal node `#overlay-root`. **`#overlay-root` is a
sibling of `#root` under `<body>`, not a child of `#root`** (so `inert` on `#root` does not
disable the dialog — see architecture §D3). Two simultaneously-open dialogs stack by **mount order
within their band**, independent of source DOM position — satisfies "stack predictably regardless
of DOM order."

**Toasts stay clickable over an open modal (resolves W-3).** `--z-toast: 70` sits above the
modal (`60`) and its scrim (`50`). For a toast to remain actionable while a modal is open and the
background is `inert`, **toasts must render into `#overlay-root`** (the one node `inert` exempts),
not into `#root`. Because `#overlay-root` is the sibling that never receives `inert`, every layer
inside it — scrim, dialog, and toast — stays interactive; only the background `#root` is inerted.
Toast *positioning* itself is out of AI2 scope (AG5/Toast workpackage owns it); AI2's only
contract is the `--z-toast: 70` band and the "toasts portal into `#overlay-root`" requirement so
the topmost layer is never trapped behind the scrim. Architecture restates this in §task 3 / Risk
notes.

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

   **15px = `--text-base` is the *intentional* dialog-title treatment — not a missing heading
   step (resolves W-1).** The Hearth scale has explicit heading steps (`--text-lg` 17px,
   `--text-xl` 20px). A dialog title deliberately renders at *body* size + `--fw-semibold` (600),
   relying on weight (not size) for hierarchy, because dialog chrome is compact: a 17/20px title
   would over-shout a 320–640px box and break the density credo. This is a conscious divergence
   from `PageHeader`/`SectionHeader` (which use the lg/xl steps for full-page hierarchy). **Do
   not "correct" 15/600 to 17px.** AI7 (header/scroll anatomy) and the builder must treat
   `--text-base` + `--fw-semibold` as the locked dialog-title token pair.
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
- **Guard-strip focus (the keyboard discard path — see §1.2)**: when the strip appears, focus
  moves to **"Keep editing"** (the safe default). Esc / Enter on it re-selects Keep editing (strip
  closes, dialog stays open, input intact). **Tab → Enter** moves to and activates **Discard**
  (closes, drops input). This is the *only* discard path that does not require a mouse; it holds
  for the non-modal `AssistantOverlay` (dirty composer) identically. Within the guard strip the
  trap is two buttons: one Tab between them, Shift-Tab back.
- **Scroll-lock**: `body` locked while any modal `Dialog` is open.
- **Motion**: scrim opacity `--motion-fast` (120ms); box `translateY(8px)→0` + opacity
  `--motion-fast`; guard strip cross-fades `--motion-fast`. Honor `prefers-reduced-motion`.
  Only `transform`/`opacity` animated.

## 7. Mobile adaptation

- `size` resolves to desktop `max-width`. At ≤480px **every** dialog becomes a **bottom-anchored**
  full-width-minus-12px-gutter bottom-sheet, `max-height: 85vh`, internal scroll — owned by the
  primitive, no consumer touches it. Generalizes TaskSheet's existing sheet↔drawer responsive split.

  **Bottom-anchored is mandatory and must be *proven*, not asserted (resolves W-4).** The static
  375px mockup of the approved variant renders the box top-anchored, which contradicts this
  thumb-reach claim; that mockup is a non-responsive snapshot, so it is **not** the source of truth
  for mobile position. The responsive primitive is. Concretely:
  - The sheet pins to the **bottom** of the viewport (`position: fixed; left: 6px; right: 6px;
    bottom: 0;`), slides up from below (`translateY(100%)→0`, replacing the desktop
    `translateY(8px)→0`), and rounds only its top corners. Thumb reach: actions sit at the bottom.
  - **`Dialog.stories.tsx` must include a `MobileSheet` story** (375px viewport) rendering the
    bottom-anchored state, and **AC-4's Playwright capture at 375px must assert bottom-anchoring**
    (e.g. the sheet's bounding box `bottom` ≈ viewport height, `top > 0`) and screenshot it — not
    merely "no horizontal overflow." This pins the mobile claim at AC time instead of discovering a
    top-anchored regression late. (The static mockup may be regenerated bottom-anchored later; the
    story + AC-4 are the binding proof.)
- Inputs ≥16px font (AQ-005) — already true in the dialogs; the primitive enforces it for chrome.
- Maps to the three-tab mobile layout as a portal surface over the active tab.

## 8. Component mapping per surface (migration targets)

| Surface | Uses | `modal` | `layer` | `isDirty` source |
|---|---|---|---|---|
| AgentAddDialog / AgentEditDialog | `Dialog` | true | dialog | name/soul/config touched |
| KnowledgeCreateDialog | `Dialog` (+ fix 15/600 title) | true | dialog | title/body non-empty |
| ScopeChangeDialog | `Dialog` | true | dialog | selection changed |
| BetCreateDialog (AG3 not started — IN scope) | `Dialog` | true | dialog | pitch non-empty (authoring → guards) |
| RoutineCreateDialog | `Dialog` | true | dialog | fields touched (authoring → guards) |
| WorkBet kill-confirm (**confirmation**) | `Dialog` | true | dialog | **`false` always** — confirmation, never dirty (§1.1); Esc always closes, replacing the hard Esc-block |
| WorkBet appetite (**value-edit form**) | `Dialog` | true | dialog | value changed (authoring → guards) |
| WorkBet ConsequencePreview (**confirmation**) | `Dialog` | true | dialog | **`false` always** — confirmation, never dirty (§1.1); Esc closes (was hard Esc-block) |
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
