/**
 * AC2 RED — Bet retro endpoint integration tests.
 *
 * AC2-1:  POST /api/bets/:id/retro writes bet outcome AND creates knowledge item atomically
 * AC2-2:  Knowledge item body has ## Reality and ## Learnings; fabric meta has betId, hypothesis, verdict
 * AC2-3:  Re-validation upserts (no duplicate), version incremented
 * AC2-4:  Hypothesis snapshot is immutable (from creation time)
 * AC2-5:  POST /api/bets/:id/retro/draft returns { verdict, summary, learnings }
 * AC2-6:  Draft endpoint rejects non-completed/killed bets
 * AC2-10: Fabric row kind='reflection'
 * AC2-11: Knowledge item status='active'
 * AC2-14: Retro endpoint rejects non-completed/killed bets with 400
 * AC2-15: Knowledge item title = "Retro: {bet title}"
 */

import {
	bets,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ac2-retro";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedRetroBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db.insert(teams).values({ id: ids("t1"), name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: ids("tm1"),
		teamId: ids("t1"),
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	await db.insert(bets).values([
		{
			id: ids("bet-completed"),
			teamId: ids("t1"),
			description: "Validate the onboarding hypothesis",
			status: "completed",
			hypothesis: "Users will complete onboarding in under 5 minutes.",
			createdAt: NOW,
		},
		{
			id: ids("bet-completed-no-hyp"),
			teamId: ids("t1"),
			description: "No hypothesis bet",
			status: "completed",
			hypothesis: null,
			createdAt: NOW,
		},
		{
			id: ids("bet-killed"),
			teamId: ids("t1"),
			description: "Killed bet",
			status: "killed",
			hypothesis: "Some hypothesis.",
			createdAt: NOW,
		},
		{
			id: ids("bet-active"),
			teamId: ids("t1"),
			description: "Active bet",
			status: "active",
			createdAt: NOW,
		},
		{
			id: ids("bet-draft"),
			teamId: ids("t1"),
			description: "Draft bet",
			status: "draft",
			createdAt: NOW,
		},
	]);
}

describe("POST /api/bets/:id/retro — AC2 hypothesis validation flow", () => {
	// AC2-1: Happy path — writes bet outcome AND creates knowledge item atomically
	test("AC2-1: writes bet outcome fields and creates retro knowledge item atomically", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "Users completed onboarding in 4.5 minutes on average.",
				learnings: "The wizard flow significantly reduces drop-off.",
			}),
		});
		expect(res.status, `Expected 200, got ${res.status}`).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;

		// Bet outcome fields must be set
		expect(body.outcomeVerdict).toBe("validated");
		expect(body.outcomeSummary).toBe("Users completed onboarding in 4.5 minutes on average.");
		expect(body.outcomeRecordedAt).toBeTruthy();

		// Must return retroKnowledgeItemId
		expect(body.retroKnowledgeItemId).toBeTruthy();
		expect(typeof body.retroKnowledgeItemId).toBe("string");

		// Use the returned id to verify the knowledge item exists in DB
		const retroId = body.retroKnowledgeItemId as string;
		const allKi = await db.select().from(knowledgeItems);
		const retroKi = allKi.find((k) => k.id === retroId);
		expect(retroKi).toBeDefined();
		expect(retroKi?.scopeKind).toBe("bet");
		expect(retroKi?.scopeId).toBe(ids("bet-completed"));
		vi.unstubAllEnvs();
	});

	// AC2-2: Knowledge item body has ## Reality and ## Learnings sections
	test("AC2-2: knowledge item body contains ## Reality and ## Learnings sections", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "refuted",
				summary: "Users took 12 minutes on average.",
				learnings: "Wizard was too long; reduce steps.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allKi = await db.select().from(knowledgeItems);
		const ki = allKi.find((k) => k.id === retroId);
		expect(ki).toBeDefined();

		// Body must contain the two required markdown sections
		expect(ki?.body).toContain("## Reality");
		expect(ki?.body).toContain("## Learnings");

		// Body must contain the summary and learnings text
		expect(ki?.body).toContain("Users took 12 minutes on average.");
		expect(ki?.body).toContain("Wizard was too long; reduce steps.");
		vi.unstubAllEnvs();
	});

	// AC2-2: Fabric meta has betId, hypothesis, verdict
	test("AC2-2: fabric row meta contains betId, hypothesis snapshot, and verdict", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "partial",
				summary: "Mixed results.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allFabric = await db.select().from(knowledgeAppProjection);
		const fabricRow = allFabric.find((f) => f.knowledgeItemId === retroId);
		expect(fabricRow).toBeDefined();

		const meta = JSON.parse(fabricRow?.meta ?? "{}") as Record<string, unknown>;
		expect(meta.betId).toBe(ids("bet-completed"));
		expect(meta.hypothesis).toBe("Users will complete onboarding in under 5 minutes.");
		expect(meta.verdict).toBe("partial");
		expect(meta.validatedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC2-3: Re-validation upserts (no duplicate), version incremented
	test("AC2-3: second retro call upserts (no duplicate), version incremented", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		// First retro
		const res1 = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "First assessment.",
			}),
		});
		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as Record<string, unknown>;
		const retroId1 = body1.retroKnowledgeItemId as string;

		// Second retro
		const res2 = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "refuted",
				summary: "Revised assessment after more data.",
			}),
		});
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as Record<string, unknown>;
		const retroId2 = body2.retroKnowledgeItemId as string;

		// Must return the same knowledge item id (upsert, not insert)
		expect(retroId2).toBe(retroId1);

		// Only one knowledge item for this bet
		const allKi = await db.select().from(knowledgeItems);
		const retroItems = allKi.filter(
			(k) => k.scopeKind === "bet" && k.scopeId === ids("bet-completed"),
		);
		expect(retroItems).toHaveLength(1);

		// Version must be incremented
		expect(retroItems[0]?.version).toBe(2);
		vi.unstubAllEnvs();
	});

	// AC2-4: Hypothesis snapshot is immutable
	test("AC2-4: hypothesis snapshot in retro body is taken at creation time, immutable to later changes", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		// Record retro with original hypothesis
		const res1 = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "Original assessment.",
			}),
		});
		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as Record<string, unknown>;
		const retroId = body1.retroKnowledgeItemId as string;

		// Verify the hypothesis in the retro fabric meta matches the original
		const allFabric = await db.select().from(knowledgeAppProjection);
		const fabricRow = allFabric.find((f) => f.knowledgeItemId === retroId);
		const metaBefore = JSON.parse(fabricRow?.meta ?? "{}") as Record<string, unknown>;
		expect(metaBefore.hypothesis).toBe("Users will complete onboarding in under 5 minutes.");

		// Now update the bet's hypothesis in the DB (simulating a field edit)
		// NOTE: We update directly in DB since the hypothesis PATCH endpoint is separate
		await db
			.update(bets)
			.set({ hypothesis: "UPDATED HYPOTHESIS — should not appear in retro" })
			.where(eq(bets.id, ids("bet-completed")));

		// Do a second retro — it must preserve the ORIGINAL hypothesis snapshot, not the new one
		const res2 = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "refuted",
				summary: "Revised assessment.",
			}),
		});
		expect(res2.status).toBe(200);

		// Check that the fabric meta still has the original hypothesis from first retro
		const allFabricAfter = await db.select().from(knowledgeAppProjection);
		const fabricRowAfter = allFabricAfter.find((f) => f.knowledgeItemId === retroId);
		const metaAfter = JSON.parse(fabricRowAfter?.meta ?? "{}") as Record<string, unknown>;
		expect(metaAfter.hypothesis).toBe("Users will complete onboarding in under 5 minutes.");
		vi.unstubAllEnvs();
	});

	// AC2-10: Fabric row kind='reflection'
	test("AC2-10: fabric row has kind='reflection'", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "Hypothesis confirmed.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allFabric = await db.select().from(knowledgeAppProjection);
		const fabricRow = allFabric.find((f) => f.knowledgeItemId === retroId);
		expect(fabricRow).toBeDefined();
		expect(fabricRow?.kind).toBe("reflection");
		vi.unstubAllEnvs();
	});

	// AC2-11: Knowledge item status='active'
	test("AC2-11: retro knowledge item has status='active'", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "inconclusive",
				summary: "Could not determine.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allKi = await db.select().from(knowledgeItems);
		const ki = allKi.find((k) => k.id === retroId);
		expect(ki?.status).toBe("active");
		vi.unstubAllEnvs();
	});

	// AC2-14: Retro endpoint rejects non-completed/killed bets with 400
	test("AC2-14: rejects retro for active bet with 400", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-active")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Too early." }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-14: rejects retro for draft bet with 400", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-draft")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Too early." }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-14: returns 404 for non-existent bet", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request(`/api/bets/${ids("nonexistent")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Does not exist." }),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// AC2-15: Knowledge item title = "Retro: {bet title}"
	test("AC2-15: knowledge item title follows 'Retro: {bet title}' format", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "Confirmed.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allKi = await db.select().from(knowledgeItems);
		const ki = allKi.find((k) => k.id === retroId);
		expect(ki?.title).toMatch(/^Retro:/);
		// The title must include the bet description (used as title by deriveTitle)
		expect(ki?.title).toContain("Validate the onboarding hypothesis");
		vi.unstubAllEnvs();
	});

	// Happy path on killed bet
	test("AC2-1: records retro on killed bet", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-killed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "refuted",
				summary: "Bet was killed before conclusion.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("refuted");
		expect(body.retroKnowledgeItemId).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// No hypothesis case — body frontmatter should note it
	test("AC2-2: body indicates no hypothesis when bet has no hypothesis", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed-no-hyp")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "inconclusive",
				summary: "No hypothesis to evaluate.",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allFabric = await db.select().from(knowledgeAppProjection);
		const fabricRow = allFabric.find((f) => f.knowledgeItemId === retroId);
		const meta = JSON.parse(fabricRow?.meta ?? "{}") as Record<string, unknown>;
		// Hypothesis in meta must indicate no hypothesis
		expect(meta.hypothesis).toMatch(/no hypothesis/i);
		vi.unstubAllEnvs();
	});

	// Learnings empty — body should have placeholder
	test("AC2-2: body has learnings placeholder when learnings not provided", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "It worked.",
				// learnings omitted
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const retroId = body.retroKnowledgeItemId as string;

		const allKi = await db.select().from(knowledgeItems);
		const ki = allKi.find((k) => k.id === retroId);
		// Should have some content in Learnings section, not empty
		expect(ki?.body).toContain("## Learnings");
		vi.unstubAllEnvs();
	});

	// Validation: missing verdict rejected
	test("rejects retro without verdict (400)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ summary: "No verdict provided" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// Validation: summary too long
	test("rejects retro with summary exceeding 2000 chars (400)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "x".repeat(2001) }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// Validation: learnings too long
	test("rejects retro with learnings exceeding 4000 chars (400)", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				verdict: "validated",
				summary: "Fine.",
				learnings: "x".repeat(4001),
			}),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verdict: "validated", summary: "Unauthorized." }),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});

async function seedDraftBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db.insert(teams).values({ id: ids("t1"), name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: ids("tm1"),
		teamId: ids("t1"),
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	await db.insert(bets).values([
		{
			id: ids("bet-completed"),
			teamId: ids("t1"),
			description: "Validate the onboarding hypothesis",
			status: "completed",
			hypothesis: "Users will complete onboarding in under 5 minutes.",
			doneCondition: "80% of users complete step 1 through 5 without drop-off.",
			createdAt: NOW,
		},
		{
			id: ids("bet-active"),
			teamId: ids("t1"),
			description: "Active bet",
			status: "active",
			createdAt: NOW,
		},
	]);

	// Seed some tasks for the draft endpoint
	await db.insert(tasks).values([
		{
			id: ids("task-1"),
			betId: ids("bet-completed"),
			teamId: ids("t1"),
			title: "Build onboarding wizard",
			state: "done",
			outcomeVerdict: "met",
			createdAt: NOW,
			updatedAt: NOW,
		},
		{
			id: ids("task-2"),
			betId: ids("bet-completed"),
			teamId: ids("t1"),
			title: "Analytics integration",
			state: "done",
			outcomeVerdict: "partially_met",
			createdAt: NOW,
			updatedAt: NOW,
		},
	]);
}

describe("POST /api/bets/:id/retro/draft — AC2 AI-assisted draft", () => {
	// AC2-5: Draft endpoint returns { verdict, summary, learnings }
	test("AC2-5: returns { verdict, summary, learnings } for completed bet with tasks", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro/draft`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status, `Expected 200, got ${res.status}`).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.verdict).toBeTruthy();
		expect(typeof body.verdict).toBe("string");
		expect(["validated", "refuted", "partial", "inconclusive"]).toContain(body.verdict);
		expect(body.summary).toBeTruthy();
		expect(typeof body.summary).toBe("string");
		expect(body.learnings).toBeTruthy();
		expect(typeof body.learnings).toBe("string");
		vi.unstubAllEnvs();
	});

	// AC2-5: Draft with no tasks returns generic content (not an error)
	test("AC2-5: returns draft for bet with no tasks (generic stub content)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db, ids);

		// Insert bet with no tasks
		await db.insert(bets).values({
			id: ids("bet-no-tasks"),
			teamId: ids("t1"),
			description: "Bet with no tasks",
			status: "completed",
			createdAt: NOW,
		});

		const res = await app.request(`/api/bets/${ids("bet-no-tasks")}/retro/draft`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.verdict).toBeTruthy();
		expect(body.summary).toBeTruthy();
		expect(body.learnings).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC2-6: Draft endpoint rejects non-completed/killed bets
	test("AC2-6: rejects draft for active bet with 400", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db, ids);

		const res = await app.request(`/api/bets/${ids("bet-active")}/retro/draft`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-6: returns 404 for non-existent bet", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request(`/api/bets/${ids("nonexistent")}/retro/draft`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request(`/api/bets/${ids("bet-completed")}/retro/draft`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});
