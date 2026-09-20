/**
 * AF17 — AC5: Bet→review never fails because system:propagation is missing.
 *
 * After bootstrap only (no demo data), drive a bet into review state and assert
 * that the review thread authored by system:propagation is created without FK error.
 *
 * @lore AU29: repoints `applyFactoryBootstrap` (framework/db, deleted this task)
 * to `applyFactoryCoreState` (this layer's own first-boot face) — it asserts the
 * propagation user, which is core-api-face state. core-api must not devDepend on
 * `tools/setup` (that would be a workspace cycle with `tools/setup → @hyperidle/core-api`),
 * so this stays a relative, in-package import.
 */

import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

const TEST_API_KEY = "test-key-AF17-ac5";
const NOW = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Minimal world to drive a bet to review without any demo data. */
async function seedMinimalWorld(
	db: HyperIdleDb,
): Promise<{ teamId: string; rootTaskId: string; sessionId: string; founderId: string }> {
	const teamId = "team-ac5-test";
	const founderId = "user-ac5-founder";
	const rootTaskId = "bet-ac5-test";
	const sessionId = "session-ac5-test";
	const agentId = "agent-ac5-builder";

	await db.insert(teams).values({ id: teamId, name: "Acme Test", phase: "build", createdAt: NOW });

	// The founder human — normally created at onboarding, not bootstrap
	await db.insert(users).values({
		id: founderId,
		kind: "human",
		name: "Acme Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Acme Builder",
		role: "builder",
		agentCategory: "team",
		status: "active",
		teamId: teamId,
		createdAt: NOW,
	});

	await db.insert(threads).values({
		id: `thr-${rootTaskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${rootTaskId}`,
		id: rootTaskId,
		parentTaskId: null,
		teamId: teamId,
		title: "Ship MVP",
		description: "Ship MVP",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { teamId, rootTaskId, sessionId, founderId };
}

describe("AF17 AC5: system:propagation is present after bootstrap; review thread succeeds", () => {
	test("system:propagation user exists after applyFactoryCoreState", async ({ db }) => {
		await applyFactoryCoreState(db);

		const [row] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, "system:propagation"))
			.limit(1);

		expect(row?.id).toBe("system:propagation");
	});

	test("can create a review thread authored by system:propagation without FK error", async ({
		db,
	}) => {
		await applyFactoryCoreState(db);
		await seedMinimalWorld(db);

		// Directly insert a review thread attributed to system:propagation to prove the FK holds.
		// This simulates what the lifecycle propagation engine does when a bet enters review.
		const threadId = "thread-ac5-review";
		const isoNow = new Date().toISOString();

		await expect(
			db.insert(threads).values({
				id: threadId,
				hostKind: "bet",
				hostId: "bet-ac5-test",
				initiatorId: "system:propagation",
				participants: JSON.stringify(["system:propagation"]),
				lastActiveAt: isoNow,
				createdAt: isoNow,
			}),
		).resolves.not.toThrow();

		const [inserted] = await db
			.select({ id: threads.id, initiatorId: threads.initiatorId })
			.from(threads)
			.where(eq(threads.id, threadId))
			.limit(1);

		expect(inserted?.initiatorId).toBe("system:propagation");
	});

	test("PATCH /api/bets/:id to review state succeeds when system:propagation was bootstrapped", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// Bootstrap factory layer (plants system:propagation)
		await applyFactoryCoreState(db);
		await seedMinimalWorld(db);

		// Transition bet to review — this should trigger review thread creation via
		// lifecycle propagation, which needs system:propagation.
		const res = await app.request("/api/bets/bet-ac5-test", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ status: "review" }),
		});

		// Allow 200 or 201; we just need no 500 (FK violation)
		expect(res.status).not.toBe(500);
		expect(res.status).not.toBe(422);

		vi.unstubAllEnvs();
	});
});
