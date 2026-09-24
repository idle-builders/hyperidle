/**
 * `subscriptions`/`inbox` (migration 0088) and the widened
 * `agent_work_intents`/`documents` checks that seat the subscription wake.
 * Real PGlite via the `{ db }` fixture — no stub of a constraint.
 */
import {
	agentWorkIntents,
	changes,
	documents,
	type HyperIdleDb,
	inbox,
	subscriptions,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";

const TS = "2026-01-01T00:00:00.000Z";

async function seedTeam(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(teams).values({ id, name: id, createdAt: TS });
}

async function seedUser(
	db: HyperIdleDb,
	id: string,
	overrides: Partial<typeof users.$inferInsert> = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: TS,
		...overrides,
	});
}

async function seedChange(db: HyperIdleDb, id: string, actor: string): Promise<void> {
	await db.insert(changes).values({
		id,
		object: "user",
		objectId: actor,
		kind: "changed",
		actor,
		before: null,
		after: "{}",
		at: TS,
	});
}

function subscriptionValues(
	overrides: Partial<typeof subscriptions.$inferInsert> & { id: string; userId: string },
): typeof subscriptions.$inferInsert {
	return {
		event: "task.changed",
		schedule: null,
		paused: false,
		nextRunAt: null,
		createdAt: TS,
		updatedAt: TS,
		...overrides,
	};
}

describe("subscriptions (migration 0088)", () => {
	test("refuses a row with neither an event nor a schedule", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		await expect(
			db
				.insert(subscriptions)
				.values(subscriptionValues({ id: "s1", userId: "u1", event: null, schedule: null })),
		).rejects.toThrow();
	});

	test("refuses a row with both an event and a schedule", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		await expect(
			db.insert(subscriptions).values(
				subscriptionValues({
					id: "s1",
					userId: "u1",
					event: "task.changed",
					schedule: "0 9 * * *",
				}),
			),
		).rejects.toThrow();
	});

	test("refuses an event name outside the nine object events", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		await expect(
			db.insert(subscriptions).values(
				subscriptionValues({
					id: "s1",
					userId: "u1",
					// deliberately outside the closed vocabulary — `event` is a plain
					// `text` column, so this is a runtime-only violation, not a type one.
					event: "routine_run",
				}),
			),
		).rejects.toThrow();
	});

	test("refuses next_run_at set on an event (non-schedule) row", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		await expect(
			db.insert(subscriptions).values(
				subscriptionValues({
					id: "s1",
					userId: "u1",
					event: "task.changed",
					nextRunAt: TS,
				}),
			),
		).rejects.toThrow();
	});

	test("refuses a subscription for a user that does not exist", async ({ db }) => {
		await expect(
			db.insert(subscriptions).values(subscriptionValues({ id: "s1", userId: "ghost" })),
		).rejects.toThrow();
	});

	test("accepts a valid event subscription", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		const [row] = await db
			.insert(subscriptions)
			.values(subscriptionValues({ id: "s1", userId: "u1", event: "user.changed" }))
			.returning();
		expect(row?.event).toBe("user.changed");
		expect(row?.schedule).toBeNull();
	});

	test("accepts a valid schedule subscription with a next_run_at", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a", kind: "ai" });
		const [row] = await db
			.insert(subscriptions)
			.values(
				subscriptionValues({
					id: "s1",
					userId: "u1",
					event: null,
					schedule: "0 9 * * *",
					nextRunAt: TS,
				}),
			)
			.returning();
		expect(row?.schedule).toBe("0 9 * * *");
		expect(row?.nextRunAt).toBe(TS);
	});
});

describe("inbox (migration 0088)", () => {
	test("refuses a row for a user that does not exist", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedChange(db, "c1", "actor");
		await expect(
			db.insert(inbox).values({ userId: "ghost", changeId: "c1", seenAt: null, readAt: null }),
		).rejects.toThrow();
	});

	test("refuses a row for a change that does not exist", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		await expect(
			db.insert(inbox).values({ userId: "u1", changeId: "ghost", seenAt: null, readAt: null }),
		).rejects.toThrow();
	});

	test("accepts one row per (user, change) and refuses a duplicate", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "u1", { teamId: "team-a" });
		await seedChange(db, "c1", "actor");
		const [row] = await db
			.insert(inbox)
			.values({ userId: "u1", changeId: "c1", seenAt: null, readAt: null })
			.returning();
		expect(row?.userId).toBe("u1");
		await expect(
			db.insert(inbox).values({ userId: "u1", changeId: "c1", seenAt: null, readAt: null }),
		).rejects.toThrow();
	});
});

describe("users.health (migration 0088)", () => {
	test("defaults to null", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "u1", { teamId: "team-a" });
		const [row] = await db.select().from(users).where(eq(users.id, "u1"));
		expect(row?.health).toBeNull();
	});

	test("stores a crash-count note on an agent row", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedUser(db, "a1", { kind: "ai", teamId: "team-a", health: "2 crashes in 7 days" });
		const [row] = await db.select().from(users).where(eq(users.id, "a1"));
		expect(row?.health).toBe("2 crashes in 7 days");
	});
});

describe("agent_work_intents subscription pairing (migration 0088)", () => {
	function intentValues(
		overrides: Partial<typeof agentWorkIntents.$inferInsert> & { id: string },
	): typeof agentWorkIntents.$inferInsert {
		return {
			kind: "subscription_run",
			sourceKind: "subscription",
			sourceId: "sub:change",
			idempotencyKey: `key-${overrides.id}`,
			status: "pending",
			createdAt: TS,
			updatedAt: TS,
			...overrides,
		};
	}

	test("accepts kind=subscription_run paired with sourceKind=subscription", async ({ db }) => {
		const [row] = await db
			.insert(agentWorkIntents)
			.values(intentValues({ id: "i1" }))
			.returning();
		expect(row?.kind).toBe("subscription_run");
		expect(row?.sourceKind).toBe("subscription");
	});

	test("refuses kind=subscription_run paired with a mismatched sourceKind", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(
				intentValues({
					id: "i1",
					sourceKind: "routine_run",
				}),
			),
		).rejects.toThrow();
	});

	test("refuses sourceKind=subscription paired with a mismatched kind", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(
				intentValues({
					id: "i1",
					kind: "task_run",
				}),
			),
		).rejects.toThrow();
	});
});

describe("documents.doc_parent_kind_ck (migration 0088)", () => {
	test("accepts parent_kind='subscription'", async ({ db }) => {
		const [row] = await db
			.insert(documents)
			.values({
				id: "d1",
				scopeKind: "factory",
				scopeId: null,
				title: "Prompt",
				body: "do the thing",
				format: "markdown",
				status: "active",
				slot: "prompt",
				parentKind: "subscription",
				parentId: "s1",
				position: 0,
				updatedBy: "seed",
				createdAt: TS,
				updatedAt: TS,
			})
			.returning();
		expect(row?.parentKind).toBe("subscription");
	});

	test("refuses a parent_kind outside the closed vocabulary", async ({ db }) => {
		await expect(
			db.insert(documents).values({
				id: "d1",
				scopeKind: "factory",
				scopeId: null,
				title: "Prompt",
				body: "do the thing",
				format: "markdown",
				status: "active",
				slot: "prompt",
				// deliberately outside the closed vocabulary — `parentKind` is a
				// plain `text` column, so this is a runtime-only violation.
				parentKind: "invented",
				parentId: "s1",
				position: 0,
				updatedBy: "seed",
				createdAt: TS,
				updatedAt: TS,
			}),
		).rejects.toThrow();
	});
});
