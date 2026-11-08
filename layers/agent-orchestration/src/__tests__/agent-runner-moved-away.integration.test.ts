/**
 * When an agent's key is cleared (keyHash set to null) after a default-runner
 * change, the runner's moved-away memory must not block taking it again.
 * hasKey === false means the previous key is gone — moved-away is stale.
 */

import type { EventBus } from "@hyperidle/event-bus";
import { markAgentRunnerKeyMovedAway, persistAgentRunnerKey } from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { type AgentRunnerDeps, createAgentRunner } from "../runner/agent-runner.js";
import type { DoorResult } from "../runner/core-door.js";

const PERSON_ID = "person-ma-1";
const PERSON_KEY = "key-person-ma";
const AGENT_ID = "agent-ma-team";
const NOW = "2026-10-01T00:00:00.000Z";

function buildDoor(agentHasKey: { value: boolean }): AgentRunnerDeps["door"] {
	return {
		call<O>(_key: string, action: string, _input: unknown): Promise<DoorResult<O>> {
			if (action === "open_user") {
				return Promise.resolve({
					ok: true,
					data: {
						user: {
							id: PERSON_ID,
							kind: "human",
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
							hasKey: true,
							teams: [
								{ id: "team-ma", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
							],
							edges: [],
						},
						documentIds: [],
						subscriptions: [],
						inbox: null,
					} as O,
				});
			}
			if (action === "search_users") {
				return Promise.resolve({
					ok: true,
					data: [
						{
							id: AGENT_ID,
							kind: "ai" as const,
							name: "Team Bot",
							role: "agent",
							status: "active",
							avatarUrl: null,
							createdAt: NOW,
							agentCategory: null,
							ownerUserId: null,
							health: null,
							discipline: null,
							what: null,
							hasKey: agentHasKey.value,
							edges: [],
							teams: [
								{ id: "team-ma", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
							],
						},
					] as O,
				});
			}
			if (action === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: {
						key: "new-agent-key",
						user: {
							id: AGENT_ID,
							kind: "ai" as const,
							name: "Team Bot",
							role: "agent",
							status: "active",
							avatarUrl: null,
							createdAt: NOW,
							agentCategory: null,
							ownerUserId: null,
							health: null,
							discipline: null,
							what: null,
							hasKey: false,
							edges: [],
							teams: [
								{ id: "team-ma", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
							],
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
}

describe("agent runner moved-away with no key", () => {
	test("takes a moved-away agent again when it has no key (key was cleared)", async ({
		runnerDb,
		eventBus,
	}: {
		runnerDb: RunnerDb;
		eventBus: EventBus;
	}) => {
		// Pre-seed the agent as moved-away (simulates: runner held agent, got 401, now key cleared).
		await persistAgentRunnerKey(runnerDb, AGENT_ID, "old-key");
		await markAgentRunnerKeyMovedAway(runnerDb, AGENT_ID);

		const agentHasKey = { value: false }; // key was cleared

		const runner = createAgentRunner({
			db: runnerDb,
			eventBus,
			door: buildDoor(agentHasKey),
			personKey: () => PERSON_KEY,
			subscribeInbox: (_agentId, _onNudge) => () => undefined,
		});

		// start() loads moved-away from DB → agent in movedAway; agent.hasKey is false
		// → fix clears movedAway → runner takes the agent
		await runner.start();

		expect(runner.heldAgentIds()).toContain(AGENT_ID);
		expect(runner.movedAwayAgentIds()).not.toContain(AGENT_ID);

		await runner.stop();
	});
});
