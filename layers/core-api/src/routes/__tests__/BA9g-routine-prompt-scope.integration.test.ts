/**
 * A routine's prompt is scoped to whoever the routine belongs to.
 *
 * The scope was hardcoded `factory` / `L4` — org-wide — for every routine
 * anybody wrote. One team's routine published its instruction to the whole
 * organisation, and a plugin installed for one team did the same.
 *
 * Founder: "routine prompts should not be hardcoded, nothing like that should
 * ever be hardcoded… our system basically comes empty out of the box 'minimal'
 * and plugins or the human add stuff to it to make it more useful."
 *
 * A prompt is knowledge, so it takes its owner's scope: an agent on a team
 * scopes to that team, an agent on no team stays factory-wide.
 */

import { type HyperIdleDb, knowledgeItems, teams, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

/** The knowledge document parented to this routine's prompt slot. */
async function findPromptDocId(db: HyperIdleDb, routineId: string): Promise<string> {
	const [row] = await db
		.select({ id: knowledgeItems.id })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, "routine"),
				eq(knowledgeItems.parentId, routineId),
				eq(knowledgeItems.role, "prompt"),
			),
		);
	return String(row?.id);
}

const TEST_API_KEY = "test-key-ba9g-prompt-scope";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedWorld(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-scope", name: "Acme", phase: "active", createdAt: now });
	await db.insert(users).values([
		{
			id: "u-founder-scope",
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{
			id: "agent-on-team",
			name: "Builder",
			role: "builder",
			status: "active",
			kind: "ai",
			teamId: "team-scope",
			createdAt: now,
		},
		{
			id: "agent-no-team",
			name: "Loner",
			role: "builder",
			status: "active",
			kind: "ai",
			createdAt: now,
		},
	]);
}

async function createRoutine(app: Hono, db: HyperIdleDb, ownerAgentId: string): Promise<string> {
	const res = await app.request("/api/routines", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			name: "Weekly sweep",
			prompt: "Sweep the knowledge base for stale items.",
			ownerAgentId,
			triggerType: "calendar",
			triggerConfig: '{"cron":"0 3 * * 0"}',
		}),
	});
	expect(res.status).toBe(201);
	const body = (await res.json()) as { id: string };
	return findPromptDocId(db, body.id);
}

describe("a routine's prompt takes its owner's scope", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a team agent's routine prompt is that team's knowledge", async ({ db, app }) => {
		await seedWorld(db);
		const docId = await createRoutine(app, db, "agent-on-team");

		const [doc] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, docId));
		expect(doc?.scopeKind, "not the whole organisation's").toBe("team");
		expect(doc?.scopeId).toBe("team-scope");
	});

	test("an agent on no team still writes a factory-wide prompt", async ({ db, app }) => {
		await seedWorld(db);
		const docId = await createRoutine(app, db, "agent-no-team");

		const [doc] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, docId));
		expect(doc?.scopeKind).toBe("factory");
		expect(doc?.scopeId).toBeNull();
	});

	test("adding a prompt to an existing routine scopes it the same way", async ({ db, app }) => {
		await seedWorld(db);

		// A routine created without a prompt has no document yet.
		const created = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Silent sweep",
				ownerAgentId: "agent-on-team",
				triggerType: "calendar",
				triggerConfig: '{"cron":"0 3 * * 0"}',
			}),
		});
		expect(created.status).toBe(201);
		const { id } = (await created.json()) as { id: string };

		const patched = await app.request(`/api/routines/${id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ prompt: "Now it has one." }),
		});
		expect(patched.status).toBe(200);
		const promptKnowledgeId = await findPromptDocId(db, id);

		const [doc] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, promptKnowledgeId));
		expect(doc?.scopeKind, "the PATCH path must not re-hardcode it").toBe("team");
		expect(doc?.scopeId).toBe("team-scope");
	});
});
