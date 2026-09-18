/**
 * AF16 T7, T8 — Search determinism + relevance ordering (RED).
 *
 * T7: Two bets with identical createdAt → same order both queries (stable tiebreaker by id ASC).
 * T8: Exact-title match older than substring match → exact-title ranks first (match-rank).
 *
 * Z8-033.
 */

import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-search-af16";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "srch-team", name: "Search Team", phase: "build", createdAt: now });
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
		// BC3: every task has a real thread now (`tasks.thread_id` is NOT NULL).
		await db.insert(threads).values([
			{
				id: "thr-srch-bet-b",
				hostKind: "team",
				hostId: "srch-team",
				initiatorId: "system:propagation",
				participants: "[]",
				lastActiveAt: tiedTs,
				createdAt: tiedTs,
			},
			{
				id: "thr-srch-bet-a",
				hostKind: "team",
				hostId: "srch-team",
				initiatorId: "system:propagation",
				participants: "[]",
				lastActiveAt: tiedTs,
				createdAt: tiedTs,
			},
		]);
		// Insert bets with the same createdAt but different ids (id order: "srch-bet-a" < "srch-bet-b")
		await db.insert(tasks).values([
			{
				id: "srch-bet-b",
				parentTaskId: null,
				teamId: "srch-team",
				title: "Determinism test B",
				state: "in_progress",
				threadId: "thr-srch-bet-b",
				createdAt: tiedTs,
				updatedAt: tiedTs,
			},
			{
				id: "srch-bet-a",
				parentTaskId: null,
				teamId: "srch-team",
				title: "Determinism test A",
				state: "in_progress",
				threadId: "thr-srch-bet-a",
				createdAt: tiedTs,
				updatedAt: tiedTs,
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

		// BC3: every task has a real thread now (`tasks.thread_id` is NOT NULL).
		await db.insert(threads).values([
			{
				id: "thr-srch-exact",
				hostKind: "team",
				hostId: "srch-team",
				initiatorId: "system:propagation",
				participants: "[]",
				lastActiveAt: olderTs,
				createdAt: olderTs,
			},
			{
				id: "thr-srch-substr",
				hostKind: "team",
				hostId: "srch-team",
				initiatorId: "system:propagation",
				participants: "[]",
				lastActiveAt: newerTs,
				createdAt: newerTs,
			},
		]);
		// "srch-exact" has exact title match but is OLDER (lower recency)
		// "srch-substr" has substring match in description and is NEWER
		await db.insert(tasks).values([
			{
				id: "srch-exact",
				parentTaskId: null,
				teamId: "srch-team",
				title: "Hyper drive project",
				state: "in_progress",
				threadId: "thr-srch-exact",
				createdAt: olderTs,
				updatedAt: olderTs,
			},
			{
				id: "srch-substr",
				parentTaskId: null,
				teamId: "srch-team",
				title: "We need a hyper drive to go faster",
				state: "in_progress",
				threadId: "thr-srch-substr",
				createdAt: newerTs,
				updatedAt: newerTs,
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
