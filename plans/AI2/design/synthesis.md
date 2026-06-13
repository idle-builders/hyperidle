# AI2 — Synthesis

## Strongest base: B — Portal stack (8.6)

B is the only variant that *literally* satisfies every layer acceptance criterion. The spec's
binding sentences decide it:

- "no two surfaces compete for the same layer, and any two that can be open simultaneously
  stack predictably **regardless of DOM order**" — only a single portal + named z-scale
  guarantees this. A fails it (top-layer can't be ordered below a `fixed` drawer; modal always
  covers TaskSheet). C passes but at the cost of two exports.
- "Exactly one dialog primitive; deviations are flags, not forks." — B is one component with
  flags (`modal`, `layer`, `isDirty`, `size`). C's hook+shell pair reads as two things; A
  forks its own render tree by the `modal` flag. B is the truest "one primitive."
- "the per-file Escape/JSDOM/focus boilerplate being gone from all migrated surfaces" — B
  deletes it outright (no native `<dialog>`, so no `showModal` JSDOM fallback exists to paste).
  A only relocates it.

## Pulled in from siblings

**From A** — the discard-guard *interaction shape*: replace the footer with an inline confirm
strip rather than stacking a second dialog. A's instinct (no 2-deep stacking — it's out of
scope) is correct and is adopted as B's guard rendering. Also adopt A's mobile bottom-sheet
generalization of TaskSheet's responsive split.

**From C** — the honest recognition that **TaskSheet, AssistantOverlay, and GlobalSearchPanel
are not centered boxes.** B accommodates this *without* C's headless split by exposing the
layer/dismissal/focus contract through the *same* `<Dialog>` component's flags AND a small
internal `useDialogBehavior` hook that `<Dialog>` consumes. The 8 form/confirm dialogs use
`<Dialog>`. The 3 oddball surfaces that genuinely need bespoke chrome consume the *internal*
hook directly — but the hook is an implementation detail of the primitive, not a second public
export. This captures C's value (the drawer/palette conform to the contract) while keeping the
public API to "one primitive." This is the one place C's argument wins, and it's absorbed, not
adopted wholesale.

## Rejected — and why (so /architecture and /write-code don't re-litigate)

1. **Native `<dialog>` top-layer as the layer mechanism (Variant A's core).** Rejected: the
   top-layer can't be z-ordered relative to `fixed` overlays, so it can't deliver "stack
   predictably regardless of DOM order." It also keeps the JSDOM `showModal` boilerplate alive.
   *The Agent pair's chrome survives; its layering mechanism does not.*
2. **Two public exports (Variant C's hook+shell).** Rejected as the public shape — violates
   "exactly one primitive." The hook survives only as a *private* internal that `<Dialog>` and
   the 3 oddball surfaces share.
3. **Per-surface guard logic.** Rejected. The guard is one rule, owned by the primitive,
   driven by one `isDirty` boolean the consumer passes. No surface decides when to guard.
4. **Hard-blocking Escape on confirmations (today's kill-bet behavior).** Rejected. A
   confirmation with an empty reason is *clean* → Esc closes (consistent with all confirms).
   Once the user types a reason it's *dirty* → guarded. This is strictly better than the L14
   hard-block and unifies confirms with the rest.
5. **2-deep dialog stacking / resize / draggable.** Out of scope per spec. The guard is an
   in-place footer swap, never a second dialog.
6. **A second confirm dialog for the guard.** Rejected (see #5). Inline footer strip only.

## The locked dismissal/guard rule (the spec's central deliverable)

> **A dialog guards dismissal if and only if it holds dirty user input.**
> Escape, backdrop-click, and the close affordance (✕ / Cancel) are all *dismissal intents*.
> - **Clean** (no dirty input): any dismissal intent closes immediately.
> - **Dirty** (`isDirty === true`): the first dismissal intent is intercepted and replaces the
>   footer with an inline discard strip ("Discard your changes? · Keep editing · Discard").
>   "Keep editing" is the safe default (a second Escape on the strip chooses it). "Discard"
>   closes and drops the input.
> - **Non-modal** (`modal={false}`): no scrim, no backdrop-dismiss, page stays interactive,
>   focus moves in but is not trapped. Escape still closes (guarded if dirty). AssistantOverlay
>   composes this flag — it is not a fork.

`isDirty` is supplied by the consumer (it owns its form state); the primitive owns the
*consequence* of that boolean. This is the rule, not a case list.
