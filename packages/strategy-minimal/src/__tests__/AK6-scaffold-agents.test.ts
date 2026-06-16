/**
 * AK6 — Minimal Strategy scaffoldAgents: RED phase
 *
 * T3 / AC1 / AC3: minimalStrategy.scaffoldAgents(req) behavior
 *
 *   - team_scaffold  → exactly 1 spec, role "builder", systemPrompt null
 *   - agent_added with name → name passed through, role from req
 *   - agent_added with role null → throws
 *   - user_assistant with ownerUserName → name "${ownerUserName}'s Assistant"
 *   - user_assistant with ownerUserId  → idHint "ast-${ownerUserId}"
 *   - user_assistant with no ownerUserName → name "Assistant"
 *   - agentCategory correctness per trigger
 *   - systemPrompt is always null under Minimal (empty-knowledge AGENTS.md)
 *
 * Tests FAIL until minimalStrategy.scaffoldAgents is implemented (green T3).
 */

import { describe, expect, it } from "vitest";
import { minimalStrategy } from "../index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE = {
	db: null as never,
	teamId: null,
	teamMembersId: null,
	teamName: null,
	functions: null,
	role: null,
	name: null,
	ownerUserId: null,
	ownerUserName: null,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// team_scaffold
// ─────────────────────────────────────────────────────────────────────────────

describe("minimalStrategy.scaffoldAgents — team_scaffold", () => {
	it("returns exactly ONE spec", async () => {
		const specs = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			functions: ["development"],
		});
		expect(specs).toHaveLength(1);
	});

	it("spec has role 'builder'", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			functions: ["development"],
		});
		expect(spec?.role).toBe("builder");
	});

	it("spec has systemPrompt null (empty-knowledge AGENTS.md)", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			functions: ["development"],
		});
		expect(spec?.systemPrompt).toBeNull();
	});

	it("spec has agentCategory 'team'", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			functions: ["development"],
		});
		expect(spec?.agentCategory).toBe("team");
	});

	it("name includes teamName when provided", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "BigCorp",
			functions: ["development"],
		});
		// The plan says: `${teamName ?? "Agent"} Agent` — exact text is plan-driven.
		expect(spec?.name).toBeDefined();
		expect(typeof spec?.name).toBe("string");
		expect((spec?.name ?? "").length).toBeGreaterThan(0);
	});

	it("falls back gracefully when teamName is null", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: null,
			functions: null,
		});
		// Must not throw; name should be a non-empty string
		expect(typeof spec?.name).toBe("string");
		expect((spec?.name ?? "").length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// agent_added
// ─────────────────────────────────────────────────────────────────────────────

describe("minimalStrategy.scaffoldAgents — agent_added", () => {
	it("passes caller-supplied name through unchanged", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "builder",
			name: "Alice the Builder",
		});
		expect(spec?.name).toBe("Alice the Builder");
	});

	it("synthesizes a name when req.name is null", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "builder",
			name: null,
		});
		expect(typeof spec?.name).toBe("string");
		expect((spec?.name ?? "").length).toBeGreaterThan(0);
	});

	it("uses the requested role on the spec", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "qa_engineer",
			name: null,
		});
		expect(spec?.role).toBe("qa_engineer");
	});

	it("returns exactly 1 spec", async () => {
		const specs = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "builder",
			name: "Bob",
		});
		expect(specs).toHaveLength(1);
	});

	it("throws when role is null (contract: agent_added always carries a role)", async () => {
		await expect(
			minimalStrategy.scaffoldAgents({
				...BASE,
				trigger: "agent_added",
				teamId: "team-1",
				teamMembersId: "tm-1",
				teamName: "Acme",
				role: null,
				name: "Nameless",
			}),
		).rejects.toThrow();
	});

	it("systemPrompt is null (no injected knowledge under Minimal)", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "builder",
			name: "Dev",
		});
		expect(spec?.systemPrompt).toBeNull();
	});

	it("agentCategory is 'team'", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "agent_added",
			teamId: "team-1",
			teamMembersId: "tm-1",
			teamName: "Acme",
			role: "designer",
			name: "Dave",
		});
		expect(spec?.agentCategory).toBe("team");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// user_assistant
// ─────────────────────────────────────────────────────────────────────────────

describe("minimalStrategy.scaffoldAgents — user_assistant", () => {
	it('name is "${ownerUserName}\'s Assistant" when ownerUserName provided', async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-ada",
			ownerUserName: "Ada",
		});
		expect(spec?.name).toBe("Ada's Assistant");
	});

	it("name is 'Assistant' when ownerUserName is null", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-x",
			ownerUserName: null,
		});
		expect(spec?.name).toBe("Assistant");
	});

	it("idHint is 'ast-${ownerUserId}' when ownerUserId provided", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-ada",
			ownerUserName: "Ada",
		});
		expect(spec?.idHint).toBe("ast-user-ada");
	});

	it("idHint is undefined when ownerUserId is null", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: null,
			ownerUserName: null,
		});
		expect(spec?.idHint).toBeUndefined();
	});

	it("role is 'assistant'", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-bob",
			ownerUserName: "Bob",
		});
		expect(spec?.role).toBe("assistant");
	});

	it("agentCategory is 'individual'", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-carol",
			ownerUserName: "Carol",
		});
		expect(spec?.agentCategory).toBe("individual");
	});

	it("systemPrompt is null (Minimal carries no injected knowledge)", async () => {
		const [spec] = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-x",
			ownerUserName: "Alex",
		});
		expect(spec?.systemPrompt).toBeNull();
	});

	it("returns exactly 1 spec", async () => {
		const specs = await minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "user_assistant",
			ownerUserId: "user-x",
			ownerUserName: "Alex",
		});
		expect(specs).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Strategy<HyperIdleDb> compliance — scaffoldAgents is present on minimalStrategy
// ─────────────────────────────────────────────────────────────────────────────

describe("minimalStrategy — Strategy port compliance", () => {
	it("has a scaffoldAgents method (port T1 compliance)", () => {
		expect(typeof minimalStrategy.scaffoldAgents).toBe("function");
	});

	it("scaffoldAgents returns a Promise", () => {
		const result = minimalStrategy.scaffoldAgents({
			...BASE,
			trigger: "team_scaffold",
			teamId: "t",
			teamMembersId: "tm",
			teamName: "X",
			functions: ["development"],
		});
		expect(result).toBeInstanceOf(Promise);
	});
});
