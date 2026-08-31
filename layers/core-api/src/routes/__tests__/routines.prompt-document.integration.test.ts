/**
 * A routine's prompt is a knowledge document.
 *
 * It was a `routines.prompt` text column — the one instruction in the system
 * with no home in knowledge, so it could not be read, edited or reused like the
 * knowledge it plainly is. A plugin that contributes a routine had nothing to
 * contribute its prompt *to*.
 *
 * The routine now points at a document. The API still takes `prompt` text
 * because that is how a person writes one; the text lands in the document, and
 * editing that document in Knowledge changes what the routine fires with.
 */

import { type HyperIdleDb, knowledgeItems, routines, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-routine-prompt";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: "u-founder",
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{ id, name: "Builder", role: "builder", status: "active", kind: "ai", createdAt: now },
	]);
}

function routineBody(extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		name: "Weekly sweep",
		prompt: "Sweep the knowledge base for stale items.",
		ownerAgentId: "agent-owner",
		triggerType: "calendar",
		triggerConfig: '{"cron":"0 3 * * 0"}',
		...extra,
	});
}

describe("a routine's prompt is a knowledge document", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("writing a routine with a prompt creates the document it points at", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: routineBody(),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };

		const [row] = await db.select().from(routines).where(eq(routines.id, created.id));
		expect(row?.promptKnowledgeId).toBeTruthy();

		const [doc] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, String(row?.promptKnowledgeId)));
		expect(doc?.body).toBe("Sweep the knowledge base for stale items.");
	});

	test("reading the routine still returns its prompt text", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const res = await app.request(`/api/routines/${created.id}`, { headers: authHeaders() });
		const view = (await res.json()) as { routine?: { prompt?: string | null } };
		expect(view.routine?.prompt).toBe("Sweep the knowledge base for stale items.");
	});

	test("editing the document in Knowledge changes what the routine fires with", async ({
		db,
		app,
	}) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const [row] = await db.select().from(routines).where(eq(routines.id, created.id));
		const docId = String(row?.promptKnowledgeId);
		const [doc] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, docId));

		// Edited as ordinary knowledge — the whole point of it being a document.
		await app.request(`/api/knowledge/${docId}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: doc?.version,
				updatedBy: "u-founder",
				body: "Sweep only items older than 90 days.",
			}),
		});

		const view = (await (
			await app.request(`/api/routines/${created.id}`, { headers: authHeaders() })
		).json()) as { routine?: { prompt?: string | null } };
		expect(view.routine?.prompt).toBe("Sweep only items older than 90 days.");
	});

	test("changing the prompt through the routine writes through to the document", async ({
		db,
		app,
	}) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		await app.request(`/api/routines/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ prompt: "Rewritten instruction." }),
		});

		const [row] = await db.select().from(routines).where(eq(routines.id, created.id));
		const [doc] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, String(row?.promptKnowledgeId)));
		expect(doc?.body).toBe("Rewritten instruction.");
	});

	test("a routine with no prompt points at no document", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody({ prompt: undefined }),
			})
		).json()) as { id: string };

		const [row] = await db.select().from(routines).where(eq(routines.id, created.id));
		expect(row?.promptKnowledgeId).toBeNull();
	});
});
