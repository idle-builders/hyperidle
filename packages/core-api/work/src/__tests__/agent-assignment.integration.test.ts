/**
 * AU21 §9 Increment 8 (RED) — architecture.md §6 Decision F1: "*Who* is
 * assigned is a core-api business decision, already baked at emit (Decision
 * B step 1); `selectAgent` reads only core-api roster (users/org), so it
 * folds into core-api's emit-time resolution."
 *
 * Traced from source: `bet-decomposition.ts`'s two real `selectAgent`
 * callers — the `bet_decomposer` surface (`runBetDecomposition`, picking the
 * decomposing PM) and the `bet_task` surface (`insertProposedBetTasks`,
 * picking each task's owner) — only ever read `work`'s OWN already-injected
 * `teamCapacity` (→ `org`) and `users` (→ `@hyperidle/users`) ports (both
 * ordinary same-layer core-api edges per `ports.ts`'s own `@lore`, not
 * against-grain). Nothing in this candidate-enumeration + role-match +
 * round-robin algorithm reaches into a separate `agent-selection` Service —
 * the standalone package's `selectBetAgent`/`candidates` merely duplicated
 * logic `work` can run directly against ports it already owns. This module
 * is the mechanical relocation: `work`'s own `agent-assignment.ts`, no DI
 * port to a separate Service, no behavior change.
 *
 * `routine_delegate` (the third `AgentSelectionService.selectAgent` surface)
 * does NOT move here — it's a `routine`-owned decision
 * (`agent-delegation.ts`, this wave's sibling module) with a materially
 * different candidate source (`userSkills`, not team membership).
 *
 * Currently RED: `../agent-assignment.js` does not exist yet — this import
 * fails to resolve, so every test below fails at collection/import time.
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

async function seedTeam(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "assign-team", name: "Assign Team", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "assign-members",
		teamId: "assign-team",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: "assign-agent-a",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "assign-members",
			createdAt: now,
		},
		{
			id: "assign-agent-b",
			kind: "ai",
			name: "Product Lead",
			role: "product_manager",
			status: "active",
			teamId: "assign-members",
			createdAt: now,
		},
		{
			id: "assign-agent-inactive",
			kind: "ai",
			name: "Inactive",
			role: "builder",
			status: "inactive",
			teamId: "assign-members",
			createdAt: now,
		},
		{
			id: "assign-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			teamId: "assign-members",
			createdAt: now,
		},
	]);
}

/** Structural deps mirroring `work`'s own already-injected `TeamCapacityReader`/`UserStoreReader` ports. */
function buildDeps() {
	return {
		teamCapacity: {
			getByTeamId: async (db: HyperIdleDb, teamId: string) => {
				const [row] = await db
					.select()
					.from(teamMembers)
					.where(eq(teamMembers.teamId, teamId))
					.limit(1);
				return row;
			},
		},
		users: {
			listActiveAiUsersByTeams: async (db: HyperIdleDb, teamMembersIds: string[]) => {
				const rows = await db.select().from(users).where(eq(users.status, "active"));
				return rows.filter(
					(row) => row.kind === "ai" && row.teamId && teamMembersIds.includes(row.teamId),
				);
			},
			getUserById: async (db: HyperIdleDb, id: string) => {
				const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
		},
	};
}

describe("agent-assignment — work's own bet_task/bet_decomposer selection (Decision F1 fold)", () => {
	test("listBetSelectionCandidates: WIP-blind active team candidates in stable id order", async ({
		db,
	}) => {
		const { listBetSelectionCandidates } = await import("../agent-assignment.js");
		await seedTeam(db);

		expect(await listBetSelectionCandidates(db, "assign-team", buildDeps())).toEqual([
			{ agentId: "assign-agent-a", role: "builder" },
			{ agentId: "assign-agent-b", role: "product_manager" },
		]);
	});

	test("selectBetTaskOwner: role match wins, else round-robins by spreadIndex, and emits the selection occasion", async ({
		db,
	}) => {
		const { selectBetTaskOwner } = await import("../agent-assignment.js");
		await seedTeam(db);
		const bus = new EventBus();
		const occasions: string[] = [];
		bus.on("work_selection_requested", (event) => occasions.push(event.workKey));

		expect(
			await selectBetTaskOwner(db, bus, buildDeps(), {
				teamId: "assign-team",
				workKey: "role-match",
				roleHint: "product_manager",
				spreadIndex: 0,
			}),
		).toEqual({ agentId: "assign-agent-b" });
		expect(
			await selectBetTaskOwner(db, bus, buildDeps(), {
				teamId: "assign-team",
				workKey: "spread-0",
				roleHint: null,
				spreadIndex: 0,
			}),
		).toEqual({ agentId: "assign-agent-a" });
		expect(
			await selectBetTaskOwner(db, bus, buildDeps(), {
				teamId: "assign-team",
				workKey: "spread-1",
				roleHint: null,
				spreadIndex: 1,
			}),
		).toEqual({ agentId: "assign-agent-b" });
		expect(occasions).toEqual(["role-match", "spread-0", "spread-1"]);
	});

	test("selectBetTaskOwner: no eligible candidates resolves to null", async ({ db }) => {
		const { selectBetTaskOwner } = await import("../agent-assignment.js");
		const bus = new EventBus();

		expect(
			await selectBetTaskOwner(db, bus, buildDeps(), {
				teamId: "assign-team-missing",
				workKey: "no-team",
				roleHint: null,
				spreadIndex: 0,
			}),
		).toEqual({ agentId: null });
	});

	test("selectBetDecomposerAgent: prefers the product_manager candidate", async ({ db }) => {
		const { selectBetDecomposerAgent } = await import("../agent-assignment.js");
		await seedTeam(db);
		const bus = new EventBus();

		expect(
			await selectBetDecomposerAgent(db, bus, buildDeps(), {
				teamId: "assign-team",
				workKey: "bet-1",
				roleHint: "product_manager",
			}),
		).toEqual({ agentId: "assign-agent-b" });
	});

	test("selectBetDecomposerAgent: rejects a resolved id that no longer maps to an active AI agent", async ({
		db,
	}) => {
		const { selectBetDecomposerAgent } = await import("../agent-assignment.js");
		await seedTeam(db);
		const bus = new EventBus();
		const deps = {
			...buildDeps(),
			users: {
				...buildDeps().users,
				getUserById: async (): Promise<undefined> => undefined,
			},
		};

		expect(
			await selectBetDecomposerAgent(db, bus, deps, {
				teamId: "assign-team",
				workKey: "bet-2",
				roleHint: "product_manager",
			}),
		).toEqual({ agentId: null });
	});
});
