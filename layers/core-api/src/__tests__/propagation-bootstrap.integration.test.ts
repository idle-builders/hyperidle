/**
 * A task's transition into review never fails with a foreign-key error
 * because system:propagation is missing — core-api's own first-boot state
 * (`applyFactoryCoreState`) must plant that user before anything else runs.
 */

import { threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

describe("system:propagation is present after bootstrap; review thread succeeds", () => {
	test("system:propagation user exists after applyFactoryCoreState", async ({ db }) => {
		await applyFactoryCoreState(db);

		const [row] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, "system:propagation"))
			.limit(1);

		expect(row?.id).toBe("system:propagation");
	});

	test("a thread can be inserted with system:propagation as initiator without a foreign-key error", async ({
		db,
	}) => {
		await applyFactoryCoreState(db);
		const threadId = "thread-review";
		const isoNow = new Date().toISOString();

		await expect(
			db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: "task-review",
				initiatorId: "system:propagation",
				participants: JSON.stringify(["system:propagation"]),
				lastActiveAt: isoNow,
				createdAt: isoNow,
			}),
		).resolves.not.toThrow();

		const [inserted] = await db
			.select({ id: threads.id, initiatorId: threads.initiatorId })
			.from(threads)
			.where(eq(threads.id, threadId))
			.limit(1);

		expect(inserted?.initiatorId).toBe("system:propagation");
	});
});
