import {
	agentLifecycleInbox,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	users,
} from "@hyperidle/db";
import { expect, test, type ScopedIds } from "@hyperidle/db/test-fixtures";
import { eq, inArray } from "drizzle-orm";
import { describe } from "vitest";
import {
	claimSessionRequest,
	createSessionRequest,
	type DurableAgentQueueDeps,
	drainIntents,
	drainLifecycleProjections,
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
	return createSessionRequest(db, {
		kind: "direct",
		request: {
			sourceKind: "assistant",
			sourceId: `queue-message-${suffix}`,
			streamId: `thread:queue-${suffix}`,
			agentId: `queue-agent-${suffix}`,
			userId: `queue-user-${suffix}`,
			promptMode: "conversation",
			idempotencyKey: `queue:${suffix}`,
			sourceCorrelation: {
				threadId: `queue-thread-${suffix}`,
				messageId: `queue-message-${suffix}`,
				userId: `queue-user-${suffix}`,
				assistantAgentId: `queue-agent-${suffix}`,
			},
		},
	});
}

async function seedIntent(db: HyperIdleDb, suffix: string, updatedAt = "2026-07-22T10:00:00.000Z") {
	const [intent] = await db
		.insert(agentWorkIntents)
		.values({
			id: `queue-intent-${suffix}`,
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: `queue-source-${suffix}`,
			idempotencyKey: `queue-intent:${suffix}`,
			status: "pending",
			createdAt: "2026-07-22T10:00:00.000Z",
			updatedAt,
		})
		.returning();
	return intent!;
}

function queueDeps(
	db: HyperIdleDb,
	lifecycleProjection: DurableAgentQueueDeps["lifecycleProjection"] = projectionDeps("never"),
): DurableAgentQueueDeps {
	return {
		db,
		lifecycleProjection,
	};
}

describe("durable request and intent lease fencing", () => {
	function claimedToken(row: { readonly claimToken: string | null } | null): string {
		if (!row?.claimToken) throw new Error("Expected an actively claimed request");
		return row.claimToken;
	}
	test("renewal at expiry cannot resurrect request custody", async ({ db, ids }) => {
		const request = await seedRequest(db, ids("expired-renew"));
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
		ids,
	}) => {
		const intent = await seedIntent(db, ids("lease-reclaim"));
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

	test("tokenless and stale release are no-ops for a claimed request", async ({ db, ids }) => {
		const request = await seedRequest(db, ids("release-fence"));
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
		ids,
	}) => {
		for (const [name, tokenKind, now] of [
			["missing", undefined, "2026-07-22T10:00:00.500Z"],
			["stale", "stale-token", "2026-07-22T10:00:00.500Z"],
			["expired", "actual", "2026-07-22T10:00:01.000Z"],
		] as const) {
			const request = await seedRequest(db, ids(`running-${name}`));
			const claimed = await claimSessionRequest(
				db,
				{ id: request.id },
				{ workerId: "worker", now: new Date("2026-07-22T10:00:00.000Z"), leaseMs: 1_000 },
			);
			const token = tokenKind === "actual" ? claimedToken(claimed) : tokenKind;

			const transition = {
				requestId: request.id,
				to: "running",
				sessionId: ids(`session-${name}`),
				claimToken: token,
			};
			await expect(
				Reflect.apply(transitionSessionRequest, undefined, [
					db,
					transition,
					undefined,
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
		ids,
	}) => {
		const eligibleAt = new Date("2026-07-22T10:00:05.000Z");
		const intent = await seedIntent(db, ids("retry-boundary"), eligibleAt.toISOString());

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

/**
 * @lore AU21 §9 Increment 10a (Decision I) correction: `decomposition`'s
 * projector — the prior fault-injection vehicle for this poison-handling
 * exploit — is REMOVED entirely (not merely made `observeOnly` like
 * `routine`'s prior correction above): the built-in bet_decomposition
 * mechanism no longer exists. `explicit_session_start`'s projector
 * (`projectTerminalState`) is the remaining real, single-call
 * (non-transactional) projection family — same shape the retry/poison
 * mechanism under test needs — so the fault injection moves there. Its
 * correlation key is `fact.requestId` (not `fact.sourceId`, which
 * `decomposition` used) — `seedLifecycleFact` returns the real requestId so
 * callers can key the injected fault off it directly. The retry/lease/poison
 * behavior under test belongs to the drain loop itself, not to any specific
 * family.
 */
function projectionDeps(failRequestId: string) {
	return {
		explicitSessionStarts: {
			async projectTerminalState(_db: HyperIdleDb, requestId: string) {
				if (requestId === failRequestId) throw new Error("poison projection");
			},
		},
	};
}

// @lore AU38: `timingDigit` is interpolated into `occurredAt`'s seconds, so it
// must stay a single digit; the request identity rides a scoped ids() label.
async function seedLifecycleFact(db: HyperIdleDb, ids: ScopedIds, timingDigit: string) {
	const request = await seedRequest(db, ids(`projection-${timingDigit}`));
	await db
		.update(agentSessionRequests)
		.set({ status: "completed" })
		.where(eq(agentSessionRequests.id, request.id));
	await db.insert(agentLifecycleInbox).values({
		requestId: request.id,
		sourceKind: "explicit_session_start",
		sourceId: ids(`projection-${timingDigit}-source`),
		state: "completed",
		occurredAt: `2026-07-22T10:00:0${timingDigit}.000Z`,
	});
	return request.id;
}

describe("lifecycle inbox retry and poison handling", () => {
	test("reclaim observes a same-token lease extension and waits for the extended expiry", async ({
		db,
		ids,
	}) => {
		const requestId = await seedLifecycleFact(db, ids, "0");
		await db
			.update(agentLifecycleInbox)
			.set({
				claimToken: "same-owner-token",
				claimExpiresAt: "2026-07-22T10:00:20.000Z",
			})
			.where(eq(agentLifecycleInbox.requestId, requestId));

		// @lore AU38: the drain scans the whole inbox, so exact return counts were
		// global claims; re-homed on this test's own fact (untouched before the
		// extended expiry, projected after it).
		await drainLifecycleProjections(queueDeps(db, projectionDeps("never")), {
			now: new Date("2026-07-22T10:00:19.999Z"),
			leaseMs: 1_000,
		});
		const [stillOwned] = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(stillOwned).toMatchObject({
			claimToken: "same-owner-token",
			claimExpiresAt: "2026-07-22T10:00:20.000Z",
			attempts: 0,
			projectedAt: null,
		});

		const drained = await drainLifecycleProjections(queueDeps(db, projectionDeps("never")), {
			now: new Date("2026-07-22T10:00:20.001Z"),
			leaseMs: 1_000,
		});
		expect(drained).toBeGreaterThanOrEqual(1);
		const [projected] = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(projected?.projectedAt).toBeTruthy();
	});

	test("a failed projection keeps its lease and does not block a later fact in the batch", async ({
		db,
		ids,
	}) => {
		const poisonId = await seedLifecycleFact(db, ids, "1");
		const validId = await seedLifecycleFact(db, ids, "2");

		const count = await drainLifecycleProjections(queueDeps(db, projectionDeps(poisonId)), {
			now: new Date("2026-07-22T10:00:10.000Z"),
			leaseMs: 1_000,
		});

		// @lore AU38: count re-homed from the global exact onto "at least the one
		// arranged healthy fact drained"; the per-row assertions below carry the
		// poison/valid contract scoped to the two arranged facts.
		expect(count).toBeGreaterThanOrEqual(1);
		const rows = await db
			.select()
			.from(agentLifecycleInbox)
			.where(inArray(agentLifecycleInbox.requestId, [poisonId, validId]));
		expect(rows.find((row) => row.requestId === poisonId)).toMatchObject({
			attempts: 1,
			lastError: "poison projection",
			projectedAt: null,
		});
		expect(rows.find((row) => row.requestId === poisonId)?.claimToken).toBeTruthy();
		expect(rows.find((row) => row.requestId === validId)?.projectedAt).toBeTruthy();
	});

	test("a poison fact becomes handled only on the configured maximum attempt", async ({
		db,
		ids,
	}) => {
		const poisonId = await seedLifecycleFact(db, ids, "3");
		const options = {
			now: new Date("2026-07-22T10:00:10.000Z"),
			leaseMs: 1,
			maxAttempts: 2,
		};

		await drainLifecycleProjections(queueDeps(db, projectionDeps(poisonId)), options).catch(
			() => {},
		);
		options.now = new Date("2026-07-22T10:00:10.002Z");
		await drainLifecycleProjections(queueDeps(db, projectionDeps(poisonId)), options).catch(
			() => {},
		);

		const [row] = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, poisonId));
		expect(row).toMatchObject({ attempts: 2, lastError: "poison projection" });
		expect(row?.projectedAt).toBeTruthy();
		expect(row?.claimToken).toBeNull();
	});
});
