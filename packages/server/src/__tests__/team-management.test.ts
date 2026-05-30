import {
	bets,
	createTestDb,
	type HyperIdleDb,
	routines,
	sessions,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { ActiveRoutinesError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addMember,
	createTeam,
	dissolveTeam,
	getAvailableCapacity,
	getTeamCost,
	removeMember,
} from "../services/team-management.js";

const NOW = "2026-04-15T00:00:00.000Z";

async function seedProduct(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "prod-1", name: "TestProduct", phase: "build", createdAt: NOW });
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		name: `Agent-${id}`,
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

describe("C4: Team Management", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedProduct(db);
	});

	describe("createTeam", () => {
		it("creates a team with 3 agents and sets their team_id", async () => {
			await seedAgent(db, "a1");
			await seedAgent(db, "a2");
			await seedAgent(db, "a3");

			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1", "a2", "a3"],
			});

			expect(team).toBeDefined();
			// @lore U1: teamMembers.teamId references teams.id (domain entity, formerly productId)
			expect(team.teamId).toBe("prod-1");
			expect(team.capacity).toBe(5);
			expect(team.activeBets).toBe(0);
			expect(team.dissolvedAt).toBeNull();

			const [a1] = await db.select().from(users).where(eq(users.id, "a1"));
			const [a2] = await db.select().from(users).where(eq(users.id, "a2"));
			const [a3] = await db.select().from(users).where(eq(users.id, "a3"));

			expect(a1?.teamId).toBe(team.id);
			expect(a2?.teamId).toBe(team.id);
			expect(a3?.teamId).toBe(team.id);
		});

		it("sets leadAgentId when provided", async () => {
			await seedAgent(db, "a1");

			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 3,
				leadAgentId: "a1",
				agentIds: ["a1"],
			});

			expect(team.leadAgentId).toBe("a1");
		});
	});

	describe("addMember", () => {
		it("updates agent team_id to the target team", async () => {
			await seedAgent(db, "a1");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: [],
			});

			await addMember(db, team.id, "a1");

			const [agent] = await db.select().from(users).where(eq(users.id, "a1"));
			expect(agent?.teamId).toBe(team.id);
		});
	});

	describe("removeMember", () => {
		it("throws ActiveRoutinesError when agent has active routines", async () => {
			await seedAgent(db, "a1");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			await db.insert(routines).values({
				id: "routine-1",
				ownerAgentId: "a1",
				triggerType: "heartbeat",
				active: true,
			});

			await expect(removeMember(db, team.id, "a1")).rejects.toThrow(ActiveRoutinesError);
		});

		it("removes member successfully when no active routines", async () => {
			await seedAgent(db, "a1");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			await removeMember(db, team.id, "a1");

			const [agent] = await db.select().from(users).where(eq(users.id, "a1"));
			expect(agent?.teamId).toBeNull();
		});

		it("allows removal when agent has only inactive routines", async () => {
			await seedAgent(db, "a1");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			await db.insert(routines).values({
				id: "routine-1",
				ownerAgentId: "a1",
				triggerType: "heartbeat",
				active: false,
			});

			await removeMember(db, team.id, "a1");

			const [agent] = await db.select().from(users).where(eq(users.id, "a1"));
			expect(agent?.teamId).toBeNull();
		});
	});

	describe("getAvailableCapacity", () => {
		it("returns capacity - activeBets", async () => {
			await seedAgent(db, "a1");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			expect(await getAvailableCapacity(db, team.id)).toBe(5);

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			await db.update(teamMembers).set({ activeBets: 3 }).where(eq(teamMembers.id, team.id));

			expect(await getAvailableCapacity(db, team.id)).toBe(2);
		});

		it("returns 0 when at capacity", async () => {
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 2,
				agentIds: [],
			});

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			await db.update(teamMembers).set({ activeBets: 2 }).where(eq(teamMembers.id, team.id));

			expect(await getAvailableCapacity(db, team.id)).toBe(0);
		});
	});

	describe("dissolveTeam", () => {
		it("sets dissolved_at and unlinks all agents", async () => {
			await seedAgent(db, "a1");
			await seedAgent(db, "a2");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1", "a2"],
			});

			await dissolveTeam(db, team.id);

			// @lore U1: dissolvedAt is on teamMembers (membership group), not teams (domain entity)
			const [dissolved] = await db
				.select()
				.from(teamMembers)
				.where(eq(teamMembers.id, team.id))
				.limit(1);
			expect(dissolved?.dissolvedAt).not.toBeNull();

			const [a1] = await db.select().from(users).where(eq(users.id, "a1"));
			const [a2] = await db.select().from(users).where(eq(users.id, "a2"));
			expect(a1?.teamId).toBeNull();
			expect(a2?.teamId).toBeNull();
		});
	});

	describe("getTeamCost", () => {
		it("returns sum of session costs for agents in the current cycle", async () => {
			await seedAgent(db, "a1");
			await seedAgent(db, "a2");
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1", "a2"],
			});

			// Need a bet and task for sessions (FK constraints)
			// @lore U1: bets.teamId and tasks.teamId reference teams.id (domain entity = "prod-1"),
			// NOT teamMembers.id (membership group = team.id)
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "prod-1",
				description: "Test bet",
				appetite: "2w",
				status: "draft",
				createdAt: NOW,
			});
			await db.insert(tasks).values({
				id: "task-1",
				betId: "bet-1",
				teamId: "prod-1",
				title: "Test task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});

			// O2: sessions.cost column stripped — cost tracking is strategy/fabric concern.
			// getTeamCost now returns 0. Sessions still seeded for FK integrity.
			await db.insert(sessions).values({
				id: "sess-1",
				taskId: "task-1",
				agentId: "a1",
				modelTier: "workhorse",
				startedAt: "2026-04-10T00:00:00.000Z",
				state: "completed",
			});

			await db.insert(sessions).values({
				id: "sess-2",
				taskId: "task-1",
				agentId: "a2",
				modelTier: "workhorse",
				startedAt: "2026-04-12T00:00:00.000Z",
				state: "completed",
			});

			const cost = await getTeamCost(db, team.id, "2026-04-01T00:00:00.000Z");
			expect(cost).toBe(0);
		});

		it("returns 0 when no agents in team", async () => {
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: [],
			});

			const cost = await getTeamCost(db, team.id, "2026-04-01T00:00:00.000Z");
			expect(cost).toBe(0);
		});
	});

	describe("capacity enforcement", () => {
		it("capacity 0 means no availability for new bets", async () => {
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 0,
				agentIds: [],
			});

			expect(await getAvailableCapacity(db, team.id)).toBe(0);
		});

		it("full capacity returns 0 available", async () => {
			const team = await createTeam(db, {
				teamId: "prod-1",
				capacity: 3,
				agentIds: [],
			});

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			await db.update(teamMembers).set({ activeBets: 3 }).where(eq(teamMembers.id, team.id));

			expect(await getAvailableCapacity(db, team.id)).toBe(0);
		});
	});
});
