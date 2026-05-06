# L20 Design: Lifecycle Propagation Visibility

**Classification:** Routine. Propagation status is surfaced through existing components (StatusChip, KeyValue, progress bars, revision logs) on existing surfaces (WorkBet, WorkProduct, WorkPortfolio). No new components, no new pages, no novel layouts.

**Core question:** How does the user SEE that a lifecycle event propagated up the hierarchy?

---

## Variant 1: Inline Status Reflection (selected)

### Principle

Propagation is invisible when it works. The user sees the RESULT of propagation: a bet's status changes, a product's status updates, the portfolio's progress counters move. No separate "propagation log" surface, no toast notifications for routine propagation, no timeline view. The system just stays in sync.

The only time propagation becomes visible AS propagation is when it fails or requires confirmation. Then it surfaces through the existing thread/notification system.

### What changes on each surface

**Session level (no UI change).**
Sessions already end via `PATCH /api/sessions/:id` with state=done/crashed. The propagation engine subscribes to `session_ended` events and evaluates whether the parent task should transition. No UI surface for this -- sessions are delegated to the harness (L19 decision).

**Task level (bet detail page, task list).**
When the propagation engine auto-transitions a task (e.g., all sessions done and outcome=completed, so task moves to `review` or `done`), the task's StatusChip on the bet detail page updates. This already happens because the bet detail endpoint re-reads task state on each request. No new UI element needed.

One addition: the task's audit trail (already stored as JSON, already visible in TaskSheet) gains a `source: "propagation"` field on auto-generated entries, so the user can distinguish "the system moved this" from "an agent moved this" from "a human requested this." This is a data-layer change, not a UI change -- the TaskSheet already renders audit entries.

**Bet level (bet detail page).**
When all tasks on a bet reach `done` and the bet's done condition is met, the propagation engine transitions the bet. The bet's StatusChip updates. The revision log (already rendered on WorkBet) gains an entry with `actor: "system:propagation"` so it reads distinctly from human-initiated actions. The progress bar (done/total) already tracks this.

One design addition: when a propagation-triggered bet transition requires human confirmation (the only case: bet -> shipped), the system creates a review thread (using L1's Thread primitive) attached to the bet. The thread appears in Conversations with the standard review message type. The user approves or rejects. This reuses the exact same flow as L14's consequence-preview for bet actions -- no new affordance.

**Product level (product page).**
The product's StatusChip (healthy/behind/blocked) is already derived server-side from team state and active bet states (see `deriveProductStatus` in products.ts). When a bet ships or is killed, the product status recalculates automatically on the next request. The `activeBets` counter on the team row decrements (already handled in `transitionBet`). The progress bar updates. No new UI element needed.

One data addition: the product page's "Burn vs Cap" section already shows cost actual vs cap. When a bet ships, the cost rolls up. This is already the case from L17's cost wiring.

**Portfolio level (portfolio page).**
The portfolio page already derives status, ship rate, progress, and active bet counts from real queries against bets and tasks. When a bet ships, the shipped count increments, ship rate recalculates, and progress updates -- all on the next page load. No new UI element needed.

### Where confirmation is required

Simplicity bias: almost everything is automatic. The only transition that requires human confirmation is:

- **Bet -> shipped**: when the last task completes and the done condition is considered met. The system creates a review thread. The user must confirm shipping. Rationale: shipping a bet is a meaningful commitment boundary (per process-layer docs section 5.5). The user should consciously acknowledge "yes, this bet is done."

Everything else propagates automatically:
- Session ends -> task state update: automatic
- Task done -> check if bet should transition to review: automatic
- Bet shipped -> product status recalculation: automatic (derived, not stored)
- Bet shipped -> portfolio counters update: automatic (derived, not stored)
- Bet killed -> product/portfolio update: automatic

### Failed propagation visibility

When a propagation attempt fails (e.g., the task transition throws an InvalidTransitionError because the task was already killed), the failure is logged server-side and retried. If retry also fails, a notification surfaces in the Rail as a warning-severity notification row (using the existing NotificationRow component and notification queue).

The notification reads: "Lifecycle propagation failed: [entity type] [entity id] could not transition from [state] to [state]. Retries exhausted." This uses the existing notification system -- no new component.

### Toast for propagation-triggered transitions

No toasts for routine propagation. The WebSocket broadcaster already forwards `bet_state_changed` and `task_state_changed` events to the `work` topic. The client can invalidate its query cache on these events. If the user happens to be on the bet detail page when the last task finishes and the bet moves to review, they see the status chip update in near-real-time.

---

## Did we consider

**Activity timeline on bet/product detail?**
Rejected. A timeline of "session ended -> task finished -> bet shipped" would be informative but adds a new component. The revision log on the bet already captures the state changes. The task audit trail already captures task transitions. A combined timeline is a future enhancement, not a propagation requirement. The acceptance criteria say "the user observes propagation through whichever surface the designer + architect choose" -- and the existing status chips + revision log + progress bars already serve this.

**Toast notifications for every propagation?**
Rejected. Most propagation is routine. Toasting "task X auto-completed" every time a session ends would be noise. The user is a power user managing a fleet of agents -- they scan status, they don't watch a toast stream.

**Propagation indicator badge (e.g., a small arrow or chain icon)?**
Rejected. Adds visual noise for marginal information value. The user cares about the RESULT (status changed) not the MECHANISM (it changed because propagation fired). The revision log entry with `actor: "system:propagation"` serves the rare case where someone wants to know HOW the transition happened.

**A "propagation pending" state on bets/tasks?**
Rejected. Propagation should be near-instant (synchronous within the event handler or retried within seconds). Introducing a visible pending state suggests unreliability to the user and creates a state management burden.

**Cycles UI?**
Explicitly rejected per founder direction. No cycles, no sprint planning. This is a kanban system.

---

## Components used

All from the existing 19 custom components + DaisyUI primitives:

- **StatusChip** -- reflects status changes at every level
- **KeyValue** -- progress counters, cost display
- **BetCard** -- on product page, shows bet status chip and progress
- **TaskCard** -- on bet detail page, shows task status chip
- **NotificationRow** -- in Rail, for failed propagation alerts
- **ThreadRow** / **RichMessageCard** -- in Conversations, for the ship-confirmation review thread
- **CommentRow** -- in revision log display

No new components required.

---

## States

**Empty:** No propagation has occurred (fresh system). All entities at their initial states. Existing empty states on each page handle this.

**Loading:** Standard skeleton states already exist on WorkBet, WorkProduct, WorkPortfolio.

**Error:** Propagation failure surfaces as a notification in the Rail. The affected entity shows its last valid state (propagation failure does not corrupt visible state -- it just means the parent hasn't updated yet).

**Populated:** Status chips, progress bars, and revision logs reflect the propagated state. This is the steady state.

---

## Score (self-assessment against 9 dimensions)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Hierarchy | 8 | Status changes surface at the right level of the hierarchy |
| Spacing | 9 | No new spacing -- reuses existing page layouts |
| Typography | 9 | No new text -- reuses StatusChip, KeyValue labels |
| Color | 9 | StatusChip monochrome palette already covers all states |
| Coherence | 9 | Propagation is invisible infrastructure, not a new surface |
| States | 7 | Failure state depends on notification system; confirmation flow reuses threads |
| A11y | 8 | StatusChip has aria labels; progress bars have aria-label |
| Anti-slop | 10 | Zero new components; zero decorative elements; zero AI aesthetic patterns |
| Premium polish | 7 | Revision log entry with system:propagation actor is informative but plain |
