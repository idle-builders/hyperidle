/**
 * An active thread-turn session stays visible in search_sessions after a
 * message is delivered into the same thread.
 *
 * Regression guard for the "Peek at session" line disappearing the moment
 * the person sends a mid-run message: the UI reads
 * `search_sessions { state: "active" }` and filters client-side to
 * `s.threadId === id && s.taskId === null`; if the session row loses its
 * threadId (sourceCorrelationJson changes) or disappears, the line vanishes.
 */
import { sessions, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = "2026-10-29T00:00:00.000Z";

interface SessionRow {
	readonly id: string;
	readonly threadId: string | null;
	readonly taskId: string | null;
	readonly state: string;
}

async function callAction<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; problems?: unknown }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return (await res.json()) as { ok: boolean; data?: T; problems?: unknown };
}

describe("search_sessions survives send_message", () => {
	test("active thread-turn session stays in results with threadId after message is sent", async ({
		db,
		app,
		asPerson,
	}) => {
		const TEAM_ID = "ssam-team";
		const HUMAN_ID = "ssam-human";
		const AGENT_ID = "ssam-agent";
		const THREAD_ID = "ssam-thread";
		const SESSION_ID = "ssam-session";

		await db.insert(teams).values({ id: TEAM_ID, name: "T", createdAt: NOW });
		await db.insert(users).values({
			id: HUMAN_ID,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await asPerson(HUMAN_ID);
		await db.insert(users).values({
			id: AGENT_ID,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: THREAD_ID,
			hostKind: "user",
			hostId: HUMAN_ID,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID, AGENT_ID]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// Insert an active session the provisioner would have written for a thread_turn.
		await db.insert(sessions).values({
			id: SESSION_ID,
			agentId: AGENT_ID,
			taskId: null,
			sourceKind: "assistant",
			sourceId: "ssam-seed-msg",
			sourceCorrelationJson: JSON.stringify({
				threadId: THREAD_ID,
				messageId: "ssam-seed-msg",
				userId: HUMAN_ID,
				agentId: AGENT_ID,
			}),
			modelTier: "fast",
			startedAt: NOW,
			state: "active",
		});

		// Before: session is returned with threadId and taskId null.
		const before = await callAction<SessionRow[]>(app, "search_sessions", { state: "active" });
		expect(before.ok).toBe(true);
		const beforeMatch = (before.data ?? []).find((s) => s.id === SESSION_ID);
		expect(beforeMatch?.threadId).toBe(THREAD_ID);
		expect(beforeMatch?.taskId).toBeNull();

		// Send a message on the thread — this is the action that triggers the UI refetch.
		const sent = await callAction(app, "send_message", { threadId: THREAD_ID, text: "hello" });
		expect(sent.ok).toBe(true);

		// After: session must still appear with the same threadId and null taskId.
		const after = await callAction<SessionRow[]>(app, "search_sessions", { state: "active" });
		expect(after.ok).toBe(true);
		const afterMatch = (after.data ?? []).find((s) => s.id === SESSION_ID);
		expect(afterMatch?.threadId).toBe(THREAD_ID);
		expect(afterMatch?.taskId).toBeNull();
	});
});
