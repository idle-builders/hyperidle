/**
 * AC6 — Graduation: a task-parented or thread-parented knowledge item moves
 * into the knowledge tree via POST /api/knowledge/:id/graduate.
 *
 * Verifies:
 * - Happy path: task-parented → knowledge-item parent (AC6 main claim)
 * - Happy path: task-parented → top of tree (null parent)
 * - Edit-log entry records the old parentId as oldValue (AC6 provenance guarantee)
 * - Refusals: wrong role (non-ordinary), already in tree (parentKind=knowledge_item),
 *   no parent at all (parentKind=null), nonexistent new parent, self-reparent,
 *   version conflict, item not found.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	tasks,
	teams,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "graduation-test-key";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const now = new Date().toISOString();

async function seedTeamAndTask(db: HyperIdleDb, teamId: string, taskId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: now });
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: "Test Task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

// @lore artifacts-become-knowledge: must always pair knowledgeItems with knowledgeAppProjection —
// the crossing-table-write rule mirrors the owner's writer which inserts both atomically.
async function insertKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id: string;
		role?: "ordinary" | "skill" | "rule" | "agent_file" | "prompt";
		parentKind?: "task" | "thread" | "knowledge_item" | null;
		parentId?: string | null;
		version?: number;
	},
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id: opts.id,
		scopeKind: "factory",
		scopeId: null,
		title: "Test item",
		body: "Body.",
		format: "markdown",
		status: "active",
		role: opts.role ?? "ordinary",
		parentKind: opts.parentKind ?? null,
		parentId: opts.parentId ?? null,
		version: opts.version ?? 1,
		updatedBy: "human",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(knowledgeAppProjection).values({
		id: `${opts.id}-projection`,
		knowledgeItemId: opts.id,
		scopeId: null,
		attentionScore: null,
		confidence: null,
		meta: null,
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
	// AC6 — happy path: task-parented item graduates to a knowledge-item parent.
	// The edit-log entry for parentId must carry oldValue = original task id.
	//
	// PROVE-CAN-FAIL: remove the edit-log write from graduate(). The test fails
	// on the parentId log assertion (logs will be empty or missing the entry).
	// -------------------------------------------------------------------------
	describe("task-parented item → knowledge-item parent", () => {
		test("returns 200, updates parentKind/parentId, writes edit-log with oldValue=taskId", async ({
			db,
			app,
		}) => {
			await seedTeamAndTask(db, "grad-team-1", "grad-task-1");

			const itemId = "ki-grad-happy-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "task",
				parentId: "grad-task-1",
			});

			// seed a target knowledge-item parent (no FK, just needs to exist)
			const targetId = "ki-grad-target-1";
			await insertKnowledgeItem(db, { id: targetId });

			const res = await app.request(`/api/knowledge/${itemId}/graduate`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					updatedBy: "human",
					newParentKind: "knowledge_item",
					newParentId: targetId,
				}),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as { parentKind: string; parentId: string; version: number };
			expect(body.parentKind).toBe("knowledge_item");
			expect(body.parentId).toBe(targetId);
			expect(body.version).toBe(2);

			// AC6: edit-log must record the old parentId (the task id)
			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, itemId));

			const parentIdLog = logs.find((l) => l.field === "parentId");
			expect(parentIdLog).toBeDefined();
			expect(parentIdLog?.oldValue).toBe("grad-task-1");
			expect(parentIdLog?.newValue).toBe(targetId);
			expect(parentIdLog?.editType).toBe("graduate");
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

			// Edit log still records the old parentId
			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, itemId));

			const parentIdLog = logs.find((l) => l.field === "parentId");
			expect(parentIdLog?.oldValue).toBe("grad-task-2");
			expect(parentIdLog?.newValue).toBeNull();
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
	// Refusal: item is already in the knowledge tree (parentKind=knowledge_item).
	// -------------------------------------------------------------------------
	describe("refusal: already in tree", () => {
		test("returns 400 when parentKind is already knowledge_item", async ({ db, app }) => {
			const existingParentId = "ki-grad-existing-parent";
			await insertKnowledgeItem(db, { id: existingParentId });

			const itemId = "ki-grad-in-tree-1";
			await insertKnowledgeItem(db, {
				id: itemId,
				parentKind: "knowledge_item",
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
					newParentKind: "knowledge_item",
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
					newParentKind: "knowledge_item",
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
