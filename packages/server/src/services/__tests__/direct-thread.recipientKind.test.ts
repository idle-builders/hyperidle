/**
 * Q1 — AC3: findOrCreateDirectThread with recipientKind parameter.
 *
 * The architecture plan §3.1 extends findOrCreateDirectThread to accept
 * a recipientKind: "agent" | "user" parameter that determines the hostKind
 * on the created thread. Default to "agent" for backward compatibility.
 */

import { createTestDb, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOrCreateDirectThread } from "../direct-thread.js";

const NOW = new Date().toISOString();

describe("findOrCreateDirectThread — recipientKind (Q1 §3.1)", () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
		// Seed two users so FK constraints on initiatorId/participants are met
		// @lore P2: agents → users table; kind:"human" for founder, "ai" for AI agents
		db.insert(users)
			.values({
				id: "sender-1",
				name: "Sender Agent",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: NOW,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-recipient",
				name: "Agent Recipient",
				role: "builder",
				status: "active",
				kind: "ai",
				createdAt: NOW,
			})
			.run();
	});

	afterEach(() => {
		// createTestDb() uses an in-memory db — no cleanup needed
	});

	// AC3: selecting an agent recipient creates thread with hostKind="agent"
	it("creates a thread with hostKind='agent' when recipientKind='agent'", () => {
		const threadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");

		const row = db
			.select()
			.from(threads)
			.all()
			.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
		expect(row?.hostId).toBe("agent-recipient");
		const parts = JSON.parse(row?.participants ?? "[]") as string[];
		expect(parts).toContain("sender-1");
		expect(parts).toContain("agent-recipient");
	});

	// AC3: selecting a user recipient creates thread with hostKind="user"
	it("creates a thread with hostKind='user' when recipientKind='user'", () => {
		const threadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "user");

		const row = db
			.select()
			.from(threads)
			.all()
			.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("user");
		expect(row?.hostId).toBe("agent-recipient");
	});

	// Backward compat: omitting recipientKind defaults to "agent"
	it("defaults to hostKind='agent' when recipientKind is omitted", () => {
		const threadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW);

		const row = db
			.select()
			.from(threads)
			.all()
			.find((t) => t.id === threadId);
		expect(row).toBeDefined();
		expect(row?.hostKind).toBe("agent");
	});

	// Reuse: a second call returns the same thread id (same kind)
	it("returns existing thread id on second call with the same params", () => {
		const id1 = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		const id2 = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		expect(id1).toBe(id2);
	});

	// Distinct kinds → distinct threads
	it("creates separate threads for agent vs user recipient kinds", () => {
		const agentThreadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		const userThreadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "user");
		expect(agentThreadId).not.toBe(userThreadId);
	});

	// Thread metadata: initiatorId, lastActiveAt, createdAt
	it("stores initiatorId = senderId on newly created threads", () => {
		const threadId = findOrCreateDirectThread(db, "sender-1", "agent-recipient", NOW, "agent");
		const row = db
			.select()
			.from(threads)
			.all()
			.find((t) => t.id === threadId);
		expect(row?.initiatorId).toBe("sender-1");
	});
});
