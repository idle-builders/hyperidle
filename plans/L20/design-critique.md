# L20 Design Critique: Lifecycle Propagation Visibility

**Reviewer:** Phase 2 design critique
**Artifact evaluated:** `plans/L20/design/approved.md`
**Classification claimed:** Routine (no new components, no new pages)

---

## Summary

The design proposes that propagation is invisible when it works. The user sees the RESULT of propagation through existing surfaces: StatusChip updates, progress bar changes, revision log entries with `actor: "system:propagation"`. The only user-facing propagation moment is the ship-confirmation review thread (bet -> shipped requires human confirmation). Failed propagation surfaces through the Rail notification system.

The designer correctly identified that this is infrastructure work with minimal UI surface. The decision to reuse existing components (StatusChip, KeyValue, BetCard, TaskCard, NotificationRow, ThreadRow) rather than introducing new propagation-specific UI is sound.

---

## 9-Dimension Score Table

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Clarity | 8 | The mental model is clear: propagation is invisible machinery, the user sees status changes. The revision log entry with `source: "propagation"` or `actor: "system:propagation"` gives an audit trail when the user wants to understand HOW a transition happened. The one gap: the design does not specify what the ship-confirmation review thread message actually looks like in the Conversations view -- what text does the user read? What are the affordances (approve/reject buttons)? This is implied via "reuses the exact same flow as L14's consequence-preview" but never shown. |
| Consistency | 9 | Follows existing patterns faithfully. StatusChip for state changes. NotificationRow for failures. Review threads for confirmation. Revision log for audit. No new patterns introduced. The `actor: "system:propagation"` convention aligns with L14's actor field on revision log entries. |
| Efficiency | 9 | Zero steps for routine propagation -- the user sees status updates automatically. One step for the ship confirmation (approve the review thread). This is the minimal viable interaction. |
| Discoverability | 7 | The revision log entry with `actor: "system:propagation"` is discoverable IF the user already knows to look at the revision log. For users who notice a bet changed status and want to understand why, the path is: open bet detail -> scroll to revision log -> read the entry. This is adequate but not proactive. The design explicitly rejected toasts and activity timelines, which is the right call for noise reduction, but it means a user who was not watching at the moment of transition must actively investigate. The failed-propagation notification in the Rail is discoverable. |
| Error handling | 8 | Failed propagation surfaces as a notification in the Rail with warning severity. The notification text is specified: "Lifecycle propagation failed: [entity type] [entity id] could not transition from [state] to [state]. Retries exhausted." The entity shows its last valid state -- no corruption. The gap: the design does not specify whether the user can DO anything about a failed propagation from the notification (e.g., retry manually, navigate to the affected entity). The notification is informational only. |
| Accessibility | 7 | Delegates to existing components which already have aria labels on StatusChip and progress bars. The ship-confirmation review thread reuses the thread primitive which has its own a11y story from L1. No new a11y concerns introduced. Score docked slightly because the design does not explicitly verify that the `actor: "system:propagation"` string in the revision log is screen-reader friendly (it contains a colon which some readers may announce oddly), but this is a minor concern. |
| Scalability | 8 | The design handles many propagation events well: each is a status change on its own entity, rendered by existing components that already handle list views. No aggregation UI that could overflow. The ship-confirmation review threads could accumulate if many bets complete simultaneously, but these surface in the normal Conversations queue which already handles volume. The one concern: if many propagations fail simultaneously, the Rail notification list could fill with similar-looking failure notifications. No grouping or dedup is specified for failure notifications. |
| Delight | 7 | The design is deliberately invisible when things work, which is the right call for infrastructure. The revision log entry distinguishing system-propagation from human-initiated and agent-initiated transitions adds trust without noise. The ship-confirmation flow is satisfying -- the user is asked to confirm a meaningful commitment boundary. The design is not delightful in the "wow" sense, but it is honest and low-friction. Appropriate for the domain. |
| Feasibility | 9 | Every component referenced already exists. StatusChip, KeyValue, BetCard, TaskCard, NotificationRow, ThreadRow, CommentRow -- all built. The ship-confirmation review thread uses the same mechanisms as L14 and L7. The `actor` field on revision log entries was added in L14. The notification queue was added in H2. No new frontend work beyond data-layer changes and minor wiring. |

---

## Average Score: 8.0 / 10

---

## Verdict: PASS

The design meets the threshold (>= 7) on all dimensions and averages 8.0 overall.

---

## Non-Blocking Suggestions

1. **Ship-confirmation message content.** The design should specify (or delegate to the builder) the exact review message payload for the ship-confirmation thread: what text the user reads, what the approve/reject affordances look like in the Conversations view. Currently this is implied by "reuses the exact same flow as L14" but the builder needs to know the message payload shape. The architecture plan (section 7) does specify the payload shape, so this is covered cross-artifact.

2. **Failed-propagation notification actionability.** Consider whether the failure notification should deep-link to the affected entity so the user can investigate without manual navigation. Currently the notification is informational text only.

3. **Failure notification dedup.** If a cascade of propagation failures occurs (e.g., a task that fails to transition causes its bet to also fail), the user could see multiple related failure notifications. A note about whether these should be grouped or whether the current behavior (one per failure) is acceptable would be useful.
