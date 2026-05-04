# L15 — Synthesis

## Strongest base

**Variant A — `quiet-menu`.** Highest critique score (7.6), zero component
budget cost, no layout reflow, single mental model across mouse and
keyboard. The founder filter favours density and predictability over
signposting; A is the most density-respectful of the three.

The biggest weakness of A is **discoverability**. We mitigate it with two
pulled-in elements (below) rather than abandoning the base.

## Pulled in from B (`inspector-drawer`)

**P-B.1 — Click anywhere on the card body opens the menu.**
B's "click card → action" pattern is the right hot path for touch and is
fast for mouse, too. We keep A's `···` as the visual affordance and aria
hook, but the **entire card body is the same trigger**. The `···` is a
focus-target for keyboard users and a redundant visual hint for mouse
users; the card body click is the primary mouse path. Resolves A's
"asymmetric desktop/touch grammar" warning.

**P-B.2 — A "Reply in thread" verb is a first-class menu item.**
B made free-form replies a primary action via a Composer. We pull this
into A by adding `Reply in thread…` to the menu, between "Open thread"
and "Snooze 24h". Selecting it opens a single-line Composer **modal**
(DaisyUI), not an inline composer. The composer modal is the same one
Variant C proposed for "request-with-reason" (P-C.1 below) — same
component, different verb.

## Pulled in from C (`linear-palette`)

**P-C.1 — "Request X with reason" via Composer modal.**
C's strongest contribution. When the user selects a verb (e.g. "Request
unblock"), if they hold `Cmd`/`Alt` while clicking (or press `Cmd+Enter`
on a focused menu item), the verb opens a Composer modal with the
optional reason field. Plain `Enter` / click sends the verb without a
reason. Default is fast; modifier promotes to "with-reason."

**P-C.2 — "Cancel pending request" verb on cards with a request in
flight.**
When a request is pending, the menu surfaces a `Cancel pending request`
item that withdraws the request. Resolves the asymmetry where a user
could send but not unsend.

**P-C.3 — Secondary "→ agent decides" hint on each verb item.**
C's secondary text "→ asks the agent to retry — agent decides" teaches
the contract every time the menu opens. We pull this into A's menu as a
muted second line under each verb. (A originally had a one-time
disclosure; C's per-item hint is better — teaches in context, never
becomes opaque.) Removes the need for the "first-use disclosure" banner
A proposed.

## Explicitly rejected

The rejection list is as load-bearing as the chosen direction. These do
NOT enter `approved.md`:

- **R-1.** **Inline drawer (B's signature).** Component-budget cost is
  too high; layout reflow is too disruptive; mobile divergence (drawer
  becomes bottom-sheet) introduces two mental models. The "thread
  context inline" idea is real but the right place for it is the
  thread surface itself (L18) and the Inspector pane (Submenu's role
  on a future detail view) — not inline within a column.
- **R-2.** **Command palette (C's signature).** Pattern is heavier than
  the problem. With 5–7 commands per task, the filter input is friction
  and the multi-section layout is fluff. A simple menu does the job at a
  fraction of the chrome.
- **R-3.** **Filter input on the menu.** Even if the palette pattern is
  rejected, someone might propose adding a filter to the menu for power
  users. Don't. The verb list is short; arrow-keys + initial-letter
  shortcuts are enough.
- **R-4.** **`K` chip on focused card.** Teaches a shortcut once; chrome
  forever. The menu's letter shortcuts are visible inside the menu
  (`S`, `H`, `D`, `B`, `O`, `Z`) and that is enough.
- **R-5.** **`not-allowed` cursor or shake on drag attempt.** Reads as
  "broken", not "intentional." Drag is silently disabled.
- **R-6.** **Onboarding hint banner ("Tasks are agent-owned").**
  Per-item secondary text covers this; no banner needed.
- **R-7.** **Verb-chip row on the card itself (always-visible, no
  drawer).** Considered as an A/B middle-ground. Rejected — it adds
  per-card chrome that violates the density-at-rest principle.
- **R-8.** **State-machine validation in the UI.** The menu shows only
  legal verbs for the current state (e.g., "Request unblock" only
  appears on `blocked` tasks). The architect must not add a "are you
  sure?" confirm on top of this — the verb selection IS the
  confirmation.
- **R-9.** **Multi-task batch-request UI.** Out of scope per L15 brief.
- **R-10.** **Touching Canvas Shaped → Committed drag.** Drag survives
  there exactly as today.

## Compounded score

A's 7.6, plus:
- +0.2 for P-B.1 (resolves W-2 from A's critique)
- +0.2 for P-C.3 (resolves S-1 from A's critique and converts into a stronger
  per-item teach)
- +0.2 for P-B.2 (free-form reply path was missing from A — biggest gap)
- +0.1 for P-C.2 (cancel pending request — completeness)

**Synthesised score (estimate): 8.3 / 10.** The approved design must
re-pass `/design-critique` at ≥ 7. Above 8 is the realistic target after
incorporating the pulls.

## Open questions surfaced for the architect

1. **Request message kind.** The thread receives a structured message
   when a verb is fired. Is it a new `MessageKind` (e.g.,
   `state_change_request`), or is it an existing kind with a typed
   payload? The architect decides; the design assumes a kind that
   carries `{verb, optionalReason}` as structured data so an agent can
   parse it without NLP.
2. **Cancel-request semantics.** Cancelling a pending request — is it a
   new message in the thread, or a soft-delete of the original
   message? Affects the agent's view of history.
3. **Pending state derivation.** The `↪ pending` chip on the card —
   does it derive from "task has an open request message" (read-model)
   or from a typed `pending_request` field on the task (write-model)?
   Read-model is cheaper to maintain but harder to query across many
   tasks; write-model needs ack/cancel paths.
4. **Atomic verb list.** Variant A enumerated verbs as
   `Request stop / hold / unblock / mark done / hand back to me / open
   thread / snooze`. The architect must define the canonical set for
   L15 — these are the source-of-truth verb identifiers.
5. **`Snooze 24h` semantics.** Hides from board for 24h, or hides from
   notifications? Different scopes. (Lean toward hides-from-this-board.)
6. **Mobile bottom-sheet vs popover.** Out-of-scope per L15 (the affordance
   is the chosen direction; mobile rendering can be implemented as a
   refinement). But the architect should size the gap so it doesn't
   leak into PR.
