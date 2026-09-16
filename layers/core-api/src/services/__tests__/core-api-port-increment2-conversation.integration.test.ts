/**
 * AU21 §9 Increment 2 (conversation wave) — RED phase.
 *
 * Extends the §11 contract-test harness (`core-api-port.integration.test.ts`,
 * Increment 1; `core-api-port-increment2-work-users.integration.test.ts`,
 * Increment 2's work/users wave) to the `tool-handlers`
 * `ToolHandlersConversationAccessor` capabilities named in
 * `edge-disposition.md`'s `tool-handlers` table row:
 * `conversation.{findThread, insertThread, insertMessage, updateThread,
 * findOrCreateDirectThread}` (§4 seam — "agent sends/reads
 * messages = UI's door"). `listInbox` was retired.
 *
 * Covers exactly the six `ToolHandlersConversationAccessor` methods
 * (`tool-handlers/src/ports.ts:69-88`): `getThreadById`, `insertThread`,
 * `updateThread`, `insertMessage`,
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
import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const NOW = "2026-07-28T00:00:00.000Z";

interface ConversationThreadView {
	readonly id: string;
	readonly participants: readonly string[];
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
		findOrCreateDirectThread(recipientId: string): Promise<{ readonly id: string }>;
		getFirstThreadByHost(
			hostKind: string,
			hostId: string,
		): Promise<ConversationThreadView | undefined>;
	};
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: `Agent ${id}`,
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
	test("getThreadById reaches the real GET /api/threads/:id route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-getthread");
		await seedAgent(db, "agent-conv-getthread");
		const threadId = "thread-conv-getthread";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-conv-x",
			initiatorId: "agent-conv-getthread",
			participants: JSON.stringify(["agent-conv-getthread"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-conv-getthread", app);
		const found = await port.conversation.getThreadById(threadId);

		expect(found?.id).toBe(threadId);
		expect(found?.participants).toContain("agent-conv-getthread");
	});

	test("getThreadById against a nonexistent thread resolves undefined", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-getthread-404");
		const port = buildSeamPort("agent-conv-missing", app);
		const found = await port.conversation.getThreadById("no-such-thread");
		expect(found).toBeUndefined();
	});

	test("insertThread reaches a real bare-thread-creation route (a real row lands in the DB, no message required)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-insertthread");
		await seedAgent(db, "agent-conv-insertthread");

		const port = buildSeamPort("agent-conv-insertthread", app);
		const created = await port.conversation.insertThread({
			hostKind: "task",
			hostId: "task-conv-insert",
			participants: ["agent-conv-insertthread"],
		});

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(threads).where(eq(threads.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("task");
		expect(row?.hostId).toBe("task-conv-insert");
		expect(JSON.parse(row?.participants ?? "[]")).toContain("agent-conv-insertthread");
	});

	test("updateThread reaches a real thread-patch route (participants land in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-updatethread");
		await seedAgent(db, "agent-conv-updatethread");
		await seedAgent(db, "agent-conv-updatethread-2");
		const threadId = "thread-conv-updatethread";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-conv-update",
			initiatorId: "agent-conv-updatethread",
			participants: JSON.stringify(["agent-conv-updatethread"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-conv-updatethread", app);
		await port.conversation.updateThread(threadId, {
			participants: ["agent-conv-updatethread", "agent-conv-updatethread-2"],
		});

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(JSON.parse(row?.participants ?? "[]")).toEqual([
			"agent-conv-updatethread",
			"agent-conv-updatethread-2",
		]);
	});

	test("updateThread can set pinned (dispatch's assistant-thread-pin shape)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-updatethread-pin");
		await seedAgent(db, "agent-conv-pin");
		const threadId = "thread-conv-pin";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: "human-conv-pin",
			initiatorId: "human-conv-pin",
			participants: JSON.stringify(["human-conv-pin", "agent-conv-pin"]),
			pinned: false,
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-conv-pin", app);
		await port.conversation.updateThread(threadId, { pinned: true });

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row?.pinned).toBe(true);
	});

	test("insertMessage reaches the real POST /api/threads/:id/messages route (senderId derives from the threaded actor, not the body)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-insertmessage");
		await seedAgent(db, "agent-conv-insertmessage");
		const threadId = "thread-conv-insertmessage";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-conv-msg",
			initiatorId: "agent-conv-insertmessage",
			participants: JSON.stringify(["agent-conv-insertmessage"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-conv-insertmessage", app);
		const created = await port.conversation.insertMessage({
			threadId,
			type: "plain",
			payload: { text: "hello from the seam" },
			clientKey: `ck-${crypto.randomUUID()}`,
		});

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(messages).where(eq(messages.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.senderId).toBe("agent-conv-insertmessage");
		expect(JSON.parse(row?.payload ?? "{}")).toMatchObject({ text: "hello from the seam" });
	});

	test("findOrCreateDirectThread reaches a real DM find-or-create route (sender derives from the actor)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-directthread");
		await seedAgent(db, "agent-conv-direct-a");
		await seedAgent(db, "agent-conv-direct-b");

		const port = buildSeamPort("agent-conv-direct-a", app);
		const created = await port.conversation.findOrCreateDirectThread("agent-conv-direct-b");

		expect(created.id).toBeTruthy();
		const [row] = await db.select().from(threads).where(eq(threads.id, created.id)).limit(1);
		expect(row).toBeDefined();
		const parts = JSON.parse(row?.participants ?? "[]") as string[];
		expect(parts.sort()).toEqual(["agent-conv-direct-a", "agent-conv-direct-b"].sort());
	});

	test("findOrCreateDirectThread is idempotent — a second call for the same pair reuses the same thread", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-directthread-idem");
		const port = buildSeamPort("agent-conv-direct-idem-a", app);
		const first = await port.conversation.findOrCreateDirectThread("agent-conv-direct-idem-b");
		const second = await port.conversation.findOrCreateDirectThread("agent-conv-direct-idem-b");
		expect(second.id).toBe(first.id);
	});

	test("getFirstThreadByHost reaches the real GET /api/threads?host_kind=&host_id= route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-firstbyhost");
		await seedAgent(db, "agent-conv-firstbyhost");
		const threadId = "thread-conv-firstbyhost";
		await db.insert(threads).values({
			id: threadId,
			// BB1: hostKind "bet" removed — root tasks use hostKind "task".
			hostKind: "task",
			hostId: "bet-conv-firstbyhost",
			initiatorId: "agent-conv-firstbyhost",
			participants: JSON.stringify(["agent-conv-firstbyhost"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-conv-firstbyhost", app);
		const found = await port.conversation.getFirstThreadByHost("task", "bet-conv-firstbyhost");

		expect(found?.id).toBe(threadId);
	});

	test("getFirstThreadByHost against a host with no thread resolves undefined", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-firstbyhost-404");
		const port = buildSeamPort("agent-conv-firstbyhost-none", app);
		const found = await port.conversation.getFirstThreadByHost("task", "bet-conv-no-thread");
		expect(found).toBeUndefined();
	});

	test("a conversation write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-conv-key-noauth");
		await seedAgent(db, "agent-conv-noauth");
		const threadId = "thread-conv-noauth";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-conv-noauth",
			initiatorId: "agent-conv-noauth",
			participants: JSON.stringify(["agent-conv-noauth"]),
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
				clientKey: `ck-${crypto.randomUUID()}`,
			}),
		).rejects.toThrow();
	});
});
