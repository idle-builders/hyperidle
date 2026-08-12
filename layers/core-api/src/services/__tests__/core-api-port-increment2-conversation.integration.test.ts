/**
 * AU21 §9 Increment 2 (conversation wave) — RED phase.
 *
 * Extends the §11 contract-test harness (`core-api-port.integration.test.ts`,
 * Increment 1; `core-api-port-increment2-work-users.integration.test.ts`,
 * Increment 2's work/users wave) to the `tool-handlers`
 * `ToolHandlersConversationAccessor` capabilities named in
 * `edge-disposition.md`'s `tool-handlers` table row:
 * `conversation.{findThread, insertThread, insertMessage, updateThread,
 * findOrCreateDirectThread, listInbox}` (§4 seam — "agent sends/reads
 * messages = UI's door").
 *
 * Covers exactly the seven `ToolHandlersConversationAccessor` methods
 * (`tool-handlers/src/ports.ts:69-88`): `getThreadById`, `insertThread`,
 * `updateThread`, `insertMessage`, `listInboxBySenderExclusion`,
 * `findOrCreateDirectThread`, `getFirstThreadByHost`.
 *
 * None of these exist yet on `CoreApiPort`/`buildCoreApiPort` — `conversation`
 * is not yet a family on the seam at all (Increment 1 seeded `work`;
 * Increment 2's first wave added `users`). Every test below fails at RUNTIME
 * (`TypeError: Cannot read properties of undefined (reading '...')`), not at
 * import-resolution time, because `buildCoreApiPort`/the transport already
 * exist from Increment 1. RED for the right reason: missing implementation,
 * not a typo. GREEN phase adds:
 *  (a) a new `CoreApiConversationPort` family (api-contract) +
 *      `buildCoreApiPort`'s `conversation` object;
 *  (b) the backing core-api routes, reusing what exists and adding narrow
 *      new routes only where nothing already serves the capability.
 *
 * Backing-route plan (documented here for the GREEN-phase builder):
 *  - `getThreadById`      → REUSE existing `GET /api/threads/:id` (extract
 *    `thread.id` + `thread.participants` — the route's `rowToThread` already
 *    returns `participants` as a parsed `string[]`, NOT the raw JSON-string
 *    row column; the seam type mirrors the ROUTE'S response shape, not the
 *    DB row — call sites that currently `JSON.parse(existing.participants)`
 *    drop that parse once migrated).
 *  - `insertThread`       → NEW `POST /api/threads/scaffold`. No existing
 *    route creates a BARE thread (`POST /api/threads` always requires an
 *    `initialMessage`, per `createThreadBodySchema` — `create_item`'s and
 *    `submit_review`'s raw `insertThread` calls create a thread with no
 *    message at all). A narrow new route, server-generates `id` (same
 *    convention as `POST /bets`/`POST /tasks`/`POST /conversations/items`),
 *    accepts `{hostKind, hostId, participants, pinned?}`, emits
 *    `thread_created` (mirroring `POST /api/threads`'s own emission).
 *  - `updateThread`       → NEW `PATCH /api/threads/:id`. No existing route
 *    patches a thread's `participants`/`lastActiveAt`/`pinned` directly —
 *    only bundled inside the messages/verdict routes' own transactions.
 *    Accepts exactly the fields real call sites set today:
 *    `{participants?, lastActiveAt?, pinned?}` — narrowly scoped, not a
 *    general thread-patch surface.
 *  - `insertMessage`      → REUSE existing `POST /api/threads/:id/messages`
 *    (the real append-message door, with its idempotency/mention/verdict/
 *    event-emission logic already correct) — NOT the raw row insert. The
 *    route generates the message's `id` server-side and derives `senderId`
 *    from `c.get("userId")` (the threaded actor identity), never from the
 *    request body — callers that today pre-generate `messageId` and pass
 *    `senderId: ctx.agentId` explicitly (`send_message`, `submit_review`)
 *    switch to using the response's `id`, matching the `createBet`/
 *    `createTask`/`createItem` precedent.
 *  - `listInboxBySenderExclusion` → NEW `GET /api/threads/inbox`. No
 *    existing route serves the sender-exclusion inbox join
 *    (`listInbox({excludeSenderId})`, `conversation-store.ts:390`). Derives
 *    the excluded sender from `c.get("userId")` (the calling agent's own
 *    identity) — NEVER a client-supplied query param — closing the same
 *    IDOR shape `GET /api/threads`'s `participant_id` guard (AD1) already
 *    closes for the human-facing list route.
 *  - `findOrCreateDirectThread` → NEW `POST /api/threads/direct`. No
 *    existing route serves the DM find-or-create composite
 *    (`findOrCreateDirectThread`, `conversation-store.ts:180`). Accepts only
 *    `{recipientId}` — the sender is always the calling agent, derived from
 *    `c.get("userId")`, never a body field (an agent can only open a DM as
 *    itself, matching every other actor-derived write in this file).
 *  - `getFirstThreadByHost` → REUSE existing `GET /api/threads` with
 *    `?host_kind=&host_id=&limit=1` (already orders `lastActive` desc); take
 *    the first row of the `threads` array, or `undefined` when empty.
 *
 * Two more `ToolHandlersConversationAccessor`-adjacent call sites live in
 * `dispatch/src/service.ts` (the "assistant-turn" writes,
 * `edge-disposition.md`'s dispatch-table row `conversation.{insertMessage,
 * updateThread} (assistant-turn)` → §4 seam): `persistTurnFailureInternal`'s
 * `insertMessage` (`service.ts:236`), `runTurnInternal`'s `insertMessage`
 * (`:437`), and `registerAssistantTriggerInternal`'s pin-after-first-response
 * `updateThread` (`:574`). These reuse the SAME two `CoreApiConversationPort`
 * methods this file already contract-tests — `dispatch`'s migration is a
 * WIRING change (`DispatchPorts.conversation` loses `insertMessage`/
 * `updateThread`, gains a `coreApi` accessor calling the same seam methods),
 * not a new seam method. Their own RED-phase proof of the FULL wiring
 * (dispatch's real functions actually reaching the seam) lives in the
 * sibling file `core-api-port-increment2-dispatch-assistant-turn.integration.test.ts`.
 * Every OTHER dispatch `conversation` call
 * (`insertThread`/`getThreadIdsByHost` in post-bet-retro/portfolio-retro,
 * `getThreadById`/`listMessagesByThread` as assistant-turn CONTEXT reads) is
 * untouched this wave — `§1/§2 core-maintenance-moved-core-side` /
 * `§2 baked`, per `edge-disposition.md`, Increment 3/5's scope.
 *
 * `routeItem` was confirmed pure/local (no `TDb`) and never part of
 * `ToolHandlersConversationAccessor` at all — AU21 §6 Decision L3 later
 * deleted it outright as vestigial (its output was consumed by nothing),
 * not relocated onto any seam.
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-28T00:00:00.000Z";

interface ConversationThreadView {
	readonly id: string;
	readonly participants: readonly string[];
}

interface InboxRowView {
	readonly participants: readonly string[];
	readonly message: { readonly id: string; readonly senderId: string };
}

interface SeamCoreApiPortIncrement2Conversation {
	readonly conversation: {
		getThreadById(id: string): Promise<ConversationThreadView | undefined>;
		insertThread(input: {
			readonly hostKind: string;
			readonly hostId: string;
			readonly participants: readonly string[];
			readonly pinned?: boolean;
		}): Promise<{ readonly id: string }>;
		updateThread(
			id: string,
			updates: Partial<{
				participants: readonly string[];
				lastActiveAt: string;
				pinned: boolean;
			}>,
		): Promise<void>;
		insertMessage(input: {
			readonly threadId: string;
			readonly type: "plain" | "review" | "questionnaire" | "verdict";
			readonly payload: Record<string, unknown>;
			readonly clientKey: string;
		}): Promise<{ readonly id: string }>;
		listInboxBySenderExclusion(limit: number): Promise<ReadonlyArray<InboxRowView>>;
		findOrCreateDirectThread(recipientId: string): Promise<{ readonly id: string }>;
		getFirstThreadByHost(
			hostKind: string,
			hostId: string,
		): Promise<ConversationThreadView | undefined>;
	};
}

async function seedAgent(db: HyperIdleDb, id: string, name?: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: name ?? `Agent ${id}`,
		role: "engineer",
		status: "active",
		createdAt: NOW,
	});
}

function buildSeamPort(actorId: string, app: Hono): SeamCoreApiPortIncrement2Conversation {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), {
		userId: actorId,
	});
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement2Conversation;
}

describe("CoreApiPort.conversation — Increment 2 conversation wave (RED)", () => {
	test("getThreadById reaches the real GET /api/threads/:id route", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-getthread"));
		const agentId = ids("agent-conv-getthread");
		await seedAgent(db, agentId);
		const threadId = ids("thread-conv-getthread");
		const hostId = ids("task-conv-x");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		const found = await port.conversation.getThreadById(threadId);

		expect(found?.id).toBe(threadId);
		expect(found?.participants).toContain(agentId);
	});

	test("getThreadById against a nonexistent thread resolves undefined", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-getthread-404"));
		const port = buildSeamPort(ids("agent-conv-missing"), app);
		const found = await port.conversation.getThreadById(ids("no-such-thread"));
		expect(found).toBeUndefined();
	});

	test("insertThread reaches a real bare-thread-creation route (a real row lands in the DB, no message required)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-insertthread"));
		const agentId = ids("agent-conv-insertthread");
		await seedAgent(db, agentId);
		const hostId = ids("task-conv-insert");

		const port = buildSeamPort(agentId, app);
		const created = await port.conversation.insertThread({
			hostKind: "task",
			hostId,
			participants: [agentId],
		});

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(threads).where(eq(threads.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("task");
		expect(row?.hostId).toBe(hostId);
		expect(JSON.parse(row?.participants ?? "[]")).toContain(agentId);
	});

	test("updateThread reaches a real thread-patch route (participants land in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-updatethread"));
		const agentId = ids("agent-conv-updatethread");
		const agentId2 = ids("agent-conv-updatethread-2");
		await seedAgent(db, agentId);
		await seedAgent(db, agentId2);
		const threadId = ids("thread-conv-updatethread");
		const hostId = ids("task-conv-update");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		await port.conversation.updateThread(threadId, {
			participants: [agentId, agentId2],
		});

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(JSON.parse(row?.participants ?? "[]")).toEqual([agentId, agentId2]);
	});

	test("updateThread can set pinned (dispatch's assistant-thread-pin shape)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-updatethread-pin"));
		const agentId = ids("agent-conv-pin");
		await seedAgent(db, agentId);
		const threadId = ids("thread-conv-pin");
		const humanId = ids("human-conv-pin");
		await db.insert(users).values({
			id: humanId,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: humanId,
			initiatorId: humanId,
			participants: JSON.stringify([humanId, agentId]),
			pinned: false,
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		await port.conversation.updateThread(threadId, { pinned: true });

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row?.pinned).toBe(true);
	});

	test("insertMessage reaches the real POST /api/threads/:id/messages route (senderId derives from the threaded actor, not the body)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-insertmessage"));
		const agentId = ids("agent-conv-insertmessage");
		await seedAgent(db, agentId);
		const threadId = ids("thread-conv-insertmessage");
		const hostId = ids("task-conv-msg");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		const created = await port.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "hello from the seam" },
			clientKey: ids("ck-insertmessage"),
		});

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(messages).where(eq(messages.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.senderId).toBe(agentId);
		expect(JSON.parse(row?.payload ?? "{}")).toMatchObject({ text: "hello from the seam" });
	});

	test("listInboxBySenderExclusion reaches a real sender-exclusion inbox route, scoped to the calling actor", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-inbox"));
		const selfAgentId = ids("agent-conv-inbox-self");
		const otherAgentId = ids("agent-conv-inbox-other");
		await seedAgent(db, selfAgentId);
		await seedAgent(db, otherAgentId);
		const threadId = ids("thread-conv-inbox");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "agent",
			hostId: selfAgentId,
			initiatorId: otherAgentId,
			participants: JSON.stringify([selfAgentId, otherAgentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		const msgFromOther = ids("msg-conv-inbox-from-other");
		const msgFromSelf = ids("msg-conv-inbox-from-self");
		await db.insert(messages).values({
			id: msgFromOther,
			senderId: otherAgentId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text: "for you" }),
			clientKey: ids("ck-inbox-other"),
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: msgFromSelf,
			senderId: selfAgentId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text: "from me" }),
			clientKey: ids("ck-inbox-self"),
			createdAt: NOW,
		});

		const port = buildSeamPort(selfAgentId, app);
		const rows = await port.conversation.listInboxBySenderExclusion(50);

		const resultIds = rows.map((r) => r.message.id);
		expect(resultIds).toContain(msgFromOther);
		expect(resultIds).not.toContain(msgFromSelf);
	});

	test("findOrCreateDirectThread reaches a real DM find-or-create route (sender derives from the actor)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-directthread"));
		const agentA = ids("agent-conv-direct-a");
		const agentB = ids("agent-conv-direct-b");
		await seedAgent(db, agentA);
		await seedAgent(db, agentB);

		const port = buildSeamPort(agentA, app);
		const created = await port.conversation.findOrCreateDirectThread(agentB);

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(threads).where(eq(threads.id, created.id)).limit(1);
		expect(row).toBeDefined();
		const parts = JSON.parse(row?.participants ?? "[]") as string[];
		expect(parts.sort()).toEqual([agentA, agentB].sort());
	});

	test("findOrCreateDirectThread is idempotent — a second call for the same pair reuses the same thread", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-directthread-idem"));
		const agentA = ids("agent-conv-direct-idem-a");
		const agentB = ids("agent-conv-direct-idem-b");
		await seedAgent(db, agentA);
		await seedAgent(db, agentB);
		const port = buildSeamPort(agentA, app);
		const first = await port.conversation.findOrCreateDirectThread(agentB);
		const second = await port.conversation.findOrCreateDirectThread(agentB);
		expect(second.id).toBe(first.id);
	});

	test("getFirstThreadByHost reaches the real GET /api/threads?host_kind=&host_id= route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-firstbyhost"));
		const agentId = ids("agent-conv-firstbyhost");
		await seedAgent(db, agentId);
		const threadId = ids("thread-conv-firstbyhost");
		const hostId = ids("bet-conv-firstbyhost");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		const found = await port.conversation.getFirstThreadByHost("bet", hostId);

		expect(found?.id).toBe(threadId);
	});

	test("getFirstThreadByHost against a host with no thread resolves undefined", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-firstbyhost-404"));
		const port = buildSeamPort(ids("agent-conv-firstbyhost-none"), app);
		const found = await port.conversation.getFirstThreadByHost("bet", ids("bet-conv-no-thread"));
		expect(found).toBeUndefined();
	});

	test("a conversation write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-conv-key-noauth"));
		const agentId = ids("agent-conv-noauth");
		await seedAgent(db, agentId);
		const threadId = ids("thread-conv-noauth");
		const hostId = ids("task-conv-noauth");
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// No withActorTransport wrapping — the raw in-process transport carries
		// no X-API-Key. If the seam bypassed the real route's auth middleware,
		// this would succeed.
		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement2Conversation;

		await expect(
			port.conversation.insertMessage({
				threadId,
				type: "plain",
				payload: { text: "should never land" },
				clientKey: ids("ck-noauth"),
			}),
		).rejects.toThrow();
	});
});
