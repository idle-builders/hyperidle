/**
 * On a 401 (key invalidated), the runner stops the agent's live harness sessions
 * on this runner so they do not keep going with a stale key.
 */

import type { EventBus } from "@hyperidle/event-bus";
import { persistAgentRunnerKey } from "@hyperidle/run-orchestration";
import { type RunnerDb, sessions } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import {
	type AgentRunner,
	type AgentRunnerDeps,
	createAgentRunner,
} from "../runner/agent-runner.js";
import { DoorError, type DoorResult } from "../runner/core-door.js";

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
		call<O>(_key: string, _action: string, _input: unknown): Promise<DoorResult<O>> {
			// Person key calls get a not-found so lookForAgents exits without taking new agents.
			// Agent key calls throw 401 to simulate the key being invalidated on another runner.
			if (_key === AGENT_KEY) {
				throw new DoorError("key invalidated", 401);
			}
			return Promise.resolve({
				ok: false,
				problems: [{ code: "not_found", message: "not found" }],
			});
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
