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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

async function seedExplicitStartIntent(
	db: import("@hyperidle/db").HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<void> {
	const now = new Date().toISOString();
	const teamId = ids(`${prefix}-team`);
	const memberId = ids(`${prefix}-member`);
	const agentId = ids(`${prefix}-agent`);
	const betId = ids(`${prefix}-bet`);
	const taskId = ids(`${prefix}-task`);
	const humanId = ids(`${prefix}-human`);
	const startId = ids(`${prefix}-start`);
	const intentId = ids(prefix);
	await db.insert(teams).values({ id: teamId, name: prefix, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: memberId,
		teamId: teamId,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: memberId,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: betId,
		teamId: teamId,
		description: prefix,
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: betId,
		teamId: teamId,
		title: prefix,
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(users).values({
		id: humanId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});
	await db.insert(explicitSessionStarts).values({
		id: startId,
		taskId: taskId,
		requestedAgentId: agentId,
		requestedModelTier: "workhorse",
		requestedBy: humanId,
		idempotencyKey: prefix,
		status: "requested",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentWorkIntents).values({
		id: intentId,
		kind: "session_start",
		sourceKind: "explicit_session_start",
		sourceId: startId,
		requestedBy: humanId,
		idempotencyKey: `explicit-session-start:${startId}`,
		status: options.claimed ? "claimed" : "pending",
		// AU21 §6 Decision B / Increment 3: `session_start`'s
		// `resolveIntentInputInternal` drain-time case is deleted — every real
		// `session_start` intent now carries a baked payload from emit time
		// (`routes/sessions-routes.ts`). Mirror that here so this fixture stays
		// production-realistic (an unbaked `session_start` row is now
		// production-unreachable, per `session-requests/src/service.ts`'s
		// updated top-of-switch comment).
		bakedRequestJson: JSON.stringify({
			defaultAgentId: agentId,
			sourceKind: "task",
			sourceId: taskId,
			streamId: `task:${taskId}`,
			taskId: taskId,
			teamId: teamId,
			sourceCorrelation: { taskId: taskId, teamId: teamId },
		}),
		...(options.claimed
			? {
					claimToken: ids(`${prefix}-token`),
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
		ids,
	}) => {
		await seedExplicitStartIntent(db, ids, "pending-race");
		await Promise.all([drainIntents(queueDeps(db)), drainIntents(queueDeps(db))]);
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, ids("pending-race-task")));
		expect(requests).toHaveLength(1);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, ids("pending-race")));
		expect(intent).toMatchObject({ status: "handed_off", requestId: requests[0]?.id });
	});

	test("an expired claim is reclaimed exactly once even under two concurrent drains", async ({
		db,
		ids,
	}) => {
		await seedExplicitStartIntent(db, ids, "expired-race", { claimed: true, expired: true });
		await Promise.all([drainIntents(queueDeps(db)), drainIntents(queueDeps(db))]);
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, ids("expired-race-task")));
		expect(requests).toHaveLength(1);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, ids("expired-race")));
		expect(intent).toMatchObject({ status: "handed_off", requestId: requests[0]?.id });
	});

	test("an invalid source is a terminal failure with a stable code, not a retry loop", async ({
		db,
		ids,
	}) => {
		const nowIso = new Date().toISOString();
		const intentId = ids("invalid-source");
		await db.insert(agentWorkIntents).values({
			id: intentId,
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: ids("message-does-not-exist"),
			idempotencyKey: ids("assistant-message-dne"),
			status: "pending",
			attempts: 4,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await drainIntents(queueDeps(db));
		const [intentRow] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.id, intentId));
		expect(intentRow).toMatchObject({ status: "failed", lastErrorCode: "INVALID_WORK_SOURCE" });
		expect(intentRow?.lastError).toBeTruthy();
	});
});
