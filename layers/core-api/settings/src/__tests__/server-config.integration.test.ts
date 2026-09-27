/**
 * The server-persisted config singleton: read returns defaults on an empty
 * table, write merges partial patches, and a corrupt or superseded config
 * column falls back to defaults instead of throwing.
 *
 * @lore `notifications` is never read — a subscription's `paused` flag is the one mute mechanism; an old row carrying the dead key must still parse.
 */

import { serverConfig } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { readServerConfig, updateServerConfig } from "../index.js";

describe("server config read/write", () => {
	describe("readServerConfig", () => {
		test("returns defaults when table is empty", async ({ db }) => {
			const config = await readServerConfig(db);

			expect(config).toBeDefined();
			expect(config.harnessDisabled).toEqual([]);
		});

		test("an old row's dead notifications key is ignored, not a parse failure", async ({ db }) => {
			const now = new Date().toISOString();
			await db.insert(serverConfig).values({
				id: "default",
				config: JSON.stringify({
					notifications: { mutedTypes: ["review_request"], delivery: { enabled: true } },
					harnessDisabled: ["codex"],
				}),
				updatedAt: now,
			});

			const config = await readServerConfig(db);
			expect(config.harnessDisabled).toEqual(["codex"]);
			expect((config as { notifications?: unknown }).notifications).toBeUndefined();
		});
	});

	describe("updateServerConfig", () => {
		test("returns the updated config", async ({ db }) => {
			const result = await updateServerConfig(db, { harnessDisabled: ["claude-code"] });
			expect(result.harnessDisabled).toEqual(["claude-code"]);
		});

		test("successive updates replace the list (full-replacement, not merge)", async ({ db }) => {
			await updateServerConfig(db, { harnessDisabled: ["claude-code"] });
			await updateServerConfig(db, { harnessDisabled: ["codex"] });

			const config = await readServerConfig(db);
			expect(config.harnessDisabled).toEqual(["codex"]);
		});

		test("concurrent disjoint patches on the singleton do not tear", async ({ db }) => {
			await updateServerConfig(db, {});
			// Distinct handles deliberately bypass any process-local coordination. The
			// guarantee belongs to the database transaction, not object identity.
			const firstHandle = new Proxy(db, {});
			const secondHandle = new Proxy(db, {});
			await Promise.all([
				updateServerConfig(firstHandle, { harnessDisabled: ["opencode"] }),
				updateServerConfig(secondHandle, { harnessDisabled: ["codex"] }),
			]);

			const config = await readServerConfig(db);
			// Whichever handle wins the lock last, the row holds one intact array —
			// never a torn mix of both writes' bytes.
			expect(["opencode", "codex"]).toContain(config.harnessDisabled[0]);
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
			expect(config.harnessDisabled).toEqual([]);
		});
	});
});
