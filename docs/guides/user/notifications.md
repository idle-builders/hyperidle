## Notifications

HyperIdle sends in-app notifications when agents need your attention. Every notification is typed so you know exactly what kind of action is needed.

### Notification Types

| Type | When it fires | Default urgency |
|---|---|---|
| **Review requests** | An agent needs your review to proceed | Immediate |
| **Blocker alerts** | An agent is blocked and needs you to intervene | Immediate |
| **Cost alerts** | Factory spend crosses a configured cost cap | Immediate |

### Notification Inbox

Click the bell icon in the sidebar to open your notification inbox.

- **Unseen dot** — a red dot on the bell means you have unseen notifications. It clears when you open the inbox.
- **Row anatomy** — each notification shows a colored urgency dot, the title, the type label, and how long ago it arrived.
- **Navigate** — clicking a row takes you to the conversation or item that triggered it.
- **Dismiss** — removes this specific notification from your inbox. Future notifications of the same type still arrive. Use dismiss when you've handled this particular notification and don't need to see it again.
- **Mute type** — silences all future notifications of that type (e.g., all review requests). Existing notifications are removed from view; the type toggle in Settings → Notifications switches off. Muting is reversible: re-enable the type in Settings to start receiving those notifications again.
- **Dismiss ≠ Mute** — dismiss clears one instance; mute suppresses all future instances of the type. If the same kind of notification keeps arriving and you don't need it, mute the type. If you just acted on a single notification, dismiss it.

#### Urgency dot legend

| Dot | Urgency | Meaning |
|---|---|---|
| Red dot | Immediate | Needs your attention now — review requests, blockers, cost alerts. Sorts first in the inbox. |
| Gray dot | Ambient | Listed for awareness — low-risk items. No escalation or interrupt. |

### Delivery and Silence

- **Immediate notifications** (review requests, blocker alerts, cost alerts) are delivered as soon as the agent triggers them.
- **Quiet hours** — if you configure quiet hours in Settings > Notifications, blocking notifications queue during that window and deliver when the window ends. Cost alerts bypass the factory kill switch but still respect your quiet hours.
- **Factory silence** — a global kill switch in Settings > Notifications > Enabled. When disabled, all notifications queue instead of delivering (except cost alerts, which bypass factory silence for safety).
- **Digest** — low-priority items batch into a scheduled digest (configurable in Settings > Notifications).

### Settings > Notifications

In **Settings → Notifications** you can:

- **Toggle types on/off** — each notification type has a toggle. Muting a type prevents those notifications from entering your inbox entirely.
- **Configure delivery** — set your primary and digest channels (in-app, ntfy push, email).
- **Quiet hours** — set a window when blocking notifications queue instead of pushing.
- **Cost cap** — set a spend threshold that triggers a cost alert.

### Auto-unblock (not a notification)

When a task's dependencies are resolved automatically, HyperIdle transitions the task to `in_progress` without interrupting you. These "auto-unblock" events are intentionally silent — they are ambient housekeeping, not a call to action.
