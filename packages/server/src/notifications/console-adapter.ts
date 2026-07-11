import { createLogger, type Logger } from "@hyperidle/shared";
import type { Notification, NotificationAdapter, Recipient, SendResult } from "./types.js";

export interface ConsoleAdapterOptions {
	logger?: Logger;
	now?: () => Date;
}

export function createConsoleAdapter(opts: ConsoleAdapterOptions = {}): NotificationAdapter {
	const logger = opts.logger ?? createLogger({ pkg: "notifications.console" });
	const now = opts.now ?? ((): Date => new Date());

	return {
		name: "console",
		send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const sentAt = now().toISOString();
			logger.info(notification.title, {
				severity: notification.severity,
				recipient: recipient.label ?? recipient.channelId,
				bodyLength: notification.body.length,
				deepLink: notification.deepLink,
				tags: notification.tags,
			});
			return Promise.resolve({ ok: true, channel: "console", sentAt });
		},
	};
}
