/**
 * Q1 — AC3: findOrCreateDirectThread with recipientKind parameter.
 *
 * The architecture plan §3.1 extends findOrCreateDirectThread to accept
 * a recipientKind: "agent" | "user" parameter that determines the hostKind
 * on the created thread. Default to "agent" for backward compatibility.
 */

import { createTestDb, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { beforeEach, describe, expect, it } from "vitest";
import { findOrCreateDirectThread } from "../direct-thread.js";

const NOW = new Date().toISOString();

describe("findOrCreateDirectThread — recipientKind (Q1 §3.1)", () => {
	let db: HyperIdleDb;

	beforeEach(async () => {
		const handle = await createTestDb();
		db = handle.db;
		await db.insert(users).values({
			id: "sender-1",
			name: "Sender Agent",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: "agent-recipient",
			name: "Agent Recipient",
			role: "builder",
			status: "active",
			kind: "ai",
			createdAt: NOW,
		});
	});

	it("creates a thread with hostKind='agent' when recipientKind='agent'", async () => {
		const threadId = await findOrCreateDirectThread(
			db,
			"sender-1",
			"agent-recipient",
			NOW,
			"agent",
		);

		const rows = await db.select().from(threads);
		const row = rows.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
		expect(row?.hostId).toBe("agent-recipient");
		const parts = JSON.parse(row?.participants ?? "[]") as string[];
		expect(parts).toContain("sender-1");
		expect(parts).toContain("agent-recipient");
	});

	it("creates a thread with hostKind='user' when recipientKind='user'", async () => {
		const threadId = await findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "user");

		const rows = await db.select().from(threads);
		const row = rows.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("user");
		expect(row?.hostId).toBe("agent-recipient");
	});

	it("defaults to hostKind='agent' when recipientKind is omitted", async () => {
		const threadId = await findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW);

		const rows = await db.select().from(threads);
		const row = rows.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
	});

	it("returns existing thread id on second call with the same params", async () => {
		const id1 = await findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		const id2 = await findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		expect(id1).toBe(id2);
	});

	it("creates separate threads for agent vs user recipient kinds", async () => {
		const agentThreadId = await findOrCreateDirectThread(
			db,
			"sender-1",
			"agent-recipient",
			NOW,
			"agent",
		);
		const userThreadId = await findOrCreateDirectThread(
			db,
			"sender-1",
			"agent-recipient",
			NOW,
			"user",
		);
		expect(agentThreadId).not.toBe(userThreadId);
	});

	it("stores initiatorId = senderId on newly created threads", async () => {
		const threadId = await findOrCreateDirectThread(
			db,
			"sender-1",
			"agent-recipient",
			NOW,
			"agent",
		);
		const rows = await db.select().from(threads);
		const row = rows.find((t) => t.id === threadId);
		expect(row?.initiatorId).toBe("sender-1");
	});
});
