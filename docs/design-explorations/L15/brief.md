# L15 — Design Brief

**Story.** `docs/work-packages/TRACK-L.md` § L15 (lines 511-540).

## Interrogated brief

### Who is acting and what decision are they making?
A founder (CEO/CPO) on the **Team Board** is reviewing a kanban of agent-owned
tasks. Most of the time they look and move on. Occasionally a task is stuck —
blocked, taking too long, parked in review without a verdict — and they want to
either (a) **request a state change** (e.g., "stop this", "drop the hold",
"hand it back to me"), OR (b) **open a thread** with the agent working on the
task to clarify or unblock. The agent decides whether to honour. Humans request,
never command.

### What's the smallest UI surface that delivers the outcome?
A per-task affordance reachable from the existing TaskCard inside Kanban,
without leaving the Team Board. Variant exploration covers per-card menu vs.
per-card hover-actions vs. a global command surface. The thread surface
itself (L18) is **out of scope** — the affordance just opens it.

### Primary state and density tax
Populated card. The action is invoked **rarely** — maybe 1 task in 10 across a
day. So:
- Default card visuals MUST NOT change. No new persistent chrome.
- Affordance reveals on hover (mouse), focus (keyboard), or long-press
  (touch). It's discoverable without being noisy.
- One keypress (`Enter` or `Space`) on a focused card opens the affordance.
- Touch targets stay ≥ 44px at viewport ≤ 1024px (AQ-015).

### New primitive vs extending an existing one?
**Extending.** TaskCard gets a new affordance slot. The mechanic underneath is
DaisyUI primitives (dropdown menu, modal/popover, button) plus existing
Composer for the free-form message. **Component budget cost target = 0** —
no new Tier-2 / Tier-3 components.

### What gets overflowed / truncated?
The card stays terse — title, owner, StatusChip, optional Tag, optional cost.
The affordance lives in a **separate flow**: either a dropdown anchored to the
card, an inline drawer revealed below, or a modal. Variants explore which
flow.

### Existing components / DaisyUI primitives this composes from
- TaskCard (Tier 2, exists) — receives the affordance
- DaisyUI `dropdown` / `menu` for the state-request picker
- DaisyUI `modal` for the free-form thread-message composer
- DaisyUI `btn` (`btn-ghost`, `btn-xs`)
- StatusChip (Tier 1, exists) — for the requested target state preview
- Composer (Tier 2, exists) — for the free-form message body if a variant
  uses it
- BlockActionsPopover (Tier 2, exists) — pattern reference for the menu shape

### What "request state change" should mean in interaction terms
Three plausible shapes — variants explore each:
- **Picker over canonical states** (`stop`, `unblock`, `hold`, `hand back`,
  `mark done`) — terse, discrete, agent-readable.
- **Picker + optional reason field** — adds a one-line "why" the agent reads
  before deciding.
- **Free-form structured request** ("I'd like you to … because …") — the
  composer becomes the input and the structured intent is embedded as a
  message kind.

The verb language must reflect agent autonomy:
- Use "Request stop", "Ask to unblock", "Suggest mark done" — **NOT** "Stop",
  "Unblock", "Mark done". Same on the confirmation toast: "Request sent. The
  agent will decide." (Per L15 contract: humans request, agents decide.)

### Drag is a no-op — what does that look like?
- Removing `useDraggable` from the Kanban TaskCard wrapper is the cheap part.
- Visual cue when a user grabs and drags: NONE. The card simply doesn't move.
  Cursor stays default. No "not allowed" cursor (signals failure; this is a
  designer-call to read as intentional, not broken). No shake. No tooltip.
- Canvas (Shaped → Committed) drag is **untouched** — different DndContext,
  different surface, BetCard not TaskCard.
- Bonus: a one-time onboarding hint ("Tasks are agent-owned; tap to request
  changes") is in scope for the synthesis phase if a variant proposes it.

### Feedback states for a sent request
- **Sent.** Toast "Request sent — agent will respond." (no auto-dismiss
  blocking; standard 3s).
- **Pending visualisation on the card.** A small monochrome `↪` indicator on
  the card's StatusChip area shows "request pending" until the agent acts or
  acknowledges. Click on the indicator opens the thread.
- **Empty state.** First time a user uses the affordance, the dropdown shows
  a one-liner: "Agents read these as suggestions, not commands."

### Mobile adaptation
Mobile uses three tabs (Conversations / Work / Knowledge). Team Board on
mobile collapses kanban columns. The TaskCard affordance must work via tap
(no hover). On tap, the card itself opens an inspector. The same affordance
shape works for all variants — the entry-point shifts from
hover-revealed-button to always-visible inline button on touch viewports.

---

## Variants chosen for parallel exploration

### Variant A — `quiet-menu` ("Minimal scaffold")
**Constraint:** smallest possible component count; reuse only DaisyUI dropdown
+ existing primitives. The shape is whatever falls out of recombining what's
already in `packages/design-system/src/`.

**Thesis:** prove the feature ships inside the 19-component budget with zero
new shapes. A `··· ` button reveals on hover/focus, opens a DaisyUI menu
listing canonical state requests + an "Open thread" item.

### Variant B — `inspector-drawer` ("Power-density rethink")
**Constraint:** optimise for the single most common power-user task — opening
the thread to read what's happening on a stuck task. Cut the explicit
state-request picker from the card surface and route it through an inline
**inspector panel** that slides in below the column row when a card is
selected.

**Thesis:** density and speed beat completeness. The 80% case is "click a
stuck task to see the thread"; the 20% case (request a state change) is one
extra click inside the inspector. The card itself stays absolutely terse and
gains zero per-card chrome.

### Variant C — `linear-palette` ("Reference-borrowed")
**Reference:** Linear's `Cmd+K` per-issue command palette + Slack's "send
request" composer.

**Constraint:** invoke a global command palette on a focused card with a
single keystroke. The palette presents the canonical request verbs as
matched commands ("Request stop", "Request unblock", "Open thread", "Snooze
24h"). Selecting a command either fires immediately (atomic verbs) or opens
a Composer modal anchored to the task's thread.

**Thesis:** a proven interaction grammar (Linear's command palette mental
model) shortens the user's learning curve. Mouse users get a `··· ` fallback;
keyboard users never leave the keyboard.

---

## Anti-convergence check

Variants differ on at least 3 of the 7 axes per pair:

| Axis | A: quiet-menu | B: inspector-drawer | C: linear-palette |
|---|---|---|---|
| Hierarchy (eye lands first) | Card content; `···` is invisible until hover | Card content; selection adds a drawer below | Card content; palette is invoked, not visible |
| Density | Unchanged card, popover above | Card unchanged, drawer adds 88px below selected card | Card unchanged, palette overlays the page |
| State strategy | One canonical card layout, popover on demand | Card has selected/unselected variants | One canonical card layout, palette is global |
| Action surface | Per-card popover anchored to the `···` | In-drawer button row | Global palette |
| Composition | Card + DaisyUI dropdown | Card + new inline-drawer block | Card + DaisyUI modal command-list |
| Copy register | Verb list ("Request stop") | Form ("Send a message to the agent" + verb chips) | Command-string ("> request stop") |
| Motion | 80ms popover fade | 150ms drawer expand height | 80ms palette fade-in |

Pairs differ on 5/7 axes minimum. Spread is intentional.

---

## Out of scope (explicit)

- The thread surface itself (L18 owns rendering)
- Cost / token displays (L17)
- Canvas Shaped → Committed drag (already exists; L15 must not break it)
- Persistent server contracts for "request" message kind (architecture decides)
- Multi-task batch-request UI (one task at a time per L15)
