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
 */

import { createTestDb } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import { readServerConfig, updateServerConfig } from "../server-config.js";

describe("P3 AC-10 — Server config read/write", () => {
	describe("readServerConfig", () => {
		it("returns defaults when table is empty", () => {
			const db = createTestDb();
			const config = readServerConfig(db);

			expect(config).toBeDefined();
			expect(config.notifications).toBeDefined();
			expect(config.notifications.reviewAlerts).toBe(true);
			expect(config.notifications.costAlerts).toBe(true);
			expect(config.notifications.blockerAlerts).toBe(true);
			expect(config.notifications.quietHoursStart).toBe("22:00");
			expect(config.notifications.quietHoursEnd).toBe("08:00");
			expect(config.notifications.mutedTeams).toEqual([]);
		});

		it("returns correct notification defaults shape", () => {
			const db = createTestDb();
			const config = readServerConfig(db);

			expect(typeof config.notifications.reviewAlerts).toBe("boolean");
			expect(typeof config.notifications.costAlerts).toBe("boolean");
			expect(typeof config.notifications.blockerAlerts).toBe("boolean");
			expect(typeof config.notifications.quietHoursStart).toBe("string");
			expect(typeof config.notifications.quietHoursEnd).toBe("string");
			expect(Array.isArray(config.notifications.mutedTeams)).toBe(true);
		});
	});

	describe("updateServerConfig", () => {
		it("merges partial notification updates without losing other keys", () => {
			const db = createTestDb();

			updateServerConfig(db, {
				notifications: { reviewAlerts: false },
			});

			const config = readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
			// Other keys preserved
			expect(config.notifications.costAlerts).toBe(true);
			expect(config.notifications.blockerAlerts).toBe(true);
		});

		it("returns the updated config", () => {
			const db = createTestDb();
			const result = updateServerConfig(db, {
				notifications: { costAlerts: false },
			});

			expect(result.notifications.costAlerts).toBe(false);
		});

		it("can update quietHoursStart", () => {
			const db = createTestDb();
			updateServerConfig(db, { notifications: { quietHoursStart: "23:00" } });

			const config = readServerConfig(db);
			expect(config.notifications.quietHoursStart).toBe("23:00");
		});

		it("can update mutedTeams", () => {
			const db = createTestDb();
			updateServerConfig(db, { notifications: { mutedTeams: ["prod-1", "prod-2"] } });

			const config = readServerConfig(db);
			expect(config.notifications.mutedTeams).toEqual(["prod-1", "prod-2"]);
		});

		it("successive updates are cumulative", () => {
			const db = createTestDb();
			updateServerConfig(db, { notifications: { reviewAlerts: false } });
			updateServerConfig(db, { notifications: { costAlerts: false } });

			const config = readServerConfig(db);
			expect(config.notifications.reviewAlerts).toBe(false);
			expect(config.notifications.costAlerts).toBe(false);
			// blockerAlerts still default
			expect(config.notifications.blockerAlerts).toBe(true);
		});
	});

	describe("corrupt JSON handling", () => {
		it("falls back to defaults when config column contains corrupt JSON", () => {
			const db = createTestDb();

			// Directly insert a corrupt config row into server_config table
			// This tests the Zod validation fallback path
			db.run(
				"INSERT OR REPLACE INTO server_config (id, config, updated_at) VALUES ('default', 'CORRUPT_JSON{{{', datetime('now'))",
			);

			const config = readServerConfig(db);
			// Should fall back to defaults without throwing
			expect(config.notifications.reviewAlerts).toBe(true);
		});
	});
});
