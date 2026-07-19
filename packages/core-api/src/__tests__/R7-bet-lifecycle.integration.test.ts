/**
 * R7 — Knowledge & Bet Cycles: bet lifecycle integration tests (red phase).
 *
 * AC-3: Bet transitions through full lifecycle (draft → active → completed)
 * AC-4: Shipped (completed) bets appear in GET /api/teams with correct shipRate
 *
 * These tests exercise the existing bet state machine and lifecycle propagation
 * end-to-end. They are expected to PASS in the red phase (the bet lifecycle
 * already works), verifying that no regression has been introduced.
 *
 * If they fail, the lifecycle subsystem has regressed and must be fixed.
 *
 * @lore R7: "shaped → committed → in_progress → shipped" maps to
 * "draft → active → completed" in U1 renamed statuses.
 * Ship rate = completed / (completed + active) * 100.
 */

import {
	insertMessage,
	insertThread,
	listMessages,
	updateMessage,
	updateThread,
} from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { enqueue } from "@hyperidle/notifications";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { transitionBet, type WorkDeps } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

/**
 * @lore AU19 Increment 2a: `registerLifecyclePropagation` now takes
 * injected `work`/`conversation`/`users`/`notifications` ports (Mechanism C
 * — `policy` never imports another Service). This test builds the exact
 * same production wiring `server-factory.ts` uses — no behavior change.
 */
const lifecyclePropagationDeps: PolicyDeps = {
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		transitionTaskState: (exec, { taskId, fromState, patch }) =>
			work.transition(exec, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch,
			}),
		getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
		transitionBetStatus: (exec, { betId, fromStatus, patch }) =>
			work.transition(exec, "bet", {
				id: betId,
				guard: { field: "status", equals: fromStatus },
				patch,
			}),
		listTasks: (exec: WriteExecutor, opts?: { betId?: string }) =>
			work.list(exec, "task", opts ?? {}),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: (exec: WriteExecutor, agentId: string) =>
			work.list(exec, "item", { sourceAgentId: agentId }).then((rows) => rows.map((r) => r.id)),
	},
	conversation: {
		insertMessage,
		insertThread,
		listMessagesByThread: (db, threadId, opts) =>
			listMessages(db, {
				threadId,
				types: opts?.type ? [opts.type] : undefined,
				order: opts?.order,
				dir: opts?.dir,
				limit: opts?.limit,
			}),
		updateMessage,
		updateThread,
		listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
			listMessages(db, { threadInitiatorId: initiatorId, types: ["verdict"], since: windowStart }),
		listVerdictMessagesByItemIds: (db, itemIds, windowStart) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
	},
	users: { getFirstUserByKind: (db, kind) => findUser(db, { kind }) },
	notifications: {
		insert: async (db, row) => {
			await enqueue(db, row);
		},
	},
	silence: { isSilenced: () => Promise.resolve(false) },
};

// AU19 Increment 1c: `work`'s `TeamCapacityReader` port (Mechanism C), wired
// to the real migrated `org` Service.
const teamCapacity: WorkDeps["teamCapacity"] = {
	getByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
	setActiveBets: (db, teamId, activeBets) => updateTeam(db, teamId, { activeBets }),
};

const TEST_API_KEY = "test-key-r7-bets";
const SYSTEM_PROPAGATION_ID = "system:propagation";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBaseData(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "team-r7", name: "R7 Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-r7", teamId: "team-r7", capacity: 5, activeBets: 0, formedAt: now });

	// F6: seed system propagation agent (required for review threads)
	await db.insert(users).values({
		id: SYSTEM_PROPAGATION_ID,
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: "agent-r7-builder",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
}

// ── AC-3: Bet lifecycle draft → active → completed ────────────────────────

describe("R7 AC-3: Bet lifecycle transitions (draft → active → completed)", () => {
	test("creating a bet via POST /api/bets results in status='draft' (shaped)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-r7",
				description: "R7 test bet — verify lifecycle",
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		// @lore U1: shaped → draft
		expect(body.status).toBe("draft");
		expect(body.teamId).toBe("team-r7");
		vi.unstubAllEnvs();
	});

	test("POST /api/bets/:id/commit transitions draft → active", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		// Create a draft bet
		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-r7",
				description: "Bet for commit test",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: betId } = (await createRes.json()) as { id: string };

		// Commit it: draft → active
		const commitRes = await app.request(`/api/bets/${betId}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(commitRes.status).toBe(200);
		const commitBody = (await commitRes.json()) as Record<string, unknown>;
		// @lore U1: committed → active
		expect(commitBody.status).toBe("active");
		vi.unstubAllEnvs();
	});

	test("transitionBet service transitions active → completed", async ({ db, eventBus }) => {
		await seedBaseData(db);

		// Create and commit a bet directly via service layer
		const now = new Date().toISOString();
		const betId = "bet-r7-complete";
		await db.insert(bets).values({
			id: betId,
			teamId: "team-r7",
			description: "Bet to be completed",
			status: "active",
			createdAt: now,
		});

		// Transition to completed (U1: "shipped" → "completed")
		await transitionBet(db, eventBus, teamCapacity, betId, "completed");

		const [row] = await db.select({ status: bets.status }).from(bets).where(eq(bets.id, betId));
		// @lore U1: shipped → completed
		expect(row?.status).toBe("completed");
	});

	test("lifecycle propagation: all tasks done → bet transitions to completed", async ({
		db,
		eventBus,
	}) => {
		await seedBaseData(db);

		// Arrange: active bet with one task in_progress
		const now = new Date().toISOString();
		const betId = "bet-r7-lc";
		await db.insert(bets).values({
			id: betId,
			teamId: "team-r7",
			description: "Lifecycle propagation test bet",
			status: "active",
			createdAt: now,
		});

		const threadId = "thread-r7-lc";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-r7-lc",
			initiatorId: "agent-r7-builder",
			participants: JSON.stringify(["agent-r7-builder"]),
			lastActiveAt: now,
			createdAt: now,
		});

		await db.insert(tasks).values({
			id: "task-r7-lc",
			betId,
			teamId: "team-r7",
			title: "Last task on the bet",
			state: "in_progress",
			threadId,
			createdAt: now,
			updatedAt: now,
		});

		const unsubscribe = registerPolicy(db, eventBus, lifecyclePropagationDeps);

		// Act: emit task_state_changed (in_progress → done) after updating DB
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-r7-lc"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-r7-lc",
			taskId: "task-r7-lc",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet transitions to completed via lifecycle propagation
		await vi.waitFor(async () => {
			const [bet] = await db.select({ status: bets.status }).from(bets).where(eq(bets.id, betId));
			expect(bet?.status).toBe("completed");
		});

		unsubscribe();
	});

	test("full end-to-end: create bet → commit → complete task → bet completed", async ({
		db,
		eventBus,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		const now = new Date().toISOString();

		// Step 1: Create bet (draft)
		const createRes = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				teamId: "team-r7",
				description: "End-to-end bet lifecycle test",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: betId } = (await createRes.json()) as { id: string };

		// Step 2: Commit → active
		const commitRes = await app.request(`/api/bets/${betId}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});
		expect(commitRes.status).toBe(200);

		// Step 3: Add a task and complete it via lifecycle propagation
		const threadId = "thread-r7-e2e";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-r7-e2e",
			initiatorId: "agent-r7-builder",
			participants: JSON.stringify(["agent-r7-builder"]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-r7-e2e",
			betId,
			teamId: "team-r7",
			title: "The one task",
			state: "in_progress",
			threadId,
			createdAt: now,
			updatedAt: now,
		});

		const unsubscribe = registerPolicy(db, eventBus, lifecyclePropagationDeps);

		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-r7-e2e"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-r7-e2e",
			taskId: "task-r7-e2e",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet is completed
		await vi.waitFor(async () => {
			const [bet] = await db.select({ status: bets.status }).from(bets).where(eq(bets.id, betId));
			expect(bet?.status).toBe("completed");
		});

		unsubscribe();
		vi.unstubAllEnvs();
	});
});

// ── AC-4: Completed bets appear in GET /api/teams with correct shipRate ────

describe("R7 AC-4: Completed bets appear in WorkPortfolio with correct shipRate", () => {
	test("GET /api/teams returns shipRate='100%' when all bets are completed", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		// Arrange: one completed bet, no active bets
		const now = new Date().toISOString();
		await db.insert(bets).values({
			id: "bet-r7-shipped",
			teamId: "team-r7",
			description: "Shipped bet",
			status: "completed",
			createdAt: now,
		});

		// Act: fetch teams — response is { teams: [...] }
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			teams: Array<{ id: string; shipRate?: string }>;
		};

		const r7Team = body.teams.find((t) => t.id === "team-r7");
		expect(r7Team).toBeDefined();
		// shipRate = completed / (completed + active) = 1 / (1 + 0) = 100%
		expect(r7Team?.shipRate).toBe("100%");
		vi.unstubAllEnvs();
	});

	test("GET /api/teams returns shipRate='50%' when half of bets are completed", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		// Arrange: one completed, one active
		const now = new Date().toISOString();
		await db.insert(bets).values([
			{
				id: "bet-r7-shipped-1",
				teamId: "team-r7",
				description: "Shipped bet 1",
				status: "completed",
				createdAt: now,
			},
			{
				id: "bet-r7-active-1",
				teamId: "team-r7",
				description: "Active bet 1",
				status: "active",
				createdAt: now,
			},
		]);
		// Update activeBets counter
		await db.update(teamMembers).set({ activeBets: 1 }).where(eq(teamMembers.id, "tm-r7"));

		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			teams: Array<{ id: string; shipRate?: string }>;
		};

		const r7Team = body.teams.find((t) => t.id === "team-r7");
		expect(r7Team).toBeDefined();
		// shipRate = 1 / (1 + 1) = 50%
		expect(r7Team?.shipRate).toBe("50%");
		vi.unstubAllEnvs();
	});

	test("GET /api/teams returns shipRate='—' when no bets exist", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		// No bets at all → shipRate should be the dash placeholder
		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			teams: Array<{ id: string; shipRate?: string }>;
		};

		const r7Team = body.teams.find((t) => t.id === "team-r7");
		expect(r7Team).toBeDefined();
		expect(r7Team?.shipRate).toBe("—");
		vi.unstubAllEnvs();
	});

	test("GET /api/teams shipRate excludes killed bets from denominator", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedBaseData(db);

		// Killed bets must not count in the ship rate calculation
		// shipRate = completed / (completed + active) — killed is excluded
		const now = new Date().toISOString();
		await db.insert(bets).values([
			{
				id: "bet-r7-killed-1",
				teamId: "team-r7",
				description: "Killed bet",
				status: "killed",
				createdAt: now,
			},
			{
				id: "bet-r7-completed-1",
				teamId: "team-r7",
				description: "Completed bet",
				status: "completed",
				createdAt: now,
			},
		]);

		const res = await app.request("/api/teams", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			teams: Array<{ id: string; shipRate?: string }>;
		};

		const r7Team = body.teams.find((t) => t.id === "team-r7");
		expect(r7Team).toBeDefined();
		// Only completed (1) and active (0) count: 1 / (1 + 0) = 100%
		// Killed (1) is excluded from the denominator
		expect(r7Team?.shipRate).toBe("100%");
		vi.unstubAllEnvs();
	});
});
