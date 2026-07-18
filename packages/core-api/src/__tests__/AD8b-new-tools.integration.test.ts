/**
 * AD8b — New tools integration tests (RED phase).
 *
 * Task 6: create_bet, edit_bet, edit_block, update_task_status
 *
 * AC-5: Low/medium-risk tools execute and report results.
 * Each tool is tested with valid input (happy path) and invalid input (error path).
 */

import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test } from "../test-fixtures.js";

const createBetTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "create_bet")!;
const editBetTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "edit_bet")!;

const NOW = "2026-06-09T00:00:00.000Z";

function makeCtx(db: HyperIdleDb, label = "ad8b"): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "ast-agent-1",
		sessionId: "session-ad8b",
		taskId: "task-ad8b",
		sandboxPath: path.join(os.tmpdir(), `hi-${label}-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "team-ad8b", name: "AD8b Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "tm-ad8b",
		teamId: "team-ad8b",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: "ast-agent-1",
		kind: "ai",
		name: "Assistant Agent",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

async function seedBet(db: HyperIdleDb): Promise<void> {
	await db.insert(bets).values({
		id: "bet-ad8b-1",
		teamId: "team-ad8b",
		description: "Test Bet for AD8b",
		status: "draft",
		createdAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// create_bet tool
// ---------------------------------------------------------------------------

describe("AD8b — create_bet tool", () => {
	test("returns ok and inserts a bet row with the given description", async ({
		db,
		eventBus: _eb,
	}) => {
		await seedBase(db);
		const ctx = makeCtx(db, "create-bet");

		const result = await createBetTool.handler(
			{ teamId: "team-ad8b", description: "New test bet" },
			ctx,
		);

		expect(result.success).toBe(true);
		expect(typeof (result as { success: true; data: { betId: string } }).data?.betId).toBe(
			"string",
		);

		// Verify DB row was inserted
		const [row] = await db.select().from(bets).where(eq(bets.description, "New test bet"));
		expect(row).toBeDefined();
		expect(row?.status).toBe("draft");
		expect(row?.teamId).toBe("team-ad8b");
	});

	test("returns error when teamId is missing", async ({ db }) => {
		await seedBase(db);
		const ctx = makeCtx(db, "create-bet-err");

		const result = await createBetTool.handler(
			// handler accepts unknown after registry erasure — validation happens inside
			{ description: "Missing team ID" },
			ctx,
		);

		expect(result.success).toBe(false);
	});

	test("bet tool definition has name='create_bet'", () => {
		expect(createBetTool.name).toBe("create_bet");
	});
});

// ---------------------------------------------------------------------------
// edit_bet tool
// ---------------------------------------------------------------------------

describe("AD8b — edit_bet tool", () => {
	test("updates bet description and returns ok", async ({ db }) => {
		await seedBase(db);
		await seedBet(db);
		const ctx = makeCtx(db, "edit-bet");

		const result = await editBetTool.handler(
			{ betId: "bet-ad8b-1", description: "Updated description" },
			ctx,
		);

		expect(result.success).toBe(true);

		const [row] = await db.select().from(bets).where(eq(bets.id, "bet-ad8b-1"));
		expect(row?.description).toBe("Updated description");
	});

	test("returns error for non-existent bet", async ({ db }) => {
		await seedBase(db);
		const ctx = makeCtx(db, "edit-bet-err");

		const result = await editBetTool.handler(
			{ betId: "bet-nonexistent", description: "Updated" },
			ctx,
		);

		expect(result.success).toBe(false);
	});

	test("bet edit tool definition has name='edit_bet'", () => {
		expect(editBetTool.name).toBe("edit_bet");
	});
});
