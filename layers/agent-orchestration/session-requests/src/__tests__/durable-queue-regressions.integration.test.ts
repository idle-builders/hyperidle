import { agentSessionRequests, agentWorkIntents, type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
	claimSessionRequest,
	drainIntents,
	findSessionRequest,
	releaseClaim,
	renewClaim,
	transitionSessionRequest,
} from "../index.js";

async function seedRequest(db: HyperIdleDb, suffix: string) {
	const createdAt = "2026-07-22T10:00:00.000Z";
	await db.insert(users).values([
		{
			id: `queue-agent-${suffix}`,
			kind: "ai",
			name: "Queue Agent",
			role: "builder",
			status: "active",
			createdAt,
		},
		{
			id: `queue-user-${suffix}`,
			kind: "human",
			name: "Queue User",
			role: "founder",
			status: "active",
			createdAt,
		},
	]);
	const [row] = await db
		.insert(agentSessionRequests)
		.values({
			id: `queue-request-${suffix}`,
			sourceKind: "assistant",
			sourceId: `queue-message-${suffix}`,
			streamId: `thread:queue-${suffix}`,
			agentId: `queue-agent-${suffix}`,
			userId: `queue-user-${suffix}`,
			promptMode: "conversation",
			idempotencyKey: `queue:${suffix}`,
			sourceCorrelationJson: JSON.stringify({
				threadId: `queue-thread-${suffix}`,
				messageId: `queue-message-${suffix}`,
				userId: `queue-user-${suffix}`,
				agentId: `queue-agent-${suffix}`,
			}),
			status: "pending",
			createdAt,
			updatedAt: createdAt,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

async function seedIntent(db: HyperIdleDb, suffix: string, updatedAt = "2026-07-22T10:00:00.000Z") {
	const [intent] = await db
		.insert(agentWorkIntents)
		.values({
			id: `queue-intent-${suffix}`,
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: `queue-source-${suffix}`,
			idempotencyKey: `queue-intent:${suffix}`,
			status: "pending",
			createdAt: "2026-07-22T10:00:00.000Z",
			updatedAt,
		})
		.returning();
	return intent!;
}

function queueDeps(db: HyperIdleDb) {
	return { db, eventBus: new EventBus() };
}

describe("durable request and intent lease fencing", () => {
	function claimedToken(row: { readonly claimToken: string | null } | null): string {
		if (!row?.claimToken) throw new Error("Expected an actively claimed request");
		return row.claimToken;
	}
	test("renewal at expiry cannot resurrect request custody", async ({ db }) => {
		const request = await seedRequest(db, "expired-renew");
		const claimedAt = new Date("2026-07-22T10:00:00.000Z");
		const requestClaim = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: claimedAt, leaseMs: 1_000 },
		);
		const expiry = new Date("2026-07-22T10:00:01.000Z");

		expect(
			await renewClaim(db, request.id, claimedToken(requestClaim), {
				now: expiry,
				leaseMs: 30_000,
			}),
		).toBe(false);
	});

	test("intent custody blocks a second drain until lease expiry, then permits one reclaim", async ({
		db,
	}) => {
		const intent = await seedIntent(db, "lease-reclaim");
		await db
			.update(agentWorkIntents)
			.set({
				status: "claimed",
				claimToken: "stalled-token",
				claimExpiresAt: "2026-07-22T10:00:05.000Z",
			})
			.where(eq(agentWorkIntents.id, intent.id));

		await drainIntents(queueDeps(db), {
			now: () => new Date("2026-07-22T10:00:04.999Z"),
			maxAttempts: 1,
		});
		expect(
			(await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, intent.id)))[0],
		).toMatchObject({ status: "claimed", attempts: 0, claimToken: "stalled-token" });

		await drainIntents(queueDeps(db), {
			now: () => new Date("2026-07-22T10:00:05.001Z"),
			maxAttempts: 1,
		});
		expect(
			(await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, intent.id)))[0],
		).toMatchObject({ status: "failed", attempts: 1 });
	});

	test("tokenless and stale release are no-ops for a claimed request", async ({ db }) => {
		const request = await seedRequest(db, "release-fence");
		const claimed = await claimSessionRequest(
			db,
			{ id: request.id },
			{ workerId: "worker", now: new Date("2026-07-22T10:00:00.000Z"), leaseMs: 30_000 },
		);

		await Reflect.apply(releaseClaim, undefined, [db, request.id]);
		await releaseClaim(db, request.id, "stale-token");

		const stored = await findSessionRequest(db, { by: "id", requestId: request.id });
		expect(stored).toMatchObject({ status: "claimed", claimToken: claimedToken(claimed) });
	});

	test("claimed to running rejects missing, stale, and expired tokens and preserves custody", async ({
		db,
	}) => {
		for (const [name, tokenKind, now] of [
			["missing", undefined, "2026-07-22T10:00:00.500Z"],
			["stale", "stale-token", "2026-07-22T10:00:00.500Z"],
			["expired", "actual", "2026-07-22T10:00:01.000Z"],
		] as const) {
			const request = await seedRequest(db, `running-${name}`);
			const claimed = await claimSessionRequest(
				db,
				{ id: request.id },
				{ workerId: "worker", now: new Date("2026-07-22T10:00:00.000Z"), leaseMs: 1_000 },
			);
			const token = tokenKind === "actual" ? claimedToken(claimed) : tokenKind;

			const transition = {
				requestId: request.id,
				to: "running",
				sessionId: `session-${name}`,
				claimToken: token,
			};
			await expect(
				Reflect.apply(transitionSessionRequest, undefined, [
					db,
					transition,
					{ now: new Date(now) },
				]),
			).rejects.toThrow(/custody/i);
			expect(await findSessionRequest(db, { by: "id", requestId: request.id })).toMatchObject({
				status: "claimed",
				claimToken: claimedToken(claimed),
			});
		}
	});

	test("a pending intent is unavailable before future updatedAt and claimable at the boundary", async ({
		db,
	}) => {
		const eligibleAt = new Date("2026-07-22T10:00:05.000Z");
		const intent = await seedIntent(db, "retry-boundary", eligibleAt.toISOString());

		const deps = queueDeps(db);
		await drainIntents(deps, {
			now: () => new Date(eligibleAt.getTime() - 1),
			maxAttempts: 1,
		});
		let [stored] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intent.id));
		expect(stored).toMatchObject({ status: "pending", attempts: 0 });
		await drainIntents(deps, { now: () => eligibleAt, maxAttempts: 1 });
		[stored] = await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, intent.id));
		expect(stored).toMatchObject({ status: "failed", attempts: 1 });
	});
});
