/**
 * L1 — Autonomy Schema (red phase, server routes).
 *
 * Pins the API contract from `docs/plans/L1.md` Decision 4:
 *   GET   /api/agents/:id/autonomy
 *   PATCH /api/agents/:id/autonomy { skillId, level, rationale? }
 *
 * Plus the validation scenarios from TRACK-L L1:
 *   - "lifting (architect, deploy) from L2 to L3" round-trips through GET.
 *   - PATCH against a missing (agent, skill) pair upserts (audit fromLevel=null).
 *
 * These tests MUST fail against `main`: the routes don't exist, neither does
 * the audit table they depend on. That's the red gate.
 *
 * @see docs/plans/L1.md Decision 4 + Decision 6 row "agents.test.ts".
 */
import {
	agentSkillAutonomyAudit,
	agentSkills,
	agents,
	createTestDb,
	type HyperIdleDb,
	products,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l1-autonomy";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = "2026-04-26T12:00:00.000Z";

describe("L1: GET/PATCH /api/agents/:id/autonomy", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		db.insert(products).values({ id: "prod-1", name: "P", phase: "build", createdAt: NOW }).run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 1,
				activeBets: 0,
				formedAt: NOW,
			})
			.run();
		db.insert(agents)
			.values([
				{
					id: "architect",
					name: "Architect",
					role: "builder",
					status: "idle",
					teamId: "team-1",
					createdAt: NOW,
				},
				{
					id: "growth",
					name: "Growth",
					role: "growth",
					status: "idle",
					teamId: "team-1",
					createdAt: NOW,
				},
			])
			.run();

		// Seed two skills for `architect`. `growth` has no rows — exercises the
		// "no per-skill rows" validation scenario.
		db.insert(agentSkills)
			.values([
				{
					agentId: "architect",
					skillId: "deploy",
					autonomyLevel: 2,
					updatedAt: NOW,
					updatedBy: "system",
				},
				{
					agentId: "architect",
					skillId: "design",
					autonomyLevel: 1,
					updatedAt: NOW,
					updatedBy: "system",
				},
			])
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ------------------------------------------------------------------
	// GET /api/agents/:id/autonomy
	// ------------------------------------------------------------------

	describe("GET /api/agents/:id/autonomy", () => {
		it("returns the per-skill ladder rows for the agent", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(Array.isArray(body)).toBe(true);
			expect(body).toHaveLength(2);

			// Each row exposes camelCase fields per Decision 4 / CONFUSION block.
			for (const row of body) {
				expect(row).toHaveProperty("skillId");
				expect(row).toHaveProperty("level");
				expect(row).toHaveProperty("updatedAt");
				expect(row).toHaveProperty("updatedBy");
				// `level` is a numeric ladder value, not a string
				expect(typeof row.level).toBe("number");
				expect([1, 2, 3, 4]).toContain(row.level);
			}

			const deploy = body.find((r) => r.skillId === "deploy");
			expect(deploy?.level).toBe(2);
			expect(deploy?.updatedBy).toBe("system");
		});

		it("returns 404 for an unknown agent", async () => {
			const res = await app.request("/api/agents/nonexistent/autonomy", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});

		it("returns [] for an agent with no per-skill rows", async () => {
			// docs/plans/L1.md Decision 4 + Open Q: GET returns the rows that
			// exist; default-to-L1 injection is the consumer's job (the editor),
			// not the route's. Empty array is the contract.
			const res = await app.request("/api/agents/growth/autonomy", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toEqual([]);
		});

		it("returns 401 without auth", async () => {
			const res = await app.request("/api/agents/architect/autonomy");
			expect(res.status).toBe(401);
		});
	});

	// ------------------------------------------------------------------
	// PATCH /api/agents/:id/autonomy
	// ------------------------------------------------------------------

	describe("PATCH /api/agents/:id/autonomy", () => {
		it("validation scenario: lift (architect, deploy) from L2 to L3 and re-fetch", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					skillId: "deploy",
					level: 3,
					rationale: "shipped 5 deploys, zero rollbacks",
				}),
			});
			expect(res.status).toBe(200);

			const updated = (await res.json()) as Record<string, unknown>;
			expect(updated.skillId).toBe("deploy");
			expect(updated.level).toBe(3);
			// updated_by is set per the validation scenario.
			expect(updated.updatedBy).not.toBeNull();
			expect(typeof updated.updatedBy).toBe("string");

			// Round-trip through GET — same row, same level.
			const getRes = await app.request("/api/agents/architect/autonomy", {
				headers: authHeaders(),
			});
			const list = (await getRes.json()) as Array<Record<string, unknown>>;
			const deploy = list.find((r) => r.skillId === "deploy");
			expect(deploy?.level).toBe(3);
			expect(deploy?.updatedBy).not.toBeNull();
		});

		it("writes an audit row with the rationale, fromLevel, toLevel", async () => {
			await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					skillId: "deploy",
					level: 3,
					rationale: "trust earned",
				}),
			});

			const audit = db
				.select()
				.from(agentSkillAutonomyAudit)
				.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
				.all();

			expect(audit).toHaveLength(1);
			expect(audit[0].skillId).toBe("deploy");
			expect(audit[0].fromLevel).toBe(2);
			expect(audit[0].toLevel).toBe(3);
			expect(audit[0].rationale).toBe("trust earned");
			expect(audit[0].changedBy).not.toBeNull();
		});

		it("creates the (agent, skill) row when missing — fromLevel=null in audit", async () => {
			// `growth` has no agent_skills rows. Lifting a skill above L1 must
			// upsert the row (otherwise the editor can't move pairs off the
			// L1 default — see Open Q in plan).
			const res = await app.request("/api/agents/growth/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					skillId: "research",
					level: 2,
					rationale: "first-set",
				}),
			});
			expect(res.status).toBe(200);

			const skillRow = db.select().from(agentSkills).where(eq(agentSkills.agentId, "growth")).get();
			expect(skillRow?.skillId).toBe("research");
			expect(skillRow?.autonomyLevel).toBe(2);

			const audit = db
				.select()
				.from(agentSkillAutonomyAudit)
				.where(eq(agentSkillAutonomyAudit.agentId, "growth"))
				.get();
			expect(audit?.fromLevel).toBeNull();
			expect(audit?.toLevel).toBe(2);
		});

		it("PATCH with the same level is a no-op for audit (no row written)", async () => {
			await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: 2 }),
			});

			const audit = db
				.select()
				.from(agentSkillAutonomyAudit)
				.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
				.all();

			// No level change ⇒ no audit row, per the existing
			// "level unchanged → no review" semantics in agents.ts.
			expect(audit).toHaveLength(0);
		});

		it("rejects level: 5 with 400", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: 5 }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects level: 0 with 400", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: 0 }),
			});
			expect(res.status).toBe(400);
		});

		it('rejects level: "L1" (string) with 400', async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: "L1" }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects missing skillId with 400", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ level: 3 }),
			});
			expect(res.status).toBe(400);
		});

		it("rejects empty skillId with 400", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "", level: 3 }),
			});
			expect(res.status).toBe(400);
		});

		it("accepts omitted rationale (optional per plan §4)", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: 3 }),
			});
			expect(res.status).toBe(200);

			const audit = db
				.select()
				.from(agentSkillAutonomyAudit)
				.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
				.get();
			expect(audit?.rationale).toBeNull();
		});

		it("returns 404 for unknown agent", async () => {
			const res = await app.request("/api/agents/nonexistent/autonomy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ skillId: "deploy", level: 3 }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 401 without auth", async () => {
			const res = await app.request("/api/agents/architect/autonomy", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ skillId: "deploy", level: 3 }),
			});
			expect(res.status).toBe(401);
		});
	});

	// ------------------------------------------------------------------
	// Regression: legacy PATCH /:id/skills/:skillId still writes an audit row
	// ------------------------------------------------------------------

	describe("regression: legacy PATCH /:id/skills/:skillId still records audit", () => {
		it("writes an audit row when level changes via the legacy route", async () => {
			// docs/plans/L1.md Decision 4: legacy route refactors to call
			// applyAutonomyChange. After the refactor it MUST also produce an
			// audit row — guard against the helper losing the audit write.
			const res = await app.request("/api/agents/architect/skills/deploy", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});
			expect(res.status).toBe(200);

			const audit = db
				.select()
				.from(agentSkillAutonomyAudit)
				.where(eq(agentSkillAutonomyAudit.agentId, "architect"))
				.all();
			expect(audit).toHaveLength(1);
			expect(audit[0].skillId).toBe("deploy");
			expect(audit[0].fromLevel).toBe(2);
			expect(audit[0].toLevel).toBe(4);
		});
	});
});
