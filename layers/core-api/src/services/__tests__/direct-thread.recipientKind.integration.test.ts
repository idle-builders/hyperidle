/**
 * A single-recipient `send_message` derives the direct thread's `hostKind`
 * from the recipient's own `kind` (ai -> "agent", human -> "user"), and
 * reuses the same thread on a second send to the same recipient.
 *
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import type { SendMessageOutput } from "@hyperidle/domain-model";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

/** Overrides ctx.actor so a run with several human users stays unambiguous. */
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

async function seedSender(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		name: "Sender",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
}

async function seedAgentRecipient(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		name: "Agent Recipient",
		role: "builder",
		status: "active",
		kind: "ai",
		createdAt: NOW,
	});
}

async function seedHumanRecipient(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		name: "Human Recipient",
		role: "member",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
}

describe("send_message — single-recipient direct thread hostKind", () => {
	test("an ai recipient creates a thread with hostKind='agent'", async ({ db, app }) => {
		await seedSender(db, "sender-1");
		await seedAgentRecipient(db, "agent-recipient-1");

		const res = await sendMessageAs(app, "sender-1", {
			recipients: ["agent-recipient-1"],
			text: "hi",
		});
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("agent");
		expect(res.body.data?.thread.hostId).toBe("agent-recipient-1");
		expect(res.body.data?.thread.initiatorId).toBe("sender-1");
	});

	test("a human recipient creates a thread with hostKind='user'", async ({ db, app }) => {
		await seedSender(db, "sender-2");
		await seedHumanRecipient(db, "human-recipient-1");

		const res = await sendMessageAs(app, "sender-2", {
			recipients: ["human-recipient-1"],
			text: "hi",
		});
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("user");
		expect(res.body.data?.thread.hostId).toBe("human-recipient-1");
	});

	test("a second send to the same recipient reuses the same thread", async ({ db, app }) => {
		await seedSender(db, "sender-3");
		await seedAgentRecipient(db, "agent-recipient-2");

		const first = await sendMessageAs(app, "sender-3", {
			recipients: ["agent-recipient-2"],
			text: "one",
		});
		const second = await sendMessageAs(app, "sender-3", {
			recipients: ["agent-recipient-2"],
			text: "two",
		});
		expect(first.body.data?.thread.id).toBe(second.body.data?.thread.id);
	});
});
