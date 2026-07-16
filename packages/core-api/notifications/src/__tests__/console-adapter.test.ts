/**
 * H2 AC1 — Console adapter unit tests.
 *
 * Verifies:
 *  - Console adapter logs the blocking item title through the injected logger.
 *  - Severity + recipient surface as structured fields.
 *  - No direct console.log — only the injected Logger is used.
 *  - Returns { ok: true, channel: "console" } on success.
 */

import type { Logger } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createConsoleAdapter } from "../console-adapter.js";
import type { Notification, Recipient } from "../types.js";

interface LogCall {
	level: "debug" | "info" | "warn" | "error";
	msg: string;
	extra: Record<string, unknown> | undefined;
}

function createCapturingLogger(): { logger: Logger; calls: LogCall[] } {
	const calls: LogCall[] = [];
	const logger: Logger = {
		debug: (msg, extra) => calls.push({ level: "debug", msg, extra }),
		info: (msg, extra) => calls.push({ level: "info", msg, extra }),
		warn: (msg, extra) => calls.push({ level: "warn", msg, extra }),
		error: (msg, extra) => calls.push({ level: "error", msg, extra }),
	};
	return { logger, calls };
}

describe("console adapter", () => {
	it("logs a blocking notification through the injected logger", async () => {
		const { logger, calls } = createCapturingLogger();
		const adapter = createConsoleAdapter({
			logger,
			now: () => new Date("2026-04-18T12:00:00.000Z"),
		});
		const recipient: Recipient = { channelId: "console", label: "dev-console" };
		const notification: Notification = {
			title: "Item 42 requires attention",
			body: "Long body explaining the blocking concern.",
			severity: "blocking",
			timestamp: Date.now(),
			deepLink: "/conversations/item/42",
			tags: ["blocking"],
		};

		const result = await adapter.send(recipient, notification);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.channel).toBe("console");
			expect(result.sentAt).toBe("2026-04-18T12:00:00.000Z");
		}
		expect(calls).toHaveLength(1);
		expect(calls[0]!.level).toBe("info");
		expect(calls[0]!.msg).toBe("Item 42 requires attention");
		expect(calls[0]!.extra?.severity).toBe("blocking");
		expect(calls[0]!.extra?.recipient).toBe("dev-console");
		expect(calls[0]!.extra?.bodyLength).toBe(notification.body.length);
		expect(calls[0]!.extra?.deepLink).toBe("/conversations/item/42");
	});

	it("falls back to channelId when label is missing", async () => {
		const { logger, calls } = createCapturingLogger();
		const adapter = createConsoleAdapter({ logger });
		await adapter.send(
			{ channelId: "console" },
			{
				title: "Hello",
				body: "body",
				severity: "digest",
				timestamp: Date.now(),
			},
		);
		expect(calls[0]!.extra?.recipient).toBe("console");
	});

	it("exposes name = 'console'", () => {
		const { logger } = createCapturingLogger();
		const adapter = createConsoleAdapter({ logger });
		expect(adapter.name).toBe("console");
	});
});
