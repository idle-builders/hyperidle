/**
 * AC2 RED — Bet retro endpoint integration tests.
 *
 * AC2-1:  POST /api/bets/:id/retro writes bet outcome fields on the bet row
 * AC2-5:  POST /api/bets/:id/retro/draft returns { verdict, summary, learnings }
 * AC2-6:  Draft endpoint rejects non-completed/killed bets
 * AC2-14: Retro endpoint rejects non-completed/killed bets with 400
 *
 * @lore AU44 batch 4: Knowledge-item creation (reflection upsert, fabric meta,
 * retroKnowledgeItemId) removed from the core retro route per FULL-AUDIT.md
 * §5129-5130. The bet-retro ceremony (creating a reflection knowledge item) is a
 * Ruling-3 ritual that belongs in the knowledge-ceremony plugin. The core retro
 * route now writes only the bet outcome fields and returns the updated bet row.
 * Tests AC2-2/3/4/10/11/15 (knowledge item assertions) were removed with the code.
 */

import { bets, type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ac2-retro";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedRetroBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "t1", name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(bets).values([
		{
			id: "bet-completed",
			teamId: "t1",
			description: "Validate the onboarding hypothesis",
			status: "completed",
			hypothesis: "Users will complete onboarding in under 5 minutes.",
			createdAt: NOW,
		},
		{
			id: "bet-completed-no-hyp",
			teamId: "t1",
			description: "No hypothesis bet",
			status: "completed",
			hypothesis: null,
			createdAt: NOW,
		},
		{
			id: "bet-killed",
			teamId: "t1",
			description: "Killed bet",
			status: "killed",
			hypothesis: "Some hypothesis.",
			createdAt: NOW,
		},
		{
			id: "bet-active",
			teamId: "t1",
			description: "Active bet",
			status: "active",
			createdAt: NOW,
		},
		{
			id: "bet-draft",
			teamId: "t1",
			description: "Draft bet",
			status: "draft",
			createdAt: NOW,
		},
	]);
}

describe("POST /api/bets/:id/retro — AC2 hypothesis validation flow", () => {
	// AC2-1: Happy path — writes bet outcome fields
	test("AC2-1: writes bet outcome fields on completed bet", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-completed/retro", {
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

		// Bet outcome fields must be set on the returned bet row
		expect(body.outcomeVerdict).toBe("validated");
		expect(body.outcomeSummary).toBe("Users completed onboarding in 4.5 minutes on average.");
		expect(body.outcomeRecordedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC2-1: Killed bet also accepts retro
	test("AC2-1: records retro on killed bet", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-killed/retro", {
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
		vi.unstubAllEnvs();
	});

	// AC2-14: Retro endpoint rejects non-completed/killed bets with 400
	test("AC2-14: rejects retro for active bet with 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-active/retro", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Too early." }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-14: rejects retro for draft bet with 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-draft/retro", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Too early." }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-14: returns 404 for non-existent bet", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets/nonexistent/retro", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "Does not exist." }),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// Validation: missing verdict rejected
	test("rejects retro without verdict (400)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-completed/retro", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ summary: "No verdict provided" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// Validation: summary too long
	test("rejects retro with summary exceeding 2000 chars (400)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-completed/retro", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "x".repeat(2001) }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// Validation: learnings too long
	test("rejects retro with learnings exceeding 4000 chars (400)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedRetroBase(db);

		const res = await app.request("/api/bets/bet-completed/retro", {
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
	test("returns 401 without authentication", async ({ requestWithoutAuth }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await requestWithoutAuth("/api/bets/bet-completed/retro", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verdict: "validated", summary: "Unauthorized." }),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});

async function seedDraftBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "t1", name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(bets).values([
		{
			id: "bet-completed",
			teamId: "t1",
			description: "Validate the onboarding hypothesis",
			status: "completed",
			hypothesis: "Users will complete onboarding in under 5 minutes.",
			doneCondition: "80% of users complete step 1 through 5 without drop-off.",
			createdAt: NOW,
		},
		{
			id: "bet-active",
			teamId: "t1",
			description: "Active bet",
			status: "active",
			createdAt: NOW,
		},
	]);

	// Seed some tasks for the draft endpoint
	await db.insert(tasks).values([
		{
			id: "task-1",
			betId: "bet-completed",
			teamId: "t1",
			title: "Build onboarding wizard",
			state: "done",
			outcomeVerdict: "met",
			createdAt: NOW,
			updatedAt: NOW,
		},
		{
			id: "task-2",
			betId: "bet-completed",
			teamId: "t1",
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
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db);

		const res = await app.request("/api/bets/bet-completed/retro/draft", {
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
	test("AC2-5: returns draft for bet with no tasks (generic stub content)", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db);

		// Insert bet with no tasks
		await db.insert(bets).values({
			id: "bet-no-tasks",
			teamId: "t1",
			description: "Bet with no tasks",
			status: "completed",
			createdAt: NOW,
		});

		const res = await app.request("/api/bets/bet-no-tasks/retro/draft", {
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
	test("AC2-6: rejects draft for active bet with 400", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedDraftBase(db);

		const res = await app.request("/api/bets/bet-active/retro/draft", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("AC2-6: returns 404 for non-existent bet", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets/nonexistent/retro/draft", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ requestWithoutAuth }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await requestWithoutAuth("/api/bets/bet-completed/retro/draft", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});
