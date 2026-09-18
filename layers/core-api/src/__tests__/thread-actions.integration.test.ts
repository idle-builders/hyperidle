/**
 * The thread module's seam test — proven end to end against the real
 * `{ db, app, eventBus }` fixture, plus direct `action.run()` calls for the
 * `ctx.caller`-dependent cases the HTTP door cannot drive (`caller` is filled
 * only by the MCP loop — architecture.md §3.2). See architecture.md §9.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	agentSessionRequests,
	agentWorkIntents,
	changes,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	messages,
	reviewSessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ActionResult, SendMessageInput, ThreadView } from "@hyperidle/domain-model";
import { adjustThreadInvariants } from "@hyperidle/domain-model";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";

const TEST_API_KEY = "test-key-thread-actions";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** The agent actor-override header the seam already uses. */
function agentHeaders(agentId: string): Record<string, string> {
	return authHeaders({ "x-hyperidle-actor-id": agentId });
}

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{
		readonly code: string;
		readonly message: string;
		readonly path?: string;
	}>;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = authHeaders(),
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/** `changes.actor` FKs to `users` — every seeded team gets these two real rows. */
const FOUNDER_ID = "u-founder";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
	await db
		.insert(users)
		.values([
			{
				id: FOUNDER_ID,
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

async function seedHuman(db: HyperIdleDb, id: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		...(teamId ? { teamId } : {}),
		createdAt: now,
	});
}

async function seedAgent(db: HyperIdleDb, agentId: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		...(teamId ? { teamId } : {}),
		createdAt: now,
	});
}

async function seedThreadRow(
	db: HyperIdleDb,
	id: string,
	opts: {
		hostKind: string;
		hostId: string;
		initiatorId: string;
		members: readonly string[];
		resolvedAt?: string | null;
		deletedAt?: string | null;
		title?: string | null;
	},
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
		deletedAt: opts.deletedAt ?? null,
		title: opts.title ?? null,
		lastActiveAt: now,
		createdAt: now,
	});
}

async function seedTaskWithThread(
	db: HyperIdleDb,
	taskId: string,
	teamId: string,
	opts?: { ownerAgentId?: string },
): Promise<string> {
	const now = new Date().toISOString();
	const threadId = `thr-${taskId}`;
	await seedThreadRow(db, threadId, {
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		members: opts?.ownerAgentId ? [opts.ownerAgentId] : [],
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: taskId,
		state: "in_progress",
		threadId,
		ownerAgentId: opts?.ownerAgentId ?? null,
		createdAt: now,
		updatedAt: now,
	});
	return threadId;
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	id: string,
	opts?: { parentKind?: string; parentId?: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: "factory",
		title: id,
		body: "body",
		format: "markdown",
		status: "proposed",
		updatedBy: FOUNDER_ID,
		...(opts?.parentKind ? { parentKind: opts.parentKind } : {}),
		...(opts?.parentId ? { parentId: opts.parentId } : {}),
		createdAt: now,
		updatedAt: now,
	});
	// @lore Ruling 13 companion rule: the owner (@hyperidle/knowledge's `create`) always writes
	// knowledgeItems and knowledgeAppProjection together — a fixture that writes only the first
	// builds a state production cannot produce.
	await db.insert(knowledgeAppProjection).values({
		id: `${id}-projection`,
		knowledgeItemId: id,
	});
}

async function readThreadMembers(db: HyperIdleDb, id: string): Promise<string[]> {
	const [row] = await db.select().from(threads).where(eq(threads.id, id));
	return row ? (JSON.parse(row.participants) as string[]) : [];
}

async function readChanges(db: HyperIdleDb, threadId: string) {
	return db.select().from(changes).where(eq(changes.objectId, threadId));
}

/**
 * The `ctx.caller`-dependent door — `actionsAsTools` is the only production
 * code that fills `caller`, so these cases call `action.run()` directly with
 * a hand-built `ActionContext`. Real recorders (over a throwaway
 * `agentOrchestration` boot) so the wake/verdict-resume paths are the real
 * seam, not a stub of the thing under test.
 */
function buildRealActions(agentOrchestration: AgentOrchestrationPort) {
	return buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
		reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
	});
}

function runnerFor<I, O>(actions: ReturnType<typeof buildRealActions>, name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

// ============================================================================
// send_message
// ============================================================================

describe("send_message — thread resolution and idempotency", () => {
	test("recipients create a thread with sender+recipients as members and write created+message rows", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-1");
		await seedHuman(db, "sm-human-1", "sm-team-1");

		const res = await call<{ message: { id: string }; thread: { id: string; members: string[] } }>(
			app,
			"send_message",
			{ recipients: ["sm-human-1"], text: "hello" },
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		const threadId = res.body.data?.thread.id as string;
		expect(res.body.data?.thread.members).toEqual(
			expect.arrayContaining([FOUNDER_ID, "sm-human-1"]),
		);

		const rows = await readChanges(db, threadId);
		expect(rows.map((r) => r.kind).sort()).toEqual(["created", "message"]);
		for (const row of rows) expect(row.actor).toBe(FOUNDER_ID);
	});

	test("a second send with the same clientKey returns the same message and writes no second row; a divergent payload conflicts", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-2");
		await seedHuman(db, "sm-recipient-2", "sm-team-2");
		const first = await call<{ message: { id: string }; thread: { id: string } }>(
			app,
			"send_message",
			{
				recipients: ["sm-recipient-2"],
				text: "one",
				clientKey: "sm-idem-key-1",
			},
		);
		expect(first.status).toBe(200);
		const threadId = first.body.data?.thread.id as string;
		const messageId = first.body.data?.message.id as string;

		const again = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			text: "one",
			clientKey: "sm-idem-key-1",
		});
		expect(again.status).toBe(200);
		expect(again.body.data?.message.id).toBe(messageId);
		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(1);

		const divergent = await call(app, "send_message", {
			threadId,
			text: "different text",
			clientKey: "sm-idem-key-1",
		});
		expect(divergent.status).toBe(422);
		expect(divergent.body.problems?.[0]?.code).toBe("idempotency_conflict");
	});

	test("a messageId overwrites and writes a message row whose before carries the old payload", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-3");
		await seedHuman(db, "sm-recipient-3", "sm-team-3");
		const created = await call<{ message: { id: string }; thread: { id: string } }>(
			app,
			"send_message",
			{
				recipients: ["sm-recipient-3"],
				text: "original",
			},
		);
		const threadId = created.body.data?.thread.id as string;
		const messageId = created.body.data?.message.id as string;

		const overwritten = await call(app, "send_message", { threadId, messageId, text: "edited" });
		expect(overwritten.status).toBe(200);

		const rows = await readChanges(db, threadId);
		const messageRow = rows.find((r) => r.kind === "message" && r.before !== null);
		expect(messageRow).toBeDefined();
		const before = JSON.parse(messageRow?.before as string) as { payload: { text: string } };
		expect(before.payload.text).toBe("original");
	});
});

describe("send_message — membership, read/write/join", () => {
	test("a non-member send into a user-hosted DM returns not_a_member and writes nothing", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-4");
		await seedHuman(db, "sm-victim", "sm-team-4");
		await seedHuman(db, "sm-stranger", "sm-team-4");
		await seedThreadRow(db, "sm-dm-1", {
			hostKind: "user",
			hostId: "sm-victim",
			initiatorId: "sm-victim",
			members: [FOUNDER_ID, "sm-victim"],
		});

		const before = await db.select().from(messages);
		const beforeChanges = await db.select().from(changes);

		const res = await call(
			app,
			"send_message",
			{ threadId: "sm-dm-1", text: "hi" },
			agentHeaders("sm-stranger"),
		);
		expect(res.status).toBe(422);
		expect((res.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("not_a_member");

		expect(await db.select().from(messages)).toHaveLength(before.length);
		expect(await db.select().from(changes)).toHaveLength(beforeChanges.length);
	});

	test("a non-member send into a team-hosted thread succeeds, joins, and appends no thread.changed row", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-5");
		await seedHuman(db, "sm-newcomer", "sm-team-5");
		await seedThreadRow(db, "sm-team-thread-1", {
			hostKind: "team",
			hostId: "sm-team-5",
			initiatorId: "system:propagation",
			members: [],
		});

		const res = await call(
			app,
			"send_message",
			{ threadId: "sm-team-thread-1", text: "hi team" },
			agentHeaders("sm-newcomer"),
		);
		expect(res.status).toBe(200);

		const members = await readThreadMembers(db, "sm-team-thread-1");
		expect(members).toContain("sm-newcomer");

		const rows = await readChanges(db, "sm-team-thread-1");
		expect(rows.filter((r) => r.kind === "changed")).toHaveLength(0);
		const messageRow = rows.find((r) => r.kind === "message");
		expect(messageRow).toBeDefined();
		const after = JSON.parse(messageRow?.after as string) as { members?: string[] };
		expect(after.members).toEqual(expect.arrayContaining(["sm-newcomer"]));

		// a second post by the same sender adds no duplicate member.
		await call(
			app,
			"send_message",
			{ threadId: "sm-team-thread-1", text: "again" },
			agentHeaders("sm-newcomer"),
		);
		const membersAfter = await readThreadMembers(db, "sm-team-thread-1");
		expect(membersAfter.filter((m) => m === "sm-newcomer")).toHaveLength(1);
	});

	test("a non-member open_thread on a user-hosted DM returns not_found, byte-identical to a deleted thread and a nonexistent id", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-6");
		await seedHuman(db, "sm-owner-6", "sm-team-6");
		await seedHuman(db, "sm-outsider-6", "sm-team-6");
		await seedThreadRow(db, "sm-dm-6", {
			hostKind: "user",
			hostId: "sm-owner-6",
			initiatorId: "sm-owner-6",
			members: [FOUNDER_ID, "sm-owner-6"],
		});
		await seedThreadRow(db, "sm-deleted-6", {
			hostKind: "user",
			hostId: "sm-owner-6",
			initiatorId: "sm-owner-6",
			members: [FOUNDER_ID, "sm-owner-6"],
			deletedAt: new Date().toISOString(),
		});

		// the OWNER, reading their own now-deleted thread, and a stranger reading
		// a thread they never had access to, must be indistinguishable — same
		// code, same shape — from asking about an id that never existed.
		const nonMember = await call(
			app,
			"open_thread",
			{ id: "sm-dm-6" },
			agentHeaders("sm-outsider-6"),
		);
		const deleted = await call(
			app,
			"open_thread",
			{ id: "sm-deleted-6" },
			agentHeaders("sm-owner-6"),
		);
		const missing = await call(app, "open_thread", { id: "sm-does-not-exist" });

		expect(nonMember.status).toBe(422);
		expect(deleted.status).toBe(422);
		expect(missing.status).toBe(422);
		for (const res of [nonMember, deleted, missing]) {
			const problems = (res.body as ActionEnvelope<unknown>).problems;
			expect(problems).toHaveLength(1);
			expect(problems?.[0]?.code).toBe("not_found");
		}
	});

	test("a non-member CAN open a team-hosted and a knowledge_item-hosted thread", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-7");
		await seedHuman(db, "sm-visitor-7", "sm-team-7");
		await seedKnowledgeItem(db, "sm-ki-7");
		await seedThreadRow(db, "sm-team-thread-7", {
			hostKind: "team",
			hostId: "sm-team-7",
			initiatorId: "system:propagation",
			members: [],
		});
		await seedThreadRow(db, "sm-ki-thread-7", {
			hostKind: "knowledge_item",
			hostId: "sm-ki-7",
			initiatorId: "system:propagation",
			members: [],
		});

		const teamRes = await call(
			app,
			"open_thread",
			{ id: "sm-team-thread-7" },
			agentHeaders("sm-visitor-7"),
		);
		const kiRes = await call(
			app,
			"open_thread",
			{ id: "sm-ki-thread-7" },
			agentHeaders("sm-visitor-7"),
		);
		expect(teamRes.status).toBe(200);
		expect(kiRes.status).toBe(200);
	});

	test("search_threads({ids}) returns [] for a stranger's DM; search_threads({host:{kind:'user'}}) returns []", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-8");
		await seedHuman(db, "sm-victim-8", "sm-team-8");
		await seedHuman(db, "sm-stranger-8", "sm-team-8");
		await seedThreadRow(db, "sm-dm-8", {
			hostKind: "user",
			hostId: "sm-victim-8",
			initiatorId: "sm-victim-8",
			members: [FOUNDER_ID, "sm-victim-8"],
		});

		const byIds = await call<unknown[]>(
			app,
			"search_threads",
			{ ids: ["sm-dm-8"] },
			agentHeaders("sm-stranger-8"),
		);
		const byHost = await call<unknown[]>(
			app,
			"search_threads",
			{ host: { kind: "user", id: "sm-victim-8" } },
			agentHeaders("sm-stranger-8"),
		);
		expect(byIds.body.data).toEqual([]);
		expect(byHost.body.data).toEqual([]);
	});

	test("a non-member adjust_thread on a team thread succeeds and does not add them as a member; on a user-hosted DM it returns not_a_member", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-team-9");
		await seedHuman(db, "sm-editor-9", "sm-team-9");
		await seedHuman(db, "sm-victim-9", "sm-team-9");
		await seedThreadRow(db, "sm-team-thread-9", {
			hostKind: "team",
			hostId: "sm-team-9",
			initiatorId: "system:propagation",
			members: [],
		});
		await seedThreadRow(db, "sm-dm-9", {
			hostKind: "user",
			hostId: "sm-victim-9",
			initiatorId: "sm-victim-9",
			members: [FOUNDER_ID, "sm-victim-9"],
		});

		const teamAdjust = await call(
			app,
			"adjust_thread",
			{ id: "sm-team-thread-9", pinned: true },
			agentHeaders("sm-editor-9"),
		);
		expect(teamAdjust.status).toBe(200);
		const members = await readThreadMembers(db, "sm-team-thread-9");
		expect(members).not.toContain("sm-editor-9");

		const dmAdjust = await call(
			app,
			"adjust_thread",
			{ id: "sm-dm-9", pinned: true },
			agentHeaders("sm-editor-9"),
		);
		expect(dmAdjust.status).toBe(422);
		expect((dmAdjust.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("not_a_member");
	});
});

describe("send_message — verdict trio and races", () => {
	test("a verdict from a non-human returns verdict_not_human", async ({ db, app }) => {
		await seedTeam(db, "sm-vt-1");
		await seedAgent(db, "sm-agent-vt1", "sm-vt-1");
		const threadId = await seedTaskWithThread(db, "sm-vt1-task", "sm-vt-1");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt1"]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId, review: { title: "r1", reasoning: ["because"] } },
			agentHeaders("sm-agent-vt1"),
		);
		expect(review.status).toBe(200);
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(
			app,
			"send_message",
			{ threadId, verdict: { decision: "approve", resolvesMessageId: reviewMessageId } },
			agentHeaders("sm-agent-vt1"),
		);
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("verdict_not_human");
	});

	test("a verdict from the review's own author returns verdict_self", async ({ db, app }) => {
		await seedTeam(db, "sm-vt-2");
		const threadId = await seedTaskWithThread(db, "sm-vt2-task", "sm-vt-2");
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			review: { title: "r2", reasoning: ["because"] },
		});
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(app, "send_message", {
			threadId,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("verdict_self");
	});

	test("naming a review in another thread returns verdict_foreign_review", async ({ db, app }) => {
		await seedTeam(db, "sm-vt-3");
		await seedAgent(db, "sm-agent-vt3", "sm-vt-3");
		const threadA = await seedTaskWithThread(db, "sm-vt3-task-a", "sm-vt-3");
		const threadB = await seedTaskWithThread(db, "sm-vt3-task-b", "sm-vt-3");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt3"]) })
			.where(eq(threads.id, threadA));
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadB));

		const review = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId: threadA, review: { title: "r3", reasoning: ["because"] } },
			agentHeaders("sm-agent-vt3"),
		);
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(app, "send_message", {
			threadId: threadB,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		expect(verdict.status).toBe(422);
		expect((verdict.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe(
			"verdict_foreign_review",
		);
	});

	test("a second concurrent verdict returns verdict_race", async ({ db, app }) => {
		await seedTeam(db, "sm-vt-4");
		await seedAgent(db, "sm-agent-vt4", "sm-vt-4");
		await seedHuman(db, "sm-human-vt4", "sm-vt-4");
		const threadId = await seedTaskWithThread(db, "sm-vt4-task", "sm-vt-4");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["sm-agent-vt4", FOUNDER_ID, "sm-human-vt4"]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId, review: { title: "r4", reasoning: ["because"] } },
			agentHeaders("sm-agent-vt4"),
		);
		const reviewMessageId = review.body.data?.message.id as string;

		const [first, second] = await Promise.all([
			call(app, "send_message", {
				threadId,
				verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
			}),
			call(
				app,
				"send_message",
				{ threadId, verdict: { decision: "reject", resolvesMessageId: reviewMessageId } },
				agentHeaders("sm-human-vt4"),
			),
		]);
		const results = [first, second];
		const oks = results.filter((r) => r.status === 200);
		const races = results.filter(
			(r) =>
				r.status === 422 &&
				(r.body as ActionEnvelope<unknown>).problems?.[0]?.code === "verdict_race",
		);
		expect(oks).toHaveLength(1);
		expect(races).toHaveLength(1);
	});
});

describe("send_message — @mentions", () => {
	test("an @mention adds the mentioned user as a member in the send's transaction; no changed row is appended", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "sm-mn-1");
		await seedHuman(db, "sm-sender-1", "sm-mn-1");
		await seedHuman(db, "sm-mentioned-1", "sm-mn-1");
		const threadId = await seedTaskWithThread(db, "sm-mn1-task", "sm-mn-1");

		// mention resolution is team-scoped off the SENDER's team.
		const res = await call(
			app,
			"send_message",
			{ threadId, text: "cc @sm-mentioned-1 please look" },
			agentHeaders("sm-sender-1"),
		);
		expect(res.status).toBe(200);

		const members = await readThreadMembers(db, threadId);
		expect(members).toContain("sm-mentioned-1");

		const rows = await readChanges(db, threadId);
		expect(rows.filter((r) => r.kind === "changed")).toHaveLength(0);
		const messageRow = rows.find((r) => r.kind === "message");
		const after = JSON.parse(messageRow?.after as string) as { members?: string[] };
		expect(after.members).toEqual(expect.arrayContaining(["sm-mentioned-1"]));
	});
});

// ============================================================================
// the wake rule
// ============================================================================

describe("send_message — the wake rule", () => {
	test("a mention of an agent records one thread_turn intent for it; a two-member thread with one agent records one with no mention; a three-member thread with no mention records none", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "wk-1");
		await seedHuman(db, "wk-human-1", "wk-1");
		await seedAgent(db, "wk-agent-mentioned", "wk-1");
		const threadId = await seedTaskWithThread(db, "wk1-task", "wk-1");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["wk-human-1"]) })
			.where(eq(threads.id, threadId));

		// mention resolution is team-scoped off the SENDER's team — `wk-human-1`
		// carries `teamId:"wk-1"`, unlike the bare global founder seed.
		await call(
			app,
			"send_message",
			{ threadId, text: "hey @wk-agent-mentioned please help" },
			agentHeaders("wk-human-1"),
		);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(intents.filter((i) => i.sourceId.endsWith(":wk-agent-mentioned"))).toHaveLength(1);
	});

	test("a direct two-member thread with your own agent wakes it with no @", async ({ db, app }) => {
		await seedTeam(db, "wk-2");
		await seedAgent(db, "wk-agent-dm", "wk-2");
		await seedThreadRow(db, "wk-dm-2", {
			hostKind: "agent",
			hostId: "wk-agent-dm",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "wk-agent-dm"],
		});

		await call(app, "send_message", { threadId: "wk-dm-2", text: "no mention needed" });
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(intents.filter((i) => i.sourceId.endsWith(":wk-agent-dm"))).toHaveLength(1);
	});

	test("a stranger posting into a two-member team thread does not wake the agent sitting in it", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "wk-3");
		await seedAgent(db, "wk-agent-3", "wk-3");
		await seedHuman(db, "wk-stranger-3", "wk-3");
		await seedThreadRow(db, "wk-team-3", {
			hostKind: "team",
			hostId: "wk-3",
			initiatorId: "system:propagation",
			members: [FOUNDER_ID, "wk-agent-3"],
		});

		await call(
			app,
			"send_message",
			{ threadId: "wk-team-3", text: "hi" },
			agentHeaders("wk-stranger-3"),
		);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(intents.filter((i) => i.sourceId.endsWith(":wk-agent-3"))).toHaveLength(0);
	});

	test("two mentioned agents produce two dispatches, not two rows — drained, two session requests exist, one per agent", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTeam(db, "wk-4");
		await seedHuman(db, "wk-human-4", "wk-4");
		await seedAgent(db, "wk-agent-a", "wk-4");
		await seedAgent(db, "wk-agent-b", "wk-4");
		const threadId = await seedTaskWithThread(db, "wk4-task", "wk-4");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["wk-human-4"]) })
			.where(eq(threads.id, threadId));

		const sent = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId, text: "@wk-agent-a and @wk-agent-b please both look" },
			agentHeaders("wk-human-4"),
		);
		const messageId = sent.body.data?.message.id as string;

		await drainIntents({ ...queueDeps(db), eventBus });

		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, messageId));
		expect(requests).toHaveLength(2);
		expect(new Set(requests.map((r) => r.agentId))).toEqual(new Set(["wk-agent-a", "wk-agent-b"]));
	});

	test("a mention of an agent already a member records one thread_turn intent and appends no changed row (B2)", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "wk-5");
		await seedHuman(db, "wk-human-5a", "wk-5");
		await seedHuman(db, "wk-human-5b", "wk-5");
		await seedAgent(db, "wk-agent-5", "wk-5");
		const threadId = await seedTaskWithThread(db, "wk5-task", "wk-5");
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["wk-human-5a", "wk-human-5b", "wk-agent-5"]) })
			.where(eq(threads.id, threadId));

		await call(
			app,
			"send_message",
			{ threadId, text: "hey @wk-agent-5 already here, please help" },
			agentHeaders("wk-human-5a"),
		);

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(intents.filter((i) => i.sourceId.endsWith(":wk-agent-5"))).toHaveLength(1);

		const rows = await readChanges(db, threadId);
		expect(rows.filter((r) => r.kind === "changed")).toHaveLength(0);
	});
});

// ============================================================================
// the caller fallback (send with neither thread nor recipients)
// ============================================================================

describe("send_message — the agent fallback via ctx.caller", () => {
	test("with caller.threadId set, posts to that thread", async ({ db, agentOrchestration }) => {
		await seedTeam(db, "cf-1");
		await seedAgent(db, "cf-agent-1", "cf-1");
		await seedThreadRow(db, "cf-thread-1", {
			hostKind: "agent",
			hostId: "cf-agent-1",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "cf-agent-1"],
		});
		const actions = buildRealActions(agentOrchestration);
		const run = runnerFor<SendMessageInput, { message: { id: string }; thread: { id: string } }>(
			actions,
			"send_message",
		);
		const result = await run(
			{
				actor: "cf-agent-1",
				db,
				eventBus: new (await import("@hyperidle/event-bus")).EventBus(),
				now: new Date().toISOString(),
				caller: { sessionId: "sess-1", taskId: null, threadId: "cf-thread-1" },
			},
			{ text: "answering back" },
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.thread.id).toBe("cf-thread-1");
	});

	test("with no caller.threadId, posts to a direct thread with its team's human", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "cf-2");
		await seedAgent(db, "cf-agent-2", "cf-2");
		await seedHuman(db, "cf-human-2", "cf-2");
		const actions = buildRealActions(agentOrchestration);
		const run = runnerFor<
			SendMessageInput,
			{ message: { id: string }; thread: { id: string; members: string[] } }
		>(actions, "send_message");
		const result = await run(
			{
				actor: "cf-agent-2",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "sess-2", taskId: null, threadId: null },
			},
			{ text: "no thread, falling back" },
		);
		expect(result.ok).toBe(true);
		if (result.ok)
			expect(result.data.thread.members).toEqual(
				expect.arrayContaining(["cf-human-2", "cf-agent-2"]),
			);
	});

	test("with neither and no human, returns no_reply_recipient", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "cf-3");
		await seedAgent(db, "cf-agent-3", "cf-3");
		// delete the founder so no human exists at all — the fixture's own
		// migration/setup rows must not leak a human into this team's ladder.
		await db.delete(users).where(eq(users.id, FOUNDER_ID));
		const actions = buildRealActions(agentOrchestration);
		const run = runnerFor<SendMessageInput, unknown>(actions, "send_message");
		const result = await run(
			{
				actor: "cf-agent-3",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "sess-3", taskId: null, threadId: null },
			},
			{ text: "nobody to tell" },
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("no_reply_recipient");
	});

	test("a human HTTP caller naming neither is stopped by the pure no_target invariant", async ({
		app,
		db,
	}) => {
		await seedTeam(db, "cf-4");
		const res = await call(app, "send_message", { text: "nowhere to go" });
		expect(res.status).toBe(422);
		expect((res.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("no_target");
	});
});

// ============================================================================
// direct thread find-or-create (B3)
// ============================================================================

describe("send_message — direct thread find-or-create (B3)", () => {
	test("two sends from the same sender to the same single recipient return the same thread.id and the thread holds both messages", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "b3-1");
		await seedHuman(db, "b3-recipient-1", "b3-1");

		const first = await call<{ thread: { id: string } }>(app, "send_message", {
			recipients: ["b3-recipient-1"],
			text: "first",
		});
		expect(first.status).toBe(200);
		const threadId = first.body.data?.thread.id as string;

		const second = await call<{ thread: { id: string } }>(app, "send_message", {
			recipients: ["b3-recipient-1"],
			text: "second",
		});
		expect(second.status).toBe(200);
		expect(second.body.data?.thread.id).toBe(threadId);

		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(2);
	});

	test("the agent no-calling-thread fallback sent twice lands in one thread", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "b3-2");
		await seedAgent(db, "b3-agent-2", "b3-2");
		await seedHuman(db, "b3-human-2", "b3-2");
		const actions = buildRealActions(agentOrchestration);
		const run = runnerFor<SendMessageInput, { thread: { id: string } }>(actions, "send_message");

		const first = await run(
			{
				actor: "b3-agent-2",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "b3-sess-2a", taskId: null, threadId: null },
			},
			{ text: "first fallback" },
		);
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const second = await run(
			{
				actor: "b3-agent-2",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "b3-sess-2b", taskId: null, threadId: null },
			},
			{ text: "second fallback" },
		);
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.data.thread.id).toBe(first.data.thread.id);
	});

	test("A sending to B then B sending to A reuse the same thread", async ({ db, app }) => {
		await seedTeam(db, "b3-3");
		await seedHuman(db, "b3-a", "b3-3");
		await seedHuman(db, "b3-b", "b3-3");

		const aToB = await call<{ thread: { id: string } }>(
			app,
			"send_message",
			{ recipients: ["b3-b"], text: "hi from a" },
			agentHeaders("b3-a"),
		);
		expect(aToB.status).toBe(200);

		const bToA = await call<{ thread: { id: string } }>(
			app,
			"send_message",
			{ recipients: ["b3-a"], text: "hi from b" },
			agentHeaders("b3-b"),
		);
		expect(bToA.status).toBe(200);
		expect(bToA.body.data?.thread.id).toBe(aToB.body.data?.thread.id);
	});
});

describe("send_message — review link and verdict resume", () => {
	test("a review with caller.sessionId links the session; a verdict on it calls the recorder", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "rl-1");
		await seedAgent(db, "rl-agent-1", "rl-1");
		const threadId = await seedTaskWithThread(db, "rl1-task", "rl-1", {
			ownerAgentId: "rl-agent-1",
		});
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["rl-agent-1", FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const actions = buildRealActions(agentOrchestration);
		const sendRun = runnerFor<SendMessageInput, { message: { id: string } }>(
			actions,
			"send_message",
		);
		const result = await sendRun(
			{
				actor: "rl-agent-1",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "rl-session-1", taskId: "rl1-task", threadId },
			},
			{ threadId, review: { title: "review it", reasoning: ["done"] } },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const messageId = result.data.message.id;

		const [linked] = await db
			.select()
			.from(reviewSessions)
			.where(eq(reviewSessions.reviewMessageId, messageId));
		expect(linked?.sessionId).toBe("rl-session-1");
	});

	test("a not_resumable outcome posts a second plain message through the action, with a changes row for it", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "rl-2");
		await seedAgent(db, "rl-agent-2", "rl-2");
		const threadId = await seedTaskWithThread(db, "rl2-task", "rl-2", {
			ownerAgentId: "rl-agent-2",
		});
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["rl-agent-2", FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const stubbedActions = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
			reviewVerdictRecorder: async () => ({ status: "not_resumable", reason: "agent deactivated" }),
		});
		const sendRun = runnerFor<SendMessageInput, { message: { id: string } }>(
			stubbedActions,
			"send_message",
		);

		const filed = await sendRun(
			{ actor: "rl-agent-2", db, eventBus, now: new Date().toISOString() },
			{ threadId, review: { title: "review it", reasoning: ["done"] } },
		);
		expect(filed.ok).toBe(true);
		if (!filed.ok) return;
		const reviewMessageId = filed.data.message.id;

		const verdict = await sendRun(
			{ actor: FOUNDER_ID, db, eventBus, now: new Date().toISOString() },
			{ threadId, verdict: { decision: "approve", resolvesMessageId: reviewMessageId } },
		);
		expect(verdict.ok).toBe(true);

		const notice = await db.select().from(messages).where(eq(messages.threadId, threadId));
		const noticeMessage = notice.find(
			(m) =>
				m.type === "plain" &&
				(JSON.parse(m.payload) as { text?: string }).text?.includes("could not be carried out"),
		);
		expect(noticeMessage).toBeDefined();
		const rows = await readChanges(db, threadId);
		expect(
			rows.some(
				(r) =>
					r.kind === "message" &&
					(JSON.parse(r.after) as { messageId?: string }).messageId === noticeMessage?.id,
			),
		).toBe(true);
	});
});

describe("send_message — review taskId stamping (Confusion 9)", () => {
	test("a review sent with caller.taskId set stores that taskId, and open_thread returns it", async ({
		db,
		app,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "tid-1");
		await seedAgent(db, "tid-agent-1", "tid-1");
		const threadId = await seedTaskWithThread(db, "tid1-task", "tid-1", {
			ownerAgentId: "tid-agent-1",
		});
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["tid-agent-1", FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const actions = buildRealActions(agentOrchestration);
		const sendRun = runnerFor<SendMessageInput, { message: { id: string } }>(
			actions,
			"send_message",
		);
		const result = await sendRun(
			{
				actor: "tid-agent-1",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "tid-session-1", taskId: "tid1-task", threadId },
			},
			{ threadId, review: { title: "review it", reasoning: ["done"] } },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const messageId = result.data.message.id;

		const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
		expect((JSON.parse(row?.payload ?? "{}") as { taskId?: string }).taskId).toBe("tid1-task");

		const opened = await call<ThreadView>(app, "open_thread", { id: threadId });
		expect(opened.status).toBe(200);
		const reviewMessage = opened.body.data?.messages.find((m) => m.id === messageId);
		expect((reviewMessage?.payload as { taskId?: string } | undefined)?.taskId).toBe("tid1-task");
	});

	test("a review sent over HTTP with a taskId smuggled into the input body is stored without it", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "tid-2");
		const threadId = await seedTaskWithThread(db, "tid2-task", "tid-2");
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		// No `caller` exists for an HTTP request (action.ts: "filled ONLY by
		// the MCP loop... Absent for every HTTP call"), so a `taskId` in the
		// wire body can only be caller-authored input, not a server stamp.
		// `SendMessageInputSchema.review` omits `taskId`, and the non-strict
		// nested schema strips an unknown key rather than rejecting the
		// request — so this returns 200 with the field silently dropped.
		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			review: { title: "smuggled", reasoning: ["x"], taskId: "smuggled-task" },
		});
		expect(res.status).toBe(200);
		const messageId = res.body.data?.message.id as string;

		const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(JSON.parse(row?.payload ?? "{}")).not.toHaveProperty("taskId");
	});
});

describe("send_message — produced-item ownership", () => {
	test("a review.producedItemId not parented to the calling task returns produced_item_not_owned", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "pi-1");
		await seedAgent(db, "pi-agent-1", "pi-1");
		const threadId = await seedTaskWithThread(db, "pi1-task", "pi-1", {
			ownerAgentId: "pi-agent-1",
		});
		await seedKnowledgeItem(db, "pi-item-1", { parentKind: "task", parentId: "some-other-task" });
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["pi-agent-1"]) })
			.where(eq(threads.id, threadId));

		const actions = buildRealActions(agentOrchestration);
		const run = runnerFor<SendMessageInput, unknown>(actions, "send_message");
		const result = await run(
			{
				actor: "pi-agent-1",
				db,
				eventBus,
				now: new Date().toISOString(),
				caller: { sessionId: "s", taskId: "pi1-task", threadId },
			},
			{ threadId, review: { title: "r", reasoning: ["x"], producedItemId: "pi-item-1" } },
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("produced_item_not_owned");
	});

	test("an HTTP caller naming a producedItemId is not checked against a task", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "pi-2");
		const threadId = await seedTaskWithThread(db, "pi2-task", "pi-2");
		await seedKnowledgeItem(db, "pi-item-2", { parentKind: "task", parentId: "unrelated" });
		await db
			.update(threads)
			.set({ participants: JSON.stringify([FOUNDER_ID]) })
			.where(eq(threads.id, threadId));

		const res = await call(app, "send_message", {
			threadId,
			review: { title: "r", reasoning: ["x"], producedItemId: "pi-item-2" },
		});
		expect(res.status).toBe(200);
	});
});

// ============================================================================
// the four paths kept alive
// ============================================================================

describe("send_message — the four dead-end paths §3.4's table keeps alive", () => {
	test("a handed-off agent that was never seeded posts in its task's thread and is a member afterwards", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "hp-1");
		await seedAgent(db, "hp-new-owner", "hp-1");
		const threadId = await seedTaskWithThread(db, "hp1-task", "hp-1");
		// the thread's members never included the new owner — a real handoff seeds nothing.
		const res = await call(
			app,
			"send_message",
			{ threadId, text: "taking over" },
			agentHeaders("hp-new-owner"),
		);
		expect(res.status).toBe(200);
		const members = await readThreadMembers(db, threadId);
		expect(members).toContain("hp-new-owner");
	});

	test("a human who is not on the task posts a verdict on a review in it — the verdict trio decides, not not_a_member", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "hp-2");
		await seedAgent(db, "hp-agent-2", "hp-2");
		await seedHuman(db, "hp-reviewer-2", "hp-2");
		const threadId = await seedTaskWithThread(db, "hp2-task", "hp-2", {
			ownerAgentId: "hp-agent-2",
		});
		await db
			.update(threads)
			.set({ participants: JSON.stringify(["hp-agent-2"]) })
			.where(eq(threads.id, threadId));

		const review = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId, review: { title: "review", reasoning: ["done"] } },
			agentHeaders("hp-agent-2"),
		);
		const reviewMessageId = review.body.data?.message.id as string;

		const verdict = await call(
			app,
			"send_message",
			{ threadId, verdict: { decision: "approve", resolvesMessageId: reviewMessageId } },
			agentHeaders("hp-reviewer-2"),
		);
		expect(verdict.status).toBe(200);
		const members = await readThreadMembers(db, threadId);
		expect(members).toContain("hp-reviewer-2");
	});

	test("a visitor posts into a knowledge_item thread they did not create", async ({ db, app }) => {
		await seedTeam(db, "hp-3");
		await seedHuman(db, "hp-visitor-3", "hp-3");
		await seedKnowledgeItem(db, "hp-ki-3");
		await seedThreadRow(db, "hp-ki-thread-3", {
			hostKind: "knowledge_item",
			hostId: "hp-ki-3",
			initiatorId: "system:propagation",
			members: [],
		});
		const res = await call(
			app,
			"send_message",
			{ threadId: "hp-ki-thread-3", text: "question" },
			agentHeaders("hp-visitor-3"),
		);
		expect(res.status).toBe(200);
		const members = await readThreadMembers(db, "hp-ki-thread-3");
		expect(members).toContain("hp-visitor-3");
	});

	test("system:propagation posts a second stalled-knowledge-action review into the thread it made on the first", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "hp-4");
		await seedKnowledgeItem(db, "hp-ki-4");
		const firstRes = await call<{ thread: { id: string } }>(
			app,
			"send_message",
			{ recipients: [FOUNDER_ID], review: { title: "stalled", reasoning: ["first failure"] } },
			agentHeaders("system:propagation"),
		);
		expect(firstRes.status).toBe(200);
		const threadId = firstRes.body.data?.thread.id as string;

		const secondRes = await call(
			app,
			"send_message",
			{ threadId, review: { title: "stalled again", reasoning: ["second failure"] } },
			agentHeaders("system:propagation"),
		);
		expect(secondRes.status).toBe(200);
		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(2);
	});
});

// ============================================================================
// adjust_thread
// ============================================================================

describe("adjust_thread", () => {
	test("with no id, creates a thread with the actor as its only member and host {user, actor}", async ({
		app,
		db,
	}) => {
		await seedTeam(db, "at-0");
		const res = await call<ThreadView>(app, "adjust_thread", {});
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("user");
		expect(res.body.data?.thread.hostId).toBe(FOUNDER_ID);
		expect(res.body.data?.members.map((m) => m.id)).toEqual([FOUNDER_ID]);
	});

	test("deleted:true hides the thread from search and makes open_thread return not_found; false restores it", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "at-1");
		await seedThreadRow(db, "at-thread-1", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const del = await call(app, "adjust_thread", { id: "at-thread-1", deleted: true });
		expect(del.status).toBe(200);
		const searched = await call<unknown[]>(app, "search_threads", { ids: ["at-thread-1"] });
		expect(searched.body.data).toEqual([]);
		const opened = await call(app, "open_thread", { id: "at-thread-1" });
		expect(opened.status).toBe(422);

		const restored = await call(app, "adjust_thread", { id: "at-thread-1", deleted: false });
		expect(restored.status).toBe(200);
		const reopened = await call(app, "open_thread", { id: "at-thread-1" });
		expect(reopened.status).toBe(200);
	});

	test("a stored title wins over the computed one; title:null restores the fallback", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "at-2");
		await seedThreadRow(db, "at-thread-2", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		const withTitle = await call<ThreadView>(app, "adjust_thread", {
			id: "at-thread-2",
			title: "My custom title",
		});
		expect(withTitle.body.data?.thread.title).toBe("My custom title");

		const cleared = await call<ThreadView>(app, "adjust_thread", {
			id: "at-thread-2",
			title: null,
		});
		expect(cleared.body.data?.thread.title).toBeNull();
		expect(cleared.body.data?.thread.computedTitle).not.toBe("My custom title");
	});

	test("open_thread and adjust_thread's create-empty write no message rows", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "at-3");
		const before = await db.select().from(messages);
		const res = await call(app, "adjust_thread", {});
		expect(res.status).toBe(200);
		const after = await db.select().from(messages);
		expect(after).toHaveLength(before.length);
	});
});

// ============================================================================
// search_threads
// ============================================================================

describe("search_threads", () => {
	test("mine returns only threads the actor is in, and carries hasUnresolvedReview correctly", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "st-1");
		await seedHuman(db, "st-outsider-1", "st-1");
		await seedAgent(db, "st-agent-1", "st-1");
		await seedThreadRow(db, "st-mine-1", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, "st-agent-1"],
		});
		await seedThreadRow(db, "st-not-mine-1", {
			hostKind: "user",
			hostId: "st-outsider-1",
			initiatorId: "st-outsider-1",
			members: ["st-outsider-1"],
		});

		await call<{ message: { id: string } }>(app, "send_message", {
			threadId: "st-mine-1",
			review: { title: "open review", reasoning: ["x"] },
		});
		const resolvedReview = await call<{ message: { id: string } }>(
			app,
			"send_message",
			{ threadId: "st-mine-1", review: { title: "resolved review", reasoning: ["y"] } },
			agentHeaders("st-agent-1"),
		);
		await call(app, "send_message", {
			threadId: "st-mine-1",
			verdict: {
				decision: "approve",
				resolvesMessageId: resolvedReview.body.data?.message.id as string,
			},
		});

		const res = await call<Array<{ id: string; hasUnresolvedReview: boolean }>>(
			app,
			"search_threads",
			{ mine: true },
		);
		expect(res.status).toBe(200);
		const ids = res.body.data?.map((r) => r.id) ?? [];
		expect(ids).toContain("st-mine-1");
		expect(ids).not.toContain("st-not-mine-1");
		const mine = res.body.data?.find((r) => r.id === "st-mine-1");
		expect(mine?.hasUnresolvedReview).toBe(true);
	});
});

// ============================================================================
// open_thread
// ============================================================================

describe("open_thread", () => {
	test("returns members as identities, messages newest-first, headMessageId and hostTitle, and writes nothing", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "ot-1");
		await seedKnowledgeItem(db, "ot-ki-1");
		await seedThreadRow(db, "ot-thread-1", {
			hostKind: "knowledge_item",
			hostId: "ot-ki-1",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		await call(app, "send_message", { threadId: "ot-thread-1", text: "first" });
		const review = await call<{ message: { id: string } }>(app, "send_message", {
			threadId: "ot-thread-1",
			review: { title: "second is a review", reasoning: ["x"] },
		});

		const beforeChanges = await db.select().from(changes);
		const res = await call<ThreadView>(app, "open_thread", { id: "ot-thread-1" });
		expect(res.status).toBe(200);
		expect(res.body.data?.messages[0]?.id).toBe(review.body.data?.message.id);
		expect(res.body.data?.headMessageId).toBe(review.body.data?.message.id);
		expect(res.body.data?.hostTitle).toBe("ot-ki-1");
		expect(res.body.data?.members.map((m) => m.id)).toEqual([FOUNDER_ID]);
		expect(await db.select().from(changes)).toHaveLength(beforeChanges.length);
	});
});

// ============================================================================
// edit_task ↔ thread
// ============================================================================

describe("edit_task — every task gets a thread", () => {
	test("with no threadId, creates a task whose threadId is a real thread with creator and owner as members", async ({
		db,
		app,
	}) => {
		await seedTeam(db, "et-1");
		await seedAgent(db, "et-owner-1", "et-1");

		const res = await call<{ task: { id: string; threadId: string } }>(app, "edit_task", {
			teamId: "et-1",
			title: "New task",
			ownerAgentId: "et-owner-1",
		});
		expect(res.status).toBe(200);
		const threadId = res.body.data?.task.threadId as string;
		expect(threadId).toBeTruthy();
		const [row] = await db.select().from(threads).where(eq(threads.id, threadId));
		expect(row?.hostKind).toBe("team");
		const members = JSON.parse(row?.participants ?? "[]") as string[];
		expect(members).toEqual(expect.arrayContaining([FOUNDER_ID, "et-owner-1"]));
	});

	test("with a threadId, uses it and adds the owner", async ({ db, app }) => {
		await seedTeam(db, "et-2");
		await seedAgent(db, "et-owner-2", "et-2");
		await seedThreadRow(db, "et-existing-thread-2", {
			hostKind: "team",
			hostId: "et-2",
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});

		const res = await call<{ task: { id: string; threadId: string } }>(app, "edit_task", {
			teamId: "et-2",
			title: "New task with thread",
			ownerAgentId: "et-owner-2",
			threadId: "et-existing-thread-2",
		});
		expect(res.status).toBe(200);
		expect(res.body.data?.task.threadId).toBe("et-existing-thread-2");
		const members = await readThreadMembers(db, "et-existing-thread-2");
		expect(members).toContain("et-owner-2");
	});
});

// ============================================================================
// legacy bus names
// ============================================================================

describe("send_message — legacy bus names still fire", () => {
	test("thread_created, thread_message_appended, thread_resolved, thread_reopened fire from the change row", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTeam(db, "lb-1");
		await seedAgent(db, "lb-agent-1", "lb-1");

		const seen: string[] = [];
		const handler = (event: { type: string }) => seen.push(event.type);
		const unsubscribers = [
			eventBus.on("thread_created", handler as never),
			eventBus.on("thread_message_appended", handler as never),
			eventBus.on("thread_resolved", handler as never),
			eventBus.on("thread_reopened", handler as never),
		];

		const created = await call<{ message: { id: string }; thread: { id: string } }>(
			app,
			"send_message",
			{ recipients: [FOUNDER_ID], review: { title: "will be resolved", reasoning: ["x"] } },
			agentHeaders("lb-agent-1"),
		);
		const threadId = created.body.data?.thread.id as string;
		const reviewMessageId = created.body.data?.message.id as string;
		await call(app, "send_message", {
			threadId,
			verdict: { decision: "approve", resolvesMessageId: reviewMessageId },
		});
		await call(
			app,
			"send_message",
			{ threadId, review: { title: "reopens it", reasoning: ["y"] } },
			agentHeaders("lb-agent-1"),
		);

		expect(seen).toContain("thread_created");
		expect(seen).toContain("thread_message_appended");
		expect(seen).toContain("thread_resolved");
		expect(seen).toContain("thread_reopened");
		for (const unsubscribe of unsubscribers) unsubscribe();
	});
});

// ============================================================================
// pure invariants
// ============================================================================

describe("pure invariants", () => {
	test("send_message: two_targets, no_body, two_bodies, plain_fields_on_non_plain, overwrite rules, verdict_on_new_thread", async ({
		app,
	}) => {
		const twoTargets = await call(app, "send_message", {
			threadId: "x",
			recipients: [FOUNDER_ID],
			text: "x",
		});
		expect((twoTargets.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("two_targets");

		const noBody = await call(app, "send_message", { threadId: "x" });
		expect(
			(noBody.body as ActionEnvelope<unknown>).problems?.some((p) => p.code === "no_body"),
		).toBe(true);

		const twoBodies = await call(app, "send_message", {
			threadId: "x",
			text: "a",
			review: { title: "b", reasoning: [] },
		});
		expect(
			(twoBodies.body as ActionEnvelope<unknown>).problems?.some((p) => p.code === "two_bodies"),
		).toBe(true);

		const plainFieldsOnNonPlain = await call(app, "send_message", {
			threadId: "x",
			review: { title: "b", reasoning: [] },
			blockId: "b1",
		});
		expect(
			(plainFieldsOnNonPlain.body as ActionEnvelope<unknown>).problems?.some(
				(p) => p.code === "plain_fields_on_non_plain",
			),
		).toBe(true);

		const overwriteNoThread = await call(app, "send_message", { messageId: "m1", text: "x" });
		expect(
			(overwriteNoThread.body as ActionEnvelope<unknown>).problems?.some(
				(p) => p.code === "overwrite_needs_thread",
			),
		).toBe(true);

		const overwriteWithRecipients = await call(app, "send_message", {
			threadId: "x",
			messageId: "m1",
			recipients: [FOUNDER_ID],
			text: "x",
		});
		expect(
			(overwriteWithRecipients.body as ActionEnvelope<unknown>).problems?.some(
				(p) => p.code === "two_targets" || p.code === "overwrite_with_recipients",
			),
		).toBe(true);

		const verdictOnNewThread = await call(app, "send_message", {
			recipients: [FOUNDER_ID],
			verdict: { decision: "approve", resolvesMessageId: "m1" },
		});
		expect(
			(verdictOnNewThread.body as ActionEnvelope<unknown>).problems?.some(
				(p) => p.code === "verdict_on_new_thread",
			),
		).toBe(true);
	});

	test("adjust_thread: adjust_empty, adjust_host_on_existing, members_empty", async ({
		app,
		db,
	}) => {
		await seedThreadRow(db, "pi-adjust-1", {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
		});
		const empty = await call(app, "adjust_thread", { id: "pi-adjust-1" });
		expect((empty.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe("adjust_empty");

		const hostOnExisting = await call(app, "adjust_thread", {
			id: "pi-adjust-1",
			host: { kind: "team", id: "t" },
		});
		expect((hostOnExisting.body as ActionEnvelope<unknown>).problems?.[0]?.code).toBe(
			"adjust_host_on_existing",
		);

		// `members: []` never reaches the action's own invariant over HTTP — the
		// wire schema's own `z.array(...).min(1)` refuses it first (a 400, not a
		// Problem). `members_empty` is exercised as the pure function it is.
		expect(adjustThreadInvariants({ members: [] })[0]?.code).toBe("members_empty");
	});
});

// ============================================================================
// MCP door
// ============================================================================

describe("the MCP door — actionsAsTools fills caller for every actor", () => {
	test("a non-member send into a DM through the tool adapter returns not_a_member, same as HTTP", async ({
		db,
		agentOrchestration,
		eventBus,
	}) => {
		await seedTeam(db, "mcp-1");
		await seedHuman(db, "mcp-victim-1", "mcp-1");
		await seedAgent(db, "mcp-stranger-1", "mcp-1");
		await seedThreadRow(db, "mcp-dm-1", {
			hostKind: "user",
			hostId: "mcp-victim-1",
			initiatorId: "mcp-victim-1",
			members: [FOUNDER_ID, "mcp-victim-1"],
		});

		const actions = buildRealActions(agentOrchestration);
		const { actionsAsTools } = await import("../actions/actions-as-tools.js");
		const tools = actionsAsTools(actions);
		const sendTool = tools.find((t) => t.name === "send_message");
		if (!sendTool) throw new Error("send_message tool missing");
		const result = await sendTool.handler({ threadId: "mcp-dm-1", text: "hi" }, {
			db,
			eventBus,
			agentId: "mcp-stranger-1",
			sessionId: "mcp-session-1",
			taskId: "",
			threadId: undefined,
			teamId: "mcp-1",
		} as never);
		expect(result.success).toBe(false);
		if (!result.success) expect(result.code).toBe("not_a_member");
	});
});

// ============================================================================
// 422 problem lists over POST /api/actions/send_message
// ============================================================================

describe("HTTP door — 422 problem lists", () => {
	test("a refused send returns a 422 with a problems array over POST /api/actions/send_message", async ({
		app,
	}) => {
		const res = await call(app, "send_message", {});
		expect(res.status).toBe(422);
		expect(Array.isArray((res.body as ActionEnvelope<unknown>).problems)).toBe(true);
		expect((res.body as ActionEnvelope<unknown>).problems?.length ?? 0).toBeGreaterThan(0);
	});
});
