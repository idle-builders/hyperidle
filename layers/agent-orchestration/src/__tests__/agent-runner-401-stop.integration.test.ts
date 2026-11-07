/**
 * On a 401 (key invalidated), the runner stops the agent's live harness sessions
 * on this runner so they do not keep going with a stale key.
 */

import { EventBus } from "@hyperidle/event-bus";
import {
	loadHeldAgentRunnerKeys,
	persistAgentRunnerKey,
} from "@hyperidle/run-orchestration";
import { agentRunnerKeys, sessions, type RunnerDb } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import {
	type AgentRunner,
	type AgentRunnerDeps,
	createAgentRunner,
} from "../runner/agent-runner.js";
import { DoorError } from "../runner/core-door.js";

const AGENT_ID = "agent-401stop";
const AGENT_KEY = "key-401stop";
const SESSION_ID = "session-401stop";
const NOW = "2026-10-01T00:00:00.000Z";

async function setup(runnerDb: RunnerDb, eventBus: EventBus): Promise<AgentRunner> {
	await persistAgentRunnerKey(runnerDb, AGENT_ID, AGENT_KEY);
	await runnerDb.insert(sessions).values({
		id: SESSION_ID,
		agentId: AGENT_ID,
		modelTier: "workhorse",
		startedAt: NOW,
		state: "active",
	});

	const door: AgentRunnerDeps["door"] = {
		call(_key, _action, _input) {
			throw new DoorError("key invalidated", 401);
		},
	};
	const runner = createAgentRunner({
		db: runnerDb,
		eventBus,
		door,
		personKey: () => "person-key",
		subscribeInbox: (_agentId, _onNudge) => () => undefined,
	});
	return runner;
}

describe("agent runner on 401", () => {
	test("stops the agent's active sessions when the key is invalidated", async ({
		runnerDb,
		eventBus,
	}) => {
		const runner = await setup(runnerDb, eventBus);
		await runner.start();

		// The runner loaded the persisted key, tried open_user, got 401, marked moved-away.
		expect(runner.movedAwayAgentIds()).toContain(AGENT_ID);
		expect(runner.heldAgentIds()).not.toContain(AGENT_ID);

		// The active session should be in a terminal state.
		const [session] = await runnerDb
			.select({ state: sessions.state })
			.from(sessions)
			.where(eq(sessions.id, SESSION_ID));
		expect(session?.state).toBe("stopped");
	});
});
