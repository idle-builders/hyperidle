/**
 * AD1 — Wire Review Routing to Humans: create-item routing tests.
 *
 * AC: When an agent creates a review item, the resulting thread includes
 *     the appropriate human(s) as participants — determined by team membership:
 *
 *  - Recipients are the humans on the agent's team (via ctx.teamId).
 *  - If the team has no humans, fall back to ALL humans so every review
 *    still reaches someone.
 *  - For non-review kinds (and non-review verbs), no extra participants.
 *
 * @lore AU20 ruling 1: the old org-edges matrix is gone. Routing is now
 * purely team-scoped: team membership answers "who reviews this agent's work".
 * The fallback (all humans) ensures no review is silently dropped.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

const NOW = new Date().toISOString();
const TEST_TEAM_ID = "team-ad1";
const TEST_TEAM_MEMBERS_ID = "tm-ad1";

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AD1 Team",
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: TEST_TEAM_MEMBERS_ID,
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(bets).values({
		id: "bet-ad1",
		teamId: TEST_TEAM_ID,
		description: "AD1 bet",
		status: "active",
		createdAt: NOW,
	});
	// Agent on the team (AI — never a review recipient)
	await db.insert(users).values({
		id: "agent-ad1",
		kind: "ai",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		teamId: TEST_TEAM_MEMBERS_ID,
		createdAt: NOW,
	});
	// Human NOT on the team by default — tests opt-in by setting teamId
	await db.insert(users).values({
		id: "founder-ad1",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ad1",
		betId: "bet-ad1",
		teamId: TEST_TEAM_ID,
		ownerAgentId: "agent-ad1",
		title: "AD1 Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides?: Partial<ToolContext<HyperIdleDb>>,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-ad1",
		sessionId: "session-ad1",
		taskId: "task-ad1",
		teamId: TEST_TEAM_ID,
		sandboxPath: path.join(os.tmpdir(), `hi-ad1-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
		...overrides,
	};
}

async function getThreadParticipants(db: HyperIdleDb, threadId: string): Promise<string[]> {
	const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
	if (!thread) throw new Error(`Thread ${threadId} not found`);
	return JSON.parse(thread.participants) as string[];
}

describe("AD1 — create-item: review routing wires human participants", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	let createItemTool: ReturnType<typeof buildToolDefinitions>[number];

	// @lore AU21 §9 Increment 2: `create_item`'s review-item branch now reaches
	// `ports.coreApi.getUserById` (the seam) — this file predates the fixture
	// `test`'s auto-registering `coreApiSeamRegistration` (it uses raw
	// `createTestDb()` + `it`/`describe`, not `../test-fixtures.js`).
	// @lore AU31 §3.2/B2: the tool is built fresh off THIS suite's own `app`
	// here in `beforeEach`, never an ambient transport global.
	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		createItemTool = buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
			(t) => t.name === "create_item",
		)!;
		await seedBase(db);
	});

	afterEach(async () => {
		disposeApp(app);
		await handle?.close();
	});

	// -------------------------------------------------------------------------
	// AC: review kind → human participants added, team-scoped
	// -------------------------------------------------------------------------
	describe("AC: kind=review routes to humans on the agent's team", () => {
		it("adds only the team's humans when the team has human members", async () => {
			// Put founder-ad1 ON the team (teamMembersId = tm-ad1)
			await db
				.update(users)
				.set({ teamId: TEST_TEAM_MEMBERS_ID })
				.where(eq(users.id, "founder-ad1"));

			// Seed a human NOT on the team
			await db.insert(users).values({
				id: "unrelated-human",
				kind: "human",
				name: "Unrelated Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "Please review my implementation",
					kind: "review",
					riskTier: "high",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);

			// Thread participants must include founder-ad1 (on the team)
			expect(participants).toContain("founder-ad1");
			// unrelated-human is NOT on the team and team has humans → no fallback
			expect(participants).not.toContain("unrelated-human");
		});

		it("falls back to all humans when the agent's team has no human members", async () => {
			// founder-ad1 is NOT on the team (no teamId set in seedBase)
			// Seed a second human also not on the team
			await db.insert(users).values({
				id: "fallback-human-2",
				kind: "human",
				name: "Fallback Human 2",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "Escalation needed",
					kind: "review",
					riskTier: "medium",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);

			// Fallback: team has no humans → all humans are included
			expect(participants).toContain("founder-ad1");
			expect(participants).toContain("fallback-human-2");
		});
	});

	// -------------------------------------------------------------------------
	// AC: escalation kind → human participants added (F2: kind gate)
	// -------------------------------------------------------------------------
	describe("AC: kind=escalation routes to humans", () => {
		it("adds human participants when kind=escalation", async () => {
			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "Escalation: production incident detected",
					kind: "escalation",
					riskTier: "high",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);

			// team has no humans → fallback → founder-ad1 (only human) is included
			expect(participants).toContain("founder-ad1");
		});
	});

	// -------------------------------------------------------------------------
	// AC: verb=review → human participants added (F2: verb gate)
	// -------------------------------------------------------------------------
	describe("AC: verb=review routes to humans (reviewer finding F2)", () => {
		it("adds human participants when verb=review even if kind is not review/escalation", async () => {
			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "Review proposed action",
					kind: "work",
					verb: "review",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);
			expect(participants).toContain("founder-ad1");
		});
	});

	// -------------------------------------------------------------------------
	// AC: non-review kind → no extra participants added
	// -------------------------------------------------------------------------
	describe("AC: non-review kind does NOT add extra participants", () => {
		it("does NOT add human participants when kind=knowledge and verb is not review", async () => {
			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "New knowledge proposal",
					kind: "knowledge",
					verb: "propose",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);

			// Only the agent (initiator) should be participant — no human routing
			expect(participants).not.toContain("founder-ad1");
			expect(participants).toContain("agent-ad1");
		});

		it("does NOT add human participants when kind=chat and verb is propose", async () => {
			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{
					title: "Chat message",
					kind: "chat",
					verb: "propose",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);
			expect(participants).not.toContain("founder-ad1");
		});
	});

	// -------------------------------------------------------------------------
	// AC: participants are sorted and deduplicated
	// -------------------------------------------------------------------------
	describe("AC: thread participants are sorted and deduplicated", () => {
		it("deduplicates and sorts participants when agent is also a human on the team", async () => {
			// Put agent-ad1 as a human on the team (unusual but tests deduplication)
			await db.insert(users).values({
				id: "human-also-on-team",
				kind: "human",
				name: "Human On Team",
				role: "founder",
				status: "active",
				teamId: TEST_TEAM_MEMBERS_ID,
				createdAt: NOW,
			});

			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler({ title: "Dedup test", kind: "review" }, ctx);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const { threadId } = result.data as { threadId: string; itemId: string; view: unknown };
			const participants = await getThreadParticipants(db, threadId);

			// No duplicates
			const unique = new Set(participants);
			expect(unique.size).toBe(participants.length);
			// Sorted
			const sorted = [...participants].sort();
			expect(participants).toEqual(sorted);
		});
	});
});
