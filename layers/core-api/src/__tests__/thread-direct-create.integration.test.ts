/**
 * `send_message`'s single-recipient find-or-create resolves a race with
 * `INSERT … ON CONFLICT (direct_key) DO NOTHING RETURNING *` inside one
 * transaction, falling back to a locked read of the winner's row when
 * nothing comes back (`layers/core-api/thread/src/thread-service.ts`'s
 * `insertDirectThread` + `findThreadForUpdate`). Proven here against real
 * concurrent sends through the real door, never a hand-built `Error`.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { SendMessageOutput } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";

const NOW = new Date().toISOString();

async function sendMessageAs(
	actorId: string,
	body: Record<string, unknown>,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Promise<{ readonly ok: boolean; readonly data?: SendMessageOutput }> {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const sendMessage = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessage) throw new Error("send_message action not found");
	const ctx: ActionContext = { actor: actorId, db, eventBus, now: new Date().toISOString() };
	const result = await sendMessage.run(ctx, body);
	return result.ok ? { ok: true, data: result.data as SendMessageOutput } : { ok: false };
}

async function seedHuman(db: HyperIdleDb, id: string, name: string): Promise<void> {
	await db.insert(users).values({
		id,
		name,
		role: "member",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
}

describe("send_message — concurrent direct-thread create", () => {
	test("five concurrent first sends to the same pair land in exactly one thread with five messages", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedHuman(db, "dc-a", "A");
		await seedHuman(db, "dc-b", "B");

		const results = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				sendMessageAs(
					"dc-a",
					{ recipients: ["dc-b"], text: `send ${i}` },
					db,
					eventBus,
					agentOrchestration,
				),
			),
		);

		for (const r of results) expect(r.ok).toBe(true);
		const threadId = results[0]?.data?.thread.id;
		expect(threadId).toBeTruthy();
		for (const r of results) expect(r.data?.thread.id).toBe(threadId);

		const directKey = `${["dc-a", "dc-b"].sort().join(":")}:user`;
		const threadRows = await db.select().from(threads).where(eq(threads.directKey, directKey));
		expect(threadRows).toHaveLength(1);
		expect(threadRows[0]?.id).toBe(threadId);

		const messageRows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId as string));
		expect(messageRows).toHaveLength(5);
	});
});
