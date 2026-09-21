/**
 * AC6 — Graduation: a task-parented or thread-parented knowledge item moves
 * into the knowledge tree via POST /api/knowledge/:id/graduate.
 *
 * Verifies:
 * - Happy path: task-parented → document parent (AC6 main claim)
 * - Happy path: task-parented → top of tree (null parent)
 * - Refusals: wrong role (non-ordinary), already in tree (parentKind=document),
 *   no parent at all (parentKind=null), nonexistent new parent, self-reparent,
 *   version conflict, item not found.
 */

import { documents, type HyperIdleDb, tasks, teams, threads } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "graduation-test-key";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const now = new Date().toISOString();

async function seedTeamAndTask(db: HyperIdleDb, teamId: string, taskId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: now });
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${taskId}`,
		id: taskId,
		parentTaskId: null,
		teamId,
		title: "Test Task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

async function insertKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id: string;
		role?: "ordinary" | "skill" | "rule" | "agent_file" | "prompt";
		parentKind?: "task" | "thread" | "document" | null;
		parentId?: string | null;
		version?: number;
	},
): Promise<void> {
	await db.insert(documents).values({
		id: opts.id,
		scopeKind: "factory",
		scopeId: null,
		title: "Test item",
		body: "Body.",
		format: "markdown",
		status: "active",
		slot: opts.role ?? "ordinary",
		parentKind: opts.parentKind ?? null,
		parentId: opts.parentId ?? null,
		version: opts.version ?? 1,
		updatedBy: "human",
		createdAt: now,
		updatedAt: now,
	});
}

describe("POST /api/knowledge/:id/graduate", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// AC6 — happy path: task-parented item graduates to a document parent.
	// -------------------------------------------------------------------------
	describe("task-parented item → document parent", () => {
		test("returns 200, updates parentKind/parentId", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-1", "grad-task-1");

			const itemId = "ki-grad-happy-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-1",
			});

			// seed a target document parent (no FK, just needs to exist)
			const targetId = "ki-grad-target-1";
			await insertKnowledgeItem(db, { id: targetId });

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					updatedBy: "human",
					newParentKind: "document",
					newParentId: targetId,
				}),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as { parentKind: string; parentId: string; version: number };
			expect(body.parentKind).toBe("document");
			expect(body.parentId).toBe(targetId);
			expect(body.version).toBe(2);
		});
	});

	// -------------------------------------------------------------------------
	// Task-parented item graduates to top of tree (null parent).
	// -------------------------------------------------------------------------
	describe("task-parented item → top of tree (null parent)", () => {
		test("returns 200, clears parentKind and parentId", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-2", "grad-task-2");

			const itemId = "ki-grad-top-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-2",
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				parentKind: string | null;
				parentId: string | null;
				version: number;
			};
			expect(body.parentKind).toBeNull();
			expect(body.parentId).toBeNull();
			expect(body.version).toBe(2);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: role is not ordinary.
	// -------------------------------------------------------------------------
	describe("refusal: non-ordinary role", () => {
		test("returns 400 when item has role=skill", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-3", "grad-task-3");

			const itemId = "ki-grad-skill-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				role: "skill",
				parentKind: "task",
				parentId: "grad-task-3",
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/ordinary/i);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: item is already in the knowledge tree (parentKind=document).
	// -------------------------------------------------------------------------
	describe("refusal: already in tree", () => {
		test("returns 400 when parentKind is already document", async ({ db, app }) => {
			const existingParentId = "ki-grad-existing-parent";
			await insertKnowledgeItem(db, { id: existingParentId });

			const itemId = "ki-grad-in-tree-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "document",
				parentId: existingParentId,
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/task|thread/i);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: item has no parent (cannot graduate a root item).
	// -------------------------------------------------------------------------
	describe("refusal: no parent", () => {
		test("returns 400 when item has no parent", async ({ db, app }) => {
			const itemId = "ki-grad-no-parent-1";
			await insertKnowledgeItem(db, { id: itemId });

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/task|thread/i);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: new parent does not exist.
	// -------------------------------------------------------------------------
	describe("refusal: nonexistent new parent", () => {
		test("returns 400 when the target knowledge item does not exist", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-4", "grad-task-4");

			const itemId = "ki-grad-noparent-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-4",
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					updatedBy: "human",
					newParentKind: "document",
					newParentId: "ki-does-not-exist",
				}),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/ki-does-not-exist/);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: self-reparent.
	// -------------------------------------------------------------------------
	describe("refusal: self-reparent", () => {
		test("returns 400 when newParentId equals the item's own id", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-5", "grad-task-5");

			const itemId = "ki-grad-self-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-5",
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					updatedBy: "human",
					newParentKind: "document",
					newParentId: itemId,
				}),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/itself/i);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: version conflict.
	// -------------------------------------------------------------------------
	describe("refusal: version conflict", () => {
		test("returns 409 when version does not match", async ({ db, app }) => {
			await seedTeamAndTask(db, "grad-team-6", "grad-task-6");

			const itemId = "ki-grad-conflict-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-6",
				version: 3,
			});

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(409);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/conflict/i);
		});
	});

	// -------------------------------------------------------------------------
	// Refusal: item not found.
	// -------------------------------------------------------------------------
	describe("refusal: item not found", () => {
		test("returns 404 when id does not exist", async ({ app }) => {
			const res = await app.request("/api/knowledge/ki-nonexistent-grad/graduate", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ version: 1, updatedBy: "human" }),
			});

			expect(res.status).toBe(404);
		});
	});
});
