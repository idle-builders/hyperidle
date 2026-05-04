# L15 — Synthesis

## Strongest base: Variant A — Kebab overflow menu

Variant A is the locked direction. Score 8.6/10. Wins on density, component-budget cost (0 new), L15/L18 boundary (the kebab routes to a thread surface that L18 fills), and grammar familiarity.

## Pulled in from Variant B

- The **chip-style verbs** ("→ Planned", "→ Blocked", "→ In Progress", "→ Done") are clearer than generic verbs like "Move to Planned". Adopt the directional arrow + state-name copy inside Variant A's submenu items.
- The **toast confirmation** ("Requested → Blocked. Posted to thread.") — Variant A's spec already includes this; reaffirmed.

## Pulled in from Variant C

- The **danger styling on the Blocked path**. C's mockup colored the "Blocked" button red because requesting a state of `blocked` is the act-now signal. Adopt this in A's submenu: the "Blocked" item gets `color: var(--danger)`. (Other states stay text-hi.)
- The **"current state" cue** — disable the current state in the submenu and append " (current)" so users see why one option is greyed out.

## Explicitly rejected

These are off the table. The architect should NOT re-litigate them.

1. **Drag-with-confirmation.** Re-introducing drag in any disguised form. The Founder's direction is clear: agents own task state; humans request via thread. Drag is a command grammar; we are deliberately removing it.
2. **Per-card persistent action toolbar.** Always-visible chip row under every card (Variant B's mobile state). Density principle (AQ-103, K9 density tier ladder) and Asana-2018-rollback precedent.
3. **Click-the-card-opens-a-sheet (Variant C entirely).** Pre-empts L18's task-thread surface design. Sheet is the right shape for L18; we don't want to lock L15 into it.
4. **Single global "Request" CTA on a per-column basis.** Considered briefly — would let users request "move all blocked back to planned" — but violates "one task = one request" auditability.
5. **Inline editor / select dropdown of states inside the card.** Reads as "edit", reinforces command grammar.
6. **Emoji icons.** AQ-105.
7. **A modal dialog asking "are you sure?"** before posting. Posting to a thread is itself the audit trail; a modal would double-confirm a low-risk action.
8. **Optimistic state change in the UI.** The card stays in its current column until the agent acts. The request is a thread message, NOT a state mutation. Showing the card "as-if moved" would lie about ownership.
9. **Free-text "request reason" input in the submenu.** Considered: a small textarea below "Request → Blocked" so the founder can say WHY. Rejected for L15 — adds modality, and the founder can always follow up in the thread (the thread surface from L18 is the right place for free-text).
10. **A keyboard shortcut on the unfocused card** (e.g. hovering a card and pressing `B` to request Blocked without opening the menu). Considered for power users. Rejected: muscle-memory across the founder's fleet of products + the implicit shortcut surface inside the menu (`P` `B` `I` `D`) already gives keyboard speed without a global keymap.

## Open questions for the architect

These are routed downstream to `/architecture`:

1. **Thread-message format.** What text does the request post? Recommend a structured marker the agent can detect: e.g. `[REQUEST state=blocked from=in_progress requested_by=user_id at=ISO]`. Architect chooses the exact wire shape — designer locks the user-visible string ("Requested → Blocked").
2. **Endpoint shape.** L15 reuses L1's `POST /api/threads` (create-with-message) and `POST /api/threads/:id/messages`. Architect decides whether L15 introduces a thin server helper (`POST /api/tasks/:id/state-request` that internally posts to the thread) or whether the web client posts directly to threads with the structured body. Designer's intent: a single thread message per request — no parallel state-request table.
3. **Thread-lift target.** When "Open thread" is selected, where does the user land? L18 will define the canonical surface. For L15, recommend opening a temporary surface that renders the task header + Composer — same component the L18 surface will eventually replace. Architect picks: route, drawer, or in-page panel.
4. **Toast surface.** Does the app have a global toast container yet? If not, L15 introduces it OR uses an inline confirmation banner inside the column.
5. **Mobile kebab visibility rule.** Kebab is hover-revealed on desktop; spec says "always visible at viewport ≤ 1024 px". Architect confirms whether `[data-density="comfortable"]` is the trigger, OR a touch-event detection.

## Score check

The chosen design = Variant A + B-copy + C-danger-styling. Net score expected ≥ 8.6 (no regression from any of the patches). Designer attests the design is shippable as approved.
