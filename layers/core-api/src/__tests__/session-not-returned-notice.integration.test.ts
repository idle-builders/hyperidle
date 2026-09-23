/**
 * @lore The never-silent net (AU27 Increment 5, Decision 5), re-pointed at
 * today's door. Recreates `conversation/src/__tests__/session-not-returned-notice.integration.test.ts`
 * (deleted with the `@hyperidle/conversation` package), asserting the same
 * behaviour through `send_message`/`open_thread` instead of a raw
 * `insertMessage`/direct `messages` read.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { agentWorkIntents, type HyperIdleDb, messages, teams, threads, users } from "@hyperidle/db";
import type { ThreadView } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import type { SendMessageRunFn } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";
import {
	registerSessionNotReturnedNotice,
	SESSION_NOT_RETURNED_NOTICE_TEXT,
} from "../services/session-not-returned-notice.js";

const TEST_API_KEY = "test-key-session-not-returned-notice";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/** `changes.actor`/`threads.initiatorId` FK to `users` — every seed needs these two real rows. */
async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now });
	await db
		.insert(users)
		.values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: now,
			},
		])
		.onConflictDoNothing();
}

async function seedAgent(db: HyperIdleDb, agentId: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		teamId,
		createdAt: now,
	});
}

/**
 * The session's calling thread — team-hosted (a task's thread is always
 * team-hosted), with the not-returning agent as
 * its only member, so a plain notice with no `@mention` wakes nobody
 * (`agentsToWake` only fires on a mention or a 2-member DM with the OTHER
 * member an agent — neither applies here).
 */
async function seedCallingThread(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	agentId: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: JSON.stringify([agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
}

function buildRealSendMessage(agentOrchestration: AgentOrchestrationPort): SendMessageRunFn {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
		reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
	});
	const sendMessageAction = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessageAction) throw new Error("send_message action not found");
	return sendMessageAction.run as unknown as SendMessageRunFn;
}

async function flush(): Promise<void> {
	// `reactToSessionNotReturned` runs fire-and-forget internally — flush the
	// microtask queue so its `await sendMessage(...)` has settled.
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("registerSessionNotReturnedNotice — the never-silent net, through send_message/open_thread", () => {
	test("a not_returned session WITH a callingThreadId gets exactly one notice in that thread, sent by the agent, with no wake", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "snr-team-1");
		await seedAgent(db, "snr-agent-1", "snr-team-1");
		await seedCallingThread(db, "snr-thread-1", "snr-team-1", "snr-agent-1");

		const sendMessage = buildRealSendMessage(agentOrchestration);
		const unregister = registerSessionNotReturnedNotice(db, eventBus, sendMessage);

		eventBus.emit({
			type: "session_not_returned",
			streamId: "snr-session-1",
			sessionId: "snr-session-1",
			agentId: "snr-agent-1",
			taskId: null,
			callingThreadId: "snr-thread-1",
			timestamp: Date.now(),
		});
		await flush();

		const opened = await call<ThreadView>(app, "open_thread", { id: "snr-thread-1" });
		expect(opened.status).toBe(200);
		expect(opened.body.data?.messages).toHaveLength(1);
		const posted = opened.body.data?.messages[0];
		expect(posted?.senderId).toBe("snr-agent-1");
		const payload = posted?.payload as { text?: string };
		expect(payload.text).toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);

		const woken = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(woken).toHaveLength(0);

		unregister();
	});

	test("a not_returned session WITHOUT a callingThreadId (e.g. task_run) posts nothing and never throws", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "snr-team-2");
		await seedAgent(db, "snr-agent-2", "snr-team-2");

		const sendMessage = buildRealSendMessage(agentOrchestration);
		const unregister = registerSessionNotReturnedNotice(db, eventBus, sendMessage);

		expect(() => {
			eventBus.emit({
				type: "session_not_returned",
				streamId: "snr-session-2",
				sessionId: "snr-session-2",
				agentId: "snr-agent-2",
				taskId: "snr-task-2",
				sourceCorrelation: { taskId: "snr-task-2", teamId: "snr-team-2" },
				timestamp: Date.now(),
			});
		}).not.toThrow();
		await flush();

		const rows = await db.select().from(messages);
		expect(rows).toHaveLength(0);

		unregister();
	});

	test("is idempotent per eventBus instance — a second registration is a no-op disposer", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "snr-team-3");
		await seedAgent(db, "snr-agent-3", "snr-team-3");
		await seedCallingThread(db, "snr-thread-3", "snr-team-3", "snr-agent-3");

		const sendMessage = buildRealSendMessage(agentOrchestration);
		const first = registerSessionNotReturnedNotice(db, eventBus, sendMessage);
		const second = registerSessionNotReturnedNotice(db, eventBus, sendMessage);

		eventBus.emit({
			type: "session_not_returned",
			streamId: "snr-session-3",
			sessionId: "snr-session-3",
			agentId: "snr-agent-3",
			taskId: null,
			callingThreadId: "snr-thread-3",
			timestamp: Date.now(),
		});
		await flush();

		// A double registration must not double-post.
		const rows = await db.select().from(messages).where(eq(messages.threadId, "snr-thread-3"));
		expect(rows).toHaveLength(1);

		second();
		first();
	});
});
