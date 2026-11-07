/**
 * The agent runner gives up on a row that keeps failing and moves on to later rows.
 * Tested at the module tier — `createAgentRunner` with a fake door (a port it doesn't own)
 * and a real runner-db, so the retry counter and DB writes are production code.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CoreDoor, DoorResult } from "@hyperidle/agent-orchestration";
import { type AgentRunnerDeps, createAgentRunner } from "@hyperidle/agent-orchestration";
import { EventBus } from "@hyperidle/event-bus";
import {
	type AgentSessionRequest,
	agentRunnerKeys,
	agentSessionRequests,
	createAndMigrateRunnerDb,
	type RunnerDb,
} from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// ---- Fake-door helpers ----

const AGENT_ID = "agent-row-failure-test";
const AGENT_KEY = "test-key-row-failure";
const TEAM_ID = "team-row-failure";
const FAIL_TASK_ID = "task-that-fails";
const OK_TASK_ID = "task-that-succeeds";
const THREAD_ID = "thread-row-failure";

/** Minimal UserRow for the agent. */
const fakeUser = {
	id: AGENT_ID,
	kind: "ai" as const,
	name: "Bot",
	role: "builder",
	status: "active" as const,
	avatarUrl: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	agentCategory: null,
	ownerUserId: null,
	health: null,
	discipline: null,
	what: null,
	hasKey: true,
	teams: [{ id: TEAM_ID, name: "Team" }],
	edges: [],
};

/** Minimal TaskView data for a task that can be queued. */
function fakeTask(id: string) {
	return {
		task: {
			id,
			teamId: TEAM_ID,
			threadId: THREAD_ID,
			state: "accepted",
			ownerAgentId: AGENT_ID,
			title: "task",
			description: null,
			doneWhen: [],
			paused: null,
			reasons: [],
		},
		ancestors: [],
	};
}

// ---- Setup ----

let tempDataDir: string;
let runnerDb: RunnerDb;

beforeEach(async () => {
	tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-row-failure-"));
	const handle = await createAndMigrateRunnerDb(path.join(tempDataDir, "runner-pg"));
	runnerDb = handle.db;
	await runnerDb.insert(agentRunnerKeys).values({
		agentId: AGENT_ID,
		agentKey: AGENT_KEY,
		movedAway: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	});
});

afterEach(async () => {
	try {
		fs.rmSync(tempDataDir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

// ---- Test ----

describe("agent runner row failure limit", () => {
	test("a row that keeps failing is given up after 3 tries and later rows are still acted on", async () => {
		// Two inbox rows: one will fail three times (triggering given-up), one will succeed.
		const inboxRows = [
			{
				id: "row-fail",
				reason: "task_run" as const,
				objectId: FAIL_TASK_ID,
				change: null,
				subscriptionId: null,
				createdAt: "2026-01-01T00:00:00.100Z",
				seenAt: null,
				readAt: null,
			},
			{
				id: "row-ok",
				reason: "task_run" as const,
				objectId: OK_TASK_ID,
				change: null,
				subscriptionId: null,
				createdAt: "2026-01-01T00:00:00.200Z",
				seenAt: null,
				readAt: null,
			},
		];
		const readRows = new Set<string>();
		const sentMessages: { key: string; action: string }[] = [];

		let failAttempts = 0;

		const fakeDoor: CoreDoor = {
			async call<O>(key: string, action: string, input: unknown): Promise<DoorResult<O>> {
				if (action === "open_user") {
					// Return only unread rows.
					const unread = inboxRows.filter((r) => !readRows.has(r.id));
					return {
						ok: true,
						data: {
							user: fakeUser,
							inbox: unread,
							documentIds: [],
							subscriptions: [],
						} as unknown as O,
					};
				}

				if (action === "edit_user") {
					// Mark rows as read.
					const { inbox } = (input ?? {}) as { inbox?: { read?: string[] } };
					for (const id of inbox?.read ?? []) {
						readRows.add(id);
					}
					return {
						ok: true,
						data: {
							user: fakeUser,
							inbox: null,
							documentIds: [],
							subscriptions: [],
						} as unknown as O,
					};
				}

				if (action === "open_task") {
					const { id } = (input ?? {}) as { id?: string };
					if (id === FAIL_TASK_ID) {
						if (failAttempts < 3) {
							failAttempts++;
							// Non-NothingToDo error — triggers the ROW_FAILURE_LIMIT counter.
							throw new Error(`simulated server error (attempt ${failAttempts})`);
						}
						// 4th call is from postFailureNotice — return valid task so the notice is sent.
						return { ok: true, data: fakeTask(id) as unknown as O };
					}
					return { ok: true, data: fakeTask(id ?? OK_TASK_ID) as unknown as O };
				}

				if (action === "search_documents") {
					return { ok: true, data: [] as unknown as O };
				}

				if (action === "send_message") {
					sentMessages.push({ key, action });
					return { ok: true, data: {} as O };
				}

				return { ok: true, data: {} as O };
			},
		};

		const eventBus = new EventBus();

		// Capture the inbox nudge callback so the test can re-trigger drains without a sweep.
		let triggerDrain: (() => void) | undefined;
		const deps: AgentRunnerDeps = {
			db: runnerDb,
			eventBus,
			door: fakeDoor,
			personKey: () => undefined,
			subscribeInbox: (_agentId, onNudge) => {
				triggerDrain = onNudge;
				return () => {
					triggerDrain = undefined;
				};
			},
		};

		const runner = createAgentRunner(deps);
		await runner.start();

		// Wait until both rows are marked read (meaning row-ok was acted on
		// and row-fail was given up after 3 failures). Nudge the drain on each
		// poll iteration to replay failed rows without relying on the sweep timer.
		const deadline = Date.now() + 15_000;
		for (;;) {
			const allRead = readRows.has("row-fail") && readRows.has("row-ok");
			if (allRead) break;
			if (Date.now() > deadline) throw new Error("timed out waiting for rows to be marked read");
			triggerDrain?.();
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		await runner.stop();

		// The failing task was attempted exactly 3 times before giving up.
		expect(failAttempts).toBe(3);

		// The ok task row was queued as a session request.
		const requests = await runnerDb
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.agentId, AGENT_ID));
		expect(requests.some((r: AgentSessionRequest) => r.sourceId === OK_TASK_ID)).toBe(true);

		// A failure notice was sent after the row was given up.
		expect(sentMessages.length).toBeGreaterThan(0);
	}, 30_000);
});
