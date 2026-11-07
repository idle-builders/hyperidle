/**
 * On a 401 (key invalidated), the runner stops the agent's live harness sessions
 * on this runner so they do not keep going with a stale key.
 * Also covers S1 (again honoured after key rotation) and S2 (key guard in markMovedAway).
 */

import type { EventBus } from "@hyperidle/event-bus";
import { persistAgentRunnerKey } from "@hyperidle/run-orchestration";
import { agentSessionRequests, type RunnerDb, sessions } from "@hyperidle/runner-db";
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
const PERSON_KEY = "person-401stop";
const KEY2 = "key-401stop-2";
const NOW = "2026-10-01T00:00:00.000Z";

const fakeAgentUser = {
	id: AGENT_ID,
	kind: "ai" as const,
	name: "Agent",
	role: "builder",
	status: "active",
	avatarUrl: null,
	createdAt: NOW,
	agentCategory: "team",
	ownerUserId: null,
	health: null,
	discipline: null,
	what: null,
	hasKey: true,
	teams: [],
	edges: [],
};

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

	test("honours again after 401 with key rotation: new key's pass runs (S1)", async ({
		runnerDb,
		eventBus,
	}) => {
		await persistAgentRunnerKey(runnerDb, AGENT_ID, AGENT_KEY);

		let resolveKey1Block: (() => void) | undefined;
		const key1Block = new Promise<void>((r) => {
			resolveKey1Block = r;
		});
		const keysUsed: string[] = [];

		const door: AgentRunnerDeps["door"] = {
			async call<O>(key: string, action: string, _input: unknown): Promise<DoorResult<O>> {
				keysUsed.push(key);
				if (key === AGENT_KEY) {
					await key1Block;
					throw new DoorError("key invalidated", 401);
				}
				if (key === PERSON_KEY && action === "edit_user") {
					return {
						ok: true,
						data: { key: KEY2, user: fakeAgentUser, documentIds: [], subscriptions: [], inbox: null } as O,
					};
				}
				if (action === "search_users") {
					// Return empty list so lookForAgents does not try to take any agent.
					return { ok: true, data: [] as O };
				}
				// KEY2 and person key non-edit_user/search_users calls: valid user, empty inbox.
				return {
					ok: true,
					data: { user: fakeAgentUser, documentIds: [], subscriptions: [], inbox: null } as O,
				};
			},
		};

		const runner = createAgentRunner({
			db: runnerDb,
			eventBus,
			door,
			personKey: () => PERSON_KEY,
			subscribeInbox: (_agentId, _onNudge) => () => undefined,
		});

		// Start the runner in the background — drain blocks on KEY1 door.
		const startPromise = runner.start();

		// One event-loop tick so the drain is running and blocked on KEY1.
		await new Promise((r) => setImmediate(r));

		// takeAgent: sets KEY2, calls drain again (adds to `again`).
		await runner.takeAgent(AGENT_ID);

		// Release KEY1: 401 fires. With S1 fix, key changed → continue outer → loop runs with KEY2.
		resolveKey1Block!();
		await startPromise;

		// KEY2 was used in a drain pass (the loop continued with the new key).
		expect(keysUsed).toContain(KEY2);
		// Agent is held with the new key — not moved-away.
		expect(runner.heldAgentIds()).toContain(AGENT_ID);
		expect(runner.movedAwayAgentIds()).not.toContain(AGENT_ID);
	}, 10_000);

	test("concurrent takeAgent during markMovedAway does not cancel its pending requests (S2)", async ({
		runnerDb,
		eventBus,
	}) => {
		await persistAgentRunnerKey(runnerDb, AGENT_ID, AGENT_KEY);
		await runnerDb.insert(agentSessionRequests).values({
			id: "req-s2",
			sourceKind: "message",
			sourceId: "msg-s2",
			streamId: "message:msg-s2",
			agentId: AGENT_ID,
			teamId: "team-s2",
			promptMode: "message",
			idempotencyKey: "req-s2",
			sourceCorrelationJson: JSON.stringify({ threadId: "thr-s2", teamId: "team-s2" }),
			payloadJson: JSON.stringify({ agentConfig: { kind: "ai", status: "active", role: "builder", teamId: "team-s2" } }),
			status: "pending",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const door: AgentRunnerDeps["door"] = {
			call<O>(key: string, action: string, _input: unknown): Promise<DoorResult<O>> {
				if (key === AGENT_KEY) {
					throw new DoorError("key invalidated", 401);
				}
				if (key === PERSON_KEY && action === "edit_user") {
					return Promise.resolve({
						ok: true,
						data: { key: KEY2, user: fakeAgentUser, documentIds: [], subscriptions: [], inbox: null } as O,
					});
				}
				if (action === "search_users") {
					return Promise.resolve({ ok: true, data: [] as O });
				}
				return Promise.resolve({
					ok: true,
					data: { user: fakeAgentUser, documentIds: [], subscriptions: [], inbox: null } as O,
				});
			},
		};

		const runner = createAgentRunner({
			db: runnerDb,
			eventBus,
			door,
			personKey: () => PERSON_KEY,
			subscribeInbox: (_agentId, _onNudge) => () => undefined,
		});

		// Run start() and takeAgent concurrently: takeAgent interleaves with markMovedAway's
		// await chain (after S1 check: key still KEY1). With S2 guard, cancelAllPendingForAgent
		// is not called after the key changes.
		await Promise.all([runner.start(), runner.takeAgent(AGENT_ID)]);

		const [req] = await runnerDb
			.select({ status: agentSessionRequests.status })
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "req-s2"));
		expect(req?.status).toBe("pending");
	}, 10_000);
});
