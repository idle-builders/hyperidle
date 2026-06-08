/**
 * AC1 RED — Bet outcome API integration tests.
 *
 * AC-1:  POST /api/bets/:id/outcome records bet outcome verdict + summary
 * AC-4:  Outcome fields default to null on new bets
 * AC-9:  POST /api/bets/:id/outcome rejected for non-completed/killed bets
 * AC-10: Invalid verdict values rejected at API boundary (400)
 * AC-12: Outcome revision tracked in audit trail (revision log)
 */

import { bets, type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ac1-bet-outcome";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBets(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "t1", name: "Alpha", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "tm1",
		teamId: "t1",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	// Seed bets in various statuses
	await db.insert(bets).values([
		{
			id: "bet-completed",
			teamId: "t1",
			description: "Completed bet",
			status: "completed",
			createdAt: NOW,
		},
		{
			id: "bet-killed",
			teamId: "t1",
			description: "Killed bet",
			status: "killed",
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

describe("POST /api/bets/:id/outcome — AC1 bet outcome (AC-1, AC-4, AC-9, AC-10, AC-12)", () => {
	// AC-1: Happy path — record outcome on completed bet
	test("AC-1: records outcome on completed bet with verdict and summary", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "The hypothesis held." }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("validated");
		expect(body.outcomeSummary).toBe("The hypothesis held.");
		expect(body.outcomeRecordedAt).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// AC-1: Record outcome without summary (summary is optional)
	test("AC-1: records outcome without summary (summary is optional)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "refuted" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("refuted");
		vi.unstubAllEnvs();
	});

	// AC-1: Records outcome on killed bet (both completed and killed are valid)
	test("AC-1: records outcome on killed bet", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-killed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "inconclusive" }),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("inconclusive");
		vi.unstubAllEnvs();
	});

	// AC-4: New bets have null outcome fields
	test("AC-4: new bets have null outcome fields", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-active", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBeNull();
		expect(body.outcomeSummary).toBeNull();
		expect(body.outcomeRecordedAt).toBeNull();
		vi.unstubAllEnvs();
	});

	// AC-9: POST /api/bets/:id/outcome rejected for active bet
	test("AC-9: rejects outcome for active bet (400)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-active/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-9: POST /api/bets/:id/outcome rejected for draft bet
	test("AC-9: rejects outcome for draft bet (400)", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-draft/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "partial" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-9: 404 for non-existent bet
	test("AC-9: returns 404 for non-existent bet", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets/nonexistent/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated" }),
		});
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});

	// AC-10: Invalid verdict value rejected (400)
	test("AC-10: rejects invalid verdict value with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "wrong_value" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-10: Missing verdict field rejected
	test("AC-10: rejects missing verdict with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ summary: "No verdict" }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-10: Summary too long rejected (> 2000 chars)
	test("AC-10: rejects summary exceeding 2000 characters with 400", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		const longSummary = "x".repeat(2001);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: longSummary }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// AC-12: Outcome revision tracked in revision log
	test("AC-12: tracks outcome revisions in revisionLog on second write", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		// First outcome
		const res1 = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "validated", summary: "First verdict" }),
		});
		expect(res1.status).toBe(200);

		// Second outcome (override)
		const res2 = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "refuted", summary: "Changed verdict" }),
		});
		expect(res2.status).toBe(200);

		const body = (await res2.json()) as Record<string, unknown>;
		// Current verdict is the latest
		expect(body.outcomeVerdict).toBe("refuted");

		// Revision log must contain the previous outcome entry
		expect(body.revisionLog).toBeTruthy();
		const revisionLog = JSON.parse(body.revisionLog as string) as Array<Record<string, unknown>>;
		const outcomeRevisions = revisionLog.filter((e) => e.field === "outcome");
		expect(outcomeRevisions.length).toBeGreaterThanOrEqual(1);
		// Previous value must be stored
		const prevEntry = outcomeRevisions.find(
			(e) => (e.old_value as Record<string, unknown>)?.verdict === "validated",
		);
		expect(prevEntry).toBeDefined();
		vi.unstubAllEnvs();
	});

	// AC-12: All four valid verdict values are accepted
	test("AC-10: all valid verdict values are accepted (validated, refuted, partial, inconclusive)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		for (const verdict of ["validated", "refuted", "partial", "inconclusive"] as const) {
			const res = await app.request("/api/bets/bet-completed/outcome", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ verdict }),
			});
			expect(res.status, `Expected 200 for verdict="${verdict}"`).toBe(200);
		}
		vi.unstubAllEnvs();
	});

	// GET /api/bets/:id returns outcome fields after they are set
	test("GET /api/bets/:id returns outcomeVerdict in task rows (W-2 reviewer finding)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBets(db);
		// Set outcome
		await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ verdict: "partial", summary: "Check detail endpoint" }),
		});

		const res = await app.request("/api/bets/bet-completed", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.outcomeVerdict).toBe("partial");
		expect(body.outcomeSummary).toBe("Check detail endpoint");
		vi.unstubAllEnvs();
	});

	// 401 without auth
	test("returns 401 without authentication", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/bets/bet-completed/outcome", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verdict: "validated" }),
		});
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});
