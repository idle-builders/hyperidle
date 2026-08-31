/**
 * A role is whatever agents actually have, not a fixed list.
 *
 * `AGENT_ROLE_CATALOG` was 17 hardcoded entries. A plugin or a person could put
 * any string in `role` — the API never validated against the catalog — but
 * nothing they invented was ever offered back: the role picker only listed the
 * hardcoded 17, and a new role rendered with a derived label and no home.
 *
 * Founder: "the roles catalog shouldn't be hardcoded, but based of what really
 * exists, a plugin or user should be able to introduce a new role with a new
 * agent. but also reuse an existing role during agent creation."
 *
 * So the roles in use are the roles that exist on agents. Introducing one is
 * creating an agent with it; reusing one is picking it off that list.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-roles";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
});
afterEach(() => {
	vi.unstubAllEnvs();
});

async function seedTeam(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder-roles",
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

async function createAgent(app: Hono, name: string, role: string): Promise<Response> {
	return app.request("/api/agents", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ name, role }),
	});
}

async function rolesInUse(app: Hono): Promise<readonly string[]> {
	const res = await app.request("/api/agents", { headers: auth() });
	expect(res.status).toBe(200);
	const rows = (await res.json()) as Array<{ role: string }>;
	return [...new Set(rows.map((r) => r.role))];
}

describe("a role is whatever agents actually have", () => {
	test("a brand-new role can be introduced by creating an agent with it", async ({ db, app }) => {
		await seedTeam(db);

		const res = await createAgent(app, "Rita", "release_manager");
		expect(res.status).toBe(201);

		const [agent] = await db.select().from(users).where(eq(users.name, "Rita"));
		expect(agent?.role, "the role is whatever you said it is").toBe("release_manager");
	});

	test("a role nobody hardcoded shows up as a role in use", async ({ db, app }) => {
		await seedTeam(db);
		await createAgent(app, "Rita", "release_manager");

		expect(await rolesInUse(app), "invented roles are offered back").toContain("release_manager");
	});

	test("an existing role can be reused for another agent", async ({ db, app }) => {
		await seedTeam(db);
		await createAgent(app, "Rita", "release_manager");
		const res = await createAgent(app, "Rex", "release_manager");
		expect(res.status).toBe(201);

		const agents = await db.select().from(users).where(eq(users.role, "release_manager"));
		expect(agents, "two agents, one role").toHaveLength(2);
	});

	test("the roles in use are only the ones that exist", async ({ db, app }) => {
		await seedTeam(db);
		await createAgent(app, "Rita", "release_manager");

		const roles = await rolesInUse(app);
		// The catalog used to offer 17 roles whether or not any agent had them.
		// Nobody has these.
		expect(roles).not.toContain("brand_voice");
		expect(roles).not.toContain("data_analyst");
		expect(roles).not.toContain("scout");
	});
});
