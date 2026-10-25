/**
 * Intent claim/reclaim races drive the real `drainIntents` entrypoint (the
 * sanctioned drain export) — never `claimAgentWorkIntent` or
 * `reclaimAgentWorkIntent` directly.
 */

import {
	agentSessionRequests,
	agentWorkIntents,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

async function seedTaskRunIntent(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: id, createdAt: now });
	await db.insert(users).values({
		id: `${id}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(userTeams).values({ userId: `${id}-agent`, teamId: `${id}-team` });
	await db.insert(threads).values({
		id: `thr-${`${id}-bet`}`,
		hostKind: "team",
		hostId: `${id}-team`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${id}-bet`}`,
		id: `${id}-bet`,
		parentTaskId: null,
		teamId: `${id}-team`,
		title: id,
		description: id,
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${`${id}-task`}`,
		hostKind: "team",
		hostId: `${id}-team`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${id}-task`}`,
		id: `${id}-task`,
		parentTaskId: `${id}-bet`,
		teamId: `${id}-team`,
		title: id,
		state: "accepted",
		ownerAgentId: `${id}-agent`,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentWorkIntents).values({
		id,
		kind: "task_run",
		sourceKind: "task_dispatch_attempt",
		sourceId: `${id}-task`,
		idempotencyKey: `task-dispatch:${id}-task`,
		status: options.claimed ? "claimed" : "pending",
		// Every intent kind bakes its request at emit time; the drain reads
		// `bakedRequestJson` directly with zero domain reads.
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
		eventBus,
	}) => {
		await seedTaskRunIntent(db, "pending-race");
		await Promise.all([
			drainIntents({ ...queueDeps(db), eventBus }),
			drainIntents({ ...queueDeps(db), eventBus }),
		]);
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
		eventBus,
	}) => {
		await seedTaskRunIntent(db, "expired-race", { claimed: true, expired: true });
		await Promise.all([
			drainIntents({ ...queueDeps(db), eventBus }),
			drainIntents({ ...queueDeps(db), eventBus }),
		]);
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
	// There is no "invalid source is terminal failure" test: unbaked intent
	// rows are production-unreachable (bakedRequest is required on
	// WorkIntentInput; the drain has no unbaked branch).
});
