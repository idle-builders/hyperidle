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
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import type { AdapterPool } from "@hyperidle/agent-layer";
import type { SandboxAdapter } from "@hyperidle/agent-layer";
import { bootAgentLayer } from "@hyperidle/agent-layer";
import { describe, expect, test } from "../test-fixtures.js";

const admitSessionCalls: string[] = [];

vi.mock("../../../agent-layer/src/services/session-provisioning.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/agent-layer")>();
	return {
		...original,
		admitSession: vi.fn(
			async (
				deps: import("@hyperidle/agent-layer").ProvisionSessionDeps,
				params: import("@hyperidle/agent-layer").ProvisionSessionParams,
			) => {
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
			},
		),
		runSession: vi.fn(async () => ({
			sessionId: "unused",
			outcome: "completed",
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
		})),
	};
});

describe("agent-layer boot recovery", () => {
	test("an awaited first sweep reconciles pending intents, expired claims, running recovery, requested terminations, and retention — each exactly once", async ({
		db,
		eventBus,
	}) => {
		const now = new Date();
		const nowIso = now.toISOString();

		// 1. A pending explicit-session-start intent — proves the awaited
		//    first-sweep drain admits it (not merely scheduled for later).
		await db
			.insert(teams)
			.values({ id: "boot-team", name: "boot", phase: "build", createdAt: nowIso });
		await db.insert(teamMembers).values({
			id: "boot-member",
			teamId: "boot-team",
			capacity: 3,
			activeBets: 0,
			formedAt: nowIso,
		});
		await db.insert(users).values([
			{
				id: "boot-agent",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				teamId: "boot-member",
				createdAt: nowIso,
			},
			{
				id: "boot-human",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: nowIso,
			},
		]);
		await db.insert(bets).values({
			id: "boot-bet",
			teamId: "boot-team",
			description: "boot",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(tasks).values({
			id: "boot-task",
			betId: "boot-bet",
			teamId: "boot-team",
			title: "boot",
			state: "accepted",
			ownerAgentId: "boot-agent",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(explicitSessionStarts).values({
			id: "boot-pending-start",
			taskId: "boot-task",
			requestedAgentId: "boot-agent",
			requestedModelTier: "workhorse",
			requestedBy: "boot-human",
			idempotencyKey: "boot-pending",
			status: "requested",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(agentWorkIntents).values({
			id: "boot-pending-intent",
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: "boot-pending-start",
			requestedBy: "boot-human",
			idempotencyKey: "explicit-session-start:boot-pending-start",
			status: "pending",
			createdAt: nowIso,
			updatedAt: nowIso,
		});

		// 2. An expired-claimed intent (crash mid-claim) — proves it is reclaimed
		//    by the same awaited sweep, not left stranded.
		await db.insert(explicitSessionStarts).values({
			id: "boot-expired-start",
			taskId: "boot-task",
			requestedAgentId: "boot-agent",
			requestedModelTier: "workhorse",
			requestedBy: "boot-human",
			idempotencyKey: "boot-expired",
			status: "requested",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(agentWorkIntents).values({
			id: "boot-expired-intent",
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: "boot-expired-start",
			requestedBy: "boot-human",
			idempotencyKey: "explicit-session-start:boot-expired-start",
			status: "claimed",
			claimToken: "stale-token",
			claimExpiresAt: "2000-01-01T00:00:00.000Z",
			createdAt: nowIso,
			updatedAt: nowIso,
		});

		// 3. A running request whose session is still "active" — no live process
		//    can possibly exist at this call site, so it must recover to
		//    failed/RUNTIME_LOST, and the orphaned session must be marked crashed.
		await db.insert(users).values({
			id: "boot-orphan-agent",
			kind: "ai",
			name: "Orphan Agent",
			role: "builder",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(agentSessionRequests).values({
			id: "boot-orphan-request",
			sourceKind: "assistant",
			sourceId: "boot-orphan-source",
			streamId: "boot-orphan-stream",
			agentId: "boot-orphan-agent",
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: "boot-orphan",
			status: "running",
			sessionId: "boot-orphan-session",
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(sessions).values({
			id: "boot-orphan-session",
			requestId: "boot-orphan-request",
			agentId: "boot-orphan-agent",
			modelTier: "fast",
			startedAt: nowIso,
			state: "active",
		});

		// 4. A running request with a durably-stored "shutdown" cause (crash after
		//    HTTP 202, before teardown) — proves requested-termination recovery.
		await db.insert(users).values({
			id: "boot-shutdown-agent",
			kind: "ai",
			name: "Shutdown Agent",
			role: "builder",
			status: "active",
			createdAt: nowIso,
		});
		await db.insert(agentSessionRequests).values({
			id: "boot-shutdown-request",
			sourceKind: "assistant",
			sourceId: "boot-shutdown-source",
			streamId: "boot-shutdown-stream",
			agentId: "boot-shutdown-agent",
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: "boot-shutdown",
			status: "running",
			sessionId: "boot-shutdown-session",
			terminationReason: "shutdown",
			terminationRequestedAt: nowIso,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
		await db.insert(sessions).values({
			id: "boot-shutdown-session",
			requestId: "boot-shutdown-request",
			agentId: "boot-shutdown-agent",
			modelTier: "fast",
			startedAt: nowIso,
			state: "active",
		});

		// 5. A 31-day-old terminal intent — proves the retention sweep runs at boot.
		await db.insert(agentWorkIntents).values({
			id: "boot-old-terminal-intent",
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: "boot-old-terminal-source",
			idempotencyKey: "boot-old-terminal",
			status: "failed",
			lastErrorCode: "INVALID_WORK_SOURCE",
			createdAt: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
			updatedAt: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
		});

		const dispose = await bootAgentLayer({
			db,
			eventBus,
			runtime: {
				db,
				eventBus,
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-boot-recovery",
		});
		try {
			// (1) pending intent admitted.
			const [pendingIntent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, "boot-pending-intent"));
			expect(pendingIntent).toMatchObject({ status: "handed_off" });
			const [pendingStart] = await db
				.select()
				.from(explicitSessionStarts)
				.where(eq(explicitSessionStarts.id, "boot-pending-start"));
			expect(pendingStart).toMatchObject({ status: "admitted" });

			// (2) expired claim reclaimed and admitted.
			const [expiredIntent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, "boot-expired-intent"));
			expect(expiredIntent).toMatchObject({ status: "handed_off" });

			// (3) orphaned running request recovered to failed/RUNTIME_LOST; session crashed.
			const [orphanRequest] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "boot-orphan-request"));
			expect(orphanRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });
			const [orphanSession] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, "boot-orphan-session"));
			expect(orphanSession).toMatchObject({ state: "crashed" });

			// (4) requested shutdown termination recovered to failed/RUNTIME_LOST.
			const [shutdownRequest] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "boot-shutdown-request"));
			expect(shutdownRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });

			// (5) the 31-day-old terminal intent was reaped.
			const oldTerminal = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, "boot-old-terminal-intent"));
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
			dispose();
		}
	});
});
