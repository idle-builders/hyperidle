/**
 * P3 RED — Server-persisted config table (AC-10)
 *
 * AC coverage:
 *  - readServerConfig() on empty table returns defaults
 *  - updateServerConfig() merges partial updates
 *  - readServerConfig() after update returns merged config
 *  - Corrupt JSON in DB falls back to defaults
 *  - Default notification settings have correct shape
 *  - updateServerConfig deep-merges nested objects
 *  - updateServerConfig returns the new config
 *
 * @lore AU44 batch 4: reviewAlerts, blockerAlerts, quietHoursStart, quietHoursEnd,
 * mutedTeams removed from NotificationsSchema. Tests updated to cover surviving
 * fields: mutedTypes, delivery (enabled/smtpHost/smtpPort/smtpSecure/smtpUsername/smtpFrom).
 *
 * @lore AU19 Increment 1f: moved from `packages/server/src/services/
 * __tests__/server-config.integration.test.ts` — only needs `{ db }` (no
 * `{ app }`), so it moves into the owning package's own `src/__tests__/` and
 * switches its fixture import to `@hyperidle/db/test-fixtures`, same
 * precedent as `@hyperidle/org`'s `org-edges.integration.test.ts`.
 */

import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { readServerConfig, updateServerConfig } from "../index.js";

describe("server config read/write", () => {
	describe("readServerConfig", () => {
		test("returns defaults when table is empty", async ({ db }) => {
			const config = await readServerConfig(db);

			expect(config).toBeDefined();
			expect(config.notifications).toBeDefined();
			expect(config.notifications.mutedTypes).toEqual([]);
			expect(config.notifications.delivery.enabled).toBe(false);
			expect(config.notifications.delivery.smtpPort).toBe(587);
			expect(config.notifications.delivery.smtpSecure).toBe(false);
			expect(config.notifications.delivery.smtpHost).toBeNull();
		});

		test("returns correct notification defaults shape", async ({ db }) => {
			const config = await readServerConfig(db);

			expect(Array.isArray(config.notifications.mutedTypes)).toBe(true);
			expect(typeof config.notifications.delivery.enabled).toBe("boolean");
			expect(typeof config.notifications.delivery.smtpPort).toBe("number");
		});
	});

	describe("updateServerConfig", () => {
		test("merges partial notification updates without losing other keys", async ({ db }) => {
			await updateServerConfig(db, {
				notifications: { mutedTypes: ["review_request"] },
			});

			const config = await readServerConfig(db);
			expect(config.notifications.mutedTypes).toContain("review_request");
			// Delivery defaults preserved
			expect(config.notifications.delivery.enabled).toBe(false);
		});

		test("returns the updated config", async ({ db }) => {
			const result = await updateServerConfig(db, {
				notifications: { delivery: { enabled: true } },
			});

			expect(result.notifications.delivery.enabled).toBe(true);
		});

		test("can update SMTP host", async ({ db }) => {
			await updateServerConfig(db, {
				notifications: { delivery: { smtpHost: "mail.example.com" } },
			});

			const config = await readServerConfig(db);
			expect(config.notifications.delivery.smtpHost).toBe("mail.example.com");
		});

		test("can update mutedTypes", async ({ db }) => {
			await updateServerConfig(db, { notifications: { mutedTypes: ["prod-alert"] } });

			const config = await readServerConfig(db);
			expect(config.notifications.mutedTypes).toEqual(["prod-alert"]);
		});

		test("successive updates are cumulative", async ({ db }) => {
			await updateServerConfig(db, {
				notifications: { mutedTypes: ["review_request"] },
			});
			await updateServerConfig(db, {
				notifications: { delivery: { enabled: true } },
			});

			const config = await readServerConfig(db);
			expect(config.notifications.mutedTypes).toContain("review_request");
			expect(config.notifications.delivery.enabled).toBe(true);
		});

		test("concurrent disjoint patches are both preserved", async ({ db }) => {
			await updateServerConfig(db, {});
			// Distinct handles deliberately bypass any process-local coordination. The
			// guarantee belongs to the database transaction, not object identity.
			const firstHandle = new Proxy(db, {});
			const secondHandle = new Proxy(db, {});
			await Promise.all([
				updateServerConfig(firstHandle, {
					notifications: { mutedTypes: ["blocker_alert"] },
				}),
				updateServerConfig(secondHandle, { harnessDisabled: ["codex"] }),
			]);

			const config = await readServerConfig(db);
			expect(config.notifications.mutedTypes).toContain("blocker_alert");
			expect(config.harnessDisabled).toEqual(["codex"]);
		});
	});

	describe("corrupt JSON handling", () => {
		test("falls back to defaults when config column contains corrupt JSON", async ({ db }) => {
			// Directly insert a corrupt config row into server_config table
			// This tests the Zod validation fallback path
			await db.execute(
				`INSERT INTO server_config (id, config, updated_at) VALUES ('default', 'CORRUPT_JSON{{{', now()) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
			);

			const config = await readServerConfig(db);
			// Should fall back to defaults without throwing
			expect(config.notifications.delivery.enabled).toBe(false);
			expect(Array.isArray(config.notifications.mutedTypes)).toBe(true);
		});
	});
});
