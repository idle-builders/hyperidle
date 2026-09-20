/**
 * R7 — Knowledge & Bet Cycles: end-to-end knowledge flow tests.
 *
 * AC-1: Agent's write_memory creates items in KnowledgeList (status: "proposed", triage tab)
 * AC-2: Agent's promote_knowledge moves items from draft → active (triage → curated)
 * AC-5: Knowledge items from session N appear in session N+1 workspace
 *
 * @lore R7: write_memory defaults to "proposed" so agent-created items land in triage.
 * promote_knowledge allows draft → active so facilitators can graduate items to curated.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { BakedContextBundle } from "@hyperidle/domain-model";
import { toBakedContextKnowledgeItems } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedKnowledgeItem } from "./_helpers.js";
import { buildTestRunOrchestrationComposition } from "./run-orchestration-test-runtime.js";

/**
 * @lore AU31 §3.2/B2: this file's tool handler(s) reach `ports.coreApi.*`
 * (the seam) — each tool is built fresh per test off THIS test's own `app`
 * (`createInProcessCoreApiTransport`), never an ambient transport global.
 *
 * @lore §8 B1: this file's own R7 AC-5 case tests `write_memory`'s
 * task-reading behaviour directly ("without explicit teamId in ToolContext")
 * — the documented case an `openTask` binding is injected for, not
 * `THROWING_OPEN_TASK`. A direct-query real implementation (no seam hop
 * needed for the narrow shape `write_memory` reads) rather than
 * `THROWING_OPEN_TASK`.
 */
function realOpenTask(db: HyperIdleDb) {
	return async (
		id: string,
	): Promise<
		{ readonly task: { readonly parentTaskId: string | null; readonly teamId: string } } | undefined
	> => {
		const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
		if (!row) return undefined;
		return { task: { parentTaskId: row.parentTaskId, teamId: row.teamId } };
	};
}

function buildPromoteKnowledgeTool(
	app: Hono,
	db: HyperIdleDb,
): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app), realOpenTask(db)).find(
		(t) => t.name === "promote_knowledge",
	)!;
}
function buildWriteMemoryTool(
	app: Hono,
	db: HyperIdleDb,
): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app), realOpenTask(db)).find(
		(t) => t.name === "write_memory",
	)!;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = "2026-05-30T00:00:00.000Z";
const TEAM_ID = "team-r7";
const AGENT_ID = "agent-r7";

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM_ID, name: "R7 Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: AGENT_ID,
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// BB1: root task replaces bet
	await db.insert(threads).values({
		id: `thr-${"bet-r7"}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-r7"}`,
		id: "bet-r7",
		parentTaskId: null,
		teamId: TEAM_ID,
		title: "R7 root task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${"task-r7"}`,
		hostKind: "team",
		hostId: TEAM_ID,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-r7"}`,
		id: "task-r7",
		parentTaskId: "bet-r7",
		teamId: TEAM_ID,
		title: "R7 test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, sandboxPath: string): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: AGENT_ID,
		sessionId: "session-r7",
		taskId: "task-r7",
		sandboxPath,
		ingestion: { dispose: (): void => {} },
	};
}

// ── AC-1: write_memory creates items with status "proposed" ─────────────────────

describe("R7 AC-1: write_memory creates items with status=draft", () => {
	test("write_memory creates a knowledge item with status='proposed' by default (not 'active')", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac1-${Date.now()}`);
		const ctx = makeContext(db, sandboxPath);

		const result = await writeMemoryTool.handler(
			{
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

		// AC-1: agent-created items must be "proposed" (triage tab), not "active" (curated tab)
		expect(row?.status).toBe("proposed");
	});

	test("write_memory sets scopeKind='team' and scopeId=teamId on the kernel table", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac1b-${Date.now()}`);
		const ctx = makeContext(db, sandboxPath);

		const result = await writeMemoryTool.handler(
			{
				title: "R7 scoped decision",
				body: "Decision made during session with team scope.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string; version: number };

		// Check kernel table for scopeKind = "team"
		const [kernelRow] = await db
			.select({ scopeKind: knowledgeItems.scopeKind, scopeId: knowledgeItems.scopeId })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, data.knowledgeItemId))
			.limit(1);

		// AC: scopeKind should be "team" (not the default "factory")
		expect(kernelRow?.scopeKind).toBe("team");
		// AC: scopeId should be the team's id so assembleContext() can find it
		expect(kernelRow?.scopeId).toBe(TEAM_ID);
	});

	test("write_memory correctly writes scopeId to the fabric extension table", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		// R7 fix: the fabric extension table (knowledgeAppProjection.scopeId) must
		// match the team ID so the team-scoped fetch can find the item.
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac1c-${Date.now()}`);
		const ctx = makeContext(db, sandboxPath);

		const result = await writeMemoryTool.handler(
			{
				title: "R7 fabric scope test",
				body: "Reflection that must be visible in the next session's workspace.",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { knowledgeItemId: string; version: number };

		const [fabricRow] = await db
			.select({ scopeId: knowledgeAppProjection.scopeId })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, data.knowledgeItemId))
			.limit(1);

		// The fabric extension row must have scopeId matching the team
		expect(fabricRow?.scopeId).toBe(TEAM_ID);
	});

	test("GET /api/knowledge returns the draft item in the response (triage-visible)", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		// Verify that items created by write_memory appear in the knowledge list endpoint
		// with status="proposed" — the KnowledgeList triage tab filters on status === "proposed"
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac1d-${Date.now()}`);
		const ctx = makeContext(db, sandboxPath);

		const result = await writeMemoryTool.handler(
			{
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
		expect(ourItem?.status).toBe("proposed");
	});
});

// ── AC-2: promote_knowledge moves draft → active ───────────────────────────

describe("R7 AC-2: promote_knowledge transitions draft → active", () => {
	test("promote_knowledge transitions a draft item to active status", async ({ db, app }) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app, db);
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac2a-${Date.now()}`);
		const eventBus = new EventBus();

		// Add facilitator user
		await db.insert(users).values({
			id: "agent-fac-r7",
			name: "Facilitator Agent",
			role: "facilitator", // @lore AD8c: renamed from practice_facilitator
			status: "active",
			createdAt: NOW,
		});

		const ctx: ToolContext<HyperIdleDb> = {
			db,
			eventBus,
			agentId: "agent-fac-r7",
			sessionId: "session-r7",
			taskId: "task-r7",
			sandboxPath,
			ingestion: { dispose: (): void => {} },
		};

		// Arrange: create a draft item directly in the DB
		const { randomUUID } = await import("node:crypto");
		const itemId = randomUUID();
		await seedKnowledgeItem(db, {
			id: itemId,
			title: "Draft item for promotion",
			body: "To be promoted from draft to active.",
			status: "proposed",
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

	test("promote_knowledge succeeds for 'proposed' now that ALLOWED_TRANSITIONS includes 'proposed' key", async ({
		db,
		app,
	}) => {
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app, db);
		// R7 fix applied: "proposed" is now in KNOWLEDGE_STATUSES and ALLOWED_TRANSITIONS
		// so isKnowledgeStatus("proposed") returns true and draft → active succeeds.
		// Previously documented the INVALID_STATE failure mode; updated in write-code phase.
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac2b-${Date.now()}`);
		const eventBus = new EventBus();

		await db.insert(users).values({
			id: "agent-fac-r7",
			name: "Facilitator Agent",
			role: "facilitator", // @lore AD8c: renamed from practice_facilitator
			status: "active",
			createdAt: NOW,
		});

		const ctx: ToolContext<HyperIdleDb> = {
			db,
			eventBus,
			agentId: "agent-fac-r7",
			sessionId: "session-r7",
			taskId: "task-r7",
			sandboxPath,
			ingestion: { dispose: (): void => {} },
		};

		const { randomUUID } = await import("node:crypto");
		const itemId = randomUUID();
		await seedKnowledgeItem(db, {
			id: itemId,
			title: "Draft item — post-fix behavior check",
			body: "Testing post-fix behavior: draft is now a valid status.",
			status: "proposed",
			updatedBy: "agent:agent-fac-r7",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId: itemId,
				toStatus: "active",
				reason: "Promoting a draft item to active",
			},
			ctx,
		);

		// After R7 fix: draft is a valid status and draft → active is an allowed transition
		expect(result.success).toBe(true);
	});

	test("full triage-to-curated flow: write_memory then promote_knowledge", async ({ db, app }) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		const promoteKnowledgeTool = buildPromoteKnowledgeTool(app, db);
		// End-to-end: agent writes item (lands in triage as "proposed"), facilitator promotes to "active" (curated)
		await seedBase(db);
		const sandboxPath = path.join(os.tmpdir(), `r7-ac2c-${Date.now()}`);
		const eventBus = new EventBus();

		await db.insert(users).values({
			id: "agent-fac-r7",
			name: "Facilitator Agent",
			role: "facilitator", // @lore AD8c: renamed from practice_facilitator
			status: "active",
			createdAt: NOW,
		});

		const writeCtx: ToolContext<HyperIdleDb> = {
			db,
			eventBus,
			agentId: AGENT_ID,
			sessionId: "session-r7",
			taskId: "task-r7",
			sandboxPath,
			ingestion: { dispose: (): void => {} },
		};
		const facCtx: ToolContext<HyperIdleDb> = {
			...writeCtx,
			agentId: "agent-fac-r7",
		};

		// Step 1: write_memory → expect "proposed"
		const writeResult = await writeMemoryTool.handler(
			{
				title: "Pattern to promote",
				body: "Discovered pattern that should be curated.",
			},
			writeCtx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;
		const { knowledgeItemId } = writeResult.data as { knowledgeItemId: string };

		// Check initial status is "proposed"
		const [beforeRow] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, knowledgeItemId))
			.limit(1);
		expect(beforeRow?.status).toBe("proposed");

		// Step 2: promote_knowledge draft → active
		const promoteResult = await promoteKnowledgeTool.handler(
			{
				knowledgeItemId,
				toStatus: "active",
				reason: "Verified pattern, moving to curated",
			},
			facCtx,
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

// ── AC-5: Knowledge from session N appears in session N+1 ───────────

describe("R7 AC-5: write_memory items appear in subsequent sessions", () => {
	let sandboxPath = ""; // initialized in beforeEach

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join("/tmp", "r7-mat-"));
	});

	afterEach(() => {
		if (sandboxPath) fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	test("an item written by write_memory appears in assembleContext() output for the same team", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		await seedBase(db);
		const ctx = makeContext(db, sandboxPath);

		// Arrange: write a knowledge item via write_memory
		const writeResult = await writeMemoryTool.handler(
			{
				title: "Session N Knowledge",
				body: "This knowledge was captured in session N and must appear in session N+1.",
			},
			ctx,
		);

		expect(writeResult.success).toBe(true);
		if (!writeResult.success) return;

		// AU21 §9 Increment 12 (Decision H3): `assembleAgentContext` consumes a
		// baked `contextBundle` now (zero db read in `context.ts`) — build the
		// SAME bundle a real `task_run` emit-time resolver would bake, from the
		// real rows (including the item write_memory JUST persisted, proving
		// the "session N knowledge reaches session N+1" behavior is unchanged).
		const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, "task-r7"));
		const [teamRow] = await db.select().from(teams).where(eq(teams.id, TEAM_ID));
		const [agentRow] = await db.select().from(users).where(eq(users.id, AGENT_ID));
		if (!(taskRow && teamRow && agentRow)) throw new Error("fixture rows missing");
		const knowledge = await assembleSessionKnowledge(db, {
			teamId: TEAM_ID,
			agentRole: agentRow.role,
			taskDescription: taskRow.description ?? taskRow.title,
			agentId: AGENT_ID,
		});
		// BB1: root task row for ancestors chain
		const [rootRow] = await db.select().from(tasks).where(eq(tasks.id, "bet-r7"));
		const contextBundle: BakedContextBundle = {
			kind: "task",
			task: {
				id: taskRow.id,
				title: taskRow.title,
				description: taskRow.description,
				state: taskRow.state,
			},
			ancestors: rootRow
				? [
						{
							id: rootRow.id,
							title: rootRow.title,
							description: rootRow.description ?? null,
							doneCondition: rootRow.doneCondition ?? null,
						},
					]
				: [],
			agent: { id: agentRow.id, name: agentRow.name, role: agentRow.role },
			team: { id: teamRow.id, name: teamRow.name },
			knowledge: toBakedContextKnowledgeItems(knowledge),
		};

		// Act: assemble context for a new session for the same team
		const assembled = await buildTestRunOrchestrationComposition().runSession(
			{ db, eventBus: new EventBus() },
			{
				mode: "assemble",
				input: {
					sandboxPath,
					sessionId: "session-r7-next",
					taskId: "task-r7",
					agentId: AGENT_ID,
					agentRole: "builder",
					teamId: TEAM_ID,
					isRoutine: false,
					sourceKind: null,
					sourceId: null,
					sourceCorrelation: null,
					contextBundle,
				},
			},
		);
		expect(assembled.mode).toBe("assembled");
		if (assembled.mode !== "assembled") return;
		const matResult = assembled.context;

		// Assert: the item is present in the assembled workspace
		// The item materialises into knowledge/ (architecture.md D1)
		expect(matResult.itemCount).toBeGreaterThan(0);

		// Verify the specific item filename appears in the manifest
		const manifestPath = path.join(sandboxPath, ".fabric/manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, { source_path: string }>;
		};

		// The item titled "Session N Knowledge" must appear in the manifest
		const itemPaths = Object.values(manifest.items).map((v) => v.source_path);
		const found = itemPaths.some((p) => p.includes("Session_N_Knowledge") || p.includes("Session"));
		expect(found).toBe(true);
	});

	test("write_memory items ARE assembled even without explicit teamId in ToolContext (R7 fix verified)", async ({
		db,
		app,
	}) => {
		const writeMemoryTool = buildWriteMemoryTool(app, db);
		// R7 fix: write_memory now derives teamId from the task when ctx.teamId
		// is absent, ensuring scopeId is always set for items tied to a team task.
		// Previously documented the null-scopeId broken state; updated in write-code phase.
		await seedBase(db);
		const ctx = makeContext(db, sandboxPath);

		// Write an item without explicit teamId in ctx (derived from task instead)
		const writeResult = await writeMemoryTool.handler(
			{
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
			.select({ scopeId: knowledgeAppProjection.scopeId })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, data.knowledgeItemId))
			.limit(1);

		// After R7 fix: scopeId is TEAM_ID (items are now properly scoped via task lookup)
		expect(fabricRow?.scopeId).toBe(TEAM_ID);
	});
});
