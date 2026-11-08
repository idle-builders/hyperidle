/**
 * When an agent is retaken after a drop (key-cleared), any stale `active`
 * sessions from the previous key period must be cleared before the first new
 * run is admitted. Without the cleanup, the provisioner's concurrency check
 * finds the stale row and crashes the first request with ConcurrencyLimitError.
 */

import type { EventBus } from "@hyperidle/event-bus";
import { markAgentRunnerKeyMovedAway, persistAgentRunnerKey } from "@hyperidle/run-orchestration";
import { type RunnerDb, sessions } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { type AgentRunnerDeps, createAgentRunner } from "../runner/agent-runner.js";
import type { DoorResult } from "../runner/core-door.js";

const PERSON_ID = "person-ret-1";
const PERSON_KEY = "key-person-ret";
const AGENT_ID = "agent-ret";
const NOW = "2026-10-01T00:00:00.000Z";
const STALE_SESSION_ID = "stale-sess-ret-1";

function buildDoor(): AgentRunnerDeps["door"] {
	return {
		call<O>(_key: string, action: string, _input: unknown): Promise<DoorResult<O>> {
			if (action === "open_user") {
				return Promise.resolve({
					ok: true,
					data: {
						user: {
							id: PERSON_ID,
							kind: "human" as const,
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
								{ id: "team-ret", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
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
							// hasKey=false → moved-away state is stale → sweep takes the agent
							hasKey: false,
							edges: [],
							teams: [
								{ id: "team-ret", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
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
								{ id: "team-ret", name: "Alpha", isGlobal: false, defaultRunnerId: PERSON_ID },
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

describe("agent runner retake: stale active session cleanup", () => {
	test("retaking an agent via sweep clears stale active sessions so the first new run is not blocked", async ({
		runnerDb,
		eventBus,
	}: {
		runnerDb: RunnerDb;
		eventBus: EventBus;
	}) => {
		// A stale active session left by markMovedAway's abort=true path:
		// markMovedAway called stopSessionRun → abort() returned true (provisioner
		// still running) → stopSessionRun returned "aborted" without updating the row.
		// The provisioner hasn't finished cleanup yet when the agent is retaken.
		await runnerDb.insert(sessions).values({
			id: STALE_SESSION_ID,
			agentId: AGENT_ID,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		// Agent is in moved-away state (401 from previous key), but the key was cleared.
		await persistAgentRunnerKey(runnerDb, AGENT_ID, "old-key");
		await markAgentRunnerKeyMovedAway(runnerDb, AGENT_ID);

		const runner = createAgentRunner({
			db: runnerDb,
			eventBus,
			door: buildDoor(),
			personKey: () => PERSON_KEY,
			subscribeInbox: (_agentId, _onNudge) => () => undefined,
		});

		// start() → sweep → agent.hasKey=false clears stale movedAway → takes new key → activates.
		// The fix: before activating, clear stale active sessions.
		await runner.start();

		expect(runner.heldAgentIds()).toContain(AGENT_ID);

		// The stale active session must be in a terminal state, not "active".
		// Without the fix, this row stays "active" and the provisioner's concurrency
		// check on the first new conversation crashes the run with ConcurrencyLimitError.
		const [staleRow] = await runnerDb
			.select({ state: sessions.state })
			.from(sessions)
			.where(eq(sessions.id, STALE_SESSION_ID));
		expect(staleRow?.state).not.toBe("active");

		await runner.stop();
	});
});
