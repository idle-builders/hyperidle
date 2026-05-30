import {
	bets,
	createTestDb,
	type HyperIdleDb,
	routines,
	sessions,
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

function seedProduct(db: HyperIdleDb): void {
	db.insert(teams)
		.values({ id: "prod-1", name: "TestProduct", phase: "build", createdAt: NOW })
		.run();
}

function seedAgent(db: HyperIdleDb, id: string): void {
	db.insert(users)
		.values({
			id,
			name: `Agent-${id}`,
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		})
		.run();
}

describe("C4: Team Management", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedProduct(db);
	});

	describe("createTeam", () => {
		it("creates a team with 3 agents and sets their team_id", () => {
			seedAgent(db, "a1");
			seedAgent(db, "a2");
			seedAgent(db, "a3");

			const team = createTeam(db, {
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

			const a1 = db.select().from(users).where(eq(users.id, "a1")).get();
			const a2 = db.select().from(users).where(eq(users.id, "a2")).get();
			const a3 = db.select().from(users).where(eq(users.id, "a3")).get();

			expect(a1?.teamId).toBe(team.id);
			expect(a2?.teamId).toBe(team.id);
			expect(a3?.teamId).toBe(team.id);
		});

		it("sets leadAgentId when provided", () => {
			seedAgent(db, "a1");

			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 3,
				leadAgentId: "a1",
				agentIds: ["a1"],
			});

			expect(team.leadAgentId).toBe("a1");
		});
	});

	describe("addMember", () => {
		it("updates agent team_id to the target team", () => {
			seedAgent(db, "a1");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: [],
			});

			addMember(db, team.id, "a1");

			const agent = db.select().from(users).where(eq(users.id, "a1")).get();
			expect(agent?.teamId).toBe(team.id);
		});
	});

	describe("removeMember", () => {
		it("throws ActiveRoutinesError when agent has active routines", () => {
			seedAgent(db, "a1");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			db.insert(routines)
				.values({
					id: "routine-1",
					ownerAgentId: "a1",
					triggerType: "heartbeat",
					active: 1,
				})
				.run();

			expect(() => removeMember(db, team.id, "a1")).toThrow(ActiveRoutinesError);
		});

		it("removes member successfully when no active routines", () => {
			seedAgent(db, "a1");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			removeMember(db, team.id, "a1");

			const agent = db.select().from(users).where(eq(users.id, "a1")).get();
			expect(agent?.teamId).toBeNull();
		});

		it("allows removal when agent has only inactive routines", () => {
			seedAgent(db, "a1");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			db.insert(routines)
				.values({
					id: "routine-1",
					ownerAgentId: "a1",
					triggerType: "heartbeat",
					active: 0,
				})
				.run();

			removeMember(db, team.id, "a1");

			const agent = db.select().from(users).where(eq(users.id, "a1")).get();
			expect(agent?.teamId).toBeNull();
		});
	});

	describe("getAvailableCapacity", () => {
		it("returns capacity - activeBets", () => {
			seedAgent(db, "a1");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1"],
			});

			expect(getAvailableCapacity(db, team.id)).toBe(5);

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			db.update(teamMembers).set({ activeBets: 3 }).where(eq(teamMembers.id, team.id)).run();

			expect(getAvailableCapacity(db, team.id)).toBe(2);
		});

		it("returns 0 when at capacity", () => {
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 2,
				agentIds: [],
			});

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			db.update(teamMembers).set({ activeBets: 2 }).where(eq(teamMembers.id, team.id)).run();

			expect(getAvailableCapacity(db, team.id)).toBe(0);
		});
	});

	describe("dissolveTeam", () => {
		it("sets dissolved_at and unlinks all agents", () => {
			seedAgent(db, "a1");
			seedAgent(db, "a2");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1", "a2"],
			});

			dissolveTeam(db, team.id);

			// @lore U1: dissolvedAt is on teamMembers (membership group), not teams (domain entity)
			const dissolved = db.select().from(teamMembers).where(eq(teamMembers.id, team.id)).get();
			expect(dissolved?.dissolvedAt).not.toBeNull();

			const a1 = db.select().from(users).where(eq(users.id, "a1")).get();
			const a2 = db.select().from(users).where(eq(users.id, "a2")).get();
			expect(a1?.teamId).toBeNull();
			expect(a2?.teamId).toBeNull();
		});
	});

	describe("getTeamCost", () => {
		it("returns sum of session costs for agents in the current cycle", () => {
			seedAgent(db, "a1");
			seedAgent(db, "a2");
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: ["a1", "a2"],
			});

			// Need a bet and task for sessions (FK constraints)
			// @lore U1: bets.teamId and tasks.teamId reference teams.id (domain entity = "prod-1"),
			// NOT teamMembers.id (membership group = team.id)
			db.insert(bets)
				.values({
					id: "bet-1",
					teamId: "prod-1",
					description: "Test bet",
					appetite: "2w",
					status: "draft",
					createdAt: NOW,
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "Test task",
					state: "in_progress",
					createdAt: NOW,
					updatedAt: NOW,
				})
				.run();

			// O2: sessions.cost column stripped — cost tracking is strategy/fabric concern.
			// getTeamCost now returns 0. Sessions still seeded for FK integrity.
			db.insert(sessions)
				.values({
					id: "sess-1",
					taskId: "task-1",
					agentId: "a1",
					modelTier: "workhorse",
					startedAt: "2026-04-10T00:00:00.000Z",
					state: "completed",
				})
				.run();
			db.insert(sessions)
				.values({
					id: "sess-2",
					taskId: "task-1",
					agentId: "a2",
					modelTier: "workhorse",
					startedAt: "2026-04-12T00:00:00.000Z",
					state: "completed",
				})
				.run();

			const cost = getTeamCost(db, team.id, "2026-04-01T00:00:00.000Z");
			expect(cost).toBe(0);
		});

		it("returns 0 when no agents in team", () => {
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 5,
				agentIds: [],
			});

			const cost = getTeamCost(db, team.id, "2026-04-01T00:00:00.000Z");
			expect(cost).toBe(0);
		});
	});

	describe("capacity enforcement", () => {
		it("capacity 0 means no availability for new bets", () => {
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 0,
				agentIds: [],
			});

			expect(getAvailableCapacity(db, team.id)).toBe(0);
		});

		it("full capacity returns 0 available", () => {
			const team = createTeam(db, {
				teamId: "prod-1",
				capacity: 3,
				agentIds: [],
			});

			// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
			db.update(teamMembers).set({ activeBets: 3 }).where(eq(teamMembers.id, team.id)).run();

			expect(getAvailableCapacity(db, team.id)).toBe(0);
		});
	});
});
