/**
 * A knowledge document's role is an ordinary editable field.
 *
 * A skill, a rule and an agent file are knowledge documents that carry a role.
 * Until now the only writer of `role` was the plugin installer, so a capability
 * could exist only if a plugin brought it: `createKnowledgeSchema` had no `role`
 * field and `updateKnowledgeSchema` could not change one. That made the plugin a
 * special kind of author rather than one writer among several.
 *
 * These cover the write side through the real HTTP route — set a role when
 * writing a document, and change one afterwards so an ordinary note can be
 * promoted into a skill.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-knowledge-role";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedFounder(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(users).values({
		id: userId,
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

function createBody(extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		title: "Knowledge decay sweep",
		body: "# How to sweep stale knowledge",
		format: "markdown",
		updatedBy: "u-founder",
		scopeKind: "factory",
		...extra,
	});
}

describe("a knowledge document's role", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("is written when the document is created with one", async ({ db, app }) => {
		await seedFounder(db, "u-founder");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ role: "skill" }),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role).toBe("skill");
	});

	test("defaults to ordinary when none is given", async ({ db, app }) => {
		await seedFounder(db, "u-founder");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody(),
		});

		const created = (await res.json()) as { id: string };
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role).toBe("ordinary");
	});

	test("can be changed afterwards, promoting an ordinary note into a skill", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody(),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const patchRes = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "skill",
			}),
		});

		expect(patchRes.status).toBe(200);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role).toBe("skill");
	});

	test("can be changed back, demoting a skill to an ordinary note", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ role: "skill" }),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "ordinary",
			}),
		});

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role).toBe("ordinary");
	});

	test("rejects a role outside the vocabulary", async ({ db, app }) => {
		await seedFounder(db, "u-founder");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ role: "wizard" }),
		});

		expect(res.status).toBe(400);
	});

	/**
	 * The point of an editable role: a note promoted in the product is picked up
	 * by context assembly as a skill on the next session, with nothing else done
	 * to it. Without this the field is just a column.
	 */
	test("a promoted note is delivered to a session as a skill", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ status: "active" }),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const before = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-alpha",
		});
		// Asserted as present-and-ordinary rather than merely "not a skill", which
		// would also pass if assembly never returned the item at all.
		expect(before.find((i) => i.id === created.id)?.role).toBe("ordinary");

		await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "skill",
			}),
		});

		const after = await assembleSessionKnowledge(db, {
			teamId: "team-alpha",
			agentRole: "builder",
			taskDescription: "anything",
			agentId: "agent-alpha",
		});
		expect(after.find((i) => i.id === created.id)?.role).toBe("skill");
	});

	/**
	 * Scope is a field on the document, so it is edited where every other field
	 * is. It used to have its own endpoint demanding a `reason` — a string that
	 * was concatenated into an edit-log value and never read by anything.
	 */
	test("scope is changed through the same edit, with no ceremony", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody(),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const res = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				scopeKind: "team",
				scopeId: "team-alpha",
			}),
		});

		expect(res.status).toBe(200);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.scopeKind).toBe("team");
		expect(row?.scopeId).toBe("team-alpha");
	});

	test("role and scope change together in one edit, under one version bump", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody(),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const res = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "skill",
				scopeKind: "team",
				scopeId: "team-alpha",
			}),
		});
		expect(res.status).toBe(200);

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role).toBe("skill");
		expect(row?.scopeKind).toBe("team");
		// One edit, one bump — not two round trips that can half-fail.
		expect(row?.version).toBe(created.version + 1);
	});

	test("the kernel and the projection agree on scope after an edit", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody(),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				scopeKind: "team",
				scopeId: "team-alpha",
			}),
		});

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, created.id));
		// The list query ORs these two columns, so a disagreement silently changes
		// who can find the document.
		expect(proj?.scopeId).toBe(row?.scopeId);
	});
});
