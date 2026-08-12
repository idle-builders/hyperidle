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
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test, vi } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/B2: both tools reach `ports.coreApi.*` (the seam) — each is
 * built fresh per test off THIS test's own `app`, never an ambient
 * transport global (and never a stale transport left registered by an
 * earlier test in this file, which the old ambient-global shape allowed).
 */
function buildCreateBetTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "create_bet",
	)!;
}
function buildEditBetTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "edit_bet",
	)!;
}

const NOW = "2026-06-09T00:00:00.000Z";

function makeCtx(db: HyperIdleDb, ids: ScopedIds, label = "ad8b"): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: ids("ast-agent-1"),
		sessionId: ids("session-ad8b"),
		taskId: ids("task-ad8b"),
		sandboxPath: path.join(os.tmpdir(), `hi-${label}-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db
		.insert(teams)
		.values({ id: ids("team-ad8b"), name: "AD8b Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: ids("tm-ad8b"),
		teamId: ids("team-ad8b"),
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: ids("ast-agent-1"),
		kind: "ai",
		name: "Assistant Agent",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		createdAt: NOW,
	});
}

async function seedBet(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db.insert(bets).values({
		id: ids("bet-ad8b-1"),
		teamId: ids("team-ad8b"),
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
		app,
		eventBus: _eb,
		ids,
	}) => {
		// @lore AU21 §9 Increment 1: create_bet now routes through the
		// CoreApiPort write seam (real POST /bets), not raw DI — needs a
		// registered in-process transport + a stubbed API key, same
		// convention `bets.integration.test.ts` uses for every real route call.
		vi.stubEnv("HYPERIDLE_API_KEY", "ad8b-create-bet-test-key");
		const createBetTool = buildCreateBetTool(app);
		await seedBase(db, ids);
		const ctx = makeCtx(db, ids, "create-bet");

		const result = await createBetTool.handler(
			{ teamId: ids("team-ad8b"), description: "New test bet" },
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
		expect(row?.teamId).toBe(ids("team-ad8b"));
	});

	test("returns error when teamId is missing", async ({ db, app, ids }) => {
		const createBetTool = buildCreateBetTool(app);
		await seedBase(db, ids);
		const ctx = makeCtx(db, ids, "create-bet-err");

		const result = await createBetTool.handler(
			// handler accepts unknown after registry erasure — validation happens inside
			{ description: "Missing team ID" },
			ctx,
		);

		expect(result.success).toBe(false);
	});

	test("bet tool definition has name='create_bet'", ({ app }) => {
		const createBetTool = buildCreateBetTool(app);
		expect(createBetTool.name).toBe("create_bet");
	});
});

// ---------------------------------------------------------------------------
// edit_bet tool
// ---------------------------------------------------------------------------

describe("AD8b — edit_bet tool", () => {
	test("updates bet description and returns ok", async ({ db, app, ids }) => {
		const editBetTool = buildEditBetTool(app);
		await seedBase(db, ids);
		await seedBet(db, ids);
		const ctx = makeCtx(db, ids, "edit-bet");

		const result = await editBetTool.handler(
			{ betId: ids("bet-ad8b-1"), description: "Updated description" },
			ctx,
		);

		expect(result.success).toBe(true);

		const [row] = await db
			.select()
			.from(bets)
			.where(eq(bets.id, ids("bet-ad8b-1")));
		expect(row?.description).toBe("Updated description");
	});

	test("returns error for non-existent bet", async ({ db, app, ids }) => {
		const editBetTool = buildEditBetTool(app);
		await seedBase(db, ids);
		const ctx = makeCtx(db, ids, "edit-bet-err");

		const result = await editBetTool.handler(
			{ betId: ids("bet-nonexistent"), description: "Updated" },
			ctx,
		);

		expect(result.success).toBe(false);
	});

	test("bet edit tool definition has name='edit_bet'", ({ app }) => {
		const editBetTool = buildEditBetTool(app);
		expect(editBetTool.name).toBe("edit_bet");
	});
});
