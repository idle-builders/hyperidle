/**
 * Nobody's agent is quietly assigned a harness or a model they never picked.
 *
 * A workspace runs on the harness its owner chose during setup. When no choice
 * has been made — a team created before a harness was picked, an agent created
 * through the API with no harness named — the correct stored value is **nothing**,
 * and the run resolves it: the adapter pool takes whichever harness is available,
 * and that harness runs on its own default model.
 *
 * What it must NOT be is a vendor's name compiled into the product. Writing
 * `builtin` + `claude-sonnet-4-6` + `anthropic` onto a row makes a decision on
 * someone's behalf and then presents it back to them as their configuration.
 * It also outlives its own reason: those three constants describe the model
 * gateway, so they keep naming a harness after that harness is gone.
 */

import { agentRunConfig, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const NOW = "2026-08-28T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json", "X-API-Key": "test-key" };
}

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder-nodefault",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		email: "founder-nodefault@hyperidle.com",
		createdAt: NOW,
	});
}

describe("no harness or model is chosen on someone's behalf", () => {
	test("an agent created with no harness named stores none", async ({ db, app }) => {
		await seedFounder(db);
		await db
			.insert(teams)
			.values({ id: "team-nodefault", name: "No Default", phase: "build", createdAt: NOW });

		const res = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Unassigned Agent", role: "builder", teamId: "team-nodefault" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { agent?: { id?: string }; id?: string };
		const agentId = body.agent?.id ?? body.id;
		expect(agentId).toBeDefined();

		const [config] = await db
			.select()
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, agentId as string))
			.limit(1);

		expect(config?.harnessType ?? null).toBeNull();
		expect(config?.modelId ?? null).toBeNull();
		expect(config?.modelProvider ?? null).toBeNull();
	});

	test("a team created without a chosen harness scaffolds agents that store none", async ({
		db,
		app,
	}) => {
		await seedFounder(db);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Unchosen Team", functions: ["development"] }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };

		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			const [config] = await db
				.select()
				.from(agentRunConfig)
				.where(eq(agentRunConfig.agentUserId, agent.id))
				.limit(1);
			expect(config?.harnessType ?? null, `${agent.name} was assigned a harness`).toBeNull();
			expect(config?.modelId ?? null, `${agent.name} was assigned a model`).toBeNull();
		}
	});

	test("a team created WITH a chosen harness scaffolds agents onto exactly that", async ({
		db,
		app,
	}) => {
		await seedFounder(db);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Chosen Team",
				functions: ["development"],
				primaryHarness: {
					harnessType: "claude-code",
					modelId: "haiku",
					modelProvider: "anthropic",
				},
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };

		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			const [config] = await db
				.select()
				.from(agentRunConfig)
				.where(eq(agentRunConfig.agentUserId, agent.id))
				.limit(1);
			expect(config?.harnessType).toBe("claude-code");
			expect(config?.modelId).toBe("haiku");
		}
	});
});
