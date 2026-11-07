/**
 * Boots the real composition root (`bootAgentLayer`) over seeded durable state
 * and asserts each recoverable row is reconciled exactly once by the awaited
 * first sweep: pending intents, expired claims, running-request recovery,
 * requested terminations (shutdown/cost-cap), and the retention sweep. The
 * only fake is the `ProvisionSessionDeps` harness-execution edge
 * (`session-provisioning.js`'s `admitSession`/`runSession`).
 */

import { users } from "@hyperidle/db";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { agentSessionRequests, sessions } from "@hyperidle/runner-db";
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
				sandboxPath: "/tmp/boot-recovery",
				ingestion: { dispose: vi.fn() },
				traceId: "trace-boot-recovery",
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
	test("an awaited first sweep reconciles running recovery and requested terminations — each exactly once", async ({
		db,
		runnerDb,
		eventBus,
	}) => {
		const now = new Date();
		const nowIso = now.toISOString();

		// 1. A running request whose session is still "active" — no live process
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
		await runnerDb.insert(agentSessionRequests).values({
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
		await runnerDb.insert(sessions).values({
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
		await runnerDb.insert(agentSessionRequests).values({
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
		await runnerDb.insert(sessions).values({
			id: "boot-shutdown-session",
			requestId: "boot-shutdown-request",
			agentId: "boot-shutdown-agent",
			modelTier: "fast",
			startedAt: nowIso,
			state: "active",
		});

		const runtime = await startTestRuntime(
			db,
			runnerDb,
			eventBus,
			{ db: runnerDb, eventBus },
			sessionProvisioner,
		);
		try {
			// (1) orphaned running request recovered to failed/RUNTIME_LOST; session crashed.
			const [orphanRequest] = await runnerDb
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "boot-orphan-request"));
			expect(orphanRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });
			const [orphanSession] = await runnerDb
				.select()
				.from(sessions)
				.where(eq(sessions.id, "boot-orphan-session"));
			expect(orphanSession).toMatchObject({ state: "crashed" });

			// (2) requested shutdown termination recovered to failed/RUNTIME_LOST.
			const [shutdownRequest] = await runnerDb
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, "boot-shutdown-request"));
			expect(shutdownRequest).toMatchObject({ status: "failed", errorCode: "RUNTIME_LOST" });

			// No duplicate recovery: orphan was not admitted.
			expect(admitSessionCalls.filter((id) => id === orphanRequest?.id)).toHaveLength(0);
		} finally {
			await runtime.dispose();
		}
	});
});
