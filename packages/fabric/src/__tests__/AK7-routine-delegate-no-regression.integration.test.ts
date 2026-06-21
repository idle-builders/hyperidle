/**
 * AK7 RED — routine_delegate no-regression integration tests.
 *
 * Tests cover:
 *   AC3 — routine_delegate: selectAgentFabric preserves findDelegate's exact
 *         userSkills-scoped query byte-identically:
 *         - same population (system-wide by skill, no team filter, no kind/status filter)
 *         - same order (userSkills insertion order)
 *         - same WIP-fallback logic (skip WIP agents)
 *         - null when no delegate available (all at WIP or no skill holders)
 *   AC3 — excluded owner is skipped (excludeAgentId)
 *
 * Oracle: pre-AK7 findDelegate output on the same fixtures.
 * The protected baseline (routine-coalescing.integration.test.ts,
 * routine-session-context.integration.test.ts) remains GREEN (not modified).
 *
 * These tests FAIL until:
 *   packages/fabric/src/services/agent-selection.ts exports `selectAgentFabric`
 *   selectAgentFabric.routine_delegate branch runs findDelegate's exact query
 *
 * @lore AK7 §5.3 / concept §3a: routine_delegate ignores candidates (always []).
 * Population is system-wide-by-skill via userSkills table (no teamId, no kind='ai'
 * filter, no status='active' filter — exactly what findDelegate does today).
 */

import {
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	userSkills,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { SelectAgentRequest } from "@hyperidle/shared";

// Import the function that does not exist yet — intentional red-phase failure.
import { selectAgentFabric } from "../services/agent-selection.js";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-rd", name: "RD Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-rd", teamId: "team-rd", capacity: 5, activeBets: 0, formedAt: NOW });
}

function makeUser(
	id: string,
	opts: { kind?: string; status?: string; maxConcurrentSessions?: number } = {},
) {
	return {
		id,
		kind: opts.kind ?? "ai",
		name: `User ${id}`,
		role: "builder",
		agentCategory: "team" as const,
		teamId: "tm-rd",
		status: opts.status ?? "active",
		maxConcurrentSessions: opts.maxConcurrentSessions ?? 3,
		createdAt: NOW,
	};
}

function makeRoutineDelegateReq(
	db: HyperIdleDb,
	skillId: string,
	excludeAgentId: string,
): SelectAgentRequest<HyperIdleDb> {
	return {
		db,
		surface: "routine_delegate",
		teamId: null,
		workKey: "routine-1",
		candidates: [], // always empty for routine_delegate
		roleHint: null,
		spreadIndex: null,
		excludeAgentId,
		skillId,
	};
}

// ---------------------------------------------------------------------------
// Core behaviour: skill match, exclusion, WIP fallback
// ---------------------------------------------------------------------------

describe("AK7: selectAgentFabric routine_delegate — skill match (AC3 no-regression)", () => {
	test("returns first user holding the skill who is not the owner and not at WIP limit", async ({
		db,
	}) => {
		await seedBase(db);

		// Owner agent (will be excluded)
		await db.insert(users).values(makeUser("owner-agent"));

		// Delegate candidate with the skill
		await db.insert(users).values(makeUser("delegate-agent"));

		await db.insert(userSkills).values([
			{ userId: "owner-agent", skillId: "skill-writing", autonomyLevel: 1 },
			{ userId: "delegate-agent", skillId: "skill-writing", autonomyLevel: 1 },
		]);

		const req = makeRoutineDelegateReq(db, "skill-writing", "owner-agent");
		const outcome = await selectAgentFabric(req);

		// delegate-agent holds the skill and is not the owner → selected
		expect(outcome.agentId).toBe("delegate-agent");
	});

	test("excludes the owner agent even when they hold the skill (oracle: findDelegate skips ownerId)", async ({
		db,
	}) => {
		await seedBase(db);

		// Only the owner holds the skill — no other holder
		await db.insert(users).values(makeUser("owner-only"));
		await db
			.insert(userSkills)
			.values([{ userId: "owner-only", skillId: "skill-unique", autonomyLevel: 1 }]);

		const req = makeRoutineDelegateReq(db, "skill-unique", "owner-only");
		const outcome = await selectAgentFabric(req);

		// Owner excluded, no other holder → null
		expect(outcome.agentId).toBeNull();
	});

	test("returns null when no user holds the skill at all", async ({ db }) => {
		await seedBase(db);
		await db.insert(users).values(makeUser("agent-noskill"));
		// No userSkills rows for this skillId

		const req = makeRoutineDelegateReq(db, "skill-nonexistent", "agent-noskill");
		const outcome = await selectAgentFabric(req);

		expect(outcome.agentId).toBeNull();
	});
});

describe("AK7: selectAgentFabric routine_delegate — WIP fallback (AC3 no-regression)", () => {
	test("skips delegate at WIP limit, picks next available", async ({ db }) => {
		await seedBase(db);

		await db.insert(users).values(makeUser("owner-wip", { maxConcurrentSessions: 3 }));
		await db.insert(users).values(makeUser("delegate-wip", { maxConcurrentSessions: 1 }));
		await db.insert(users).values(makeUser("delegate-free", { maxConcurrentSessions: 3 }));

		await db.insert(userSkills).values([
			{ userId: "owner-wip", skillId: "skill-wip", autonomyLevel: 1 },
			{ userId: "delegate-wip", skillId: "skill-wip", autonomyLevel: 1 },
			{ userId: "delegate-free", skillId: "skill-wip", autonomyLevel: 1 },
		]);

		// Put delegate-wip at WIP limit (1 active session)
		// We need a tasks row for the session. Insert a minimal bet + task.
		await db.insert(bets).values({
			id: "bet-wip",
			teamId: "team-rd",
			description: "WIP test bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "task-wip",
			betId: "bet-wip",
			teamId: "team-rd",
			title: "WIP task",
			state: "in_progress",
			ownerAgentId: "delegate-wip",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: "session-wip",
			taskId: "task-wip",
			agentId: "delegate-wip",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const req = makeRoutineDelegateReq(db, "skill-wip", "owner-wip");
		const outcome = await selectAgentFabric(req);

		// delegate-wip is at WIP limit → skip; delegate-free is available → selected
		expect(outcome.agentId).toBe("delegate-free");
	});

	test("returns null when all skill holders are at WIP limit (oracle: findDelegate returns undefined)", async ({
		db,
	}) => {
		await seedBase(db);

		await db.insert(users).values(makeUser("owner-full", { maxConcurrentSessions: 1 }));
		await db.insert(users).values(makeUser("delegate-full", { maxConcurrentSessions: 1 }));

		await db.insert(userSkills).values([
			{ userId: "owner-full", skillId: "skill-allwip", autonomyLevel: 1 },
			{ userId: "delegate-full", skillId: "skill-allwip", autonomyLevel: 1 },
		]);

		await db.insert(bets).values({
			id: "bet-allwip",
			teamId: "team-rd",
			description: "All WIP bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "task-allwip",
			betId: "bet-allwip",
			teamId: "team-rd",
			title: "All WIP task",
			state: "in_progress",
			ownerAgentId: "delegate-full",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: "session-allwip",
			taskId: "task-allwip",
			agentId: "delegate-full",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const req = makeRoutineDelegateReq(db, "skill-allwip", "owner-full");
		const outcome = await selectAgentFabric(req);

		// All holders at WIP limit → null (owner excluded, delegate at WIP → null)
		expect(outcome.agentId).toBeNull();
	});
});

describe("AK7: selectAgentFabric routine_delegate — system-wide, no team filter (AC3 no-regression)", () => {
	test("picks a delegate from a different team (system-wide, no teamId constraint)", async ({
		db,
	}) => {
		await seedBase(db);

		// Owner on team-rd
		await db.insert(users).values(makeUser("owner-crossteam"));

		// Delegate on a different team
		await db.insert(teams).values({
			id: "team-other",
			name: "Other Team",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(teamMembers).values({
			id: "tm-other",
			teamId: "team-other",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		const crossTeamDelegate = {
			id: "delegate-crossteam",
			kind: "ai",
			name: "Cross Team Delegate",
			role: "builder",
			agentCategory: "team" as const,
			teamId: "tm-other", // different membership group
			status: "active",
			maxConcurrentSessions: 3,
			createdAt: NOW,
		};
		await db.insert(users).values(crossTeamDelegate);

		await db.insert(userSkills).values([
			{ userId: "owner-crossteam", skillId: "skill-cross", autonomyLevel: 1 },
			{ userId: "delegate-crossteam", skillId: "skill-cross", autonomyLevel: 1 },
		]);

		const req = makeRoutineDelegateReq(db, "skill-cross", "owner-crossteam");
		const outcome = await selectAgentFabric(req);

		// System-wide: delegate on other team is valid
		expect(outcome.agentId).toBe("delegate-crossteam");
	});

	test("follows userSkills insertion order (not alphabetical — oracle: findDelegate query)", async ({
		db,
	}) => {
		await seedBase(db);

		await db.insert(users).values(makeUser("owner-order"));
		// Insert delegate-B before delegate-A deliberately
		await db.insert(users).values(makeUser("delegate-B-second"));
		await db.insert(users).values(makeUser("delegate-A-first"));

		// Insert userSkills in the order that determines the pick:
		// delegate-B inserted first → userSkills insertion order → delegate-B is first non-owner
		await db.insert(userSkills).values([
			{ userId: "owner-order", skillId: "skill-order", autonomyLevel: 1 },
			{ userId: "delegate-B-second", skillId: "skill-order", autonomyLevel: 1 }, // inserted first
			{ userId: "delegate-A-first", skillId: "skill-order", autonomyLevel: 1 }, // inserted second
		]);

		const req = makeRoutineDelegateReq(db, "skill-order", "owner-order");
		const outcome = await selectAgentFabric(req);

		// Oracle (findDelegate): first non-owner in userSkills query order → delegate-B-second
		expect(outcome.agentId).toBe("delegate-B-second");
	});
});
