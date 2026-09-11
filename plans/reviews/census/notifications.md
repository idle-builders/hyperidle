# Census — notifications vs routines

Two mechanisms for what the target model calls one thing: a user subscribing to an event.

## Notification side — barely built

- **2 types total.** `review_request`, `blocker_alert` (`framework/domain-model/src/notifications.ts`,
  `NOTIFICATION_TYPES`). Against 34 event types on the bus. The notification vocabulary is its
  own tiny registry with no relationship to `EventType`.
- **No recipient column.** `notification_queue` (`framework/db/src/schema.ts:971`) has no user or
  team column at all. One global inbox, served by `GET /notifications/inbox` with no filtering.
  There is no concept of *who* a notification is for.
- **Agents cannot receive one.** Nothing in the path reads `users.kind` — because nothing reads a
  user at all. The only kind-filtering anywhere near this is `resolveReviewRecipients`
  (`layers/core-api/org/src/org-routing.ts`), which seeds thread participants, never notifications.
- **Default is ON, mute subtracts** — `mutedTypes` defaults to `[]`. Matches the target polarity.
  But the mute list lives on the `server_config` singleton, so it is **global**: one person muting
  a type mutes it for the whole install.
- **Producer-side filtering.** A muted type is checked before insert, so it leaves no row and no
  trace. Unmuting does not reveal what was missed.
- **One writer bypasses the bus.** `agent-health-session-end-reactions.ts:151` inserts rows with
  `typeKey = null` — off-registry, unmutable, unlabeled in the UI.
- **Delivery is fetch-on-mount only.** No websocket push, no polling, no OS notification.
  `Sidebar`'s `unseenNotificationCount` is never passed by `AppShell` in production, so the unread
  dot is dead outside tests and stories.

## Routine side — fully built, opposite shape

| | Notification | Routine (`triggerType:"event"`) |
|---|---|---|
| Vocabulary | own 2-key registry | the 34 `EVENT_TYPES` directly |
| Subject | none — global inbox | `ownerAgentId` FK, NOT NULL |
| Scope | none (global singleton) | derived from the owner's team |
| Storage | JSON array on a singleton | a row per subscription, indexed |
| Polarity | default-on, subtractive | default-off, additive |
| Granularity | type key only | event + optional transition constraint + prompt |
| Lifecycle | boolean muted | state, active, soft delete, plugin, auto-error |
| Filtering | producer-side, before insert | consumer-side, per emission |
| Delivery | a queue row pulled on mount | an agent run + `routine_runs` audit row |
| Loop guard | none | `originRoutineId` self-suppression |
| API | `PUT /mute/:key` | full CRUD + `GET /event-types` |

## What the target model requires

1. One vocabulary. Notifications speak `EventType`, culled to the ones a person would want.
2. A recipient on the notification row, and scope + ownership on the subscription.
3. Per-user mute, not a global singleton.
4. Same polarity on both sides.
5. The off-registry writer folded in or deleted.

## The open asymmetry

A notification has an obvious default action — show it to me. A routine does not: it needs a
prompt saying what the agent should do. So "on by default" cannot mean the same thing on both
sides without deciding what an agent does when an event fires and nobody said what to do.
