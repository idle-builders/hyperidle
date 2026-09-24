/**
 * @lore BC5 T7b: the eval suite's replacement for `@hyperidle/core-api`'s
 * deleted `fireRoutine` — fires one subscription directly, outside the tick loop
 * (`@hyperidle/user`'s `startSubscriptionClock`/`registerSubscriptionFire`
 * are both interval/event-driven, with no single-call entry a scenario can
 * drive deterministically). Mirrors `subscription-clock.ts`'s own
 * `fireSchedule`/`tick` shape, built from the same exported pieces
 * (`resolveSubscriptionWakeRequest`) plus the seam-backed work-intent
 * recorder every other eval scenario already uses.
 *
 * `tools/eval` is a tooling composition root — importing `@hyperidle/user`
 * directly here (never from a scenario file) is the same "tooling →
 * service" crossing `@hyperidle/core-api`'s own `@lore` already allows.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	buildSeamBackedWorkIntentRecorder,
	createStandaloneSearchDocuments,
} from "@hyperidle/core-api";
import { type HyperIdleDb, subscriptions, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { resolveSubscriptionWakeRequest } from "@hyperidle/user";
import { eq } from "drizzle-orm";

export interface SubscriptionFireResult {
	readonly fired: boolean;
}

const searchDocuments = createStandaloneSearchDocuments();

/**
 * Fires one subscription by id, synchronously — the eval-scenario
 * equivalent of one `subscription-clock.ts` tick over a single due row.
 * Returns `{fired:false}` when the subscription or its (agent) owner is
 * missing, or when the bake refuses (an unrunnable agent) — the same
 * "drop and log" outcome `subscription-fire.ts` gives a bad wake.
 */
export async function fireSubscription(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	subscriptionId: string,
): Promise<SubscriptionFireResult> {
	const [sub] = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.id, subscriptionId))
		.limit(1);
	if (!sub) return { fired: false };

	const [agent] = await db.select().from(users).where(eq(users.id, sub.userId)).limit(1);
	if (agent?.kind !== "ai") return { fired: false };

	const dueAt = sub.nextRunAt ?? new Date().toISOString();
	const sourceId = `${sub.id}:${dueAt}`;
	const agentWorkIntentRecorder = buildSeamBackedWorkIntentRecorder(agentOrchestration);

	try {
		const bakedRequest = await resolveSubscriptionWakeRequest(
			{ actor: agent.id, db, eventBus, now: new Date().toISOString(), internal: true },
			{
				subscription: { id: sub.id, event: sub.event, schedule: sub.schedule },
				agentId: agent.id,
				change: null,
				sourceId,
			},
			{ searchDocuments },
		);
		await agentWorkIntentRecorder({
			kind: "subscription_run",
			sourceKind: "subscription",
			sourceId,
			requestedBy: agent.id,
			idempotencyKey: `subscription:${sub.id}:${dueAt}`,
			bakedRequest,
		});
		return { fired: true };
	} catch {
		return { fired: false };
	}
}
