/**
 * AU9 Remediation-2 — new suite (architecture.md §Test-matrix additions).
 * Boots the real composition root (`bootAgentLayer`) over seeded durable state
 * and asserts each recoverable row is reconciled exactly once by the awaited
 * first sweep: pending intents, expired claims, running-request recovery,
 * requested terminations (shutdown/cost-cap), and the retention sweep. The
 * only fake is the `ProvisionSessionDeps` harness-execution edge
 * (`session-provisioning.js`'s `admitSession`/`runSession`).
 */

import {
	agentSessionRequests,
	agentWorkIntents,
	bets,
	explicitSessionStarts,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { startTestRuntime } from "./run-orchestration-test-runtime.js";

const admitSessionCalls: string[] = [];

const sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]> = {
	admitSession: vi.fn(async (deps, params) => {
		const requestId = params.requestContext?.requestId ?? "unknown";
		admitSessionCalls.push(requestId);
		const [existing] = await deps.db
			.select()
			.from(sessions)
			.where(eq(sessions.requestId, requestId))
			.limit(1);
		const sessionId = existing?.id ?? `stub-session-${requestId}`;
		return {
			sessionId,
			sessionContext: {
				sessionId,
				agentId: params.agentId,
				taskId: params.taskId,
				sandboxPath: "/tmp/au9-boot-recovery",
				ingestion: { dispose: vi.fn() },
				traceId: "trace-au9-boot-recovery",
				requestContext: params.requestContext,
			},
		};
	}),
	runSession: vi.fn(async () => ({
		sessionId: "unused",
		outcome: "completed" as const,
		taskId: null,
		forceReturnCount: 0,
	})),
};

describe("agent-layer boot recovery", () => {
	test("an awaited first sweep reconciles pending intents, expired claims, running recovery, requested terminations, and retention — each exactly once", async ({
		db,
		eventBus,
		ids,
	}) => {
		const now = new Date();
		const nowIso = now.toISOString();

		// 1. A pending explicit-session-start intent — proves the awaited
		//    first-sweep drain admits it (not merely scheduled for later).
		const teamId = ids("boot-team");
		const memberId = ids("boot-member");
		const agentId = ids("boot-agent");
		const humanId = ids("boot-human");
		const betId = ids("boot-bet");
		const taskId = ids("boot-task");
		const pendingStartId = ids("boot-pending-start");
		const pendingIntentId = ids("boot-pending-intent");
		const expiredStartId = ids("boot-expired-start");
		const expiredIntentId = ids("boot-expired-intent");
		const orphanAgentId = ids("boot-orphan-agent");
		const orphanRequestId = ids("boot-orphan-request");
		const orphanSessionId = ids("boot-orphan-session");
		const shutdownAgentId = ids("boot-shutdown-agent");
		const shutdownRequestId = ids("boot-shutdown-request");
		const shutdownSessionId = ids("boot-shutdown-session");
		const oldTerminalIntentId = ids("boot-old-terminal-intent");

		await db.insert(teams).values({ id: teamId, name: "boot", phase: "build", createdAt: nowIso });
		await db.insert(teamMembers).values({
			id: memberId,
			teamId: teamId,
			capacity: 3,
			activeBets: 0,
			formedAt: nowIso,
		});
		await db.insert(users).values([
			{
				id: agentId,
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				teamId: memberId,
				createdAt: nowIso,
			},
			{
				id: humanId,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: nowIso,
			},
		]);
		await db.insert(bets).values({
			id: betId,
			teamId: teamId,
			description: "boot",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId: betId,
			teamId: teamId,
			title: "boot",
			state: "accepted",
			ownerAgentId: agentId,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(explicitSessionStarts).values({
			id: pendingStartId,
			taskId: taskId,
			requestedAgentId: agentId,
			requestedModelTier: "workhorse",
			requestedBy: humanId,
			idempotencyKey: ids("boot-pending"),
			status: "requested",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(agentWorkIntents).values({
			id: pendingIntentId,
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: pendingStartId,
			requestedBy: humanId,
			idempotencyKey: ids(`explicit-session-start:${pendingStartId}`),
			status: "pending",
			// AU21 §6 Decision B / Increment 3: `session_start`'s drain-time case
			// is deleted — every real intent now carries a baked payload from
			// emit time. Mirror that here so this fixture stays
			// production-realistic (see `session-requests/src/service.ts`'s
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
			createdAt: nowIso,
			updatedAt: nowIso,
		});

		// 2. An expired-claimed intent (crash mid-claim) — proves it is reclaimed
		//    by the same awaited sweep, not left stranded.
		await db.insert(explicitSessionStarts).values({
			id: expiredStartId,
			taskId: taskId,
			requestedAgentId: agentId,
			requestedModelTier: "workhorse",
			requestedBy: humanId,
			idempotencyKey: ids("boot-expired"),
			status: "requested",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(agentWorkIntents).values({
			id: expiredIntentId,
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: expiredStartId,
			requestedBy: humanId,
			idempotencyKey: ids(`explicit-session-start:${expiredStartId}`),
			status: "claimed",
			// AU21 §6 Decision B / Increment 3 — see the `boot-pending-intent` `@lore` above.
			bakedRequestJson: JSON.stringify({
				defaultAgentId: agentId,
				sourceKind: "task",
				sourceId: taskId,
				streamId: `task:${taskId}`,
				taskId: taskId,
				teamId: teamId,
				sourceCorrelation: { taskId: taskId, teamId: teamId },
			}),
			claimToken: ids("stale-token"),
			claimExpiresAt: "2000-01-01T00:00:00.000Z",
			createdAt: nowIso,
			updatedAt: nowIso,
		});

		// 3. A running request whose session is still "active" — no live process
		//    can possibly exist at this call site, so it must recover to
		//    failed/RUNTIME_LOST, and the orphaned session must be marked crashed.
		await db.insert(users).values({
			id: orphanAgentId,
			kind: "ai",
			name: "Orphan Agent",
			role: "builder",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(agentSessionRequests).values({
			id: orphanRequestId,
			sourceKind: "assistant",
			sourceId: ids("boot-orphan-source"),
			streamId: ids("boot-orphan-stream"),
			agentId: orphanAgentId,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: ids("boot-orphan"),
			status: "running",
			sessionId: orphanSessionId,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(sessions).values({
			id: orphanSessionId,
			requestId: orphanRequestId,
			agentId: orphanAgentId,
			modelTier: "fast",
			startedAt: nowIso,
			state: "active",
		});

		// 4. A running request with a durably-stored "shutdown" cause (crash after
		//    HTTP 202, before teardown) — proves requested-termination recovery.
		await db.insert(users).values({
			id: shutdownAgentId,
			kind: "ai",
			name: "Shutdown Agent",
			role: "builder",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(agentSessionRequests).values({
			id: shutdownRequestId,
			sourceKind: "assistant",
			sourceId: ids("boot-shutdown-source"),
			streamId: ids("boot-shutdown-stream"),
			agentId: shutdownAgentId,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: ids("boot-shutdown"),
			status: "running",
			sessionId: shutdownSessionId,
			terminationReason: "shutdown",
			terminationRequestedAt: nowIso,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(sessions).values({
			id: shutdownSessionId,
			requestId: shutdownRequestId,
			agentId: shutdownAgentId,
			modelTier: "fast",
			startedAt: nowIso,
			state: "active",
		});

		// 5. A 31-day-old terminal intent — proves the retention sweep runs at boot.
		await db.insert(agentWorkIntents).values({
			id: oldTerminalIntentId,
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: ids("boot-old-terminal-source"),
			idempotencyKey: ids("boot-old-terminal"),
			status: "failed",
			lastErrorCode: "INVALID_WORK_SOURCE",
			createdAt: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
			updatedAt: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
		});

		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, sessionProvisioner);
		try {
			// (1) pending intent admitted.
			const [pendingIntent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, pendingIntentId));
			expect(pendingIntent).toMatchObject({ status: "handed_off" });
			const [pendingStart] = await db
				.select()
				.from(explicitSessionStarts)
				.where(eq(explicitSessionStarts.id, pendingStartId));
			expect(pendingStart).toMatchObject({ status: "admitted" });

			// (2) expired claim reclaimed and admitted.
			const [expiredIntent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, expiredIntentId));
			expect(expiredIntent).toMatchObject({ status: "handed_off" });

			// (3) orphaned running request recovered to failed/RUNTIME_LOST; session crashed.
			const [orphanRequest] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, orphanRequestId));
			expect(orphanRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });
			const [orphanSession] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, orphanSessionId));
			expect(orphanSession).toMatchObject({ state: "crashed" });

			// (4) requested shutdown termination recovered to failed/RUNTIME_LOST.
			const [shutdownRequest] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, shutdownRequestId));
			expect(shutdownRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });

			// (5) the 31-day-old terminal intent was reaped.
			const oldTerminal = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, oldTerminalIntentId));
			expect(oldTerminal).toHaveLength(0);

			// No second harness start: each real request that reached admission
			// (the two explicit-session-starts) was admitted exactly once.
			expect(admitSessionCalls.filter((id) => id === orphanRequest?.id)).toHaveLength(0);
			const counts = admitSessionCalls.reduce<Record<string, number>>((acc, id) => {
				acc[id] = (acc[id] ?? 0) + 1;
				return acc;
			}, {});
			for (const count of Object.values(counts)) {
				expect(count).toBe(1);
			}
		} finally {
			await runtime.dispose();
		}
	});
});
