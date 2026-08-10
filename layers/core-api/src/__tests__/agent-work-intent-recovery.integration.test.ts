/**
 * AU9 Remediation-2 — R2: intent claim/reclaim races drive the real
 * `drainIntents` entrypoint (the sanctioned drain export from the
 * R2-banned `agent-work-intent-worker.ts` module) — never `claimAgentWorkIntent`
 * or `reclaimAgentWorkIntent` directly.
 */

import {
	agentSessionRequests,
	agentWorkIntents,
	bets,
	explicitSessionStarts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

async function seedExplicitStartIntent(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: id, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: `${id}-member`,
		teamId: `${id}-team`,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: `${id}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: `${id}-member`,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: `${id}-bet`,
		teamId: `${id}-team`,
		description: id,
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: `${id}-task`,
		betId: `${id}-bet`,
		teamId: `${id}-team`,
		title: id,
		state: "accepted",
		ownerAgentId: `${id}-agent`,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(users).values({
		id: `${id}-human`,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});
	await db.insert(explicitSessionStarts).values({
		id: `${id}-start`,
		taskId: `${id}-task`,
		requestedAgentId: `${id}-agent`,
		requestedModelTier: "workhorse",
		requestedBy: `${id}-human`,
		idempotencyKey: id,
		status: "requested",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentWorkIntents).values({
		id,
		kind: "session_start",
		sourceKind: "explicit_session_start",
		sourceId: `${id}-start`,
		requestedBy: `${id}-human`,
		idempotencyKey: `explicit-session-start:${id}-start`,
		status: options.claimed ? "claimed" : "pending",
		// AU21 §6 Decision B / Increment 3: `session_start`'s
		// `resolveIntentInputInternal` drain-time case is deleted — every real
		// `session_start` intent now carries a baked payload from emit time
		// (`routes/sessions-routes.ts`). Mirror that here so this fixture stays
		// production-realistic (an unbaked `session_start` row is now
		// production-unreachable, per `session-requests/src/service.ts`'s
		// updated top-of-switch comment).
		bakedRequestJson: JSON.stringify({
			defaultAgentId: `${id}-agent`,
			sourceKind: "task",
			sourceId: `${id}-task`,
			streamId: `task:${id}-task`,
			taskId: `${id}-task`,
			teamId: `${id}-team`,
			sourceCorrelation: { taskId: `${id}-task`, teamId: `${id}-team` },
		}),
		...(options.claimed
			? {
					claimToken: "prior-token",
					claimExpiresAt: options.expired
						? "2000-01-01T00:00:00.000Z"
						: new Date(Date.now() + 30_000).toISOString(),
				}
			: {}),
		createdAt: now,
		updatedAt: now,
	});
}

describe("intent recovery drives the real drain", () => {
	test("two concurrent drains create exactly one request and hand off exactly one intent", async ({
		db,
	}) => {
		await seedExplicitStartIntent(db, "pending-race");
		await Promise.all([drainIntents(queueDeps(db)), drainIntents(queueDeps(db))]);
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, "pending-race-task"));
		expect(requests).toHaveLength(1);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, "pending-race"));
		expect(intent).toMatchObject({ status: "handed_off", requestId: requests[0]?.id });
	});

	test("an expired claim is reclaimed exactly once even under two concurrent drains", async ({
		db,
	}) => {
		await seedExplicitStartIntent(db, "expired-race", { claimed: true, expired: true });
		await Promise.all([drainIntents(queueDeps(db)), drainIntents(queueDeps(db))]);
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, "expired-race-task"));
		expect(requests).toHaveLength(1);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, "expired-race"));
		expect(intent).toMatchObject({ status: "handed_off", requestId: requests[0]?.id });
	});

	test("an invalid source is a terminal failure with a stable code, not a retry loop", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(agentWorkIntents).values({
			id: "invalid-source",
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: "message-does-not-exist",
			idempotencyKey: "assistant:message-does-not-exist",
			status: "pending",
			attempts: 4,
			createdAt: now,
			updatedAt: now,
		});
		await drainIntents(queueDeps(db));
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, "invalid-source"));
		expect(intent).toMatchObject({ status: "failed", lastErrorCode: "INVALID_WORK_SOURCE" });
		expect(intent?.lastError).toBeTruthy();
	});
});
