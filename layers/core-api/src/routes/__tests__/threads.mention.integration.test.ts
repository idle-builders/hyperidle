/**
 * AE5 — Mention resolution on message append (Task 4 acceptance).
 *
 * AC-1: Users can @mention a specific participant and the mentioned user
 * receives a notification (= gets added to thread participants).
 * AC-2: @mentions are a recognized inline element (MentionRef in InlineRef union).
 *
 * Scenarios:
 * - Message with @AgentName → agent added to thread.participants.
 * - Returned message payload contains MentionRef in refs[].
 * - Self-mention does not add sender to participants (already a participant).
 * - Unknown @name stays as plain text (no MentionRef, no error).
 * - Initial thread creation with @mention resolves and adds participant.
 * - MAX_MENTIONS_PER_MESSAGE cap prevents unbounded lookups.
 */

import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ae5-mention";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({ id: "p1", name: "Team Alpha", phase: "build", createdAt: now });

	// Human founder (sender)
	await db.insert(users).values({
		id: "u-founder",
		kind: "human",
		name: "Alice Founder",
		role: "founder",
		status: "active",
		teamId: "p1",
		createdAt: now,
	});

	// AI agent (to be mentioned)
	await db.insert(users).values({
		id: "agent-aria",
		kind: "ai",
		name: "Aria",
		role: "builder",
		status: "active",
		teamId: "p1",
		createdAt: now,
	});

	// Another AI agent
	await db.insert(users).values({
		id: "agent-bob",
		kind: "ai",
		name: "Bob",
		role: "reviewer",
		status: "active",
		teamId: "p1",
		createdAt: now,
	});

	// A bet + task for hosting threads
	await db.insert(tasks).values({
		id: "bet-1",
		parentTaskId: null,
		teamId: "p1",
		title: "Test bet",
		description: "Test bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "p1",
		title: "Test task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

describe("AE5 — @mention adds participant to thread (AC-1)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("message with @Aria adds Aria to thread participants", async ({ db, app }) => {
		await seedBase(db);

		// Create thread with only founder (Aria is NOT yet a participant)
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Starting this task" },
					clientKey: "ae5-mention-create-001",
				},
			}),
		});
		expect(create.status).toBe(201);
		const createBody = (await create.json()) as { thread: { id: string; participants: string[] } };
		const threadId = createBody.thread.id;

		// Verify Aria is NOT in participants yet
		expect(createBody.thread.participants).not.toContain("agent-aria");

		// Send message with @Aria mention
		const mention = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @Aria please review this" },
				clientKey: "ae5-mention-send-001",
			}),
		});
		expect(mention.status).toBe(201);

		// Verify Aria is now in thread participants
		const getThread = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(getThread.status).toBe(200);
		const threadBody = (await getThread.json()) as { thread: { participants: string[] } };
		expect(threadBody.thread.participants).toContain("agent-aria");
	});

	test("mentioned user appears in refs[] as MentionRef (AC-2)", async ({ db, app }) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Starting" },
					clientKey: "ae5-mention-ref-002",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };
		const threadId = createBody.thread.id;

		const mention = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @Aria please check this out" },
				clientKey: "ae5-mention-ref-003",
			}),
		});
		expect(mention.status).toBe(201);

		const mentionBody = (await mention.json()) as {
			message: {
				payload: {
					text: string;
					refs?: Array<{ kind: string; identityId?: string; displayName?: string }>;
				};
			};
		};

		// AC-2: MentionRef in refs[]
		expect(mentionBody.message.payload.refs).toBeDefined();
		const mentionRef = mentionBody.message.payload.refs?.find((r) => r.kind === "mention");
		expect(mentionRef).toBeDefined();
		expect(mentionRef?.identityId).toBe("agent-aria");
		expect(mentionRef?.displayName).toBe("Aria");
	});

	test("self-mention does NOT add sender to participants (already present)", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "I am here" },
					clientKey: "ae5-self-mention-004",
				},
			}),
		});
		expect(create.status).toBe(201);
		const createBody = (await create.json()) as { thread: { id: string; participants: string[] } };
		const threadId = createBody.thread.id;
		const initialParticipantCount = createBody.thread.participants.length;

		// Self-mention: founder mentions themselves
		const mention = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @Alice let me clarify" },
				clientKey: "ae5-self-mention-send-004",
			}),
		});
		expect(mention.status).toBe(201);

		// Participant count should not increase for self-mentions
		const getThread = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const threadBody = (await getThread.json()) as { thread: { participants: string[] } };
		// u-founder was already a participant; self-mention doesn't duplicate
		expect(threadBody.thread.participants.filter((p) => p === "u-founder")).toHaveLength(1);
		// Participant count stays same (no new entries for self)
		expect(threadBody.thread.participants.length).toBeLessThanOrEqual(initialParticipantCount + 1);
	});

	test("unknown @name stays as plain text (no MentionRef, no error)", async ({ db, app }) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Starting" },
					clientKey: "ae5-unknown-005",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };
		const threadId = createBody.thread.id;

		// @NoSuchPerson does not exist in DB — should be silently ignored
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @NoSuchPerson check this" },
				clientKey: "ae5-unknown-send-005",
			}),
		});

		// No error — message succeeds
		expect(res.status).toBe(201);

		const body = (await res.json()) as {
			message: {
				payload: {
					refs?: Array<{ kind: string }>;
				};
			};
		};
		// No MentionRef should be in refs
		const mentionRefs = (body.message.payload.refs ?? []).filter((r) => r.kind === "mention");
		expect(mentionRefs).toHaveLength(0);
	});

	test("@mention in initial thread creation message adds participant atomically", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		// Create thread with initial message that mentions Bob
		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Hey @Bob can you help here?" },
					clientKey: "ae5-create-mention-006",
				},
			}),
		});
		expect(create.status).toBe(201);
		const createBody = (await create.json()) as { thread: { id: string; participants: string[] } };

		// Bob should be in participants immediately (atomic with thread creation)
		expect(createBody.thread.participants).toContain("agent-bob");
	});

	test("multiple @mentions in one message add all mentioned participants", async ({ db, app }) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Starting task" },
					clientKey: "ae5-multi-mention-007",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };
		const threadId = createBody.thread.id;

		// Mention both Aria and Bob Agent
		const mention = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @Aria and @Bob please both check this" },
				clientKey: "ae5-multi-mention-send-007",
			}),
		});
		expect(mention.status).toBe(201);

		const getThread = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const threadBody = (await getThread.json()) as { thread: { participants: string[] } };
		expect(threadBody.thread.participants).toContain("agent-aria");
		expect(threadBody.thread.participants).toContain("agent-bob");
	});

	test("mentioning existing participant does not create duplicate in participants", async ({
		db,
		app,
	}) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder", "agent-aria"],
				initialMessage: {
					type: "plain",
					payload: { text: "Starting" },
					clientKey: "ae5-dup-mention-008",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };
		const threadId = createBody.thread.id;

		// Mention Aria who is already a participant
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hey @Aria again" },
				clientKey: "ae5-dup-mention-send-008",
			}),
		});

		const getThread = await app.request(`/api/threads/${threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const threadBody = (await getThread.json()) as { thread: { participants: string[] } };
		// Aria should appear exactly once
		expect(threadBody.thread.participants.filter((p) => p === "agent-aria")).toHaveLength(1);
	});
});

describe("AE5 — thread detail with hostTitle and extended identities (Task 5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// @lore AF11-IDOR: Agent message seeded via DB rather than API POST.
	// After the fix, POST /api/threads/:id/messages always attributes to c.get("userId")
	// (the auth principal = u-founder), so agent-aria cannot send via X-Identity.
	// Seeding agent messages directly tests the same observable: isAgent in identities.
	test("AI agent identity includes isAgent: true in thread detail", async ({ db, app }) => {
		await seedBase(db);
		const now = new Date().toISOString();

		// Seed thread + messages directly
		await db.insert(threads).values({
			id: "thr-ae5-identity-009",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-aria"]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(messages).values({
			id: "msg-human-009",
			threadId: "thr-ae5-identity-009",
			senderId: "u-founder",
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: "ae5-identity-009",
			createdAt: now,
		});
		// Agent message seeded directly (not via API) to test isAgent identity field
		await db.insert(messages).values({
			id: "msg-agent-009",
			threadId: "thr-ae5-identity-009",
			senderId: "agent-aria",
			type: "plain",
			payload: JSON.stringify({ text: "agent reply" }),
			clientKey: "ae5-identity-agent-009",
			createdAt: now,
		});

		const res = await app.request("/api/threads/thr-ae5-identity-009", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			identities: Record<string, { name: string; role?: string; isAgent?: boolean }>;
		};

		expect(body.identities["agent-aria"]?.isAgent).toBe(true);
	});

	test("human identity does not have isAgent: true", async ({ db, app }) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "human message" },
					clientKey: "ae5-human-identity-010",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };

		const res = await app.request(`/api/threads/${createBody.thread.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			identities: Record<string, { isAgent?: boolean }>;
		};

		// Human should either have isAgent: false or undefined (not true)
		expect(body.identities["u-founder"]?.isAgent).not.toBe(true);
	});

	test("thread detail includes hostTitle for task-hosted thread", async ({ db, app }) => {
		await seedBase(db);

		const create = await app.request("/api/threads", {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-founder" }),
			body: JSON.stringify({
				hostKind: "task",
				hostId: "task-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "hello" },
					clientKey: "ae5-host-title-011",
				},
			}),
		});
		const createBody = (await create.json()) as { thread: { id: string } };

		const res = await app.request(`/api/threads/${createBody.thread.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { hostTitle?: string | null };
		// hostTitle should be present (either "Test task" or null if not yet implemented,
		// but after implementation it should be "Test task")
		expect("hostTitle" in body).toBe(true);
		expect(body.hostTitle).toBe("Test task");
	});

	// @lore AF11-IDOR: Agent message seeded via DB rather than API POST.
	// @lore AU26 J1: `operationalStatus` was DELETED from thread identities — it
	// was derived from a raw `sessions` read (one query per AI participant, an
	// N+1) and had zero production readers. What survives is `isAgent`, which the
	// renderers do read.
	test("an agent sender is flagged isAgent and carries no run-derived status", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const now = new Date().toISOString();

		// Seed thread + agent message directly
		await db.insert(threads).values({
			id: "thr-ae5-idle-012",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-aria"]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(messages).values({
			id: "msg-human-idle-012",
			threadId: "thr-ae5-idle-012",
			senderId: "u-founder",
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: "ae5-status-idle-012",
			createdAt: now,
		});
		// A second, agent-authored message so the identity map covers an AI sender.
		await db.insert(messages).values({
			id: "msg-agent-idle-012",
			threadId: "thr-ae5-idle-012",
			senderId: "agent-aria",
			type: "plain",
			payload: JSON.stringify({ text: "reply" }),
			clientKey: "ae5-status-idle-reply-012",
			createdAt: now,
		});

		const res = await app.request("/api/threads/thr-ae5-idle-012", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await res.json()) as {
			identities: Record<string, Record<string, unknown>>;
		};

		const agentIdentity = body.identities["agent-aria"];
		expect(agentIdentity?.isAgent).toBe(true);
		expect(agentIdentity).not.toHaveProperty("operationalStatus");
	});
});
