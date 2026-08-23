/**
 * AU18 §5 — server_config schema extension round-trip tests.
 *
 * Proves the notifications sub-sections (delivery, mutedTypes) read/write/merge
 * correctly.
 *
 * @lore AU44 batch 4: silence sub-section, reviewAlerts, mutedTeams, primaryChannel,
 * digestChannel, ntfyBaseUrl, digestCron removed from the schema. Tests updated to
 * cover surviving fields only (enabled, smtpHost/Port/Secure/Username/From, mutedTypes).
 *
 * @lore AU19 Increment 1f: moved from `packages/server/src/services/
 * __tests__/` — only needs `{ db }`, switched to `@hyperidle/db/test-fixtures`.
 */

import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { readServerConfig, updateServerConfig } from "../index.js";

describe("server_config — notifications.delivery / mutedTypes", () => {
	test("readServerConfig returns delivery defaults", async ({ db }) => {
		const config = await readServerConfig(db);
		expect(config.notifications.delivery.enabled).toBe(false);
		expect(config.notifications.delivery.smtpPort).toBe(587);
		expect(config.notifications.delivery.smtpSecure).toBe(false);
		expect(config.notifications.delivery.smtpHost).toBeNull();
	});

	test("readServerConfig returns mutedTypes empty by default; updateServerConfig can set it", async ({
		db,
	}) => {
		expect((await readServerConfig(db)).notifications.mutedTypes).toEqual([]);
		await updateServerConfig(db, { notifications: { mutedTypes: ["review_alert"] } });
		expect((await readServerConfig(db)).notifications.mutedTypes).toEqual(["review_alert"]);
	});

	test("a delivery-only patch does not clobber mutedTypes", async ({ db }) => {
		await updateServerConfig(db, { notifications: { mutedTypes: ["review_request"] } });
		await updateServerConfig(db, { notifications: { delivery: { enabled: true } } });

		const config = await readServerConfig(db);
		expect(config.notifications.delivery.enabled).toBe(true);
		// mutedTypes must survive the delivery-only patch
		expect(config.notifications.mutedTypes).toContain("review_request");
	});

	test("a mutedTypes-only patch does not clobber delivery settings", async ({ db }) => {
		await updateServerConfig(db, {
			notifications: { delivery: { smtpHost: "smtp.example.com" } },
		});
		await updateServerConfig(db, { notifications: { mutedTypes: ["blocker_alert"] } });

		const config = await readServerConfig(db);
		expect(config.notifications.mutedTypes).toContain("blocker_alert");
		expect(config.notifications.delivery.smtpHost).toBe("smtp.example.com");
	});

	test("SMTP fields round-trip correctly", async ({ db }) => {
		await updateServerConfig(db, {
			notifications: {
				delivery: {
					smtpHost: "mail.example.com",
					smtpPort: 465,
					smtpSecure: true,
					smtpUsername: "noreply@example.com",
					smtpFrom: "HyperIdle <noreply@example.com>",
				},
			},
		});

		const config = await readServerConfig(db);
		expect(config.notifications.delivery.smtpHost).toBe("mail.example.com");
		expect(config.notifications.delivery.smtpPort).toBe(465);
		expect(config.notifications.delivery.smtpSecure).toBe(true);
		expect(config.notifications.delivery.smtpUsername).toBe("noreply@example.com");
		expect(config.notifications.delivery.smtpFrom).toBe("HyperIdle <noreply@example.com>");
	});
});
