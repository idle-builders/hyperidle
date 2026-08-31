/**
 * Deleting a routine takes its prompt document with it.
 *
 * BA9f made a routine's instruction a knowledge document the routine points at.
 * Deleting the routine left the document behind: an orphan in the knowledge view
 * titled "<name> — prompt", belonging to a routine that no longer exists, which
 * nothing could ever reach again.
 *
 * Archived, not hard-deleted — `knowledge_edit_log` and friends hold RESTRICT
 * FKs on `knowledge_items.id`, and the audit trail outlives its subject.
 */

import { type HyperIdleDb, knowledgeItems, routines, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-routine-delete";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

async function seedAgent(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: "u-founder-rd",
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{
			id: "agent-rd",
			name: "Sweeper",
			role: "builder",
			status: "active",
			kind: "ai",
			createdAt: now,
		},
	]);
}

async function createRoutine(app: Hono): Promise<string> {
	const res = await app.request("/api/routines", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({
			name: "Weekly sweep",
			prompt: "Sweep the stale items.",
			ownerAgentId: "agent-rd",
			triggerType: "calendar",
			triggerConfig: '{"cron":"0 3 * * 0"}',
		}),
	});
	expect(res.status).toBe(201);
	return ((await res.json()) as { id: string }).id;
}

describe("deleting a routine takes its prompt document with it", () => {
	test("the prompt document is archived, not left behind", async ({ db, app }) => {
		await seedAgent(db);
		const routineId = await createRoutine(app);

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId));
		const docId = String(row?.promptKnowledgeId);
		expect(docId, "the routine points at a prompt document").toBeTruthy();

		const del = await app.request(`/api/routines/${routineId}`, {
			method: "DELETE",
			headers: auth(),
		});
		expect(del.status).toBe(200);

		const [doc] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, docId));
		// Still there for the audit trail's sake, but out of every live view.
		expect(doc, "the row survives — audit tables hold RESTRICT FKs on it").toBeDefined();
		expect(doc?.status, "and it is archived, not live").toBe("archived");
	});

	test("a routine that never had a prompt deletes cleanly", async ({ db, app }) => {
		await seedAgent(db);
		const res = await app.request("/api/routines", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({
				name: "No prompt",
				ownerAgentId: "agent-rd",
				triggerType: "calendar",
				triggerConfig: '{"cron":"0 3 * * 0"}',
			}),
		});
		expect(res.status).toBe(201);
		const routineId = ((await res.json()) as { id: string }).id;

		const del = await app.request(`/api/routines/${routineId}`, {
			method: "DELETE",
			headers: auth(),
		});
		expect(del.status).toBe(200);
	});

	test("deleting one routine leaves another's prompt alone", async ({ db, app }) => {
		await seedAgent(db);
		const doomed = await createRoutine(app);
		const spared = await createRoutine(app);

		const [sparedRow] = await db.select().from(routines).where(eq(routines.id, spared));
		const sparedDocId = String(sparedRow?.promptKnowledgeId);

		await app.request(`/api/routines/${doomed}`, { method: "DELETE", headers: auth() });

		const [doc] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, sparedDocId));
		expect(doc?.status, "the surviving routine still has its instruction").toBe("active");
	});
});
