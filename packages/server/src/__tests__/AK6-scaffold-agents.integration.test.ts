/**
 * AK6 — Scaffold agents integration tests: RED phase
 *
 * Covers:
 *   T4  / AC4  — Fabric composeRoster/scaffoldAgents (3 triggers) — preservation golden
 *   T5  / AC5  — persistScaffoldedAgents: stable ids, idHint honored, deny-set enforced
 *   T6  / AC1,A3 — POST /api/teams routes through scaffoldAgents; Minimal=1 agent; bus event
 *   T7  / AC1  — add_agent tool routes through scaffoldAgents; caller name preserved; bus event
 *   T8  / AC1,AC8 — POST /api/users assistant created via scaffoldAgents; bus event; name preserved
 *
 * Tests FAIL until:
 *   - ScaffoldRequest / AgentScaffoldSpec in @hyperidle/shared (T1)
 *   - scaffoldAgents on minimalStrategy (T3) + fabricStrategy (T4)
 *   - persistScaffoldedAgents helper (T5)
 *   - teams-routes.ts, add-agent tool, users.ts/assistant.ts rewired through port (T6/T7/T8)
 *   - creation events emitted (T2)
 */

import { factorySettings, teamMembers, teams, users } from "@hyperidle/db";
import {
	type AgentAddedEvent,
	type AgentScaffoldSpec,
	EventBus,
	type ScaffoldRequest,
	type TeamCreatedEvent,
	type UserCreatedEvent,
} from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { persistScaffoldedAgents } from "../services/scaffold-agents.js";
import { test } from "../test-fixtures.js";
import { addAgentTool } from "../tools/add-agent.js";
import { createTeamTool } from "../tools/create-team.js";

const TEST_API_KEY = "test-key-AK6";
const NOW = new Date().toISOString();

const resolverState = vi.hoisted(() => ({
	scaffoldAgents: null as null | ((input: unknown) => unknown),
}));

vi.mock("../services/agent-defaults/resolvers.js", () => ({
	resolveAgentScaffoldSpecs: async (input: unknown) => {
		if (!resolverState.scaffoldAgents) return [];
		return resolverState.scaffoldAgents(input);
	},
	resolveAgentSelection: async (input: {
		candidates?: ReadonlyArray<{ agentId: string; role: string }>;
		roleHint?: string | null;
		spreadIndex?: number | null;
	}) => {
		const candidates = input.candidates ?? [];
		const byRole = input.roleHint
			? candidates.find((candidate) => candidate.role === input.roleHint)
			: undefined;
		const chosen = byRole ?? candidates[(input.spreadIndex ?? 0) % Math.max(candidates.length, 1)];
		return { agentId: chosen?.agentId ?? null };
	},
	resolveAssistantFormation: async () => ({
		persona: null,
		assistantDraftSurface: "standard",
	}),
	resolveDecompositionPlan: async (input: {
		candidates?: ReadonlyArray<{ agentId: string; role: string }>;
	}) => {
		const candidates = input.candidates ?? [];
		const pm =
			candidates.find((candidate) => candidate.role === "product_manager") ?? candidates[0];
		return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
	},
}));

function setActiveStrategy(strategy: {
	scaffoldAgents(input: ScaffoldRequest<unknown>): Promise<readonly AgentScaffoldSpec[]>;
}): void {
	resolverState.scaffoldAgents = strategy.scaffoldAgents.bind(strategy) as (
		input: unknown,
	) => unknown;
}

function clearActiveStrategy(): void {
	resolverState.scaffoldAgents = null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// T5 — persistScaffoldedAgents helper (AC5: stable user-id, idHint, deny-set)
// ─────────────────────────────────────────────────────────────────────────────

describe("T5: persistScaffoldedAgents — id assignment and mechanism fields", () => {
	test("inserts N users rows with kind=ai, status=active", async ({ db }) => {
		const tm = "tm-t5-basic";
		const teamId = "team-t5-basic";
		await db.insert(teams).values({ id: teamId, name: "T5 Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const specs: readonly AgentScaffoldSpec[] = [
			{ role: "builder", name: "Builder", agentCategory: "team", systemPrompt: null },
			{ role: "qa_engineer", name: "QA", agentCategory: "team", systemPrompt: null },
		];

		const result = await persistScaffoldedAgents(db, tm, specs);

		expect(result.agentIds).toHaveLength(2);

		const rows = await db.select().from(users).where(eq(users.teamId, tm));
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.kind).toBe("ai");
			expect(row.status).toBe("active");
		}
	});

	test("teamId is set on the inserted users row (teamMembersId)", async ({ db }) => {
		const tm = "tm-t5-teamid";
		const teamId = "team-t5-teamid";
		await db
			.insert(teams)
			.values({ id: teamId, name: "T5 TeamId", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const specs: readonly AgentScaffoldSpec[] = [
			{ role: "builder", name: "Builder", agentCategory: "team", systemPrompt: null },
		];
		await persistScaffoldedAgents(db, tm, specs);

		const rows = await db.select().from(users).where(eq(users.teamId, tm));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.teamId).toBe(tm);
	});

	test("idHint honored when id is free (ast- prefix)", async ({ db }) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "assistant",
				name: "Ada's Assistant",
				agentCategory: "individual",
				systemPrompt: null,
				idHint: "ast-user-ada-free",
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		expect(result.agentIds[0]).toBe("ast-user-ada-free");
	});

	test("idHint honored when id is free (seed-agent- prefix)", async ({ db }) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "builder",
				name: "Builder",
				agentCategory: "team",
				systemPrompt: null,
				idHint: "seed-agent-test-builder",
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		expect(result.agentIds[0]).toBe("seed-agent-test-builder");
	});

	test("idHint with system: prefix → fresh UUID (deny-set)", async ({ db }) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "builder",
				name: "Builder",
				agentCategory: "team",
				systemPrompt: null,
				idHint: "system:propagation",
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		// Must NOT use the system: prefixed hint
		expect(result.agentIds[0]).not.toBe("system:propagation");
		expect(result.agentIds[0]).toBeDefined();
		// Should be a UUID or some generated id
		expect(typeof result.agentIds[0]).toBe("string");
	});

	test("idHint collision → fresh UUID assigned (stable-id contract)", async ({ db }) => {
		// Pre-insert a user with the hinted id
		const existingId = "ast-user-collision-test";
		await db.insert(users).values({
			id: existingId,
			kind: "ai",
			name: "Pre-existing",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});

		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "assistant",
				name: "Alice's Assistant",
				agentCategory: "individual",
				systemPrompt: null,
				idHint: existingId,
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		// Should NOT use the colliding id
		expect(result.agentIds[0]).not.toBe(existingId);
		expect(result.agentIds[0]).toBeDefined();
	});

	test("lead is first product_manager if present", async ({ db }) => {
		const tm = "tm-t5-lead";
		const teamId = "team-t5-lead";
		await db.insert(teams).values({ id: teamId, name: "T5 Lead", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const specs: readonly AgentScaffoldSpec[] = [
			{ role: "builder", name: "Builder", agentCategory: "team", systemPrompt: null },
			{ role: "product_manager", name: "PM", agentCategory: "team", systemPrompt: null },
			{ role: "qa_engineer", name: "QA", agentCategory: "team", systemPrompt: null },
		];

		const result = await persistScaffoldedAgents(db, tm, specs);
		// Lead should be the product_manager agent id
		const rows = await db.select().from(users).where(eq(users.teamId, tm));
		const pmRow = rows.find((r) => r.role === "product_manager");
		expect(result.leadAgentId).toBe(pmRow?.id);
	});

	test("lead is first spec when no product_manager present", async ({ db }) => {
		const tm = "tm-t5-lead-fallback";
		const teamId = "team-t5-lead-fallback";
		await db
			.insert(teams)
			.values({ id: teamId, name: "T5 Lead Fallback", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const specs: readonly AgentScaffoldSpec[] = [
			{ role: "builder", name: "Builder", agentCategory: "team", systemPrompt: null },
			{ role: "qa_engineer", name: "QA", agentCategory: "team", systemPrompt: null },
		];

		const result = await persistScaffoldedAgents(db, tm, specs);
		expect(result.leadAgentId).toBe(result.agentIds[0]);
	});

	test("null teamMembersId allowed (non-team-scoped agents like individual assistant)", async ({
		db,
	}) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "assistant",
				name: "Solo Assistant",
				agentCategory: "individual",
				systemPrompt: null,
				idHint: "ast-user-solo-test",
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		expect(result.agentIds).toHaveLength(1);
		// teamId should be null on the inserted row
		const rows = await db.select().from(users).where(eq(users.id, "ast-user-solo-test"));
		expect(rows[0]?.teamId).toBeNull();
	});

	test("systemPrompt from spec is persisted on the users row", async ({ db }) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "builder",
				name: "Builder with Persona",
				agentCategory: "team",
				systemPrompt: "You are a specialized builder.",
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		const agentId = result.agentIds[0];
		const rows = await db.select().from(users).where(eq(users.id, agentId!));
		expect(rows[0]?.systemPrompt).toBe("You are a specialized builder.");
	});

	test("null systemPrompt from spec is persisted as null (Minimal path)", async ({ db }) => {
		const specs: readonly AgentScaffoldSpec[] = [
			{
				role: "builder",
				name: "Builder No Persona",
				agentCategory: "team",
				systemPrompt: null,
			},
		];

		const result = await persistScaffoldedAgents(db, null, specs);
		const agentId = result.agentIds[0];
		const rows = await db.select().from(users).where(eq(users.id, agentId!));
		expect(rows[0]?.systemPrompt).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — POST /api/teams routes through scaffoldAgents (AC1/A3)
// ─────────────────────────────────────────────────────────────────────────────

describe("T6: POST /api/teams routes through scaffoldAgents", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("Minimal active: POST /api/teams creates EXACTLY 1 agent (AC3)", async ({ db, app }) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Minimal Team", functions: ["development", "product"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
		const tm = body.teamMembers.id;

		const agents = await db.select().from(users).where(eq(users.teamId, tm));
		expect(agents).toHaveLength(1);
	});

	test("Minimal active: POST /api/teams agent has systemPrompt null (empty-knowledge)", async ({
		db,
		app,
	}) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Minimal Team SP", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };

		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		expect(agents).toHaveLength(1);
		expect(agents[0]?.systemPrompt).toBeNull();
	});

	test("Minimal active: scaffolded agent has a valid users.id (stable Kernel user-id)", async ({
		db,
		app,
	}) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Valid ID Team", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };

		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		expect(agents).toHaveLength(1);
		expect(agents[0]?.id).toBeDefined();
		expect(typeof agents[0]?.id).toBe("string");
		expect((agents[0]?.id ?? "").length).toBeGreaterThan(0);
	});

	test("POST /api/teams emits team_created event on bus (AC2)", async ({ app, eventBus }) => {
		setActiveStrategy(minimalStrategy);

		const received: TeamCreatedEvent[] = [];
		eventBus.on("team_created", (e) => received.push(e));

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Event Team", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("team_created");
		expect(received[0]?.agentIds).toBeDefined();
		expect(Array.isArray(received[0]?.agentIds)).toBe(true);
	});

	test("team_created event is emitted AFTER agents are persisted (post-persist contract)", async ({
		db,
		app,
		eventBus,
	}) => {
		setActiveStrategy(minimalStrategy);

		let agentsExistAtEventTime = false;
		eventBus.on("team_created", async (e) => {
			const rows = await db
				.select()
				.from(users)
				.where(eq(users.id, e.agentIds[0] ?? ""));
			agentsExistAtEventTime = rows.length > 0;
		});

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Post-Persist Team", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		expect(agentsExistAtEventTime).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — add_agent tool routes through scaffoldAgents (AC1, caller name)
// ─────────────────────────────────────────────────────────────────────────────

describe("T7: add_agent tool routes through scaffoldAgents", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("add_agent tool: caller-supplied name is persisted unchanged", async ({ db }) => {
		setActiveStrategy(minimalStrategy);

		// Create a team + membership first (tool needs an existing team)
		const teamId = "team-t7-name";
		const tm = "tm-t7-name";
		await db
			.insert(teams)
			.values({ id: teamId, name: "T7 Name Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		// Call the add_agent tool via MCP/tool route
		// The tool endpoint is typically exposed via session-bound tool calls.
		// We test the underlying service directly if the tool can't be easily hit:
		// For now we test via POST /api/tools if available, or assert the service.
		// @lore AK6-T7: The tool invocation is tested via the server route that
		// exposes add_agent. If no dedicated route, we assert via the db helper.

		// Direct helper test for tool behavior: call persistScaffoldedAgents with
		// a spec derived from an agent_added-style scaffoldAgents call.
		const scaffoldReq: ScaffoldRequest<typeof db> = {
			db,
			trigger: "agent_added",
			teamId,
			teamMembersId: tm,
			teamName: "T7 Name Team",
			functions: null,
			role: "builder",
			name: "My Custom Builder Name",
			ownerUserId: null,
			ownerUserName: null,
		};
		const specs = await minimalStrategy.scaffoldAgents(scaffoldReq);
		// The name from req should be preserved
		expect(specs[0]?.name).toBe("My Custom Builder Name");

		// Persist and confirm
		const result = await persistScaffoldedAgents(db, tm, specs);
		const rows = await db.select().from(users).where(eq(users.id, result.agentIds[0]!));
		expect(rows[0]?.name).toBe("My Custom Builder Name");
	});

	test("add_agent tool: emits agent_added event on bus (AC2)", async ({ db, app, eventBus }) => {
		setActiveStrategy(minimalStrategy);

		// POST to the teams add-agent endpoint
		const teamId = "team-t7-event";
		const tm = "tm-t7-event";
		await db
			.insert(teams)
			.values({ id: teamId, name: "T7 Event Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const received: AgentAddedEvent[] = [];
		eventBus.on("agent_added", (e) => received.push(e));

		// Hit the add-agent route (POST /api/teams/:id/members or similar)
		const res = await app.request(`/api/teams/${teamId}/agents`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ role: "builder", name: "New Builder" }),
		});

		// If the endpoint is 201 or 200, event should be emitted.
		// If 404 (route not yet wired), test fails correctly (missing impl).
		expect(res.status).toBe(201);
		expect(received.length).toBeGreaterThanOrEqual(1);
		expect(received[0]?.type).toBe("agent_added");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AK6 P4 fix — WARNING-1: Tool-path creation events (AC2 completeness)
// The HTTP-route tests above go through the route which DOES emit. These tests
// call the tool HANDLER directly (as an MCP session would) to prove the tool
// path ALSO emits team_created / agent_added — the gap the reviewer flagged.
// RED before fix: handler returns ok but emits no event.
// GREEN after fix: handler emits the event via ctx.eventBus.
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 WARNING-1: tool handler direct path emits creation events (AC2)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("create_team tool handler emits team_created on ctx.eventBus", async ({ db }) => {
		setActiveStrategy(minimalStrategy);

		const bus = new EventBus();
		const received: TeamCreatedEvent[] = [];
		bus.on("team_created", (e) => received.push(e));

		const ctx = {
			db,
			eventBus: bus,
			agentId: "agent-test",
			sessionId: "session-test",
			taskId: "task-test",
			sandboxPath: "/tmp/ak6-tool-test-create-team",
			ingestion: {
				dispose: (): void => {
					/* no-op */
				},
			},
		};

		const result = await createTeamTool.handler(
			{ name: "Tool-Created Team", functions: ["development"] },
			ctx,
		);

		// createTeamTool uses ToolResult: { success: true, data } not AssistantToolResult
		expect(result.success).toBe(true);
		// Event must have been emitted on the tool's event bus — not just on the HTTP route bus
		expect(received.length).toBeGreaterThanOrEqual(1);
		expect(received[0]?.type).toBe("team_created");
		if (result.success) {
			const data = result.data as { teamId: string };
			expect(received[0]?.teamId).toBe(data.teamId);
		}
	});

	test("add_agent tool handler emits agent_added on ctx.eventBus", async ({ db }) => {
		setActiveStrategy(minimalStrategy);

		// Seed the team
		const teamId = "team-warning1-add-agent";
		const tm = "tm-warning1-add-agent";
		await db.insert(teams).values({ id: teamId, name: "W1 Team", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: tm, teamId, capacity: 5, activeBets: 0, formedAt: NOW });

		const bus = new EventBus();
		const received: AgentAddedEvent[] = [];
		bus.on("agent_added", (e) => received.push(e));

		const ctx = {
			db,
			eventBus: bus,
			agentId: "agent-test",
			sessionId: "session-test",
			taskId: "task-test",
			sandboxPath: "/tmp/ak6-tool-test-add-agent",
			ingestion: {
				dispose: (): void => {
					/* no-op */
				},
			},
		};

		const result = await addAgentTool.handler(
			{ teamId, role: "builder", name: "Tool-Added Builder" },
			ctx,
		);

		// addAgentTool uses ToolResult: { success: true, data } not AssistantToolResult
		expect(result.success).toBe(true);
		// Event must have been emitted on the tool's event bus
		expect(received.length).toBeGreaterThanOrEqual(1);
		expect(received[0]?.type).toBe("agent_added");
		if (result.success) {
			const data = result.data as { agentId: string; teamId: string };
			expect(received[0]?.teamId).toBe(data.teamId);
			expect(received[0]?.agentId).toBe(data.agentId);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 — Assistant creation via scaffoldAgents (AC1/AC8, name preservation)
// ─────────────────────────────────────────────────────────────────────────────

describe("T8: POST /api/users assistant created via scaffoldAgents", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("POST /api/users creates assistant with id 'ast-${userId}'", async ({ db, app }) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Alice", role: "founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const userId = body.user.id;

		const assistants = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${userId}`));
		expect(assistants).toHaveLength(1);
		expect(assistants[0]?.id).toBe(`ast-${userId}`);
	});

	test('POST /api/users creates assistant with name "${name}\'s Assistant" (preserved)', async ({
		db,
		app,
	}) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Bob", role: "founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const userId = body.user.id;

		const assistants = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${userId}`));
		expect(assistants[0]?.name).toBe("Bob's Assistant");
	});

	test("POST /api/users under Minimal: assistant systemPrompt is null", async ({ db, app }) => {
		setActiveStrategy(minimalStrategy);

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Carol", role: "founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const userId = body.user.id;

		const assistants = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${userId}`));
		expect(assistants[0]?.systemPrompt).toBeNull();
	});

	test("POST /api/users emits user_created event on bus (AC2)", async ({ app, eventBus }) => {
		setActiveStrategy(minimalStrategy);

		const received: UserCreatedEvent[] = [];
		eventBus.on("user_created", (e) => received.push(e));

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Dave", role: "founder" }),
		});

		expect(res.status).toBe(201);
		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("user_created");
	});

	test("user_created event carries assistantAgentId post-persist (AC2 post-fact contract)", async ({
		db,
		app,
		eventBus,
	}) => {
		setActiveStrategy(minimalStrategy);

		let assistantIdFromEvent: string | undefined;
		eventBus.on("user_created", (e) => {
			assistantIdFromEvent = e.assistantAgentId;
		});

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Eve", role: "founder" }),
		});

		expect(res.status).toBe(201);
		expect(assistantIdFromEvent).toBeDefined();

		// The assistant row must exist in DB at event time
		const rows = await db.select().from(users).where(eq(users.id, assistantIdFromEvent!));
		expect(rows).toHaveLength(1);
	});

	test("user_created event carries userId that matches the created human user", async ({
		app,
		eventBus,
	}) => {
		setActiveStrategy(minimalStrategy);

		let userIdFromEvent: string | undefined;
		eventBus.on("user_created", (e) => {
			userIdFromEvent = e.userId;
		});

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Frank", role: "founder" }),
		});

		expect(res.status).toBe(201);
		expect(userIdFromEvent).toBeDefined();

		const body = (await res.json()) as { user: { id: string } };
		expect(userIdFromEvent).toBe(body.user.id);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — Strategy swap: Minimal vs Fabric produces different roster (A1/A2)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC4/A1: Swapping Strategy changes roster with zero Kernel code change", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("Minimal: POST /api/teams → 1 agent; Fabric: POST /api/teams → >1 agent (same Kernel path)", async ({
		db,
		app,
	}) => {
		// --- Minimal ---
		setActiveStrategy(minimalStrategy);
		const minRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Minimal Swap Team", functions: ["development", "product"] }),
		});
		expect(minRes.status).toBe(201);
		const minBody = (await minRes.json()) as { teamMembers: { id: string } };
		const minAgents = await db.select().from(users).where(eq(users.teamId, minBody.teamMembers.id));
		expect(minAgents).toHaveLength(1);

		clearActiveStrategy();

		// --- Fabric (requires Fabric to be available as a Strategy) ---
		// Import dynamically — Fabric may not implement scaffoldAgents yet (RED phase).
		// If the import fails, this test fails correctly (missing impl).
		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);

		const fabRes = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Fabric Swap Team", functions: ["development", "product"] }),
		});
		expect(fabRes.status).toBe(201);
		const fabBody = (await fabRes.json()) as { teamMembers: { id: string } };
		const fabAgents = await db.select().from(users).where(eq(users.teamId, fabBody.teamMembers.id));

		// Fabric should produce more than 1 agent (defaultRoster expansion)
		expect(fabAgents.length).toBeGreaterThan(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4/A4 — Fabric preservation golden (non-regression of current roster+personas)
// ─────────────────────────────────────────────────────────────────────────────

describe("T4/AC4: Fabric scaffoldAgents preserves pre-AK6 roster", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("Fabric team_scaffold(development+product) produces builder, product_manager, qa_engineer", async ({
		db,
		app,
	}) => {
		// Seed system templates (needed for systemPrompt population)
		await db
			.insert(factorySettings)
			.values([
				{ key: "system_template:builder", value: "You are a builder agent.", updatedAt: NOW },
				{
					key: "system_template:product_manager",
					value: "You are a product manager.",
					updatedAt: NOW,
				},
				{ key: "system_template:qa_engineer", value: "You are a QA engineer.", updatedAt: NOW },
			])
			.onConflictDoNothing();

		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				name: "Fabric Preservation Team",
				functions: ["development", "product"],
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));
		const roles = agents.map((a) => a.role).sort();

		// defaultRoster(["development","product"]) = ["builder","product_manager","qa_engineer"]
		expect(roles).toEqual(["builder", "product_manager", "qa_engineer"]);
	});

	test("Fabric team_scaffold: agents with templates have non-null systemPrompt (persona sourced from Strategy)", async ({
		db,
		app,
	}) => {
		await db
			.insert(factorySettings)
			.values({ key: "system_template:builder", value: "You are a builder.", updatedAt: NOW })
			.onConflictDoNothing();

		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);

		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Persona Team", functions: ["development"] }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };
		const agents = await db.select().from(users).where(eq(users.teamId, body.teamMembers.id));

		const builderAgent = agents.find((a) => a.role === "builder");
		expect(builderAgent?.systemPrompt).not.toBeNull();
		expect(builderAgent?.systemPrompt).toBe("You are a builder.");
	});

	test("Fabric user_assistant: name is '${ownerUserName}'s Assistant' (preservation)", async ({
		db,
		app,
	}) => {
		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Grace", role: "founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const assistants = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${body.user.id}`));

		expect(assistants[0]?.name).toBe("Grace's Assistant");
	});

	test("Fabric user_assistant: systemPrompt is non-null (Fabric persona sourced, not null)", async ({
		db,
		app,
	}) => {
		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);

		const res = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Heidi", role: "founder" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const assistants = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${body.user.id}`));

		// Fabric supplies the builtin assistant persona — systemPrompt is NOT null
		expect(assistants[0]?.systemPrompt).not.toBeNull();
	});
});
