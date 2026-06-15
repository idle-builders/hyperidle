/**
 * AK4 — Unit tests for buildAssistantDraftRegistry + related helpers.
 *
 * AC3b (static/structural):
 *   - buildAssistantDraftRegistry().definitions names === ["create_bet","edit_bet"] (sorted)
 *   - ALL_TOOL_DEFINITIONS has no commit_bet/ship_bet/kill_bet
 *
 * AC0 (CRITICAL-1):
 *   - toolsForRole("assistant") includes both create_bet AND edit_bet
 *   - ALL_TOOL_DEFINITIONS contains editBetTool registered for assistant role
 *
 * Task 2 (team-inject unit):
 *   - create_bet via the draft registry with a wrong model teamId still writes resolved teams.id
 *
 * Task 5 (edit_bet draft guard unit):
 *   - editBetTool.handler rejects active bet with status='error', no DB write
 *   - editBetTool.handler allows draft bet, returns ok
 *
 * resolveDraftTeamId unit:
 *   - two-hop resolution: users.teamId → teamMembers.teamId = teams.id
 *   - null users.teamId → undefined
 */

import * as os from "node:os";
import * as path from "node:path";
import { bets, teamMembers, teams, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { test } from "../../test-fixtures.js";
// These imports will FAIL until the green phase creates these symbols:
import { buildAssistantDraftRegistry } from "../../tools/assistant-draft-registry.js";
import { resolveDraftTeamId } from "../../tools/assistant-draft-registry.js";
import { editBetTool } from "../../tools/edit-bet.js";
import { ALL_TOOL_DEFINITIONS, toolsForRole } from "../../tools/tool-registry.js";
import type { ToolContext } from "../../tools/tool-registry.js";

const NOW = "2026-06-15T00:00:00.000Z";

function makeContext(db: import("@hyperidle/db").HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "ast-u-ak4-unit",
		sessionId: "session-unit-1",
		taskId: "",
		sandboxPath: path.join(os.tmpdir(), `hi-ak4-${Date.now()}`),
		ingestion: { dispose: () => {} },
	};
}

// ── AC0 (CRITICAL-1): edit_bet registered for assistant role ──────────────────

describe("AK4 AC0: toolsForRole('assistant') includes edit_bet", () => {
	it("edit_bet is in ALL_TOOL_DEFINITIONS", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).toContain("edit_bet");
	});

	it("toolsForRole('assistant') includes both create_bet and edit_bet", () => {
		const assistantTools = toolsForRole("assistant");
		const names = assistantTools.map((d) => d.name);
		expect(names).toContain("create_bet");
		expect(names).toContain("edit_bet");
	});

	it("edit_bet definition has roles including 'assistant'", () => {
		const editBetDef = ALL_TOOL_DEFINITIONS.find((d) => d.name === "edit_bet");
		expect(editBetDef).toBeDefined();
		expect(editBetDef!.roles).toContain("assistant");
	});
});

// ── AC3b: buildAssistantDraftRegistry has EXACTLY [create_bet, edit_bet] ─────

describe("AK4 AC3b: buildAssistantDraftRegistry — exactly 2 tools, no commit/kill/ship", () => {
	test("registry.definitions.map(d=>d.name).sort() === ['create_bet','edit_bet']", async ({
		db,
	}) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team-id",
			currentDraftBetId: undefined,
		});

		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual(["create_bet", "edit_bet"]);
	});

	it("ALL_TOOL_DEFINITIONS has no commit_bet, ship_bet, or kill_bet tool", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).not.toContain("commit_bet");
		expect(names).not.toContain("ship_bet");
		expect(names).not.toContain("kill_bet");
	});

	test("registry.toClaudeToolSpecs() returns 2 specs", async ({ db }) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team-id",
			currentDraftBetId: undefined,
		});

		const specs = registry.toClaudeToolSpecs();
		expect(specs).toHaveLength(2);
		const specNames = specs.map((s) => s.name).sort();
		expect(specNames).toEqual(["create_bet", "edit_bet"]);
	});
});

// ── resolveDraftTeamId unit ───────────────────────────────────────────────────

describe("AK4 resolveDraftTeamId: two-hop users.teamId → teamMembers.teamId = teams.id", () => {
	test("resolves users.teamId (teamMembers.id) → teamMembers.teamId (teams.id)", async ({
		db,
	}) => {
		const TEAM_ID = "team-resolve-test";
		const TM_ID = "tm-resolve-test";
		const USER_ID = "u-resolve-test";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Resolve Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: USER_ID,
			kind: "human",
			name: "Resolve User",
			role: "founder",
			status: "active",
			teamId: TM_ID, // users.teamId → teamMembers.id
			createdAt: NOW,
		});

		const resolved = await resolveDraftTeamId(db, USER_ID);
		expect(resolved).toBe(TEAM_ID); // must be teams.id, not tm_id
	});

	test("users.teamId is null → returns undefined", async ({ db }) => {
		await db.insert(users).values({
			id: "u-no-team",
			kind: "human",
			name: "No Team User",
			role: "founder",
			status: "active",
			// no teamId
			createdAt: NOW,
		});

		const resolved = await resolveDraftTeamId(db, "u-no-team");
		expect(resolved).toBeUndefined();
	});

	test("user does not exist → returns undefined", async ({ db }) => {
		const resolved = await resolveDraftTeamId(db, "u-nonexistent");
		expect(resolved).toBeUndefined();
	});
});

// ── Task 5: edit_bet draft-only guard ─────────────────────────────────────────

describe("AK4 Task 5: edit_bet draft-only guard", () => {
	test("editBetTool.handler rejects an active bet — returns status=error, no DB write", async ({
		db,
	}) => {
		const TEAM_ID = "team-edit-guard";
		const BET_ID = "bet-active-edit-guard";
		const TM_ID = "tm-edit-guard";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Edit Guard Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(bets).values({
			id: BET_ID,
			teamId: TEAM_ID,
			description: "Active bet — must not be editable by assistant",
			status: "active",
			createdAt: NOW,
		});

		const ctx = makeContext(db);
		const result = await editBetTool.handler(
			{ betId: BET_ID, description: "Attempted edit" },
			ctx,
		);

		expect(result.status).toBe("error");

		// No DB write — description must remain unchanged
		const [bet] = await db.select().from(bets).where(eq(bets.id, BET_ID)).limit(1);
		expect(bet!.description).toBe("Active bet — must not be editable by assistant");
	});

	test("editBetTool.handler allows editing a draft bet — returns status=ok", async ({ db }) => {
		const TEAM_ID = "team-edit-draft";
		const BET_ID = "bet-draft-edit";
		const TM_ID = "tm-edit-draft";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Edit Draft Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(bets).values({
			id: BET_ID,
			teamId: TEAM_ID,
			description: "Draft bet",
			status: "draft",
			createdAt: NOW,
		});

		const ctx = makeContext(db);
		const result = await editBetTool.handler(
			{ betId: BET_ID, description: "Updated description via assistant" },
			ctx,
		);

		expect(result.status).toBe("ok");

		const [bet] = await db.select().from(bets).where(eq(bets.id, BET_ID)).limit(1);
		expect(bet!.description).toBe("Updated description via assistant");
	});
});

// ── Team-inject via buildAssistantDraftRegistry.create_bet wrapper ────────────

describe("AK4 team-inject unit: create_bet wrapper hard-injects resolvedTeamId", () => {
	test("create_bet via registry with resolvedTeamId → writes correct teamId to DB", async ({
		db,
	}) => {
		const TEAM_ID = "team-inject-unit";
		const TM_ID = "tm-inject-unit";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Inject Test Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});

		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: TEAM_ID,
			currentDraftBetId: undefined,
		});

		// Invoke create_bet WITHOUT any teamId (or with wrong teamId)
		// The wrapper must inject TEAM_ID
		const result = await registry.invoke("create_bet", {
			// teamId intentionally absent — wrapper must inject
			description: "Injected team bet",
		});

		expect(result.success).toBe(true);

		// Bet row must carry the injected TEAM_ID
		const allBets = await db.select().from(bets);
		const bet = allBets.find((b) => b.description === "Injected team bet");
		expect(bet).toBeDefined();
		expect(bet!.teamId).toBe(TEAM_ID);
	});

	test("create_bet via registry with undefined resolvedTeamId → returns error", async ({
		db,
	}) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: undefined, // no team
			currentDraftBetId: undefined,
		});

		const result = await registry.invoke("create_bet", {
			description: "Should fail — no team",
		});

		expect(result.success).toBe(false);
		// No bet created
		const allBets = await db.select().from(bets);
		expect(allBets).toHaveLength(0);
	});

	test("edit_bet via registry when currentDraftBetId is undefined → returns error", async ({
		db,
	}) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team",
			currentDraftBetId: undefined, // no draft yet
		});

		const result = await registry.invoke("edit_bet", {
			doneCondition: "Should fail — no draft",
		});

		expect(result.success).toBe(false);
	});
});
