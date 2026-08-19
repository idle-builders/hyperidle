# Destroyer input — `notifications` (core-api)

Package: `layers/core-api/notifications`
Surface: 16 exported functions, 0 classes (0 member methods), 11 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `getDailyDigest` | yes | `layers/core-api/notifications/src/daily-digest.ts:36` |
| 2 | `scrubErrorMessage` | internal | `layers/core-api/notifications/src/install.ts:622` |
| 3 | `priorityForSeverity` | internal | `layers/core-api/notifications/src/install.ts:677` |
| 4 | `classifySmtpRetriable` | internal | `layers/core-api/notifications/src/install.ts:787` |
| 5 | `installNotifications` | yes | `layers/core-api/notifications/src/install.ts:1699` |
| 6 | `deliver` | yes | `layers/core-api/notifications/src/install.ts:1751` |
| 7 | `readConfig` | yes | `layers/core-api/notifications/src/install.ts:1841` |
| 8 | `updateConfig` | yes | `layers/core-api/notifications/src/install.ts:1854` |
| 9 | `readPreferences` | yes | `layers/core-api/notifications/src/install.ts:1881` |
| 10 | `updatePreferences` | yes | `layers/core-api/notifications/src/install.ts:1889` |
| 11 | `enqueue` | yes | `layers/core-api/notifications/src/notification-queue.ts:305` |
| 12 | `listNotifications` | yes | `layers/core-api/notifications/src/notification-queue.ts:348` |
| 13 | `markNotifications` | yes | `layers/core-api/notifications/src/notification-queue.ts:405` |
| 14 | `reap` | yes | `layers/core-api/notifications/src/notification-queue.ts:452` |
| 15 | `isInSilenceWindow` | internal | `layers/core-api/notifications/src/silence-policy.ts:27` |
| 16 | `isSilenced` | yes | `layers/core-api/notifications/src/silence-policy.ts:56` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `DeliverySpec` (type, public) `layers/core-api/notifications/src/install.ts:141`
- `DeliveryResult` (type, public) `layers/core-api/notifications/src/install.ts:150`
- `NotificationConfigPatch` (interface, public) `layers/core-api/notifications/src/install.ts:168` — members: `enabled`, `primaryChannel`, `digestChannel`, `recipientEmail`, `recipientNtfyTopic`, `ntfyBaseUrl`, `ntfyAuthToken`, `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUsername`, `smtpPassword`, `smtpFrom`, `floodMaxPerMinute`, `floodCoalesceWindowMs`, `testMaxPerHour`, `smtpIgnoreTls`, `digestCron`
- `SafeNotificationConfig` (type, public) `layers/core-api/notifications/src/install.ts:193`
- `NotificationFilter` (type, public) `layers/core-api/notifications/src/notification-queue.ts:233`
- `NotificationSelector` (type, public) `layers/core-api/notifications/src/notification-queue.ts:257`
- `NotificationPatch` (interface, public) `layers/core-api/notifications/src/notification-queue.ts:266` — members: `read`, `seen`, `status`, `attempts`, `sentAt`, `lastError`, `claimedAt`
- `NotificationsDeps` (interface, public) `layers/core-api/notifications/src/ports.ts:125` — members: `serverConfig`, `credentialCipher`, `credentialStore`, `users`, `teams`, `work`
- `NotificationChannel` (type, public) `layers/core-api/notifications/src/types.ts:2`
- `Notification` (interface, public) `layers/core-api/notifications/src/types.ts:32` — members: `title`, `body`, `severity`, `deepLink`, `tags`, `timestamp`
- `NotificationAdapter` (interface, public) `layers/core-api/notifications/src/types.ts:46` — members: `name`, `send`, `close`
