/**
 * X7: Tests for seedWorld utility.
 *
 * Verifies that seedWorld inserts all entities correctly into an ephemeral DB.
 */

import {
	bets,
	createTestDb,
	knowledgeItems,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedWorld } from "../seed.js";
import type { EvalSeedData } from "../types.js";

const MINIMAL_SEED: EvalSeedData = {
	team: { id: "seed-team-1", name: "Seed Test Team" },
	teamMember: { id: "seed-tm-1" },
	agents: [{ id: "seed-agent-1", name: "Test Agent", role: "builder" }],
	bet: { id: "seed-bet-1", description: "Seed test bet" },
	tasks: [{ id: "seed-task-1", title: "Seed task", state: "accepted" }],
};

describe("seedWorld", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
	});

	afterEach(async () => {
		await handle.close();
	});

	it("inserts team, teamMember, agent, bet, and task", async () => {
		await seedWorld(handle.db, MINIMAL_SEED);

		const [team] = await handle.db.select().from(teams).where(eq(teams.id, "seed-team-1"));
		expect(team?.name).toBe("Seed Test Team");
		expect(team?.phase).toBe("build");

		const [tm] = await handle.db.select().from(teamMembers).where(eq(teamMembers.id, "seed-tm-1"));
		expect(tm?.teamId).toBe("seed-team-1");

		const [agent] = await handle.db.select().from(users).where(eq(users.id, "seed-agent-1"));
		expect(agent?.name).toBe("Test Agent");
		expect(agent?.role).toBe("builder");

		const [bet] = await handle.db.select().from(bets).where(eq(bets.id, "seed-bet-1"));
		expect(bet?.description).toBe("Seed test bet");
		expect(bet?.status).toBe("active");

		const [task] = await handle.db.select().from(tasks).where(eq(tasks.id, "seed-task-1"));
		expect(task?.title).toBe("Seed task");
		expect(task?.state).toBe("accepted");
	});

	it("inserts multiple agents", async () => {
		const multiAgentSeed: EvalSeedData = {
			...MINIMAL_SEED,
			agents: [
				{ id: "seed-agent-a", name: "Agent A", role: "builder" },
				{ id: "seed-agent-b", name: "Agent B", role: "product_manager" },
			],
		};

		await seedWorld(handle.db, multiAgentSeed);

		const allAgents = await handle.db.select().from(users);
		expect(allAgents).toHaveLength(2);
		expect(allAgents.map((a) => a.id)).toContain("seed-agent-a");
		expect(allAgents.map((a) => a.id)).toContain("seed-agent-b");
	});

	it("inserts optional knowledge items", async () => {
		const seedWithKi: EvalSeedData = {
			...MINIMAL_SEED,
			knowledgeItems: [
				{ id: "seed-ki-1", title: "Test Finding", body: "Test body text." },
				{
					id: "seed-ki-2",
					title: "Test Pattern",
					body: "Pattern body.",
					scopeKind: "product",
					scopeId: "seed-team-1",
				},
			],
		};

		await seedWorld(handle.db, seedWithKi);

		const allKi = await handle.db.select().from(knowledgeItems);
		expect(allKi).toHaveLength(2);

		const [ki1] = await handle.db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "seed-ki-1"));
		expect(ki1?.scopeKind).toBe("factory");
		expect(ki1?.scopeId).toBeNull();

		const [ki2] = await handle.db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "seed-ki-2"));
		expect(ki2?.scopeKind).toBe("product");
		expect(ki2?.scopeId).toBe("seed-team-1");
	});

	it("sets costAppetiteMinor on bet when provided", async () => {
		const seedWithCap: EvalSeedData = {
			...MINIMAL_SEED,
			bet: { id: "seed-bet-cap", description: "Cost test bet", costAppetiteMinor: 1000 },
		};
		// Need separate team/teamMember to avoid PK conflicts
		const isolatedSeed: EvalSeedData = {
			...seedWithCap,
			team: { id: "seed-team-cap", name: "Cap Team" },
			teamMember: { id: "seed-tm-cap" },
			agents: [{ id: "seed-agent-cap", name: "Cap Agent", role: "builder" }],
			tasks: [{ id: "seed-task-cap", title: "Cap task", state: "accepted" }],
		};
		await seedWorld(handle.db, isolatedSeed);

		const [bet] = await handle.db.select().from(bets).where(eq(bets.id, "seed-bet-cap"));
		expect(bet?.costAppetiteMinor).toBe(1000);
	});

	it("sets costCapMinor on agent when provided", async () => {
		const seedWithAgentCap: EvalSeedData = {
			team: { id: "seed-team-agcap", name: "AgCap Team" },
			teamMember: { id: "seed-tm-agcap" },
			agents: [
				{ id: "seed-agent-agcap", name: "Capped Agent", role: "builder", costCapMinor: 500 },
			],
			bet: { id: "seed-bet-agcap", description: "AgCap bet" },
			tasks: [{ id: "seed-task-agcap", title: "AgCap task", state: "accepted" }],
		};
		await seedWorld(handle.db, seedWithAgentCap);

		const [agent] = await handle.db.select().from(users).where(eq(users.id, "seed-agent-agcap"));
		expect(agent?.costCapMinor).toBe(500);
	});
});
