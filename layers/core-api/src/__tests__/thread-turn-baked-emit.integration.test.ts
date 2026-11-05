/**
 * The wake rule (`@hyperidle/thread`'s `send_message` action) wakes the agent
 * via an inbox row at emit time, so the agent has a reason to run with the
 * full context of what triggered it.
 */

import { type HyperIdleDb, threads, users } from "@hyperidle/db";
import { listInboxRows } from "@hyperidle/user";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

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
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/**
 * A 2-member thread (human + agent) — `agentsToWake` wakes the other member
 * with no @-mention needed once the thread has exactly two members
 * (`actions/thread.ts`'s `agentsToWake`).
 */
async function seedTwoMemberThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly agentId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: options.agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "agent",
		hostId: options.agentId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.agentId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("the wake rule creates an inbox row for the agent at emit time (send_message)", () => {
	test("posting a plain message in a two-member thread creates an inbox row for the woken agent", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedTwoMemberThread(db, {
			threadId: "thread-bake-emit-1",
			senderId: "user-bake-emit-1",
			agentId: "agent-bake-emit-1",
		});
		await asPerson("user-bake-emit-1");

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId: "thread-bake-emit-1",
			text: "hello agent",
		});
		expect(res.status).toBe(200);

		const inboxRows = await listInboxRows(db, { userId: "agent-bake-emit-1" });
		expect(inboxRows.filter((r) => r.reason === "message")).toHaveLength(1);
	});
});
