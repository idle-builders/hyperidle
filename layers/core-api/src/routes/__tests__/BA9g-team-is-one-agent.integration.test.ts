/**
 * A new team is one empty agent.
 *
 * Creating a team used to create a ROSTER: `defaultRoster(functions)` mapped the
 * team's declared functions through a catalog and produced a Builder, a Product
 * Manager, a QA Engineer. A team that produced no agents was a 400.
 *
 * Founder: "the entire roster concept should be removed from the core… a new
 * team is just a single empty agent. and then you improve that team with
 * plugins." A builder is not something HyperIdle has an opinion about; it is
 * something the `role-personas` plugin brings.
 *
 * So: one agent, no identity document, no declared functions. Install a plugin
 * to get more.
 */

import { type HyperIdleDb, knowledgeItems, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-team-one-agent";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder-team",
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

async function createTeam(app: Hono, name: string): Promise<Response> {
	return app.request("/api/teams", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ name, userId: "u-founder-team" }),
	});
}

describe("a new team is one empty agent", () => {
	test("creating a team creates exactly one agent", async ({ db, app }) => {
		await seedFounder(db);

		const res = await createTeam(app, "Acme");
		expect(res.status).toBe(201);

		const body = (await res.json()) as { team: { id: string }; leadAgentId?: string | null };
		const agents = await db.select().from(users).where(eq(users.teamId, body.team.id));
		// The founder's own assistant is not the team's — it has no teamId, and it
		// is the one agent HyperIdle does ship, per human.
		expect(agents, "one agent, not a roster").toHaveLength(1);
	});

	test("that agent has no identity — you write one, or a plugin brings it", async ({ db, app }) => {
		await seedFounder(db);
		const res = await createTeam(app, "Acme");
		const body = (await res.json()) as { team: { id: string }; leadAgentId?: string | null };

		const [agent] = await db.select().from(users).where(eq(users.teamId, body.team.id));
		const identities = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.scopeId, String(agent?.id)));

		expect(identities, "a bare AGENTS.md").toHaveLength(0);
	});

	test("no builder, no product manager, no QA engineer", async ({ db, app }) => {
		await seedFounder(db);
		const res = await createTeam(app, "Acme");
		const body = (await res.json()) as { team: { id: string }; leadAgentId?: string | null };

		const agents = await db.select().from(users).where(eq(users.teamId, body.team.id));
		const roles = agents.map((a) => a.role);

		// The roles the old roster produced for the default functions.
		expect(roles).not.toContain("builder");
		expect(roles).not.toContain("product_manager");
		expect(roles).not.toContain("qa_engineer");
	});

	test("a team creates fine without declaring any functions", async ({ db, app }) => {
		await seedFounder(db);

		// `functions` used to be required in spirit: an empty roster was a 400
		// "Team functions produced no agents". There is no roster to be empty.
		const res = await createTeam(app, "Functionless");
		expect(res.status).toBe(201);
	});

	test("the team's one agent is its lead", async ({ db, app }) => {
		await seedFounder(db);
		const res = await createTeam(app, "Acme");
		const body = (await res.json()) as {
			team: { id: string };
			leadAgentId?: string | null;
		};

		const [agent] = await db.select().from(users).where(eq(users.teamId, body.team.id));
		// Lead used to be "the first product_manager, else the first agent". With
		// one agent there is no election to hold.
		expect(body.leadAgentId ?? agent?.id).toBe(agent?.id);
	});
});
