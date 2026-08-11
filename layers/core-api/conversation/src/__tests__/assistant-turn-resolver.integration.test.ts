/**
 * AU21 Increment 3, assistant_turn wave (RED) — architecture.md §6 Decision B's
 * placement ruling: "`assistant_turn` → a resolver added to
 * `layers/core-api/conversation/src/` (paired with its emit site,
 * `routes/threads.ts`)."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "assistant_turn" case does today
 * (`session-requests/src/service.ts:725-745`), reading only `conversation`'s
 * own tables + the shared `requireRunnableAgent` invariant
 * (`@hyperidle/users`), so the real emit call site (`routes/threads.ts`) can
 * bake the full request at emit time instead of leaving it for the drain to
 * resolve later:
 *   1. Load the message; reject if it does not exist, is deleted, or is
 *      redacted.
 *   2. Resolve the target assistant agent id as `ast-<senderId>`.
 *   3. Validate runnability of that agent via the shared core-api helper
 *      (never trust the human sender).
 *   4. Bake the request: `defaultAgentId`, `sourceKind: "assistant"`,
 *      `sourceId` (the message id), `streamId: thread:<threadId>`,
 *      `userId` (the sender), `sourceCorrelation`.
 *
 * Currently RED: no `assistant-turn-resolver.ts` module exists anywhere under
 * `layers/core-api/conversation/src/` (nor from its barrel,
 * `@hyperidle/conversation`) — this import fails to resolve at runtime.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this new resolver. `resolveAssistantTurnRequest` is this wave's best-guess
 * interpretation, flagged for reviewer confirmation — if the implementer
 * picks a different name, only this import line needs to change.
 *
 * @lore GREEN-phase signature correction: Mechanism C
 * (`composition-boundary-guard`) forbids a nested Service (`conversation`)
 * from depending on another Service (`@hyperidle/users`) directly, even for
 * this one cross-cutting invariant — every other Service in the repo depends
 * ONLY on `@hyperidle/db` + framework packages (verified from source). The
 * resolver therefore takes `requireRunnableAgent` as an injected 3rd-arg
 * `deps` parameter instead of importing it statically; test files live under
 * `__tests__/` (guard-exempt, matching `connections`' own precedent of
 * importing `@hyperidle/users` directly in its integration test), so this
 * file imports the real `requireRunnableAgent` to wire the same dependency
 * `routes/threads.ts` wires in production.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly assistantId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "user",
		hostId: options.senderId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.assistantId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

async function seedMessage(
	db: HyperIdleDb,
	options: {
		readonly messageId: string;
		readonly threadId: string;
		readonly senderId: string;
		readonly deletedAt?: string | null;
		readonly redactedAt?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(messages).values({
		id: options.messageId,
		senderId: options.senderId,
		threadId: options.threadId,
		type: "plain",
		payload: JSON.stringify({ text: "hi" }),
		clientKey: `client-${options.messageId}`,
		createdAt: now,
		deletedAt: options.deletedAt ?? null,
		redactedAt: options.redactedAt ?? null,
	});
}

describe("resolveAssistantTurnRequest — emit-time assistant_turn resolver (conversation)", () => {
	test("bakes the full request for a valid message, matching resolveIntentInputInternal's shape", async ({
		db,
		ids,
	}) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		await seedThread(db, {
			threadId: ids("thread-resolver-1"),
			senderId: ids("user-resolver-1"),
			assistantId: `ast-${ids("user-resolver-1")}`,
		});
		await db.insert(users).values({
			id: `ast-${ids("user-resolver-1")}`,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await seedMessage(db, {
			messageId: ids("message-resolver-1"),
			threadId: ids("thread-resolver-1"),
			senderId: ids("user-resolver-1"),
		});

		const baked = await resolveAssistantTurnRequest(db, ids("message-resolver-1"), {
			requireRunnableAgent,
		});

		expect(baked).toMatchObject({
			defaultAgentId: `ast-${ids("user-resolver-1")}`,
			sourceKind: "assistant",
			sourceId: ids("message-resolver-1"),
			streamId: `thread:${ids("thread-resolver-1")}`,
			userId: ids("user-resolver-1"),
			sourceCorrelation: {
				threadId: ids("thread-resolver-1"),
				messageId: ids("message-resolver-1"),
				userId: ids("user-resolver-1"),
				assistantAgentId: `ast-${ids("user-resolver-1")}`,
			},
			// AU27 Increment 1 (Decision 1): the assistant's calling thread is
			// always the triggering message's own thread — no resolve-or-create
			// needed (unlike task_run/session_start/reengagement).
			callingThreadId: ids("thread-resolver-1"),
		});
	});

	test("rejects a source message that does not exist", async ({ db, ids }) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		await expect(
			resolveAssistantTurnRequest(db, ids("message-does-not-exist"), { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects a deleted message", async ({ db, ids }) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		await seedThread(db, {
			threadId: ids("thread-resolver-deleted"),
			senderId: ids("user-resolver-deleted"),
			assistantId: `ast-${ids("user-resolver-deleted")}`,
		});
		await db.insert(users).values({
			id: `ast-${ids("user-resolver-deleted")}`,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await seedMessage(db, {
			messageId: ids("message-resolver-deleted"),
			threadId: ids("thread-resolver-deleted"),
			senderId: ids("user-resolver-deleted"),
			deletedAt: new Date().toISOString(),
		});

		await expect(
			resolveAssistantTurnRequest(db, ids("message-resolver-deleted"), { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects a redacted message", async ({ db, ids }) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		await seedThread(db, {
			threadId: ids("thread-resolver-redacted"),
			senderId: ids("user-resolver-redacted"),
			assistantId: `ast-${ids("user-resolver-redacted")}`,
		});
		await db.insert(users).values({
			id: `ast-${ids("user-resolver-redacted")}`,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await seedMessage(db, {
			messageId: ids("message-resolver-redacted"),
			threadId: ids("thread-resolver-redacted"),
			senderId: ids("user-resolver-redacted"),
			redactedAt: new Date().toISOString(),
		});

		await expect(
			resolveAssistantTurnRequest(db, ids("message-resolver-redacted"), { requireRunnableAgent }),
		).rejects.toThrow();
	});

	test("rejects when the resolved assistant agent is not a runnable AI agent (never trusts the human sender)", async ({
		db,
		ids,
	}) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		// Deliberately do NOT seed `ast-user-resolver-unrunnable` as an AI agent —
		// the resolver must reload the real users row for the ast-<userId>
		// target and reject, never trust/derive runnability from the sender.
		await seedThread(db, {
			threadId: ids("thread-resolver-unrunnable"),
			senderId: ids("user-resolver-unrunnable"),
			assistantId: `ast-${ids("user-resolver-unrunnable")}`,
		});
		await seedMessage(db, {
			messageId: ids("message-resolver-unrunnable"),
			threadId: ids("thread-resolver-unrunnable"),
			senderId: ids("user-resolver-unrunnable"),
		});

		await expect(
			resolveAssistantTurnRequest(db, ids("message-resolver-unrunnable"), { requireRunnableAgent }),
		).rejects.toThrow();
	});
});
