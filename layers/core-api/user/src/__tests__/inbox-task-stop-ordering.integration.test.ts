/**
 * task_stop inbox rows sort before task_run rows so they reach the first page
 * even when earlier rows are held back by the agent busy check.
 */
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { insertInboxRow, listInboxRows } from "../subscriptions-store.js";

const NOW = "2026-10-01T00:00:00.000Z";
const LATER = "2026-10-01T00:01:00.000Z";

async function seedUser(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(teams).values({ id: "team-ordering", name: "Team", createdAt: NOW });
	await db.insert(users).values({
		id: userId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

describe("inbox task_stop ordering", () => {
	test("task_stop row sorts before task_run rows with older createdAt", async ({ db }) => {
		const userId = "agent-ordering";
		await seedUser(db, userId);

		// Seed three task_run rows at the earlier timestamp.
		for (let i = 0; i < 3; i++) {
			await insertInboxRow(db, {
				id: `row-run-${i}`,
				key: `row-run-${i}`,
				reason: "task_run",
				createdAt: NOW,
				userId,
				changeId: null,
				subscriptionId: null,
				objectId: `task-${i}`,
				seenAt: null,
				readAt: null,
			});
		}

		// Seed a task_stop row with a LATER timestamp — it would normally sort last.
		await insertInboxRow(db, {
			id: "row-stop-1",
			key: "row-stop-1",
			reason: "task_stop",
			createdAt: LATER,
			userId,
			changeId: null,
			subscriptionId: null,
			objectId: "task-stop-1",
			seenAt: null,
			readAt: null,
		});

		const rows = await listInboxRows(db, { userId, unread: true, limit: 10 });
		expect(rows[0]?.reason).toBe("task_stop");
		expect(rows[0]?.id).toBe("row-stop-1");
		// task_run rows follow in createdAt order.
		expect(rows.slice(1).every((r) => r.reason === "task_run")).toBe(true);
	});

	test("multiple task_stop rows all sort before task_run rows", async ({ db }) => {
		const userId = "agent-ordering-2";
		await db.insert(users).values({
			id: userId,
			kind: "ai",
			name: "Agent 2",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});

		// Two task_stop rows with later timestamps.
		for (let i = 0; i < 2; i++) {
			await insertInboxRow(db, {
				id: `row-stop-multi-${i}`,
				key: `row-stop-multi-${i}`,
				reason: "task_stop",
				createdAt: LATER,
				userId,
				changeId: null,
				subscriptionId: null,
				objectId: `task-stop-multi-${i}`,
				seenAt: null,
				readAt: null,
			});
		}
		// Two task_run rows with the earlier timestamp.
		for (let i = 0; i < 2; i++) {
			await insertInboxRow(db, {
				id: `row-run-multi-${i}`,
				key: `row-run-multi-${i}`,
				reason: "task_run",
				createdAt: NOW,
				userId,
				changeId: null,
				subscriptionId: null,
				objectId: `task-run-multi-${i}`,
				seenAt: null,
				readAt: null,
			});
		}

		const rows = await listInboxRows(db, { userId, unread: true, limit: 10 });
		const reasons = rows.map((r) => r.reason);
		// task_stop rows first, then task_run rows.
		expect(reasons.slice(0, 2).every((r) => r === "task_stop")).toBe(true);
		expect(reasons.slice(2).every((r) => r === "task_run")).toBe(true);
	});
});
