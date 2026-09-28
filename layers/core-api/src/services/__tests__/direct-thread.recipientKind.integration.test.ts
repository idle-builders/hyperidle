/**
 * A single-recipient `send_message` derives the direct thread's `hostKind`
 * from the recipient's own `kind` (ai -> "agent", human -> "user"), and
 * reuses the same thread on a second send to the same recipient.
 *
 * @lore send_message's single-recipient branch inlines its own find-or-create — this test drives the real send_message action door.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, users } from "@hyperidle/db";
import type { SendMessageOutput } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import type { ActionContext } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";

const NOW = new Date().toISOString();

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function sendMessageAs(
	actorId: string,
	body: Record<string, unknown>,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<SendMessageOutput> }> {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const sendMessage = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessage) throw new Error("send_message action not found");
	const ctx: ActionContext = { actor: actorId, db, eventBus, now: new Date().toISOString() };
	const result = await sendMessage.run(ctx, body);
	return result.ok
		? { status: 200, body: { ok: true, data: result.data as SendMessageOutput } }
		: { status: 422, body: { ok: false } };
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
	test("an ai recipient creates a thread with hostKind='agent'", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedSender(db, "sender-1");
		await seedAgentRecipient(db, "agent-recipient-1");

		const res = await sendMessageAs(
			"sender-1",
			{ recipients: ["agent-recipient-1"], text: "hi" },
			db,
			eventBus,
			agentOrchestration,
		);
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("agent");
		expect(res.body.data?.thread.hostId).toBe("agent-recipient-1");
		expect(res.body.data?.thread.initiatorId).toBe("sender-1");
	});

	test("a human recipient creates a thread with hostKind='user'", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedSender(db, "sender-2");
		await seedHumanRecipient(db, "human-recipient-1");

		const res = await sendMessageAs(
			"sender-2",
			{ recipients: ["human-recipient-1"], text: "hi" },
			db,
			eventBus,
			agentOrchestration,
		);
		expect(res.status).toBe(200);
		expect(res.body.data?.thread.hostKind).toBe("user");
		expect(res.body.data?.thread.hostId).toBe("human-recipient-1");
	});

	test("a second send to the same recipient reuses the same thread", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedSender(db, "sender-3");
		await seedAgentRecipient(db, "agent-recipient-2");

		const first = await sendMessageAs(
			"sender-3",
			{ recipients: ["agent-recipient-2"], text: "one" },
			db,
			eventBus,
			agentOrchestration,
		);
		const second = await sendMessageAs(
			"sender-3",
			{ recipients: ["agent-recipient-2"], text: "two" },
			db,
			eventBus,
			agentOrchestration,
		);
		expect(first.body.data?.thread.id).toBe(second.body.data?.thread.id);
	});
});
