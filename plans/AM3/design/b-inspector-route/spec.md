# Variant B — Inspector route (dedicated full sub-surface)

**Story:** `packages/web/src/components/SessionDialInRoute.stories.tsx` → "SessionDialIn · B Inspector route"

## User workpackage
A founder opens a session-reference and navigates to `/session/:id` — a real, deep-linkable sub-room — to configure and audit the session with full room for both, returning to the conversation via the breadcrumb.

## Component composition
- `Breadcrumb` (DS) — "Passkey login / Atlas · session" — orientation + the way back.
- `DialInHeader` strip (Session · agent · task · `StatusChip` · ✕).
- Left **controls rail** (`<aside>`, 300px, `--surface-container`): `Configure` label + `DialInControls` (descriptor-driven, persistently visible while reading).
- Main column (`<main>`, max-width 680px): `What happened` label + **`PartList`** over `derivePartsFromSession()`.

## Information hierarchy
1. Breadcrumb — where am I + back.
2. Header — which session, its state.
3. Activity column (main, widest) — the thing you came to read.
4. Controls rail (left, persistent) — steer without scrolling away.

## States
- **Populated** as shown. *Build-phase:* live/running/empty/error as in A, plus a 404-style fallback when the session id is unknown (route-level).

## Behavior
- Reached by navigation (the `session` `OpenTarget` route, no-op until AM3 — AM3 wires it). Breadcrumb / browser-back returns to the conversation.
- Rail stays fixed; only the activity column scrolls — config is always reachable.
- Pill select as in A. Keyboard: focus lands on the first control on route-enter; the rail is a single tab group, activity a second.
- Motion: route transition is a cross-fade (`--motion-default`), no slide.

## Mobile adaptation
Rail collapses above the activity as a single `Fold`-gated config band (B degrades to a stacked single column — header · config-fold · activity). Full-screen route on the conversation tab.

## Signature
**A session is a place** — deep-linkable, full-width, both config and activity get their own column.

## Trade-offs
- Bad at: keeping conversation context — you navigate AWAY from it (mitigated by breadcrumb, but it's a context switch, the opposite of A).
- The 300px rail crowds the descriptor pills (they wrap to 2 rows; see screenshot) — denser harnesses with many options will feel cramped in the rail.
- Heaviest: a new route, route-param resolution, and a full layout vs A/C's overlay.
