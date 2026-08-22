/**
 * The live session stream is `agent-orchestration`'s own — transport, topic
 * space and authorization all sit on the Layer that owns the `sessions` table.
 *
 * Founder ruling (2026-08-04): *"session dial in is 1000% orchestration and has
 * nothing to do with core. core should not know about this session live stuff at
 * all."* Core's socket keeps only its own topics (`threads`, `conversations`,
 * `work`); `session:<id>` moved here, onto this Layer's own app.
 *
 * Authorization is **an authenticated user plus the run exists** — one read of
 * this Layer's own table and nothing else. That is what the core-hosted check
 * already amounted to on the task-backed path (it read the run, read the task,
 * and returned "the task exists", which every authenticated principal passes);
 * the `threads`/`users`/`team_members` reads it also carried are gone, because
 * they were core tables this Layer must never touch.
 */

import { bets, type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import {
	createRunStreamSubscribeAuthorizer,
	type SessionStreamClient,
	SessionStreamHub,
} from "../session-stream-hub.js";

function createMockClient(): SessionStreamClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

const NOW = "2026-08-04T00:00:00.000Z";

/** The FK chain a run row needs: a team, a bet, a task and two users. */
async function seedRunHosts(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: NOW });
	// The owner writes the membership row alongside the team.
	await db.insert(users).values([
		{ id: "agent-1", kind: "ai", name: "Agent", role: "builder", status: "idle", createdAt: NOW },
		{
			id: "ast-1",
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "idle",
			createdAt: NOW,
		},
	]);
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "team-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "team-1",
		title: "Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("session stream hub", () => {
	dbTest("an authenticated user may subscribe to an existing run", async ({ db }) => {
		await seedRunHosts(db);
		await db.insert(sessions).values({
			id: "run-1",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client, "user-1");

		expect(await hub.subscribe(client, "session:run-1")).toBe("ok");
	});

	dbTest("a task-free run is reachable by any authenticated user too", async ({ db }) => {
		await seedRunHosts(db);
		await db.insert(sessions).values({
			id: "run-assistant",
			agentId: "ast-1",
			taskId: null,
			sourceKind: "assistant",
			sourceId: "msg-1",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thr-1",
				messageId: "msg-1",
				userId: "u-founder",
				assistantAgentId: "ast-1",
			}),
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client, "u-other");

		expect(await hub.subscribe(client, "session:run-assistant")).toBe("ok");
	});

	dbTest("an unknown run is denied — fail-closed", async ({ db }) => {
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client, "user-1");

		expect(await hub.subscribe(client, "session:no-such-run")).toBe("forbidden");
		expect(await hub.subscribe(client, "session:")).toBe("forbidden");
	});

	dbTest("an unauthenticated client is denied", async ({ db }) => {
		await seedRunHosts(db);
		await db.insert(sessions).values({
			id: "run-1",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client); // no bound identity

		expect(await hub.subscribe(client, "session:run-1")).toBe("forbidden");
	});

	dbTest("core's own topics are not served here", async ({ db }) => {
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client, "user-1");

		expect(await hub.subscribe(client, "thread:thr-1")).toBe("forbidden");
		expect(await hub.subscribe(client, "conversations")).toBe("forbidden");
		expect(await hub.subscribe(client, "work")).toBe("forbidden");
	});

	dbTest("a denied client never joins the topic and receives no broadcast", async ({ db }) => {
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const denied = createMockClient();
		hub.addClient(denied, "user-1");
		expect(await hub.subscribe(denied, "session:no-such-run")).toBe("forbidden");

		hub.broadcast("session:no-such-run", JSON.stringify({ type: "tool_call_recorded" }));
		expect(denied.messages).toEqual([]);
	});

	dbTest("a subscribed client receives broadcasts until it unsubscribes", async ({ db }) => {
		await seedRunHosts(db);
		await db.insert(sessions).values({
			id: "run-1",
			agentId: "agent-1",
			taskId: "task-1",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const client = createMockClient();
		hub.addClient(client, "user-1");
		await hub.subscribe(client, "session:run-1");

		hub.broadcast("session:run-1", "first");
		expect(client.messages).toEqual(["first"]);

		hub.unsubscribe(client, "session:run-1");
		hub.broadcast("session:run-1", "second");
		expect(client.messages).toEqual(["first"]);
	});

	dbTest("an unregistered client reports unknown_client", async ({ db }) => {
		const hub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
		const stranger = createMockClient();

		expect(await hub.subscribe(stranger, "session:run-1")).toBe("unknown_client");
		expect(hub.unsubscribe(stranger, "session:run-1")).toBe("unknown_client");
	});
});
