/**
 * `startSubscriptionClock` — architecture.md §4's schedule half. Real PGlite
 * via the `{ db }` fixture, a real `EventBus()` (same precedent as
 * `subscription-fire.integration.test.ts`), a real tick loop — not a
 * hand-called `tick()`, the actual `setInterval` this module starts.
 */
import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { type SubscriptionClockDeps, startSubscriptionClock } from "../subscription-clock.js";
import { getSubscription, insertSubscription } from "../subscriptions-store.js";

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
		teamId,
		createdAt: TS,
	});
}

function buildDeps(overrides: Partial<SubscriptionClockDeps> = {}): SubscriptionClockDeps {
	return {
		agentWorkIntentRecorder: async (input) => ({
			id: "intent-noop",
			idempotencyKey: input.idempotencyKey,
		}),
		searchDocuments: async () => ({ ok: true, data: [] }),
		...overrides,
	};
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
		const woken: string[] = [];
		const deps = buildDeps({
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const clock = startSubscriptionClock(db, new EventBus(), deps, { tickIntervalMs: 25 });
		try {
			await new Promise((r) => setTimeout(r, 150));
		} finally {
			clock.stop();
		}
		expect(woken).toHaveLength(1);
		expect(woken[0]).toBe(`sub-cron:${past}`);

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
		const woken: string[] = [];
		const deps = buildDeps({
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const clock = startSubscriptionClock(db, new EventBus(), deps, { tickIntervalMs: 25 });
		try {
			await new Promise((r) => setTimeout(r, 150));
		} finally {
			clock.stop();
		}
		expect(woken).toHaveLength(0);
		const row = await getSubscription(db, "sub-paused-cron");
		expect(row?.nextRunAt).toBe(past);
	});
});
