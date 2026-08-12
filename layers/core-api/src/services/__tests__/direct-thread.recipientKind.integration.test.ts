/**
 * Q1 — AC3: findOrCreateDirectThread with recipientKind parameter.
 *
 * The architecture plan §3.1 extends findOrCreateDirectThread to accept
 * a recipientKind: "agent" | "user" parameter that determines the hostKind
 * on the created thread. Default to "agent" for backward compatibility.
 */

import { findOrCreateDirectThread } from "@hyperidle/conversation";
import { type HyperIdleDb, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function seedUsers(db: HyperIdleDb, senderId: string, recipientId: string): Promise<void> {
	await db.insert(users).values({
		id: senderId,
		name: "Sender Agent",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: recipientId,
		name: "Agent Recipient",
		role: "builder",
		status: "active",
		kind: "ai",
		createdAt: NOW,
	});
}

describe("findOrCreateDirectThread — recipientKind (Q1 §3.1)", () => {
	test("creates a thread with hostKind='agent' when recipientKind='agent'", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const threadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "agent");

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
		expect(row?.hostId).toBe(recipientId);
		const parts = JSON.parse(row?.participants ?? "[]") as string[];
		expect(parts).toContain(senderId);
		expect(parts).toContain(recipientId);
	});

	test("creates a thread with hostKind='user' when recipientKind='user'", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const threadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "user");

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("user");
		expect(row?.hostId).toBe(recipientId);
	});

	test("defaults to hostKind='agent' when recipientKind is omitted", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const threadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW);

		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
	});

	test("returns existing thread id on second call with the same params", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const id1 = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "agent");
		const id2 = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "agent");
		expect(id1).toBe(id2);
	});

	test("creates separate threads for agent vs user recipient kinds", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const agentThreadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "agent");
		const userThreadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "user");
		expect(agentThreadId).not.toBe(userThreadId);
	});

	test("stores initiatorId = senderId on newly created threads", async ({ db, ids }) => {
		const senderId = ids("sender-1");
		const recipientId = ids("agent-recipient");
		await seedUsers(db, senderId, recipientId);
		const threadId = await findOrCreateDirectThread(db, senderId, recipientId, NOW, "agent");
		const [row] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
		expect(row?.initiatorId).toBe(senderId);
	});
});
