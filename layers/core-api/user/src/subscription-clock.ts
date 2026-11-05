import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import { nextCronMatch, parseCron } from "./cron.js";
import { type InboxNudge, tellUser } from "./inbox-tell.js";
import { isRunnableAgent } from "./runnable-agent.js";
import { listSubscriptions, updateSubscription } from "./subscriptions-store.js";
import { findUser } from "./user-store.js";

const logger = createLogger({ pkg: "user.subscription-clock" });

export interface SubscriptionClockDeps {
	/** The WS nudge for a new inbox row. Absent → no push (no WS wired). */
	readonly wsPush?: InboxNudge;
}

export interface SubscriptionClockConfig {
	/** Default 30s poll cadence. */
	readonly tickIntervalMs?: number;
}

export interface SubscriptionClock {
	readonly stop: () => void;
}

/**
 * A due schedule is a row in its agent's inbox — with no change, since nothing changed — then
 * `next_run_at` moves on whether or not anyone acts, so a broken subscription never fires on
 * every tick.
 */
async function fireSchedule(
	db: HyperIdleDb,
	sub: {
		readonly id: string;
		readonly userId: string;
		readonly schedule: string | null;
		readonly nextRunAt: string | null;
	},
	deps: SubscriptionClockDeps,
): Promise<void> {
	const dueAt = sub.nextRunAt;
	if (dueAt === null || sub.schedule === null) return;

	const agent = await findUser(db, { id: sub.userId });
	if (agent && isRunnableAgent(agent)) {
		await tellUser(
			db,
			{
				userId: agent.id,
				reason: "subscription",
				key: `subscription:${sub.id}:${dueAt}`,
				subscriptionId: sub.id,
			},
			new Date().toISOString(),
			deps.wsPush,
		);
	}

	const now = new Date();
	let nextRunAt: string | null;
	try {
		nextRunAt = nextCronMatch(parseCron(sub.schedule), now).toISOString();
	} catch {
		nextRunAt = null;
	}
	await updateSubscription(db, sub.id, { nextRunAt, updatedAt: now.toISOString() });
}

async function tick(db: HyperIdleDb, deps: SubscriptionClockDeps): Promise<void> {
	const now = new Date().toISOString();
	const candidates = await listSubscriptions(db, { paused: false });
	const due = candidates.filter(
		(s) => s.schedule !== null && s.nextRunAt !== null && s.nextRunAt <= now,
	);
	for (const sub of due) {
		await fireSchedule(db, sub, deps);
	}
}

export function startSubscriptionClock(
	db: HyperIdleDb,
	deps: SubscriptionClockDeps,
	config?: SubscriptionClockConfig,
): SubscriptionClock {
	const intervalMs = config?.tickIntervalMs ?? 30_000;
	let tickRunning = false;
	const intervalId = setInterval(() => {
		if (tickRunning) return;
		tickRunning = true;
		void tick(db, deps)
			.catch((error) => {
				logger.error("subscription clock tick failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			})
			.finally(() => {
				tickRunning = false;
			});
	}, intervalMs);
	return {
		stop: () => clearInterval(intervalId),
	};
}
