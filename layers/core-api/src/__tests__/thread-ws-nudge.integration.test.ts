/**
 * The server half of the websocket nudge — architecture.md §3.12 (locked as
 * the nudge reading) / §5 B8.
 *
 * After commit, `send_message`/`adjust_thread` push the `changes` row
 * itself, once per row, on both `thread:<threadId>` and `conversations`,
 * the unchanged envelope `{type, topic, kind, data}`. The message body
 * never rides `conversations` — only the thread id, message id, sender and
 * members do.
 *
 * Direct `action.run()` calls (same door `thread-actions.integration.test.ts`
 * uses for `ctx.caller`-independent cases): `buildCoreActions`'s `wsPush`
 * binding is wired to a fake capturing sink, proving the dep is exactly the
 * optional `hub?.broadcast(topic, json)` shape — no hub, no push, no throw.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, teams, threads, users } from "@hyperidle/db";
import type {
	ActionResult,
	AdjustThreadInput,
	SendMessageInput,
	SendMessageOutput,
	ThreadView,
} from "@hyperidle/domain-model";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";

const FOUNDER_ID = "u-founder";

interface CapturedBroadcast {
	readonly topic: string;
	readonly envelope: {
		readonly type: string;
		readonly topic: string;
		readonly kind: string;
		readonly data: {
			readonly id: string;
			readonly object: string;
			readonly objectId: string;
			readonly kind: string;
			readonly actor: string;
			readonly before: unknown;
			readonly after: Record<string, unknown>;
			readonly at: string;
		};
	};
}

function buildActionsWithHub(agentOrchestration: AgentOrchestrationPort, broadcasts: CapturedBroadcast[]) {
	return buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
		reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
		wsPush: (topic: string, envelope: unknown) => {
			broadcasts.push({ topic, envelope: envelope as CapturedBroadcast["envelope"] });
		},
	});
}

function runnerFor<I, O>(actions: ReturnType<typeof buildActionsWithHub>, name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
	await db
		.insert(users)
		.values([{ id: FOUNDER_ID, kind: "human", name: "Founder", role: "founder", status: "active", createdAt: now }])
		.onConflictDoNothing();
}

async function seedHuman(db: HyperIdleDb, id: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({ id, kind: "human", name: id, role: "member", status: "active", teamId, createdAt: now });
}

async function seedThreadRow(
	db: HyperIdleDb,
	id: string,
	opts: { hostKind: string; hostId: string; initiatorId: string; members: readonly string[]; resolvedAt?: string | null },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: opts.hostKind,
		hostId: opts.hostId,
		initiatorId: opts.initiatorId,
		participants: JSON.stringify(opts.members),
		pinned: false,
		resolvedAt: opts.resolvedAt ?? null,
		lastActiveAt: now,
		createdAt: now,
	});
}

function ctxFor(db: HyperIdleDb, eventBus: ActionContext["eventBus"], actor: string): ActionContext {
	return { actor, db, eventBus, now: new Date().toISOString() };
}

describe("send_message — the websocket nudge", () => {
	test("a new-thread send broadcasts created+message on both topics, redacted on conversations", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedTeam(db, "nudge-team-1");
		await seedHuman(db, "nudge-human-1", "nudge-team-1");

		const broadcasts: CapturedBroadcast[] = [];
		const actions = buildActionsWithHub(agentOrchestration, broadcasts);
		const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");

		const result = await sendMessage(ctxFor(db, eventBus, FOUNDER_ID), {
			recipients: ["nudge-human-1"],
			text: "secret message body",
		});
		expect(result.ok).toBe(true);
		const threadId = (result as { ok: true; data: SendMessageOutput }).data.thread.id;

		expect(broadcasts).toHaveLength(4);
		const kinds = broadcasts.map((b) => b.envelope.kind).sort();
		expect(kinds).toEqual(["thread.created", "thread.created", "thread.message", "thread.message"]);

		const threadTopicRows = broadcasts.filter((b) => b.topic === `thread:${threadId}`);
		expect(threadTopicRows).toHaveLength(2);
		for (const row of threadTopicRows) {
			expect(row.envelope.topic).toBe(`thread:${threadId}`);
			expect(row.envelope.data.objectId).toBe(threadId);
			expect(row.envelope.data.actor).toBe(FOUNDER_ID);
		}
		// the created row's `after` is untouched on `thread:<id>`.
		const threadCreated = threadTopicRows.find((b) => b.envelope.kind === "thread.created");
		expect(threadCreated?.envelope.data.after.hostKind).toBeDefined();
		// the message row's `after` carries the real payload on `thread:<id>`.
		const threadMessage = threadTopicRows.find((b) => b.envelope.kind === "thread.message");
		expect(JSON.stringify(threadMessage?.envelope.data.after)).toContain("secret message body");

		const conversationsRows = broadcasts.filter((b) => b.topic === "conversations");
		expect(conversationsRows).toHaveLength(2);
		for (const row of conversationsRows) expect(row.envelope.topic).toBe("conversations");
		const conversationsMessage = conversationsRows.find((b) => b.envelope.kind === "thread.message");
		expect(conversationsMessage).toBeDefined();
		// the message body never rides `conversations` — no payload/text, only
		// thread id, message id, sender, members.
		const after = conversationsMessage?.envelope.data.after as Record<string, unknown>;
		expect(JSON.stringify(after)).not.toContain("secret message body");
		expect(after.payload).toBeUndefined();
		expect(after.threadId).toBe(threadId);
		expect(after.messageId).toBeDefined();
		expect(after.senderId).toBe(FOUNDER_ID);
	});

	test("a refused send (not a member) broadcasts nothing", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "nudge-team-2");
		await seedHuman(db, "nudge-victim", "nudge-team-2");
		await seedHuman(db, "nudge-stranger", "nudge-team-2");
		await seedThreadRow(db, "nudge-dm-1", {
			hostKind: "user",
			hostId: "nudge-victim",
			initiatorId: "nudge-victim",
			members: [FOUNDER_ID, "nudge-victim"],
		});

		const broadcasts: CapturedBroadcast[] = [];
		const actions = buildActionsWithHub(agentOrchestration, broadcasts);
		const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");

		const result = await sendMessage(ctxFor(db, eventBus, "nudge-stranger"), { threadId: "nudge-dm-1", text: "hi" });
		expect(result.ok).toBe(false);
		expect(broadcasts).toHaveLength(0);
	});

	test("with no hub wired, send_message pushes nothing and does not throw", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "nudge-team-3");
		await seedHuman(db, "nudge-human-3", "nudge-team-3");

		// no `wsPush` in the bindings — the dep is optional (architecture.md §3.12).
		const actions = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
			reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
		});
		const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");

		const result = await sendMessage(ctxFor(db, eventBus, FOUNDER_ID), { recipients: ["nudge-human-3"], text: "no hub here" });
		expect(result.ok).toBe(true);
	});
});

describe("adjust_thread — the websocket nudge", () => {
	test("a resolve broadcasts thread.changed on both topics, unredacted", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "nudge-team-4");
		await seedThreadRow(db, "nudge-thread-4", {
			hostKind: "team",
			hostId: "nudge-team-4",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const broadcasts: CapturedBroadcast[] = [];
		const actions = buildActionsWithHub(agentOrchestration, broadcasts);
		const adjustThread = runnerFor<AdjustThreadInput, ThreadView>(actions, "adjust_thread");

		const result = await adjustThread(ctxFor(db, eventBus, FOUNDER_ID), { id: "nudge-thread-4", resolved: true });
		expect(result.ok).toBe(true);

		expect(broadcasts).toHaveLength(2);
		const kinds = broadcasts.map((b) => b.envelope.kind);
		expect(kinds).toEqual(["thread.changed", "thread.changed"]);
		const topics = broadcasts.map((b) => b.topic).sort();
		expect(topics).toEqual(["conversations", "thread:nudge-thread-4"].sort());
		for (const row of broadcasts) {
			expect(row.envelope.data.objectId).toBe("nudge-thread-4");
			expect((row.envelope.data.after as Record<string, unknown>).resolvedAt).toBeDefined();
		}
	});

	test("a no-op adjust (nothing actually changes) broadcasts nothing", async ({ db, eventBus, agentOrchestration }) => {
		await seedTeam(db, "nudge-team-5");
		await seedThreadRow(db, "nudge-thread-5", {
			hostKind: "team",
			hostId: "nudge-team-5",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			resolvedAt: null,
		});

		const broadcasts: CapturedBroadcast[] = [];
		const actions = buildActionsWithHub(agentOrchestration, broadcasts);
		const adjustThread = runnerFor<AdjustThreadInput, ThreadView>(actions, "adjust_thread");

		// `resolved: false` on an already-unresolved thread changes nothing.
		const result = await adjustThread(ctxFor(db, eventBus, FOUNDER_ID), { id: "nudge-thread-5", resolved: false });
		expect(result.ok).toBe(true);
		expect(broadcasts).toHaveLength(0);
	});
});
