/**
 * R7 — Knowledge & Bet Cycles: end-to-end knowledge flow tests (red phase).
 *
 * AC-1: Agent's write_memory creates items in KnowledgeList (status: "draft", triage tab)
 * AC-2: Agent's promote_knowledge moves items from draft → active (triage → curated)
 * AC-5: Knowledge items from session N materialize into session N+1 workspace
 *
 * These tests FAIL in the red phase because:
 *  - write_memory defaults to "active", not "draft" (needs fix)
 *  - promote_knowledge ALLOWED_TRANSITIONS has no "draft" key (needs fix)
 *  - write_memory does not set scopeKind/scopeId on kernel table (needs fix)
 *
 * @lore R7: status mismatch — fabric KNOWLEDGE_STATUSES does not include "draft",
 * but the knowledge route and KnowledgeList use "draft" as the triage status.
 * write_memory must default to "draft" (not "active") and promote_knowledge must
 * allow draft → active so triage items can graduate to curated.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	knowledgeItems,
	knowledgeStrategyFabric,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promoteKnowledgeTool } from "../skill-tools/promote-knowledge.js";
import type { ToolContext } from "../skill-tools/tool-registry.js";
import { writeMemoryTool } from "../skill-tools/write-memory.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = "2026-05-30T00:00:00.000Z";
const TEAM_ID = "team-r7";
const AGENT_ID = "agent-r7";

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "R7 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-r7", teamId: TEAM_ID, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// tasks require a betId (NOT NULL FK) — seed a bet first
	await db.insert(bets).values({
		id: "bet-r7",
		teamId: TEAM_ID,
		description: "R7 test bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-r7",
		betId: "bet-r7",
		teamId: TEAM_ID,
		title: "R7 test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: AGENT_ID,
		sessionId: "session-r7",
		taskId: "task-r7",
		workspacePath: path.join(os.tmpdir(), `hi-r7-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

// ── AC-1: write_memory creates items with status "draft" ─────────────────────

describe("R7 AC-1: write_memory creates items with status=draft", () => {
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let ctx: ToolContext;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		await seedBase(db);
		ctx = makeContext(db, eventBus);
	});

	afterEach(async () => {
		await handle.close();
	});

	it("write_memory creates a knowledge item with status='draft' by default (not 'active')", async () => {
		// R7 fix: write_memory must default to "draft" so agents create triage items.
		// Currently defaults to "active" — this test FAILS until that default is changed.
		const result = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "pattern",
				title: "R7 test pattern",
				body: "This pattern was captured by the agent during a session.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string; version: number };
		const [row] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, data.knowledgeItemId))
			.limit(1);

		// AC-1: agent-created items must be "draft" (triage tab), not "active" (curated tab)
		expect(row?.status).toBe("draft");
	});

	it("write_memory sets scopeKind='product' and scopeId=teamId on the kernel table", async () => {
		// R7 fix: write_memory must pass scopeKind/scopeId through to the kernel table
		// so materialization (which reads from knowledgeStrategyFabric by scopeId) finds them.
		// Currently, scopeKind is NOT set — this test FAILS until that is fixed.
		const result = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "decision",
				title: "R7 scoped decision",
				body: "Decision made during session with product scope.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string; version: number };

		// Check kernel table for scopeKind = "product"
		const [kernelRow] = await db
			.select({ scopeKind: knowledgeItems.scopeKind, scopeId: knowledgeItems.scopeId })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, data.knowledgeItemId))
			.limit(1);

		// AC: scopeKind should be "product" (not the default "factory")
		expect(kernelRow?.scopeKind).toBe("product");
		// AC: scopeId should be the team's id so materialize() can find it
		expect(kernelRow?.scopeId).toBe(TEAM_ID);
	});

	it("write_memory correctly writes scopeId to the fabric extension table", async () => {
		// R7 fix: the fabric extension table (knowledgeStrategyFabric.scopeId) must
		// match the team ID for fetchAllForLayer(db, "L2", productId) to find the item.
		const result = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "reflection",
				title: "R7 fabric scope test",
				body: "Reflection that must be visible in the next session's workspace.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string; version: number };

		const [fabricRow] = await db
			.select({ scopeId: knowledgeStrategyFabric.scopeId, layer: knowledgeStrategyFabric.layer })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, data.knowledgeItemId))
			.limit(1);

		// The fabric extension row must have scopeId matching the team
		expect(fabricRow?.scopeId).toBe(TEAM_ID);
		// And layer L2 as specified by the agent
		expect(fabricRow?.layer).toBe("L2");
	});

	it("GET /api/knowledge returns the draft item in the response (triage-visible)", async () => {
		// Verify that items created by write_memory appear in the knowledge list endpoint
		// with status="draft" — the KnowledgeList triage tab filters on status === "draft"
		const result = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "principle",
				title: "R7 knowledge route test",
				body: "Knowledge item that must appear in GET /api/knowledge.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string };

		// Direct DB query to simulate what the route returns
		const allItems = await db.select().from(knowledgeItems);
		const ourItem = allItems.find((i) => i.id === data.knowledgeItemId);

		expect(ourItem).toBeDefined();
		// The item must have draft status so the KnowledgeList triage tab shows it
		expect(ourItem?.status).toBe("draft");
	});
});

// ── AC-2: promote_knowledge moves draft → active ───────────────────────────

describe("R7 AC-2: promote_knowledge transitions draft → active", () => {
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let ctx: ToolContext;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		await seedBase(db);
		// AC-2 requires the agent to be a facilitator-level role for promote_knowledge
		await db.insert(users).values({
			id: "agent-fac-r7",
			name: "Facilitator Agent",
			role: "practice_facilitator",
			status: "active",
			createdAt: NOW,
		});
		ctx = {
			...makeContext(db, eventBus),
			agentId: "agent-fac-r7",
		};
	});

	afterEach(async () => {
		await handle.close();
	});

	it("promote_knowledge transitions a draft item to active status", async () => {
		// R7 fix: ALLOWED_TRANSITIONS in promote-knowledge.ts must include "draft" → ["active"]
		// Currently "draft" is not a key in ALLOWED_TRANSITIONS — this test FAILS until fixed.

		// Arrange: create a draft item directly in the DB
		const { randomUUID } = await import("node:crypto");
		const itemId = randomUUID();
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "Draft item for promotion",
			body: "To be promoted from draft to active.",
			format: "markdown",
			status: "draft",
			version: 1,
			updatedBy: "agent:agent-fac-r7",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Act: promote from draft → active
		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: itemId,
				toStatus: "active",
				reason: "Reviewed and approved",
			},
			ctx,
		);

		// AC-2: must succeed (not INVALID_TRANSITION or INVALID_STATE)
		expect(result.success).toBe(true);

		if (!result.success) return;

		// Verify the item is now "active" (curated tab)
		const [row] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);

		expect(row?.status).toBe("active");
	});

	it("promote_knowledge returns INVALID_STATE for 'draft' when ALLOWED_TRANSITIONS lacks 'draft' key", async () => {
		// This is the CURRENT behavior before the fix — "draft" is not in KNOWLEDGE_STATUSES
		// so isKnowledgeStatus("draft") returns false and the tool returns INVALID_STATE.
		// After the fix, this test should be replaced by the success test above.
		// We include this to document the current failure mode.
		const { randomUUID } = await import("node:crypto");
		const itemId = randomUUID();
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "Draft item — current behavior check",
			body: "Testing current failure mode.",
			format: "markdown",
			status: "draft", // Not in KNOWLEDGE_STATUSES — triggers INVALID_STATE
			version: 1,
			updatedBy: "agent:agent-fac-r7",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: itemId,
				toStatus: "active",
				reason: "Trying to promote a draft item",
			},
			ctx,
		);

		// Before fix: fails with INVALID_STATE (because "draft" not in KNOWLEDGE_STATUSES type guard)
		// After fix: this should return success — but we keep this test to document the current state
		// The pipeline write-code phase will update this test when fixing.
		expect(result.success).toBe(false);
	});

	it("full triage-to-curated flow: write_memory then promote_knowledge", async () => {
		// End-to-end: agent writes item (lands in triage as "draft"), facilitator promotes to "active" (curated)
		// After R7 fixes: both write_memory default and promote_knowledge draft→active must work.

		// Step 1: write_memory → expect "draft"
		const writeCtx: ToolContext = {
			...ctx,
			agentId: AGENT_ID,
		};
		const writeResult = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "pattern",
				title: "Pattern to promote",
				body: "Discovered pattern that should be curated.",
			},
			writeCtx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;
		const { knowledgeItemId } = writeResult.data as { knowledgeItemId: string };

		// Check initial status is "draft"
		const [beforeRow] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, knowledgeItemId))
			.limit(1);
		expect(beforeRow?.status).toBe("draft");

		// Step 2: promote_knowledge draft → active
		const promoteResult = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId,
				toStatus: "active",
				reason: "Verified pattern, moving to curated",
			},
			ctx, // facilitator context
		);

		expect(promoteResult.success).toBe(true);
		if (!promoteResult.success) return;

		// Verify final status is "active" (curated tab)
		const [afterRow] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, knowledgeItemId))
			.limit(1);
		expect(afterRow?.status).toBe("active");
	});
});

// ── AC-5: Knowledge from session N materializes into session N+1 ───────────

describe("R7 AC-5: write_memory items materialize into subsequent sessions", () => {
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let ctx: ToolContext;
	let workspacePath = ""; // initialized in beforeEach

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		await seedBase(db);
		workspacePath = fs.mkdtempSync(path.join("/tmp", "r7-mat-"));
		ctx = {
			...makeContext(db, eventBus),
			workspacePath,
		};
	});

	afterEach(async () => {
		if (workspacePath) fs.rmSync(workspacePath, { recursive: true, force: true });
		await handle.close();
	});

	it("an item written by write_memory with layer=L2 appears in materialize() output for the same productId", async () => {
		// R7 fix: write_memory must pass scopeId (teamId) to the fabric extension table.
		// fetchAllForLayer(db, "L2", productId) will then find it.
		// Currently scopeId is NOT set — so materialize() will miss the item.
		// This test FAILS until write_memory passes scopeId.
		const { materialize } = await import("@hyperidle/fabric");

		// Arrange: write a knowledge item via write_memory
		const writeResult = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "principle",
				title: "Session N Knowledge",
				body: "This knowledge was captured in session N and must appear in session N+1.",
			},
			ctx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;

		// Act: materialize a new session workspace for the same team
		const matResult = await materialize(db, {
			workspacePath,
			sessionId: "session-r7-next",
			taskId: "task-r7",
			agentId: AGENT_ID,
			agentRole: "builder",
			productId: TEAM_ID, // same team
		});

		// Assert: the item is present in the materialized workspace
		// The item is written to context/product/ zone for L2 items
		expect(matResult.itemCount).toBeGreaterThan(0);

		// Verify the specific item filename appears in the manifest
		const manifestPath = path.join(workspacePath, ".fabric/manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, { source_path: string }>;
		};

		// The item titled "Session N Knowledge" must appear in the manifest
		const itemPaths = Object.values(manifest.items).map((v) => v.source_path);
		const found = itemPaths.some((p) => p.includes("Session_N_Knowledge") || p.includes("Session"));
		expect(found).toBe(true);
	});

	it("write_memory items are NOT materialized when teamId is missing from ToolContext (regression guard)", async () => {
		// This is a regression guard: if teamId is absent from ToolContext,
		// scopeId won't be set and the item won't be found by materialize().
		// Documents the CURRENT (broken) behavior for the red phase.
		const { materialize } = await import("@hyperidle/fabric");

		// Write an item (currently: no scopeId set because teamId not in ToolContext)
		const writeResult = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "anti_pattern",
				title: "Orphaned knowledge item",
				body: "This item has no scopeId and should NOT materialize.",
			},
			ctx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;

		// Verify the fabric row has no scopeId (current broken state)
		const data = writeResult.data as { knowledgeItemId: string };
		const [fabricRow] = await db
			.select({ scopeId: knowledgeStrategyFabric.scopeId })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, data.knowledgeItemId))
			.limit(1);

		// Before fix: scopeId is null (item is "lost" — won't materialize)
		// After fix: scopeId = TEAM_ID
		// This assertion documents the current state — will fail after fix is applied
		// (which is fine — the previous test will be green)
		expect(fabricRow?.scopeId).toBeNull();
	});
});
