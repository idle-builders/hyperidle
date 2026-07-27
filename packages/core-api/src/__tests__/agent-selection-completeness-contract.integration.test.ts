import { createAgentSelectionService } from "@hyperidle/agent-selection";
import { sessions, teamMembers, teams, userSkills, users } from "@hyperidle/db";
import { getTeamMembers } from "@hyperidle/org";
import { EventBus } from "@hyperidle/shared";
import { findUser, listUsers } from "@hyperidle/users";
import { describe, expect, test } from "../test-fixtures.js";

const NOW = "2026-07-22T00:00:00.000Z";

function createService() {
	return createAgentSelectionService({
		users: {
			getUserById: (db, id) => findUser(db, { id }),
			listActiveAiUsersByTeams: (db, teamIds) =>
				listUsers(db, { teamIds, kind: "ai", status: "active" }),
		},
		teams: {
			getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }),
		},
	});
}

async function seedTeam(db: Parameters<ReturnType<typeof createService>["isAtCapacity"]>[0]) {
	await db.insert(teams).values({
		id: "selection-team",
		name: "Selection Team",
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: "selection-members",
		teamId: "selection-team",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: "agent-a",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "selection-members",
			maxConcurrentSessions: 1,
			createdAt: NOW,
		},
		{
			id: "agent-b",
			kind: "ai",
			name: "Product Lead",
			role: "product_manager",
			status: "active",
			teamId: "selection-members",
			maxConcurrentSessions: 2,
			createdAt: NOW,
		},
		{
			id: "agent-inactive",
			kind: "ai",
			name: "Inactive",
			role: "builder",
			status: "inactive",
			teamId: "selection-members",
			createdAt: NOW,
		},
		{
			id: "selection-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			teamId: "selection-members",
			createdAt: NOW,
		},
	]);
}

describe("agent-selection completeness contract", () => {
	test("lists the WIP-blind active team candidate population in stable id order", async ({
		db,
	}) => {
		await seedTeam(db);
		const service = createService();

		expect(await service.listCandidates({ db, teamId: "selection-team" })).toEqual([
			{ agentId: "agent-a", role: "builder" },
			{ agentId: "agent-b", role: "product_manager" },
		]);
	});

	test("selects bet owners by role then round-robin and emits each selection occasion", async ({
		db,
	}) => {
		await seedTeam(db);
		const service = createService();
		const bus = new EventBus();
		const occasions: string[] = [];
		bus.on("work_selection_requested", (event) => occasions.push(event.workKey));

		expect(
			await service.selectAgent({
				surface: "bet_task",
				db,
				eventBus: bus,
				teamId: "selection-team",
				workKey: "role-match",
				roleHint: "product_manager",
				spreadIndex: 0,
			}),
		).toEqual({ agentId: "agent-b" });
		expect(
			await service.selectAgent({
				surface: "bet_task",
				db,
				eventBus: bus,
				teamId: "selection-team",
				workKey: "spread-0",
				roleHint: null,
				spreadIndex: 0,
			}),
		).toEqual({ agentId: "agent-a" });
		expect(
			await service.selectAgent({
				surface: "bet_task",
				db,
				eventBus: bus,
				teamId: "selection-team",
				workKey: "spread-1",
				roleHint: null,
				spreadIndex: 1,
			}),
		).toEqual({ agentId: "agent-b" });
		expect(occasions).toEqual(["role-match", "spread-0", "spread-1"]);
	});

	test("selects the product-manager decomposer and rejects an unattachable resolved id", async ({
		db,
	}) => {
		await seedTeam(db);
		const bus = new EventBus();
		const service = createService();
		expect(
			await service.selectAgent({
				surface: "bet_decomposer",
				db,
				eventBus: bus,
				teamId: "selection-team",
				workKey: "bet-1",
				roleHint: "product_manager",
				spreadIndex: null,
			}),
		).toEqual({ agentId: "agent-b" });

		const invalidService = createAgentSelectionService({
			users: {
				listActiveAiUsersByTeams: (exec, teamIds) =>
					listUsers(exec, { teamIds, kind: "ai", status: "active" }),
				getUserById: async () => undefined,
			},
			teams: {
				getTeamMembersByTeamId: (exec, teamId) => getTeamMembers(exec, { teamId }),
			},
		});
		expect(
			await invalidService.selectAgent({
				surface: "bet_task",
				db,
				eventBus: bus,
				teamId: "selection-team",
				workKey: "invalid",
				roleHint: null,
				spreadIndex: 0,
			}),
		).toEqual({ agentId: null });
	});

	test("enforces WIP capacity and routine delegation skips owner and full candidates", async ({
		db,
	}) => {
		await seedTeam(db);
		const service = createService();
		await db.insert(sessions).values({
			id: "agent-a-active",
			agentId: "agent-a",
			modelTier: "fast",
			startedAt: NOW,
			state: "active",
		});
		await db.insert(userSkills).values([
			{ userId: "agent-a", skillId: "skill-1", autonomyLevel: 2 },
			{ userId: "agent-b", skillId: "skill-1", autonomyLevel: 2 },
		]);

		expect(await service.isAtCapacity(db, "agent-a")).toBe(true);
		expect(await service.isAtCapacity(db, "agent-b")).toBe(false);
		expect(await service.isAtCapacity(db, "missing-agent")).toBe(true);
		expect(
			await service.selectAgent({
				surface: "routine_delegate",
				db,
				teamId: null,
				workKey: "routine-1",
				skillId: "skill-1",
				excludeAgentId: "agent-a",
			}),
		).toEqual({ agentId: "agent-b" });
	});

	test("resolves all three scaffold creation triggers", async ({ db }) => {
		const service = createService();
		const common = {
			db,
			teamId: "selection-team",
			teamMembersId: "selection-members",
			teamName: "Selection",
			functions: ["development"] as readonly string[],
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		};
		const teamSpecs = await service.resolveScaffoldSpecs({ ...common, trigger: "team_scaffold" });
		expect(teamSpecs.length).toBeGreaterThan(0);
		expect(teamSpecs.every((spec) => spec.name.startsWith("Selection "))).toBe(true);
		expect(
			await service.resolveScaffoldSpecs({
				...common,
				trigger: "agent_added",
				role: "builder",
				name: "Exact Name",
			}),
		).toMatchObject([{ role: "builder", name: "Exact Name", agentCategory: "team" }]);
		expect(
			await service.resolveScaffoldSpecs({
				...common,
				trigger: "user_assistant",
				ownerUserId: "user-1",
				ownerUserName: "Ada",
			}),
		).toMatchObject([
			{
				role: "assistant",
				name: "Ada's Assistant",
				agentCategory: "individual",
				idHint: "ast-user-1",
			},
		]);
	});
});
