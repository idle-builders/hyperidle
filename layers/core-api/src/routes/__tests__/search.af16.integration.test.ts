/**
 * AF16 T7, T8 — Search determinism + relevance ordering (RED).
 *
 * T7: Two bets with identical createdAt → same order both queries (stable tiebreaker by id ASC).
 * T8: Exact-title match older than substring match → exact-title ranks first (match-rank).
 *
 * Z8-033.
 */

import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-search-af16";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("srch-team"), name: "Search Team", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: ids("srch-tm"),
		teamId: ids("srch-team"),
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: ids("srch-user"),
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
		ids,
	}) => {
		await seedBase(db, ids);
		const tiedTs = "2024-01-15T10:00:00.000Z";
		// Insert bets with the same createdAt but different ids.
		await db.insert(bets).values([
			{
				id: ids("srch-bet-b"),
				teamId: ids("srch-team"),
				description: "Determinism test B",
				status: "active",
				createdAt: tiedTs,
			},
			{
				id: ids("srch-bet-a"),
				teamId: ids("srch-team"),
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
		// AU38 P5/P6: search is a global endpoint — assert ordering over the
		// arranged pair only. The tiebreaker is id ASC; scoped UUIDs don't sort
		// by label, so the expected pair order is derived from the ids themselves.
		const arranged = ids1.filter((id) => id === ids("srch-bet-a") || id === ids("srch-bet-b"));
		expect(arranged).toEqual([ids("srch-bet-a"), ids("srch-bet-b")].sort());
	});
});

describe("AF16 T8 — Search relevance ordering (Z8-033)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("exact-title match older than substring match ranks first", async ({ db, app, ids }) => {
		await seedBase(db, ids);

		const olderTs = "2023-06-01T00:00:00.000Z";
		const newerTs = "2024-06-01T00:00:00.000Z";

		// "srch-exact" has exact title match but is OLDER (lower recency)
		// "srch-substr" has substring match in description and is NEWER
		await db.insert(bets).values([
			{
				id: ids("srch-exact"),
				teamId: ids("srch-team"),
				description: "Hyper drive project",
				status: "active",
				createdAt: olderTs,
			},
			{
				id: ids("srch-substr"),
				teamId: ids("srch-team"),
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
		const resultIds = body.work.map((w) => w.id);
		expect(resultIds).toContain(ids("srch-exact"));
		expect(resultIds).toContain(ids("srch-substr"));

		// Exact prefix match should rank before the mid-string match — asserted
		// over the arranged pair only (AU38 P5/P6: global endpoint).
		const arranged = resultIds.filter(
			(id) => id === ids("srch-exact") || id === ids("srch-substr"),
		);
		expect(arranged.indexOf(ids("srch-exact"))).toBeLessThan(arranged.indexOf(ids("srch-substr")));
	});
});
