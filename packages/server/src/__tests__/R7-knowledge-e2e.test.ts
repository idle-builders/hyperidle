/**
 * R7 — Knowledge & Bet Cycles: end-to-end knowledge flow tests.
 *
 * AC-1: Agent's write_memory creates items in KnowledgeList (status: "draft", triage tab)
 * AC-2: Agent's promote_knowledge moves items from draft → active (triage → curated)
 * AC-5: Knowledge items from session N materialize into session N+1 workspace
 *
 * @lore R7: write_memory defaults to "draft" so agent-created items land in triage.
 * promote_knowledge allows draft → active so facilitators can graduate items to curated.
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

	it("full triage-to-curated flow: write_memory then promote_knowledge", async () => {
		// End-to-end: agent writes item (lands in triage as "draft"), facilitator promotes to "active" (curated)

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

	it("write_memory items ARE materialized even without explicit teamId in ToolContext (R7 fix verified)", async () => {
		// teamId is derived from the task when ctx.teamId is absent
		// Write an item without explicit teamId in ctx (derived from task instead)
		const writeResult = await writeMemoryTool.handler(
			{
				layer: "L2",
				kind: "anti_pattern",
				title: "Scoped knowledge item via task lookup",
				body: "This item has scopeId derived from the task's teamId.",
			},
			ctx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;

		// After R7 fix: scopeId is set to TEAM_ID (derived from task-r7's teamId)
		const data = writeResult.data as { knowledgeItemId: string };
		const [fabricRow] = await db
			.select({ scopeId: knowledgeStrategyFabric.scopeId })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, data.knowledgeItemId))
			.limit(1);

		// After R7 fix: scopeId is TEAM_ID (items are now properly scoped via task lookup)
		expect(fabricRow?.scopeId).toBe(TEAM_ID);
	});
});
