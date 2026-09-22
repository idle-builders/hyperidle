/**
 * Shared `@hyperidle/notifications` DI-port wiring for test files.
 *
 * @lore AU19 Increment 1g: every notifications function that reaches across
 * a Service boundary (`settings`/`users`/`org`/`work`/`conversation`/
 * `connections`) now takes an injected port (Mechanism C) — real production
 * wiring lives in `server-factory.ts`/`app.ts`. Test files that call these
 * functions directly (bypassing the `app`/`server-factory` composition
 * points) need the same real wiring; this module is the single shared
 * construction so it isn't duplicated ad hoc across a dozen test files.
 *
 * @lore AU20 Ag6b: collapsed from three separate exports
 * (`notificationsConfigDeps`, `notificationsSilenceDeps`, `notificationsWorkReader`)
 * into one `notificationsDeps: NotificationsDeps` bag. Callers that used the
 * individual exports now pass `notificationsDeps` to any notifications function
 * that takes the collapsed type.
 *
 * @lore server_credentials deletion: `credentialCipher`/`credentialStore`
 * are gone from `NotificationsDeps` with the table they read.
 */

import type { NotificationsDeps } from "@hyperidle/notifications";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";

export const notificationsDeps: NotificationsDeps = {
	serverConfig: { read: readServerConfig, update: updateServerConfig },
};
