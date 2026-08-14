/**
 * Increment 7, Wave B (Decision E) — RED phase.
 *
 * architecture.md §6 Decision E: session/harness streaming "belongs
 * owned/served by `agent-execution`... [exposed] via `AgentOrchestrationPort`
 * (Decision D) as the gateway door." §9 Increment 7: "build the (c)
 * session/harness streaming capability owned by `agent-execution`, gatewayed
 * by `agent-orchestration`, exposed via `AgentOrchestrationPort`."
 *
 * This mirrors `agent-orchestration-port.integration.test.ts`'s own §11
 * contract-test shape (Increment 6) for a NEW read method,
 * `sessions.getRecentActivity(sessionId)`, backed by a NEW route
 * `GET /api/agent-orchestration/sessions/:sessionId/activity` — the
 * relocated `SessionActivityBuffer`'s read door, replacing
 * `sessions-routes.ts`'s direct buffer reference.
 *
 * RED reason: `buildAgentOrchestrationPort`'s returned `sessions` object has
 * exactly two keys today (`getSessionCostBySessionId`,
 * `listSessionHistoryBySource`) — `getRecentActivity` does not exist, so
 * calling it throws `TypeError: ... is not a function` at runtime. This is
 * the same "cast to the target shape, call the not-yet-real method" RED
 * pattern `agent-orchestration-port-readonly.integration.test.ts` uses for
 * its read-only obligation tests, applied here to a genuinely new
 * capability rather than an import-resolution failure (the composition
 * module itself already exists from Increment 6).
 */

import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

interface SeamAgentOrchestrationPortWithActivity {
	readonly sessions: {
		getRecentActivity(
			sessionId: string,
		): Promise<ReadonlyArray<{ readonly type: string; readonly timestamp: number }>>;
	};
}

afterEach(() => {
	// @lore shared-integration-workers: auth env belongs to this file and
	// must not turn the next file's unauthenticated fixture requests into 401s.
	vi.unstubAllEnvs();
});

describe("AgentOrchestrationPort — session-activity gateway (§9 Increment 7)", () => {
	test("reaches a real per-session activity route and returns entries the relocated buffer recorded", async ({
		db: _db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-activity-happy");

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-activity-happy",
			sessionId: "sess-activity-happy",
			toolName: "bash",
			argsSummary: 'cmd="ls -la"',
			timestamp: Date.now(),
		});

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPortWithActivity;

		const entries = await port.sessions.getRecentActivity("sess-activity-happy");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.type).toBe("tool_call");
	});

	test("returns an empty array through the port for a session with no recorded activity", async ({
		db: _db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-activity-empty");

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPortWithActivity;

		await expect(port.sessions.getRecentActivity("sess-never-active")).resolves.toEqual([]);
	});

	test("isolates activity entries per session id through the port", async ({
		db: _db,
		app,
		eventBus,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-activity-isolate");

		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-activity-a",
			sessionId: "sess-activity-a",
			toolName: "bash",
			argsSummary: "cmd-a",
			timestamp: Date.now(),
		});
		eventBus.emit({
			type: "tool_call_recorded",
			streamId: "sess-activity-b",
			sessionId: "sess-activity-b",
			toolName: "write_file",
			argsSummary: "cmd-b",
			timestamp: Date.now(),
		});

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPortWithActivity;

		const a = await port.sessions.getRecentActivity("sess-activity-a");
		const b = await port.sessions.getRecentActivity("sess-activity-b");
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});
});
