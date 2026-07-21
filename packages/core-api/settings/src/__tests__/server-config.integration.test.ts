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
			expect(config.notifications.reviewAlerts).toBe(true);
			expect(config.notifications.costAlerts).toBe(true);
			expect(config.notifications.blockerAlerts).toBe(true);
			expect(config.notifications.quietHoursStart).toBe("22:00");
			expect(config.notifications.quietHoursEnd).toBe("08:00");
			expect(config.notifications.mutedTeams).toEqual([]);
		});

		test("returns correct notification defaults shape", async ({ db }) => {
			const config = await readServerConfig(db);

			expect(typeof config.notifications.reviewAlerts).toBe("boolean");
			expect(typeof config.notifications.costAlerts).toBe("boolean");
			expect(typeof config.notifications.blockerAlerts).toBe("boolean");
			expect(typeof config.notifications.quietHoursStart).toBe("string");
			expect(typeof config.notifications.quietHoursEnd).toBe("string");
			expect(Array.isArray(config.notifications.mutedTeams)).toBe(true);
		});
	});

	describe("updateServerConfig", () => {
		test("merges partial notification updates without losing other keys", async ({ db }) => {
			await updateServerConfig(db, {
				notifications: { reviewAlerts: false },
			});

			const config = await readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
			// Other keys preserved
			expect(config.notifications.costAlerts).toBe(true);
			expect(config.notifications.blockerAlerts).toBe(true);
		});

		test("returns the updated config", async ({ db }) => {
			const result = await updateServerConfig(db, {
				notifications: { costAlerts: false },
			});

			expect(result.notifications.costAlerts).toBe(false);
		});

		test("can update quietHoursStart", async ({ db }) => {
			await updateServerConfig(db, { notifications: { quietHoursStart: "23:00" } });

			const config = await readServerConfig(db);
			expect(config.notifications.quietHoursStart).toBe("23:00");
		});

		test("can update mutedTeams", async ({ db }) => {
			await updateServerConfig(db, { notifications: { mutedTeams: ["prod-1", "prod-2"] } });

			const config = await readServerConfig(db);
			expect(config.notifications.mutedTeams).toEqual(["prod-1", "prod-2"]);
		});

		test("successive updates are cumulative", async ({ db }) => {
			await updateServerConfig(db, { notifications: { reviewAlerts: false } });
			await updateServerConfig(db, { notifications: { costAlerts: false } });

			const config = await readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
			expect(config.notifications.costAlerts).toBe(false);
			// blockerAlerts still default
			expect(config.notifications.blockerAlerts).toBe(true);
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
			expect(config.notifications.reviewAlerts).toBe(true);
		});
	});
});
