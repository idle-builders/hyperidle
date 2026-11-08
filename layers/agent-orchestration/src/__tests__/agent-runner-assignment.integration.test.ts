/**
 * A runner may only take agents assigned to its person (ownerUserId === personId)
 * or to a team the person is in (ownerUserId === null and agent.teams overlaps
 * the person's teams). Agents assigned to another person or to no one run nowhere.
 */

import type { EventBus } from "@hyperidle/event-bus";
import type { RunnerDb } from "@hyperidle/runner-db";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { type AgentRunnerDeps, createAgentRunner } from "../runner/agent-runner.js";
import type { DoorResult } from "../runner/core-door.js";

const PERSON_ID = "person-assign-1";
const PERSON_KEY = "key-person-assign";
const NOW = "2026-10-01T00:00:00.000Z";

const baseAgent = {
	kind: "ai" as const,
	role: "agent",
	status: "active",
	avatarUrl: null,
	createdAt: NOW,
	agentCategory: null,
	health: null,
	discipline: null,
	what: null,
	hasKey: false,
	edges: [],
};

const agents = [
	// 1. Directly owned by this person → should be taken.
	{ ...baseAgent, id: "agent-own", name: "Own", ownerUserId: PERSON_ID, teams: [] },
	// 2. Unowned but in one of the person's teams, person is default runner → should be taken.
	{
		...baseAgent,
		id: "agent-team",
		name: "Team",
		ownerUserId: null,
		teams: [{ id: "team-1", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID }],
	},
	// 3. Unowned but in a different team → should NOT be taken.
	{
		...baseAgent,
		id: "agent-other",
		name: "Other",
		ownerUserId: null,
		teams: [{ id: "team-2", name: "Beta", isGlobal: false, defaultRunnerId: null }],
	},
	// 4. Unowned with no team → should NOT be taken.
	{ ...baseAgent, id: "agent-none", name: "None", ownerUserId: null, teams: [] },
];

function buildDoor(): AgentRunnerDeps["door"] {
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
							teams: [{ id: "team-1", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID }],
							edges: [],
						},
						documentIds: [],
						subscriptions: [],
						inbox: null,
					} as O,
				});
			}
			if (action === "search_users") {
				return Promise.resolve({ ok: true, data: agents as O });
			}
			if (action === "edit_user") {
				const { id } = _input as { id: string };
				return Promise.resolve({
					ok: true,
					data: {
						key: `key-for-${id}`,
						user: agents.find((a) => a.id === id) ?? agents[0],
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

async function setup(runnerDb: RunnerDb, eventBus: EventBus) {
	const runner = createAgentRunner({
		db: runnerDb,
		eventBus,
		door: buildDoor(),
		personKey: () => PERSON_KEY,
		subscribeInbox: (_agentId, _onNudge) => () => undefined,
	});
	return runner;
}

describe("agent runner assignment filtering", () => {
	test("takes only agents assigned to the person or in the person's teams", async ({
		runnerDb,
		eventBus,
	}) => {
		const runner = await setup(runnerDb, eventBus);
		await runner.start();

		const held = runner.heldAgentIds();

		// Own agent and team agent are taken.
		expect(held).toContain("agent-own");
		expect(held).toContain("agent-team");

		// Agent in a different team and unassigned agent are not taken.
		expect(held).not.toContain("agent-other");
		expect(held).not.toContain("agent-none");

		await runner.stop();
	});
});
