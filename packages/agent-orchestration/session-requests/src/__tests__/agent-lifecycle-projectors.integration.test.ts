/**
 * @lore AU19 Increment 3d: this Service's own `{db}`-only fixture test (same
 * precedent as `@hyperidle/session-requests`'s
 * `agent-session-requests.integration.test.ts`, Increment 3b) — proves the
 * real `agent_lifecycle_inbox` claim/project/ack drain loop AND the
 * DI-converted `routine`/`work`/`explicitSessionStarts` port wiring
 * (`ports.ts`) with fakes standing in for the injected Services (this
 * package must never import `@hyperidle/routine`/`@hyperidle/work` directly —
 * Mechanism C).
 *
 * @lore AU20 B1a: moved from `packages/agent-orchestration/lifecycle-projection`
 * into `session-requests` as part of the fold.
 */

import { agentLifecycleInbox, agentSessionRequests, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { type DurableAgentQueueDeps, drainLifecycleProjections, reapExpired } from "../index.js";

function fakeDeps(): DurableAgentQueueDeps["lifecycleProjection"] & {
	// AU21 correction: `routine` no longer has an injected lifecycle-projection
	// port at all (the interface field was deleted along with `projectRoutine`
	// — Wave C's `finalizeRoutineRun` is the sole finalizer now). `routineCalls`
	// stays only as a witness array that must remain empty forever, proving
	// the drain has no way left to reach a routine write.
	readonly routineCalls: Array<{ id: string; patch: unknown }>;
	readonly workCalls: Array<{ id: string; patch: unknown }>;
	readonly explicitCalls: Array<{ requestId: string; patch: unknown }>;
} {
	const routineCalls: Array<{ id: string; patch: unknown }> = [];
	const workCalls: Array<{ id: string; patch: unknown }> = [];
	const explicitCalls: Array<{ requestId: string; patch: unknown }> = [];
	return {
		routineCalls,
		workCalls,
		explicitCalls,
		work: {
			async updateTaskDispatchAttemptIfActive() {},
			async updateBetDecompositionStatusIfRunning(_exec: unknown, id: string, patch: unknown) {
				workCalls.push({ id, patch });
			},
		},
		explicitSessionStarts: {
			async projectTerminalState(_exec: unknown, requestId: string, patch: unknown) {
				explicitCalls.push({ requestId, patch });
			},
		},
	};
}

function queueDeps(
	db: import("@hyperidle/db").HyperIdleDb,
	lifecycleProjection: DurableAgentQueueDeps["lifecycleProjection"],
): DurableAgentQueueDeps {
	return {
		db,
		lifecycleProjection,
		config: { listConfiguration: async () => [] },
		teams: { getTeamMembersByTeamId: async () => undefined },
		users: {
			getUserById: async () => undefined,
			getUserByIdScopedToTeam: async () => undefined,
			listUsersByTeam: async () => [],
		},
		work: {
			getTaskById: async () => undefined,
			getBetById: async () => undefined,
			getTaskDispatchAttemptById: async () => undefined,
			reapTerminalTaskDispatchAttempts: async () => 0,
		},
		routine: {
			getRoutineRunById: async () => undefined,
			getRoutineById: async () => undefined,
		},
		conversation: { getMessageById: async () => undefined },
		review: { findGrantedProposedCall: async () => undefined },
		knowledge: { findById: async () => null },
	};
}

async function seedRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	requestId: string,
	sourceKind: string,
	sourceId: string,
	sessionId?: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: `${requestId}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id: requestId,
		sourceKind: "assistant",
		sourceId: `${requestId}-source`,
		streamId: `${requestId}-stream`,
		agentId: `${requestId}-agent`,
		promptMode: "conversation",
		sourceCorrelationJson: "{}",
		idempotencyKey: requestId,
		status: "completed",
		...(sessionId ? { sessionId } : {}),
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentLifecycleInbox).values({
		requestId,
		sourceKind,
		sourceId,
		state: "completed",
		...(sessionId ? { sessionId } : {}),
		occurredAt: now,
	});
}

describe("drainLifecycleProjections — exhaustive DI port wiring", () => {
	/**
	 * AU21 correction (post-Increment-5 verification) — RED. `routine` used
	 * to be a "real projection" family here, calling
	 * `deps.routine.updateRoutineRunIfRunning` directly — that was the THIRD
	 * raw cross-layer write path the gap report found. Wave C's core-api-side
	 * `finalizeRoutineRun` (reacting to `session_ended`/
	 * `agent_run_lifecycle_changed`) already does this job end-to-end via the
	 * proper event-driven mechanism, so `routine`'s projector becomes
	 * `observeOnly` — joining `assistant`/`knowledge`/`proposed_call` below.
	 * Today (RED): `lifecycleProjectors.routine` is still `projectRoutine`,
	 * so `deps.routineCalls` is NOT empty and this fails.
	 */
	test("routine family is observeOnly — the drain never calls the injected routine port directly", async ({
		db,
	}) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-routine-req", "routine", "lp-routine-run");

		const count = await drainLifecycleProjections(queueDeps(db, deps));

		expect(count).toBe(1);
		expect(deps.routineCalls).toHaveLength(0);
		expect(deps.workCalls).toHaveLength(0);
		expect(deps.explicitCalls).toHaveLength(0);

		const [row] = await db
			.select({ projectedAt: agentLifecycleInbox.projectedAt })
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "lp-routine-req"));
		expect(row?.projectedAt).toBeTruthy();
	});

	test("decomposition family calls the injected work port", async ({ db }) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-decomp-req", "decomposition", "lp-decomp-bet");

		await drainLifecycleProjections(queueDeps(db, deps));

		expect(deps.workCalls).toHaveLength(1);
		expect(deps.workCalls[0]).toMatchObject({
			id: "lp-decomp-bet",
			patch: { decompositionStatus: "done", decompositionBlockerReason: null },
		});
	});

	test("explicit_session_start family calls the injected session-requests port", async ({ db }) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-explicit-req", "explicit_session_start", "lp-explicit-req", "sess-1");

		await drainLifecycleProjections(queueDeps(db, deps));

		expect(deps.explicitCalls).toHaveLength(1);
		expect(deps.explicitCalls[0]).toMatchObject({
			requestId: "lp-explicit-req",
			patch: { status: "completed", sessionId: "sess-1" },
		});
	});

	test("task family projects the explicit-session-start port inside the same transaction", async ({
		db,
	}) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-task-req", "task", "lp-task-attempt");

		await drainLifecycleProjections(queueDeps(db, deps));

		expect(deps.explicitCalls).toHaveLength(1);
		expect(deps.explicitCalls[0]).toMatchObject({ requestId: "lp-task-req" });
	});

	test("all no-op families acknowledge without calling any port", async ({ db }) => {
		const deps = fakeDeps();
		// AU21 correction: `routine` joins the no-op families here (see the
		// dedicated test above for the RED signal on that transition).
		for (const sourceKind of ["assistant", "knowledge", "proposed_call", "routine"] as const) {
			await seedRequest(db, `lp-${sourceKind}-req`, sourceKind, `lp-${sourceKind}-source`);
		}

		const count = await drainLifecycleProjections(queueDeps(db, deps));

		expect(count).toBe(4);
		expect(deps.routineCalls).toHaveLength(0);
		expect(deps.workCalls).toHaveLength(0);
		expect(deps.explicitCalls).toHaveLength(0);
	});
});

describe("reapExpired — lifecycle retention contract", () => {
	test("removes projected lifecycle facts older than retention", async ({ db }) => {
		const past = new Date(Date.now() - 60_000).toISOString();
		await seedRequest(db, "lp-reap-req", "assistant", "lp-reap-source");
		await db
			.update(agentLifecycleInbox)
			.set({ projectedAt: new Date().toISOString(), occurredAt: past })
			.where(eq(agentLifecycleInbox.requestId, "lp-reap-req"));

		await reapExpired(queueDeps(db, fakeDeps()), {
			now: new Date(),
			retentionDays: 0,
			batchSize: 10,
		});

		const remaining = await db
			.select({ requestId: agentLifecycleInbox.requestId })
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "lp-reap-req"));
		expect(remaining).toHaveLength(0);
	});
});
