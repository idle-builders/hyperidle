# AK5 — Design: Promote a knowledge item into a bet

**Classification: routine.** Reuses three established patterns: the `KnowledgeDetail` overflow `Menu` (action affordance), the `WorkBet`/`WorkBetCreate` AG3 authoring surface (landing target), and the `KnowledgeCreateDialog` "lock scope to a host" idiom (forward link, inverted direction). One variant + considered-alternatives check, per the routine gate.

## The founder's task

In the Knowledge view, the founder is looking at an idea they captured. Decision: *"turn this into committed work."* What would waste their time: retyping the body into a blank bet form; a multi-field "promote" wizard asking for a team/appetite they'd rather set in the real editor; landing on a read-only confirmation instead of an editable bet. The whole value is "don't retype, drop me into the editor."

## Chosen variant — "Menu action → optimistic create → land in editor"

### Affordance (source: `KnowledgeDetail` overflow menu)
Add a **"Promote to bet"** item to the existing `KnowledgeOverflowMenu` (the `···` `Menu`), above `Change scope`, separated from `Archive`. No new button on the header (header budget is Edit + `···`; AQ density). Reuses the `MenuItem` shape already in place — zero new component.

- Disabled with title when the item is `archived` (can't promote a retired idea) — mirrors the existing menu's disabled-with-reason pattern.
- `dataAttrs: { "data-testid": "knowledge-promote-bet" }`.

### Interaction (no intermediate dialog)
Selecting it does NOT open a form. It immediately:
1. Closes the menu, sets an in-flight state (the `···` is replaced by a small inline "Promoting…" label via the existing `archiving`-style state — reuse `SaveIndicator`-adjacent styling, no new spinner component).
2. Calls the promote endpoint (architecture: `POST /api/bets` extended with `sourceKnowledgeItemId`, OR `POST /api/knowledge/:id/promote` — see architecture; UI calls whichever the plan settles).
3. On 201, `navigate('/work/bet/:betId')` — the founder lands in the **normal `WorkBet` detail/edit surface** (AG3), `description` already filled with the item's body, status `draft`. They refine and commit there.
4. On error, an inline `role="alert"` reusing the exact `archiveError` banner pattern already in `KnowledgeDetailView` ("Promote failed: …" + Dismiss). No new error component.

**Why no dialog:** team/appetite are commitments the founder sets *in the editor* (`WorkBet` already exposes them; `WorkBetCreate`'s aside is the model). For a single-team factory (the common case) team auto-resolves server-side; multi-team selection happens in the bet, not in a promote modal. A dialog here would be a second authoring surface — forbidden by the AG3 "no second editor" constraint and by component budget. Pre-filling content and dropping into the real editor is the entire AC.

### Provenance display (on the resulting bet)
A single **"From knowledge: <title>"** line in the `WorkBet` detail surface, rendered as a back-link (`RRLink` to `/knowledge/:sourceId`), styled exactly like the existing `BacklinksCard` links in `KnowledgeDetail` (`text-[var(--accent-primary)] hover:underline`, 13px). Placement: in the bet header meta row (next to status/team), or as a one-line note above the body — a compact, scannable provenance chip, NOT a card. It appears only when `sourceKnowledgeItemId` is set; absent for hand-typed bets. `data-testid="bet-provenance-link"`.

Copy: `From knowledge: {title}` — no icon (AQ-113/AQ-105: no decorative icon), no "Promoted from" verbosity.

### States
- **Empty / not applicable:** non-promotable status → menu item disabled with title. Bet with no source → provenance line absent.
- **Loading:** inline "Promoting…" in the action cluster; menu items unavailable during flight.
- **Error:** inline alert, reuse `archiveError` pattern; founder stays on the knowledge item.
- **Populated:** founder is on the bet, body filled, provenance line shown.

### Keyboard / focus
- The `Menu` primitive already owns arrow-key navigation, Escape, and click-outside (AG5). "Promote to bet" inherits this for free.
- After `navigate`, focus lands on the bet page per existing routing behaviour (no special handling beyond what `WorkBet` already does).

## Considered alternatives — "did we consider X/Y/Z?"

- **X — A "Promote" wizard/dialog collecting team + appetite + edited body before creating.** Rejected: duplicates the AG3 editor (second authoring surface, forbidden), adds friction to a "don't retype" feature, and the editor already collects commitments. Pre-fill + land-in-editor is strictly less work for the founder and zero new components.
- **Y — A primary header button "Promote to bet" beside Edit.** Rejected: header action budget is Edit + `···`; promotion is an occasional, deliberate action, not a primary one. It belongs in the overflow menu with Archive/Change-scope (same altitude of "lifecycle action on this item"). Avoids header crowding (density principle).
- **Z — Bidirectional "linked bets" panel on the knowledge item showing every bet promoted from it.** Rejected: out of scope (bidirectional sync / N:M surfacing). AK5's provenance is recoverable one-way (bet → source); listing bets-from-an-item is a future read view, not required by any AC. Building it now is scope creep on an M (~1d) WP.
- **Also considered — reuse `scopeKind="bet"` for provenance.** Rejected at concept level: that link means the inverse relation. Conflating them corrupts both the "Add knowledge" reverse link and provenance. Distinct directed reference required.

## Rubric score (in-session, 9 dimensions, /5)

| Dimension | Score | Note |
|---|---|---|
| Task fit | 5 | Exactly matches "don't retype, drop me in the editor." |
| Component budget | 5 | Zero new components: `Menu`/`MenuItem`, existing alert pattern, `RRLink`, AG3 surface. |
| One interaction grammar | 5 | Promotion = a menu lifecycle action, same as Archive/Change-scope. Provenance = a backlink, same as `BacklinksCard`. |
| Density | 4 | One menu item + one provenance line; no header bloat. (−1: provenance placement in header meta row needs the build to confirm it doesn't crowd status/team.) |
| States covered | 5 | Empty/disabled, loading, error, populated all specified with reused patterns. |
| Avoids AI aesthetic | 5 | No icon, no card, no hero, no dialog; warm tokens, dense. |
| Keyboard/focus | 4 | Inherits `Menu` a11y; post-nav focus relies on existing `WorkBet` behaviour (−1: not independently re-verified here). |
| Reuse / no rebuild | 5 | No bet editor or block editor rebuilt; AG3 surface is the landing target verbatim. |
| Sovereignty fit | 5 | Produces a `draft`; human commits in the editor. No auto-commit, no bypass. |

**Mean ≈ 4.8.** Routine, high-reuse, no new component. Approved.
