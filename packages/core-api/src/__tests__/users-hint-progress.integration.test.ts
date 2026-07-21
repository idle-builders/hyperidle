import type { HyperIdleDb } from "@hyperidle/db";
import { dismissHint, insertUser, listDismissedHints } from "@hyperidle/users";
import { describe, expect, test } from "../test-fixtures.js";

const NOW = "2026-01-01T00:00:00.000Z";

async function seedUser(db: HyperIdleDb, id: string): Promise<void> {
	await insertUser(db, {
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: NOW,
	});
}

describe("users hint-progress completeness contract", () => {
	test("dismissal is idempotent and list returns the stored projection", async ({ db }) => {
		await seedUser(db, "hint-user");

		expect(await dismissHint(db, "hint-user", "welcome")).toEqual({ inserted: true });
		expect(await dismissHint(db, "hint-user", "welcome")).toEqual({ inserted: false });

		const dismissed = await listDismissedHints(db, "hint-user");
		expect(dismissed).toHaveLength(1);
		expect(dismissed[0]).toMatchObject({ hintId: "welcome" });
		expect(new Date(dismissed[0]?.seenAt ?? "invalid").toString()).not.toBe("Invalid Date");
	});

	test("dismissed hints remain isolated per user", async ({ db }) => {
		await seedUser(db, "hint-a");
		await seedUser(db, "hint-b");
		await dismissHint(db, "hint-a", "welcome");

		expect(await listDismissedHints(db, "hint-a")).toHaveLength(1);
		expect(await listDismissedHints(db, "hint-b")).toEqual([]);
	});
});
