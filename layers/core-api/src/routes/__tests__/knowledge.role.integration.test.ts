/**
 * A knowledge document's role is set at creation, never edited afterwards.
 *
 * A skill, a rule and an agent file are knowledge documents that carry a role.
 * BA9e made role an editable field so a plugin was not the only writer — but
 * that opened two defects: a person could change a routine prompt's role away
 * from `prompt` (the routine then silently runs on its name), or promote an
 * ordinary note into a stray `prompt`. knowledge-attachment-slot closes both
 * by making role create-only: every creator writes a role through its own
 * list (routines, agents, the skills-and-rules settings surface), and no
 * later edit can change it.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
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

describe("a knowledge document's role is set at creation", () => {
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
	 * `z.object` strips unknown keys, so a PATCH carrying `role` is silently
	 * ignored rather than rejected — this is the guard that closes both
	 * defects the critique found: role cannot drift away from what created
	 * the document.
	 */
	test("a PATCH carrying role leaves the role unchanged", async ({ db, app }) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ role: "skill" }),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const patchRes = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "ordinary",
			}),
		});

		expect(patchRes.status).toBe(200);
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role, "the PATCH's role is ignored, not applied").toBe("skill");
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

	test("a scope edit that also carries role changes scope and leaves role alone, under one version bump", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "u-founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ role: "skill" }),
		});
		const created = (await createRes.json()) as { id: string; version: number };

		const res = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "u-founder",
				role: "ordinary",
				scopeKind: "team",
				scopeId: "team-alpha",
			}),
		});
		expect(res.status).toBe(200);

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id));
		expect(row?.role, "role is not among the applied changes").toBe("skill");
		expect(row?.scopeKind).toBe("team");
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
