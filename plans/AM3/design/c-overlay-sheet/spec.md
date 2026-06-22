# Variant C — Overlay sheet (modal dial-in)

**Story:** `packages/web/src/components/SessionDialInOverlay.stories.tsx` → "SessionDialIn · C Overlay sheet"

## User workpackage
A founder taps a session-reference and a centered sheet floats over the dimmed conversation — a momentary act: open, steer or glance, dismiss; the conversation is right there to return to.

## Component composition
- Scrim (dim layer) + centered sheet (max-width 720px, `--r-default`, `--shadow-elevated`). **Maps to the DS `Dialog`** (`size="lg"`, `layer="dialog"`) in production — the story renders a self-contained scrim+sheet so it shows in isolation without a portal root; composition is the design.
- `DialInHeader` (compact) — Session · agent · task · `StatusChip` · ✕.
- Config band (`--surface-container`): `Fold` + `DialInControls` (`layout="inline"` — controls wrap horizontally, two compact rows, no fixed label column).
- `What happened` label + **`PartList`** (max-width 600px) over `derivePartsFromSession()`.

## Information hierarchy
1. Scrim — signals "this is transient; the conversation waits beneath".
2. Header — which session.
3. Config band — compact, inline, foldable.
4. Activity column — fills the sheet body.

## States
- **Populated** as shown. *Build-phase:* live/running/empty/error inside the sheet body; the sheet itself is the loading container.

## Behavior
- Opening the `session-reference` Fold opens the Dialog; ✕ / Escape / scrim-click closes (DS `Dialog` behavior + focus-trap, `useDialogBehavior`). Focus traps in the sheet; returns to the Fold on close.
- Config Fold collapses the band; inline pills as in A/B.
- Motion: DS Dialog enter/exit (scale+opacity, `--motion-default`); reduced-motion → opacity only.

## Mobile adaptation
DS `Dialog` already becomes a bottom mobile-sheet (`data-dialog-box` CSS) at ≤768px — C inherits this for free. Config folds by default; activity fills.

## Signature
**Momentary by construction** — a transient overlay that resists becoming a place you linger; the scrim keeps the conversation present.

## Trade-offs
- Bad at: sustained auditing — a modal is poor for long reading; no deep-link; can't keep it open while working in the conversation (it blocks the conversation beneath).
- Cannot reference the session and the conversation side-by-side (A's strength).
- Inherits Dialog focus-trap semantics — correct for momentary use, wrong if dial-in should be a persistent workspace.
