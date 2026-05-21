/**
 * Default notification adapter factory.
 *
 * @lore O3: This function was moved from packages/server/src/app.ts to
 * fabric because all its dependencies (adapter constructors, config types)
 * moved to fabric in O3. The server app.ts now imports this from
 * @hyperidle/fabric for the notification HTTP routes.
 */
import type { NotificationConfig } from "./config.js";
import { createConsoleAdapter } from "./console-adapter.js";
import { createNtfyAdapter } from "./ntfy-adapter.js";
import { createSmtpAdapter } from "./smtp-adapter.js";
import type { NotificationAdapter } from "./types.js";

export function defaultNotificationAdapterFactory(cfg: NotificationConfig): NotificationAdapter {
	switch (cfg.primaryChannel) {
		case "ntfy":
			return createNtfyAdapter({
				baseUrl: cfg.ntfy.baseUrl,
				authToken: cfg.ntfy.authToken,
			});
		case "smtp":
			if (!(cfg.smtp.host && cfg.smtp.from)) return createConsoleAdapter();
			return createSmtpAdapter({
				host: cfg.smtp.host,
				port: cfg.smtp.port,
				secure: cfg.smtp.secure,
				username: cfg.smtp.username,
				password: cfg.smtp.password,
				from: cfg.smtp.from,
				ignoreTls: cfg.smtpIgnoreTls,
			});
		default:
			return createConsoleAdapter();
	}
}
