/**
 * AK5 — Promote a knowledge item into a task.
 *
 * @lore BB1: ported from the deleted `bets.AK5-promote.integration.test.ts`.
 * A bet is a root task now, so promotion targets POST /tasks. BB1 had dropped
 * the whole feature: the create schema had no `sourceKnowledgeItemId` (and was
 * not `.strict()`, so the field was silently stripped rather than rejected),
 * the insert never wrote the column, and GET /tasks/:id did not enrich it.
 *
 * AC1: POST /tasks with sourceKnowledgeItemId creates a task whose description == item body.
 * AC2: the row carries the FK; GET /tasks/:id returns sourceKnowledge:{id,title}.
 * AC3: unknown sourceKnowledgeItemId -> 400.
 * Carry-forward: omitting it -> unchanged behaviour (sourceKnowledge null).
 * Carry-forward: `.strict()` -> unknown extra fields -> 400.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teams,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-AK5-task";
const ITEM_BODY = "# Auth Strategy\n\nWe should use JWT with refresh tokens for all API calls.";
const ITEM_TITLE = "Architecture Decision: Auth Strategy";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-ak5", name: "AK5 Team", phase: "build", createdAt: now });
	await db.insert(knowledgeItems).values({
		id: "ki-ak5",
		title: ITEM_TITLE,
		body: ITEM_BODY,
		format: "markdown",
		status: "active",
		scopeKind: "factory",
		updatedBy: "user-1",
		createdAt: now,
		updatedAt: now,
	});
	await db
		.insert(knowledgeAppProjection)
		.values({ id: "ki-ak5-projection", knowledgeItemId: "ki-ak5" });
}

describe("AK5 — POST /tasks with sourceKnowledgeItemId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("AC1 — creates a task pre-filled with the knowledge item body", () => {
		test("returns 201 with the item body as description", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					title: ITEM_TITLE,
					description: ITEM_BODY,
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});

			expect(res.status).toBe(201);
			const data = await res.json();
			expect(data.state).toBe("proposed");
			expect(data.description).toBe(ITEM_BODY);
		});

		test("stores sourceKnowledgeItemId on the row", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					title: ITEM_TITLE,
					description: ITEM_BODY,
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});
			expect(res.status).toBe(201);
			const data = await res.json();

			const [row] = await db.select().from(tasks).where(eq(tasks.id, data.id)).limit(1);
			expect(row).toBeDefined();
			expect(row?.sourceKnowledgeItemId).toBe("ki-ak5");
		});
	});

	describe("AC2 — GET /tasks/:id returns sourceKnowledge:{id,title}", () => {
		test("promoted task exposes its provenance", async ({ db, app }) => {
			await seedBase(db);

			const createRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					title: ITEM_TITLE,
					description: ITEM_BODY,
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id } = await createRes.json();

			const getRes = await app.request(`/api/tasks/${id}`, { headers: authHeaders() });
			expect(getRes.status).toBe(200);
			const detail = await getRes.json();

			expect(detail.sourceKnowledge).not.toBeNull();
			expect(detail.sourceKnowledge.id).toBe("ki-ak5");
			expect(detail.sourceKnowledge.title).toBe(ITEM_TITLE);
		});

		test("hand-typed task exposes sourceKnowledge: null", async ({ db, app }) => {
			await seedBase(db);

			const createRes = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "team-ak5", title: "Hand-typed task" }),
			});
			expect(createRes.status).toBe(201);
			const { id } = await createRes.json();

			const getRes = await app.request(`/api/tasks/${id}`, { headers: authHeaders() });
			expect(getRes.status).toBe(200);
			const detail = await getRes.json();
			expect(detail.sourceKnowledge).toBeNull();
		});
	});

	describe("AC3 — validation", () => {
		test("unknown sourceKnowledgeItemId returns 400", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					title: "Some task",
					sourceKnowledgeItemId: "ki-does-not-exist",
				}),
			});

			expect(res.status).toBe(400);
		});

		test("omitting sourceKnowledgeItemId still works", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ teamId: "team-ak5", title: "Normal task" }),
			});

			expect(res.status).toBe(201);
		});

		test("unknown extra fields return 400 (.strict())", async ({ db, app }) => {
			await seedBase(db);

			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					title: "Task",
					unknownField: "should be rejected",
				}),
			});

			expect(res.status).toBe(400);
		});
	});
});
