# Variant A — Side panel (slide-over beside the conversation)

**Story:** `packages/web/src/components/SessionDialInSide.stories.tsx` → "SessionDialIn · A Side panel"

## User workpackage
A founder reading a conversation taps a session-reference and dials in to *steer or audit* the session — without losing the conversation, which stays visible at left while the dial-in docks as a right column.

## Component composition
- Right-docked `<aside>` (420px) with `--shadow-elevated`, left border — the slide-over.
- `DialInHeader` (Session tag · agent · host task · `StatusChip` ended/live · close ✕) — mirrors `ConversationHeader`.
- Config band (`--surface-container`): `Fold` ("Configuration · Hide/Show") + `DialInControls` (descriptor-driven pill selects, stacked, 112px mono labels).
- `What happened` mono micro-label + **`PartList`** over `derivePartsFromSession()` — the SAME renderer the conversation uses. Diffs render as the existing `diff` Embed → `ReferenceChip`.
- Conversation stays mounted at left (the surface you came from).

## Information hierarchy
1. The conversation (left, full weight) — you never left it.
2. Dial-in header — what session this is + its state.
3. Config band — steerable, collapsible (folds away when auditing).
4. Activity column — "what happened", calm Part reading.

## States (populated only this round; rest deferred to build)
- **Populated:** config + activity as shown.
- *Build-phase:* live (StatusChip "Live", auto-scroll), running (no ended chip), empty activity (`EmptyState` compact), error (`ErrorState`), descriptor-with-no-options (config band shows model only).

## Behavior
- Opening the `session-reference` Fold sets panel-open state on the conversation surface; ✕ / Escape closes; focus moves to the panel header on open, returns to the Fold on close.
- Config Fold collapses controls to reclaim reading height while auditing.
- Pill select = click to set; active pill carries accent ring + dim fill.
- Motion: panel slides in `transform: translateX` over `--motion-default`; honors `prefers-reduced-motion` (opacity-only).

## Mobile adaptation
Panel becomes a full-height bottom-up sheet over the conversation tab (the conversation is one of the three tabs); ✕ returns to the conversation. Config collapses by default on mobile to prioritize activity.

## Signature
**Context never lost** — the conversation stays beside you; the dial-in is a docked companion, not a destination.

## Trade-offs
- Bad at: deep auditing of long sessions — 420px is narrow, diffs and long reasoning wrap. Two surfaces compete for width on smaller laptops.
- The conversation+panel split halves activity reading width vs B/C.
