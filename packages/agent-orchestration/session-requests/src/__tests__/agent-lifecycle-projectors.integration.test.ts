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
import {
	deleteLifecycleInboxByRequestIds,
	insertLifecycleInboxFactIfAbsent,
	listProjectedLifecycleInboxBefore,
} from "../agent-lifecycle-inbox.js";
import {
	AGENT_LIFECYCLE_PROJECTORS,
	drainAgentLifecycleInbox,
} from "../agent-lifecycle-projectors.js";
import type { AgentLifecycleProjectionDeps } from "../ports.js";

function fakeDeps(): AgentLifecycleProjectionDeps & {
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
		routine: {
			async updateRoutineRunIfRunning(_exec, id, patch) {
				routineCalls.push({ id, patch });
			},
		},
		work: {
			async updateBetDecompositionStatusIfRunning(_exec, id, patch) {
				workCalls.push({ id, patch });
			},
		},
		explicitSessionStarts: {
			async projectTerminalState(_exec, requestId, patch) {
				explicitCalls.push({ requestId, patch });
			},
		},
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

describe("AGENT_LIFECYCLE_PROJECTORS registry — exhaustive contract", () => {
	test("every source kind has a registered projector", () => {
		expect(Object.keys(AGENT_LIFECYCLE_PROJECTORS).sort()).toEqual(
			[
				"assistant",
				"task",
				"knowledge",
				"routine",
				"decomposition",
				"proposed_call",
				"explicit_session_start",
			].sort(),
		);
	});
});

describe("drainAgentLifecycleInbox — DI port wiring", () => {
	test("routine family calls the injected routine port, not a raw table write", async ({ db }) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-routine-req", "routine", "lp-routine-run");

		const count = await drainAgentLifecycleInbox(db, deps);

		expect(count).toBe(1);
		expect(deps.routineCalls).toHaveLength(1);
		expect(deps.routineCalls[0]).toMatchObject({
			id: "lp-routine-run",
			patch: { outcome: "success" },
		});
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

		await drainAgentLifecycleInbox(db, deps);

		expect(deps.workCalls).toHaveLength(1);
		expect(deps.workCalls[0]).toMatchObject({
			id: "lp-decomp-bet",
			patch: { decompositionStatus: "done", decompositionBlockerReason: null },
		});
	});

	test("explicit_session_start family calls the injected session-requests port", async ({ db }) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-explicit-req", "explicit_session_start", "lp-explicit-req", "sess-1");

		await drainAgentLifecycleInbox(db, deps);

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

		await drainAgentLifecycleInbox(db, deps);

		expect(deps.explicitCalls).toHaveLength(1);
		expect(deps.explicitCalls[0]).toMatchObject({ requestId: "lp-task-req" });
	});

	test("no-op families acknowledge without calling any port", async ({ db }) => {
		const deps = fakeDeps();
		await seedRequest(db, "lp-assistant-req", "assistant", "lp-assistant-source");

		const count = await drainAgentLifecycleInbox(db, deps);

		expect(count).toBe(1);
		expect(deps.routineCalls).toHaveLength(0);
		expect(deps.workCalls).toHaveLength(0);
		expect(deps.explicitCalls).toHaveLength(0);
	});
});

describe("agent_lifecycle_inbox owned-table accessors — writer/reaper surface", () => {
	test("insertLifecycleInboxFactIfAbsent is idempotent by requestId", async ({ db }) => {
		await db.insert(users).values({
			id: "lp-acc-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await db.insert(agentSessionRequests).values({
			id: "lp-acc-req",
			sourceKind: "assistant",
			sourceId: "lp-acc-source",
			streamId: "lp-acc-stream",
			agentId: "lp-acc-agent",
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: "lp-acc-req",
			status: "completed",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		const fact = {
			requestId: "lp-acc-req",
			sourceKind: "assistant",
			sourceId: "lp-acc-source",
			state: "completed",
			sessionId: null,
			failureCode: null,
			occurredAt: new Date().toISOString(),
		};

		await insertLifecycleInboxFactIfAbsent(db, fact);
		await insertLifecycleInboxFactIfAbsent(db, fact);

		const rows = await db
			.select({ requestId: agentLifecycleInbox.requestId })
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "lp-acc-req"));
		expect(rows).toHaveLength(1);
	});

	test("listProjectedLifecycleInboxBefore + deleteLifecycleInboxByRequestIds round-trip the reaper sweep", async ({
		db,
	}) => {
		const past = new Date(Date.now() - 60_000).toISOString();
		await seedRequest(db, "lp-reap-req", "assistant", "lp-reap-source");
		await db
			.update(agentLifecycleInbox)
			.set({ projectedAt: new Date().toISOString(), occurredAt: past })
			.where(eq(agentLifecycleInbox.requestId, "lp-reap-req"));

		const future = new Date(Date.now() + 60_000).toISOString();
		const candidates = await listProjectedLifecycleInboxBefore(db, future, 10);
		expect(candidates.map((row) => row.requestId)).toContain("lp-reap-req");

		await deleteLifecycleInboxByRequestIds(
			db,
			candidates.map((row) => row.requestId),
		);

		const remaining = await db
			.select({ requestId: agentLifecycleInbox.requestId })
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "lp-reap-req"));
		expect(remaining).toHaveLength(0);
	});
});
