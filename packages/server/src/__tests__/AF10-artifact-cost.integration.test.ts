/**
 * AF10 — AC4: Artifact cost recording & surfacing (Z8-124/Z8-127/Z8-162).
 *
 * Currently `POST /api/artifacts` accepts a `cost` body field and then
 * silently discards it (`@lore O2`). The `artifacts` table has no cost
 * columns, and read paths always return `NULL_COST`.
 *
 * After AF10 (T9), the route:
 *   (a) accepts optional `agentId` and `sessionId` on the create body
 *   (b) resolves `agentId` (body → tasks.ownerAgentId fallback)
 *   (c) resolves `teamId` via `users.teamId` (=teamMembers.id, NOT tasks.teamId)
 *   (d) calls `recordCostAndCheck(delta = money_micros / 10000)` if agent resolved
 *   (e) returns the create response with cost reflected
 *   (f) does NOT break when agentId is unresolvable (§5.3: still 201, no cost recorded)
 *
 * AC4 narrowing (§5.4): per-artifact GET chip stays NULL_COST by O2 design.
 * The test asserts this explicitly (intentional, not a bug).
 *
 * Protected: existing artifacts-route tests are NOT touched.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { clearDeduplicationCache } from "../services/cost-cap.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-af10-artifact";
const NOW = "2026-04-28T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

interface SeedResult {
	teamId: string; // teams.id (domain entity)
	teamMembersId: string; // teamMembers.id (membership group)
	betId: string;
	taskId: string; // task WITH ownerAgentId set
	agentId: string;
	taskIdNoAgent: string; // task with ownerAgentId = null
}

async function seedDomain(db: HyperIdleDb, suffix = ""): Promise<SeedResult> {
	const teamId = `team-af10-art${suffix}`;
	const teamMembersId = `tm-af10-art${suffix}`;
	const betId = `bet-af10-art${suffix}`;
	const agentId = `agent-af10-art${suffix}`;
	const taskId = `task-af10-art${suffix}`;
	const taskIdNoAgent = `task-af10-noagent${suffix}`;

	await db.insert(teams).values({
		id: teamId,
		name: "AF10 Art Team",
		phase: "build",
		createdAt: NOW,
	});

	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		costActual: 0,
		formedAt: NOW,
	});

	// @lore U1: users.teamId references teamMembers.id (NOT teams.id)
	await db.insert(users).values({
		id: agentId,
		name: "AF10 Art Agent",
		role: "builder",
		status: "active",
		teamId: teamMembersId, // <-- membership group id
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});

	await db.insert(bets).values({
		id: betId,
		teamId, // bets.teamId references teams.id
		description: "AF10 art bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	// Task WITH ownerAgentId
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AF10 art task with agent",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
		ownerAgentId: agentId,
	});

	// Task WITHOUT ownerAgentId (null owner — §5.3 negative case)
	await db.insert(tasks).values({
		id: taskIdNoAgent,
		betId,
		teamId,
		title: "AF10 art task no agent",
		state: "pending",
		createdAt: NOW,
		updatedAt: NOW,
		ownerAgentId: null,
	});

	return { teamId, teamMembersId, betId, taskId, agentId, taskIdNoAgent };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AF10 AC4: artifact cost recording into aggregates (Z8-124/Z8-127)", () => {
	beforeEach(() => {
		clearDeduplicationCache();
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	/**
	 * T8(a): POST artifact with cost.money_micros + agentId → bet/agent/team
	 * aggregates increase by micros / 10000.
	 *
	 * 10_000 micros = 1 minor cent.
	 *
	 * FAILS until T9: currently artifact cost is silently dropped.
	 */
	test("POST /api/artifacts with money_micros and agentId records cost into bet aggregate", async ({
		db,
		app,
	}) => {
		const { betId, taskId, agentId } = await seedDomain(db);

		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskId,
				kind: "code",
				preview: null,
				// AF10: new optional fields
				agentId,
				cost: {
					money_micros: 10_000, // 10_000 micros = 1 minor cent
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});

		expect(res.status).toBe(201);

		// FAILS until T9: currently bet.costActualMinor stays NULL
		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, betId))
			.limit(1);
		expect(bet?.costActualMinor).toBe(1); // 10_000 micros / 10_000 = 1 cent
	});

	test("POST /api/artifacts with money_micros and agentId records cost into agent aggregate", async ({
		db,
		app,
	}) => {
		const { taskId, agentId } = await seedDomain(db, "-agent");

		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskId,
				kind: "code",
				preview: null,
				agentId,
				cost: {
					money_micros: 50_000, // 50_000 micros = 5 minor cents
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});

		expect(res.status).toBe(201);

		// FAILS until T9
		const [user] = await db
			.select({ costActual: users.costActual })
			.from(users)
			.where(eq(users.id, agentId))
			.limit(1);
		expect(user?.costActual).toBe(5); // 50_000 / 10_000 = 5 cents
	});

	test("POST /api/artifacts with money_micros and agentId records cost into team aggregate", async ({
		db,
		app,
	}) => {
		const { taskId, agentId, teamMembersId } = await seedDomain(db, "-team");

		await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskId,
				kind: "code",
				preview: null,
				agentId,
				cost: {
					money_micros: 20_000, // 20_000 micros = 2 minor cents
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});

		// FAILS until T9
		const [member] = await db
			.select({ costActual: teamMembers.costActual })
			.from(teamMembers)
			.where(eq(teamMembers.id, teamMembersId))
			.limit(1);
		expect(member?.costActual).toBe(2); // 20_000 / 10_000 = 2 cents
	});

	/**
	 * T8(b): AC4 narrowed per §5.4 — artifact GET returns NULL_COST even
	 * after cost was recorded to aggregates.
	 *
	 * This is the INTENTIONAL O2 design: per-artifact chip lives in kernel table
	 * which has no cost columns. The test asserts the narrowing explicitly.
	 *
	 * The first assert (bet aggregate durable on reload) proves "recorded" survives.
	 * The second assert (artifact cost null on GET) proves §5.4 narrowing is intentional.
	 *
	 * Currently PASSES for the null assertion (artifact never had cost columns);
	 * the bet-aggregate-durable assertion FAILS until T9.
	 */
	test("T8(b): GET /api/artifacts/:id returns cost.money == null (narrowed AC4); bet aggregate durable", async ({
		db,
		app,
	}) => {
		const { betId, taskId, agentId } = await seedDomain(db, "-b");

		// Create artifact with cost
		const createRes = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskId,
				kind: "code",
				preview: null,
				agentId,
				cost: {
					money_micros: 30_000, // 3 minor cents
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		// Verify bet aggregate was recorded (durable)
		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, betId))
			.limit(1);
		// FAILS until T9
		expect(bet?.costActualMinor).toBe(3);

		// GET the artifact — cost chip must be null (narrowed O2 design)
		const getRes = await app.request(`/api/artifacts?axis=task&taskId=${taskId}`, {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as {
			items: Array<{ id: string; cost: { money: unknown; tokens: unknown } | null }>;
		};
		const artifact = body.items.find((i) => i.id === created.id);
		expect(artifact).toBeDefined();

		// The per-artifact chip stays null — O2 decision (strategy concern, not kernel)
		if (artifact?.cost != null) {
			expect(artifact.cost.money).toBeNull();
		} else {
			expect(artifact?.cost).toBeNull();
		}
	});

	/**
	 * T8(c): null-agent negative case (§5.3).
	 *
	 * When neither body.agentId nor tasks.ownerAgentId resolves an agent,
	 * the artifact must still be created (201) and NO cost is recorded.
	 * Aggregates remain unchanged.
	 *
	 * PASSES for the 201 assertion today (creation works).
	 * The "aggregate unchanged" assertion passes trivially today (no cost written).
	 * After T9 the route must skip recordCostAndCheck when agentId cannot be resolved.
	 */
	test("T8(c): artifact with null ownerAgentId and no body agentId → 201, zero aggregate delta", async ({
		db,
		app,
	}) => {
		const { betId, taskIdNoAgent } = await seedDomain(db, "-noagent");

		// Record bet baseline before create
		const [betBefore] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, betId))
			.limit(1);
		const baselineBetCost = betBefore?.costActualMinor ?? 0;

		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskIdNoAgent, // task has ownerAgentId=null
				kind: "code",
				preview: null,
				// No agentId in body
				cost: {
					money_micros: 99_000,
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});

		// Must create successfully — never 422 for missing agent
		expect(res.status).toBe(201);

		// Aggregate must NOT increase (no agent to attribute to)
		const [betAfter] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, betId))
			.limit(1);
		const afterBetCost = betAfter?.costActualMinor ?? 0;

		// Zero delta — absence is honest, not a silent drop to a non-existent column
		expect(afterBetCost).toBe(baselineBetCost);
	});

	/**
	 * T8(d): agentId falls back to tasks.ownerAgentId when not provided in body.
	 *
	 * The task has ownerAgentId set. No agentId in body. Cost must still be recorded
	 * to the agent/bet/team aggregates via the fallback resolution.
	 *
	 * FAILS until T9: currently cost is always dropped.
	 */
	test("T8(d): omitting body.agentId falls back to tasks.ownerAgentId for cost attribution", async ({
		db,
		app,
	}) => {
		const { betId, taskId } = await seedDomain(db, "-fallback");
		// taskId has ownerAgentId set (in seedDomain)

		const res = await app.request("/api/artifacts", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				producingTaskId: taskId,
				kind: "code",
				preview: null,
				// No agentId in body — must fall back to tasks.ownerAgentId
				cost: {
					money_micros: 40_000, // 4 minor cents
					tokens_input: null,
					tokens_output: null,
				},
			}),
		});
		expect(res.status).toBe(201);

		// FAILS until T9: bet aggregate should be updated via fallback
		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, betId))
			.limit(1);
		expect(bet?.costActualMinor).toBe(4); // 40_000 / 10_000 = 4 cents
	});
});
