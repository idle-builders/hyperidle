/**
 * AF16 T7, T8 — Search determinism + relevance ordering (RED).
 *
 * T7: Two bets with identical createdAt → same order both queries (stable tiebreaker by id ASC).
 * T8: Exact-title match older than substring match → exact-title ranks first (match-rank).
 *
 * Z8-033.
 */

import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-search-af16";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "srch-team", name: "Search Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "srch-tm", teamId: "srch-team", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: "srch-user",
		kind: "human",
		name: "Searcher",
		role: "admin",
		status: "active",
		createdAt: now,
	});
}

describe("AF16 T7 — Search determinism (Z8-033)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("tied timestamps: same query twice returns identical ordered id lists", async ({
		db,
		app,
	}) => {
		await seedBase(db);
		const tiedTs = "2024-01-15T10:00:00.000Z";
		// Insert bets with the same createdAt but different ids (id order: "srch-bet-a" < "srch-bet-b")
		await db.insert(bets).values([
			{
				id: "srch-bet-b",
				teamId: "srch-team",
				description: "Determinism test B",
				status: "active",
				createdAt: tiedTs,
			},
			{
				id: "srch-bet-a",
				teamId: "srch-team",
				description: "Determinism test A",
				status: "active",
				createdAt: tiedTs,
			},
		]);

		const q = "Determinism test";

		const res1 = await app.request(`/api/search?q=${encodeURIComponent(q)}`, {
			headers: authHeaders(),
		});
		const res2 = await app.request(`/api/search?q=${encodeURIComponent(q)}`, {
			headers: authHeaders(),
		});

		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);

		const body1 = (await res1.json()) as { work: Array<{ id: string }> };
		const body2 = (await res2.json()) as { work: Array<{ id: string }> };

		const ids1 = body1.work.map((w) => w.id);
		const ids2 = body2.work.map((w) => w.id);

		expect(ids1).toEqual(ids2);
		// With id ASC tiebreaker, "srch-bet-a" < "srch-bet-b" lexically
		expect(ids1[0]).toBe("srch-bet-a");
		expect(ids1[1]).toBe("srch-bet-b");
	});
});

describe("AF16 T8 — Search relevance ordering (Z8-033)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("exact-title match older than substring match ranks first", async ({ db, app }) => {
		await seedBase(db);

		const olderTs = "2023-06-01T00:00:00.000Z";
		const newerTs = "2024-06-01T00:00:00.000Z";

		// "srch-exact" has exact title match but is OLDER (lower recency)
		// "srch-substr" has substring match in description and is NEWER
		await db.insert(bets).values([
			{
				id: "srch-exact",
				teamId: "srch-team",
				description: "Hyper drive project",
				status: "active",
				createdAt: olderTs,
			},
			{
				id: "srch-substr",
				teamId: "srch-team",
				description: "We need a hyper drive to go faster",
				status: "active",
				createdAt: newerTs,
			},
		]);

		// Query "hyper drive" — exact title in srch-exact description should rank first
		const res = await app.request(`/api/search?q=${encodeURIComponent("hyper drive")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { work: Array<{ id: string }> };

		// Both should be in results
		const ids = body.work.map((w) => w.id);
		expect(ids).toContain("srch-exact");
		expect(ids).toContain("srch-substr");

		// Exact prefix match should rank before the mid-string match
		const exactIdx = ids.indexOf("srch-exact");
		const substrIdx = ids.indexOf("srch-substr");
		expect(exactIdx).toBeLessThan(substrIdx);
	});
});
