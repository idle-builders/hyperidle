# AF8 — Concept verification notes (verify-only)

`/concept` run as **verify-only**. The notification model is founder-locked (`docs/human-interface-layer/notification-primitive.md` + `plans/AF8/concept.md`). This file records that the New/Reshaped nouns are fully specified for what AF8 builds, plus the silent assumptions the probes surfaced. **No redefinition.**

## Verdict

Concept is **complete and buildable**. All seven New/Reshaped nouns (Notification, Notification type, Notification popover, Source link, Mute preference, Urgency, Channel) have identity, properties, lifecycle, authority, cardinality, and hard rules pinned. No concept gap blocks design or architecture.

## Silent assumptions surfaced (resolved in architecture, not concept)

These are **implementation contracts the build must honor**, not concept holes:

1. **`type key` ≠ today's `eventType` column verbatim.** The concept says "reuse `eventType`", but the live `notification_queue.eventType` holds raw bus event names (`item_created`, `cost_cap_breached`, `cost_cap_warning`) — not the concept's type keys (`review_request`, `blocker_alert`, `cost_alert`). One event can map to one type, and `item_created` only becomes `review_request` when `verb=review`. **Architecture must define the event→type mapping explicitly** and persist the *type key*, not the raw event name, in a new column. The raw `eventType` may stay for audit but is not the mute unit.

2. **`urgency` is a new persisted column, derived from the type registry's `defaultUrgency`.** Today's `severity` column (`blocking|cost_breach|digest`) conflates type + urgency + delivery-mode. The concept retires `severity` as the model field. Architecture decision: **keep the `severity` column for the dormant egress path** (adapters/flood/digest routing already key off it) but **add `urgency` + `typeKey` + `sourceLink` + read-state columns** for the in-app popover. `digest` stays a `severity`/egress value, never a `urgency`.

3. **Source link is a string route, persisted at enqueue.** Hard rule #2. The concept gives two shapes: `/conversations/<threadId>[?message=...]` (thread-backed) and a place route (cost detail). Architecture must pick the **cost detail route string** (the app has no dedicated cost-detail page yet — see Coordination/Blocker note) and persist a single `sourceLink: text` column. Resolved-at-click means the column holds the literal client route.

4. **Per-user read-state vs per-user mute are two different per-user concerns.**
   - *Seen/read* (dismiss one instance) — lives on the notification row. AF8 owns it. Single-founder near-term, so a row-level `readAt` is acceptable; multi-user read-state is out of scope (no per-(user,notification) join table yet).
   - *Mute preference* (suppress a type) — per-user, owned by **AF15** for persistence. AF8 defines the **read interface** the drain + popover consume (`isTypeMuted(userId, typeKey)`), and a code-defined default (all types on). See architecture Coordination.

5. **`cost_actual` the sentinel reads is a factory-wide aggregate that nothing writes.** Confirmed defect (Z8-008). `recordCostAndCheck` writes per-entity accumulators (`users.costActual`, `teamMembers.costActual`, `bets.costActualMinor`) but never a factory-wide `factory_settings.cost_actual`. Architecture must define the canonical factory cost value and coordinate with AF10 (the cost-recording boundary). See architecture Coordination — this is a **contract dependency**, flagged.

6. **The `notification` bus event is structurally too thin to become a popover notification.** `NotificationEvent = { type, streamId, targetId, message, timestamp }` has no type key, no urgency, no source link, no item context. The policy engine emits it on a `push` decision for an item, with `targetId = itemId` and a generic message. Architecture must enrich on the listener side (look up the item → derive `review_request`/`blocker_alert`, build the source link) rather than trust the event payload. Confirmed: **zero `.on("notification")` listeners** exist outside tests.

## Out-of-scope confirmations (concept + spec agree)

- Scheduler (AF6), the cost-accounting *fix* itself (AF10), retention/TTL cleanup (AF16), notification history / test-send UI. AF8 wires delivery + the popover + the Settings type-list only.
- Push/email egress stays **dormant** — the popover is the entire near-term surface. AF8 does not enable channels; it makes the in-app path real and keeps the egress path drain-correct.
