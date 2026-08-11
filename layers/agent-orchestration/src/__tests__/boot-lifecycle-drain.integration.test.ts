/**
 * AU31 B2 (§5, §12 lifecycle-drain cluster) — `bootAgentOrchestration` now
 * owns starting/stopping the lifecycle-projection drain itself (relocated
 * from `core-api`'s `service-bootstrap.ts`, whose own `O3-service-move-
 * bootstrap.integration.test.ts` no longer names it as one of
 * `registerCoreDomainServices`'s owners). This drives the drain's ONE real
 * (non-`observeOnly`) family — `explicit_session_start` — through a real
 * boot, with no test-side `startLifecycleProjectionDrain` call of its own:
 * if `bootAgentOrchestration` did not start the poller, `explicitSessionStarts`
 * would stay `admitted` forever and this test would time out.
 */

import {
	agentLifecycleInbox,
	agentSessionRequests,
	bets,
	explicitSessionStarts,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { bootAgentOrchestration } from "../boot.js";

describe("bootAgentOrchestration — lifecycle-projection drain (relocated from core-api)", () => {
	test("starts the drain internally, and dispose() stops it cleanly", async ({ db, ids }) => {
		const now = new Date().toISOString();

		await db
			.insert(teams)
			.values({ id: ids("au31-b2-team"), name: "AU31 B2", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: ids("au31-b2-member"),
			teamId: ids("au31-b2-team"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: ids("au31-b2-agent"),
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				teamId: ids("au31-b2-member"),
				createdAt: now,
			},
			{
				id: ids("au31-b2-human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: ids("au31-b2-bet"),
			teamId: ids("au31-b2-team"),
			description: "AU31 B2",
			appetite: "small",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("au31-b2-task"),
			betId: ids("au31-b2-bet"),
			teamId: ids("au31-b2-team"),
			title: "AU31 B2",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(agentSessionRequests).values({
			id: ids("au31-b2-request"),
			sourceKind: "explicit_session_start",
			sourceId: ids("au31-b2-request"),
			streamId: ids("au31-b2-request-stream"),
			agentId: ids("au31-b2-agent"),
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: ids("au31-b2-request"),
			status: "completed",
			sessionId: ids("au31-b2-session"),
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(sessions).values({
			id: ids("au31-b2-session"),
			taskId: ids("au31-b2-task"),
			agentId: ids("au31-b2-agent"),
			modelTier: "fast",
			startedAt: now,
			state: "active",
		});
		await db.insert(explicitSessionStarts).values({
			id: ids("au31-b2-start"),
			taskId: ids("au31-b2-task"),
			requestedAgentId: ids("au31-b2-agent"),
			requestedModelTier: "workhorse",
			requestedBy: ids("au31-b2-human"),
			idempotencyKey: ids("au31-b2-start"),
			status: "admitted",
			requestId: ids("au31-b2-request"),
			sessionId: ids("au31-b2-session"),
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(agentLifecycleInbox).values({
			requestId: ids("au31-b2-request"),
			sourceKind: "explicit_session_start",
			sourceId: ids("au31-b2-request"),
			state: "completed",
			sessionId: ids("au31-b2-session"),
			occurredAt: now,
		});

		const boot = await bootAgentOrchestration({ db, eventBus: new EventBus() });
		try {
			const deadline = Date.now() + 5_000;
			for (;;) {
				const [row] = await db
					.select()
					.from(explicitSessionStarts)
					.where(eq(explicitSessionStarts.id, ids("au31-b2-start")));
				if (row?.status === "completed") break;
				if (Date.now() > deadline)
					throw new Error("boot did not drain the lifecycle inbox in time");
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
		} finally {
			expect(() => boot.dispose()).not.toThrow();
		}

		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, ids("au31-b2-start")));
		expect(start).toMatchObject({ status: "completed" });
	});
});
