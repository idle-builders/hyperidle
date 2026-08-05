/**
 * AK5 — Promote a knowledge item into a bet: failing integration tests (red phase).
 *
 * AC coverage:
 * AC1: POST /bets with sourceKnowledgeItemId creates a draft bet whose description == item body.
 * AC2: Created bet row carries sourceKnowledgeItemId; GET /bets/:id returns
 *      sourceKnowledge:{id,title}. Provenance survives.
 * AC3 (API side): POST with unknown sourceKnowledgeItemId → 400 (validation error).
 * Carry-forward: source knowledge item is not mutated after promotion.
 * Carry-forward: omitting sourceKnowledgeItemId → existing behaviour unchanged (no provenance).
 * Carry-forward: .strict() preserved — unknown extra fields → 400.
 */

import { bets, type HyperIdleDb, knowledgeItems, teamMembers, teams } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-AK5";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb, _eventBus: EventBus): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-ak5", name: "AK5 Team", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "tm-ak5",
		teamId: "team-ak5",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(knowledgeItems).values({
		id: "ki-ak5",
		title: "Architecture Decision: Auth Strategy",
		body: "# Auth Strategy\n\nWe should use JWT with refresh tokens for all API calls.",
		format: "markdown",
		status: "active",
		scopeKind: "factory",
		updatedBy: "user-1",
		createdAt: now,
		updatedAt: now,
	});
}

describe("AK5 — POST /bets with sourceKnowledgeItemId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ─── AC1: draft bet pre-filled with item content ─────────────────────────────

	describe("AC1 — Creates a draft bet pre-filled with knowledge item body", () => {
		test("POST /bets with sourceKnowledgeItemId returns 201 with status=draft", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description:
						"# Auth Strategy\n\nWe should use JWT with refresh tokens for all API calls.",
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});

			expect(res.status).toBe(201);
			const data = await res.json();
			expect(data.status).toBe("draft");
		});

		test("POST /bets with sourceKnowledgeItemId returns bet with description matching item body", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const itemBody =
				"# Auth Strategy\n\nWe should use JWT with refresh tokens for all API calls.";
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: itemBody,
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});

			expect(res.status).toBe(201);
			const data = await res.json();
			expect(data.description).toBe(itemBody);
		});

		test("POST /bets with sourceKnowledgeItemId stores sourceKnowledgeItemId on the row", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Auth Strategy",
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});

			expect(res.status).toBe(201);
			const data = await res.json();

			// The DB row must carry the FK
			const [row] = await db.select().from(bets).where(eq(bets.id, data.id)).limit(1);
			expect(row).toBeDefined();
			expect(row!.sourceKnowledgeItemId).toBe("ki-ak5");
		});
	});

	// ─── AC2: provenance recoverable via GET /bets/:id ──────────────────────────

	describe("AC2 — GET /bets/:id returns sourceKnowledge:{id,title} for promoted bets", () => {
		test("GET /bets/:id returns sourceKnowledge with id and title after promotion", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			// Create the promoted bet
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Auth Strategy",
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id: betId } = await createRes.json();

			// GET enrichment must include sourceKnowledge
			const getRes = await app.request(`/api/bets/${betId}`, {
				headers: authHeaders(),
			});
			expect(getRes.status).toBe(200);
			const betDetail = await getRes.json();

			expect(betDetail.sourceKnowledge).not.toBeNull();
			expect(betDetail.sourceKnowledge.id).toBe("ki-ak5");
			expect(betDetail.sourceKnowledge.title).toBe("Architecture Decision: Auth Strategy");
		});

		test("GET /bets/:id returns sourceKnowledge:null for hand-typed bets (no provenance)", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			// Create a bet WITHOUT sourceKnowledgeItemId
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Hand-typed bet",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id: betId } = await createRes.json();

			const getRes = await app.request(`/api/bets/${betId}`, {
				headers: authHeaders(),
			});
			expect(getRes.status).toBe(200);
			const betDetail = await getRes.json();

			// sourceKnowledge must be null — no provenance
			expect(betDetail.sourceKnowledge).toBeNull();
		});
	});

	// ─── AC3 (API): validation errors ────────────────────────────────────────────

	describe("AC3 — POST /bets validation for sourceKnowledgeItemId", () => {
		test("returns 400 when sourceKnowledgeItemId references a non-existent knowledge item", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Some bet",
					sourceKnowledgeItemId: "ki-does-not-exist",
				}),
			});

			expect(res.status).toBe(400);
		});

		test("POST /bets without sourceKnowledgeItemId still works (existing callers unchanged)", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Normal bet",
				}),
			});

			expect(res.status).toBe(201);
		});

		test("POST /bets with unknown extra fields returns 400 (.strict() preserved)", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: "# Bet",
					unknownField: "should be rejected",
				}),
			});

			expect(res.status).toBe(400);
		});
	});

	// ─── Carry-forward: source knowledge item must NOT be mutated ───────────────

	describe("Carry-forward — source knowledge item is not mutated by promotion", () => {
		test("source knowledge item body/status unchanged after promotion", async ({
			db,
			app,
			eventBus,
		}) => {
			await seedBase(db, eventBus);

			const originalBody =
				"# Auth Strategy\n\nWe should use JWT with refresh tokens for all API calls.";
			const originalStatus = "active";

			const res = await app.request("/api/bets", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: "team-ak5",
					description: originalBody,
					sourceKnowledgeItemId: "ki-ak5",
				}),
			});
			expect(res.status).toBe(201);

			// Verify the source item was NOT mutated
			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "ki-ak5"))
				.limit(1);
			expect(item).toBeDefined();
			expect(item!.body).toBe(originalBody);
			expect(item!.status).toBe(originalStatus);
		});
	});
});
