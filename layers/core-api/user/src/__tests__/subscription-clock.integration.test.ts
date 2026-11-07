/**
 * `startSubscriptionClock` — the subscription schedule half. Real PGlite
 * via the `{ db }` fixture, a real tick loop — not a hand-called `tick()`,
 * the actual `setInterval` this module starts. Wakes are proved through inbox
 * rows written by the clock directly.
 */
import { type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { startSubscriptionClock } from "../subscription-clock.js";
import { getSubscription, insertSubscription, listInboxRows } from "../subscriptions-store.js";

const TS = "2026-01-01T00:00:00.000Z";

async function seedTeam(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(teams).values({ id, name: id, createdAt: TS });
}

async function seedAgent(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role: "builder",
		status: "active",
		createdAt: TS,
	});
	await db.insert(userTeams).values({ userId: id, teamId });
}

describe("startSubscriptionClock", () => {
	test("a due schedule wakes once and advances next_run_at", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedAgent(db, "agent-a", "team-a");
		const past = new Date(Date.now() - 60_000).toISOString();
		await insertSubscription(db, {
			id: "sub-cron",
			userId: "agent-a",
			event: null,
			schedule: "* * * * *",
			paused: false,
			nextRunAt: past,
			createdAt: TS,
			updatedAt: TS,
		});
		const clock = startSubscriptionClock(db, {}, { tickIntervalMs: 25 });
		try {
			await new Promise((r) => setTimeout(r, 150));
		} finally {
			clock.stop();
		}
		const rows = await listInboxRows(db, { userId: "agent-a" });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.reason).toBe("subscription");
		expect(rows[0]?.subscriptionId).toBe("sub-cron");

		// `next_run_at` advances from the fire-time "now" (a `safeNextRunAt`-
		// style rule), not from the due row's own stale `next_run_at` — so
		// this only pins the invariant
		// the AC actually names: it moved off the due timestamp, to a real
		// future minute-boundary.
		const row = await getSubscription(db, "sub-cron");
		expect(row?.nextRunAt).not.toBeNull();
		expect(row?.nextRunAt).not.toBe(past);
		const nextRunAt = row?.nextRunAt as string;
		expect(new Date(nextRunAt).getTime()).toBeGreaterThan(Date.now() - 1000);
		expect(new Date(nextRunAt).getUTCSeconds()).toBe(0);
	});

	test("a due schedule calls wsPush with user:<userId>", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedAgent(db, "agent-a", "team-a");
		const past = new Date(Date.now() - 60_000).toISOString();
		await insertSubscription(db, {
			id: "sub-cron-push",
			userId: "agent-a",
			event: null,
			schedule: "* * * * *",
			paused: false,
			nextRunAt: past,
			createdAt: TS,
			updatedAt: TS,
		});
		const pushed: string[] = [];
		const clock = startSubscriptionClock(
			db,
			{ wsPush: (topic) => pushed.push(topic) },
			{ tickIntervalMs: 25 },
		);
		try {
			await new Promise((r) => setTimeout(r, 150));
		} finally {
			clock.stop();
		}
		expect(pushed).toContain("user:agent-a");
	});

	test("a paused schedule is never fired and next_run_at is untouched", async ({ db }) => {
		await seedTeam(db, "team-a");
		await seedAgent(db, "agent-a", "team-a");
		const past = new Date(Date.now() - 60_000).toISOString();
		await insertSubscription(db, {
			id: "sub-paused-cron",
			userId: "agent-a",
			event: null,
			schedule: "* * * * *",
			paused: true,
			nextRunAt: past,
			createdAt: TS,
			updatedAt: TS,
		});
		const clock = startSubscriptionClock(db, {}, { tickIntervalMs: 25 });
		try {
			await new Promise((r) => setTimeout(r, 150));
		} finally {
			clock.stop();
		}
		const rows = await listInboxRows(db, { userId: "agent-a" });
		expect(rows).toHaveLength(0);
		const row = await getSubscription(db, "sub-paused-cron");
		expect(row?.nextRunAt).toBe(past);
	});
});
