/**
 * takeAgent on an already-held agent must tear down the old WS subscription and
 * re-subscribe with the new key so inbox nudges keep arriving.
 */

import type { EventBus } from "@hyperidle/event-bus";
import { persistAgentRunnerKey } from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import { describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import {
	type AgentRunner,
	type AgentRunnerDeps,
	createAgentRunner,
} from "../runner/agent-runner.js";
import type { DoorResult } from "../runner/core-door.js";

const AGENT_ID = "agent-resubscribe";
const KEY1 = "key-resubscribe-1";
const KEY2 = "key-resubscribe-2";
const PERSON_KEY = "person-key-resubscribe";
const NOW = "2026-10-01T00:00:00.000Z";

async function setup(runnerDb: RunnerDb, eventBus: EventBus) {
	await persistAgentRunnerKey(runnerDb, AGENT_ID, KEY1);

	const unsubscribeSpy = vi.fn();
	let subscribeCallCount = 0;
	const subscribeInbox = vi.fn((_agentId: string, _onNudge: () => void) => {
		subscribeCallCount++;
		return unsubscribeSpy;
	});

	/** Keys used in open_user inbox drain calls (unread: true). Used to assert KEY2 after takeAgent. */
	const inboxDrainKeys: string[] = [];

	const door: AgentRunnerDeps["door"] = {
		call<O>(key: string, action: string, input: unknown): Promise<DoorResult<O>> {
			if (action === "open_user") {
				if ((input as Record<string, unknown>)?.unread === true) inboxDrainKeys.push(key);
				return Promise.resolve({
					ok: true,
					data: {
						user: {
							id: AGENT_ID,
							kind: "person",
							name: "Person",
							role: "admin",
							status: "active",
							avatarUrl: null,
							createdAt: NOW,
							agentCategory: null,
							ownerUserId: null,
							health: null,
							discipline: null,
							what: null,
							hasKey: false,
							teams: [],
							edges: [],
						},
						documentIds: [],
						subscriptions: [],
						inbox: null,
					} as O,
				});
			}
			if (action === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: {
						key: KEY2,
						user: {
							id: AGENT_ID,
							kind: "ai",
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
						},
						documentIds: [],
						subscriptions: [],
						inbox: null,
					} as O,
				});
			}
			return Promise.resolve({
				ok: false,
				problems: [{ code: "not_found", message: "not found" }],
			});
		},
	};

	const runner: AgentRunner = createAgentRunner({
		db: runnerDb,
		eventBus,
		door,
		personKey: () => PERSON_KEY,
		subscribeInbox,
	});

	return { runner, unsubscribeSpy, subscribeCallCount: () => subscribeCallCount, inboxDrainKeys };
}

describe("agent runner takeAgent re-subscribe", () => {
	test("tears down the old WS subscription and re-subscribes when key is rotated on a held agent", async ({
		runnerDb,
		eventBus,
	}) => {
		const { runner, unsubscribeSpy, subscribeCallCount, inboxDrainKeys } = await setup(
			runnerDb,
			eventBus,
		);

		// start() loads the persisted key and activates the agent (1st subscribe call).
		await runner.start();
		expect(subscribeCallCount()).toBe(1);
		expect(runner.heldAgentIds()).toContain(AGENT_ID);

		const beforeTake = subscribeCallCount();

		// takeAgent on an already-held agent should swap the key and re-subscribe.
		await runner.takeAgent(AGENT_ID);

		// Old subscription must be torn down.
		expect(unsubscribeSpy).toHaveBeenCalledOnce();
		// A fresh subscription must be registered.
		expect(subscribeCallCount()).toBe(beforeTake + 1);
		// The runner still holds the agent with the new key.
		expect(runner.heldAgentIds()).toContain(AGENT_ID);
		expect(runner.keyFor(AGENT_ID)).toBe(KEY2);

		await runner.stop();
		// stop() awaits all in-flight drains, so the drain triggered by activateAgent(KEY2)
		// is now complete. Assert that the last inbox pass used KEY2 (not the old KEY1).
		expect(inboxDrainKeys.at(-1)).toBe(KEY2);
	});
});
