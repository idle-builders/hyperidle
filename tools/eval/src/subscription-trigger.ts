/**
 * @lore BC5 T7b: the eval suite's replacement for `@hyperidle/core-api`'s
 * deleted `fireRoutine` — fires one subscription directly, outside the tick loop
 * (`@hyperidle/user`'s `startSubscriptionClock`/`registerSubscriptionFire`
 * are both interval/event-driven, with no single-call entry a scenario can
 * drive deterministically). Mirrors `subscription-clock.ts`'s own
 * `fireSchedule`/`tick` shape, built from the same exported pieces
 * (`tellUser`, `updateSubscription`, `nextCronMatch`, `parseCron`).
 *
 * `tools/eval` is a tooling composition root — importing `@hyperidle/user`
 * directly here (never from a scenario file) is the same "tooling →
 * service" crossing `@hyperidle/core-api`'s own `@lore` already allows.
 */
import { type HyperIdleDb, subscriptions, users } from "@hyperidle/db";
import { nextCronMatch, parseCron, tellUser, updateSubscription } from "@hyperidle/user";
import { eq } from "drizzle-orm";

export interface SubscriptionFireResult {
	readonly fired: boolean;
}

/**
 * Fires one subscription by id, synchronously — the eval-scenario
 * equivalent of one `subscription-clock.ts` tick over a single due row.
 * Returns `{fired:false}` when the subscription or its (agent) owner is
 * missing, or when the subscription has no schedule — the same "drop and
 * log" outcome `subscription-clock.ts` gives a bad wake.
 */
export async function fireSubscription(
	db: HyperIdleDb,
	subscriptionId: string,
): Promise<SubscriptionFireResult> {
	const [sub] = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.id, subscriptionId))
		.limit(1);
	if (!sub || sub.schedule === null) return { fired: false };

	const [agent] = await db.select().from(users).where(eq(users.id, sub.userId)).limit(1);
	if (agent?.kind !== "ai") return { fired: false };

	const dueAt = sub.nextRunAt ?? new Date().toISOString();

	try {
		await tellUser(
			db,
			{
				userId: agent.id,
				reason: "subscription",
				key: `subscription:${sub.id}:${dueAt}`,
				subscriptionId: sub.id,
			},
			new Date().toISOString(),
		);

		const now = new Date();
		let nextRunAt: string | null;
		try {
			nextRunAt = nextCronMatch(parseCron(sub.schedule), now).toISOString();
		} catch {
			nextRunAt = null;
		}
		await updateSubscription(db, sub.id, { nextRunAt, updatedAt: now.toISOString() });

		return { fired: true };
	} catch {
		return { fired: false };
	}
}
