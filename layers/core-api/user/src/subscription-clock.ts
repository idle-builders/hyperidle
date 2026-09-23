/**
 * `startSubscriptionClock` — the schedule half of a subscription
 * (`event | schedule`, never both). Architecture.md §4: `cron.ts` moved
 * verbatim (T2), the tick-loop shape copied from
 * `@hyperidle/routine`'s `routine-scheduler.ts` (never imported — a Service
 * may depend on nothing but `@hyperidle/db`/framework packages) — a running
 * guard, a `setInterval`, due rows fired then their `next_run_at` advanced.
 * Registered in `app.ts` beside `registerSubscriptionFire`.
 */
import type { HyperIdleDb, User } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { AgentWorkIntentRecorderFn } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ActionContext } from "./action-types.js";
import { nextCronMatch, parseCron } from "./cron.js";
import { AgentNotRunnableError } from "./runnable-agent.js";
import type { SubscriptionWakeDeps } from "./subscription-wake.js";
import { resolveSubscriptionWakeRequest } from "./subscription-wake.js";
import { listSubscriptions, updateSubscription } from "./subscriptions-store.js";
import { findUser } from "./user-store.js";

const logger = createLogger({ pkg: "user.subscription-clock" });

export interface SubscriptionClockDeps extends SubscriptionWakeDeps {
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
}

export interface SubscriptionClockConfig {
	/** Default 30s — matches the routine scheduler's own default poll cadence. */
	readonly tickIntervalMs?: number;
}

export interface SubscriptionClock {
	readonly stop: () => void;
}

function actionContextFor(db: HyperIdleDb, eventBus: EventBus, actor: string, now: string): ActionContext {
	return { actor, db, eventBus, now, internal: true };
}

/**
 * Wake one due schedule, then advance `next_run_at` regardless of whether
 * the wake itself succeeded — the same "a broken subscription must not
 * retry on every tick" reasoning `fireGenericRoutine`'s `safeNextRunAt`
 * applies, minus the state:"error" write (there is no `active`/`state`
 * column to disable here, only `paused`, and pausing on a bake failure is
 * not this module's call to make).
 */
async function fireSchedule(
	db: HyperIdleDb,
	eventBus: EventBus,
	sub: { readonly id: string; readonly userId: string; readonly schedule: string | null; readonly nextRunAt: string | null },
	deps: SubscriptionClockDeps,
): Promise<void> {
	const dueAt = sub.nextRunAt;
	if (dueAt === null || sub.schedule === null) return;
	const sourceId = `${sub.id}:${dueAt}`;

	const agent: User | undefined = await findUser(db, { id: sub.userId });
	if (agent?.kind === "ai") {
		try {
			const bakedRequest = await resolveSubscriptionWakeRequest(
				actionContextFor(db, eventBus, agent.id, new Date().toISOString()),
				{
					subscription: { id: sub.id, event: null, schedule: sub.schedule },
					agentId: agent.id,
					change: null,
					sourceId,
				},
				deps,
			);
			await deps.agentWorkIntentRecorder({
				kind: "subscription_run",
				sourceKind: "subscription",
				sourceId,
				requestedBy: agent.id,
				idempotencyKey: `subscription:${sub.id}:${dueAt}`,
				bakedRequest,
			});
		} catch (error) {
			logger.error("subscription schedule wake failed", {
				subscriptionId: sub.id,
				agentId: agent.id,
				error:
					error instanceof AgentNotRunnableError
						? error.message
						: error instanceof Error
							? error.message
							: String(error),
			});
		}
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

async function tick(db: HyperIdleDb, eventBus: EventBus, deps: SubscriptionClockDeps): Promise<void> {
	const now = new Date().toISOString();
	const candidates = await listSubscriptions(db, { paused: false });
	const due = candidates.filter((s) => s.schedule !== null && s.nextRunAt !== null && s.nextRunAt <= now);
	for (const sub of due) {
		await fireSchedule(db, eventBus, sub, deps);
	}
}

/**
 * Start the tick loop. A running guard skips an overlapping tick (the
 * previous one is still in flight) rather than queuing it — the same shape
 * `startRoutineScheduler` uses.
 */
export function startSubscriptionClock(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: SubscriptionClockDeps,
	config?: SubscriptionClockConfig,
): SubscriptionClock {
	const intervalMs = config?.tickIntervalMs ?? 30_000;
	let tickRunning = false;
	const intervalId = setInterval(() => {
		if (tickRunning) return;
		tickRunning = true;
		void tick(db, eventBus, deps)
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
