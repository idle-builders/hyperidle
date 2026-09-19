/**
 * BC3 review-fix: `send_message`'s single-recipient find-or-create used to
 * catch `threads_direct_key_uq`'s unique violation by string-matching the
 * error message (`isDirectKeyConflict`) and retry the whole send in a second
 * transaction. Replaced with `INSERT … ON CONFLICT (direct_key) DO NOTHING
 * RETURNING *` inside the ONE transaction, falling back to a locked read of
 * the winner's row when nothing comes back
 * (`layers/core-api/thread/src/thread-service.ts`'s `insertDirectThread` +
 * `findThreadForUpdate`). Proven here against real concurrent sends through
 * the real door, never against a hand-built `Error`.
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import type { SendMessageOutput } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function sendMessageAs(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	actorId: string,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<SendMessageOutput> }> {
	const res = await app.request("/api/actions/send_message", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-hyperidle-actor-id": actorId },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<SendMessageOutput> };
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

describe("send_message — concurrent direct-thread create (BC3 review-fix)", () => {
	test("five concurrent first sends to the same pair land in exactly one thread with five messages", async ({
		db,
		app,
	}) => {
		await seedHuman(db, "dc-a", "A");
		await seedHuman(db, "dc-b", "B");

		const results = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				sendMessageAs(app, "dc-a", { recipients: ["dc-b"], text: `send ${i}` }),
			),
		);

		for (const r of results) expect(r.status).toBe(200);
		const threadId = results[0]?.body.data?.thread.id;
		expect(threadId).toBeTruthy();
		for (const r of results) expect(r.body.data?.thread.id).toBe(threadId);

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
