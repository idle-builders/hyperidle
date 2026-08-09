/**
 * AD1 RED — Wire Review Routing to Humans: create-item routing tests.
 *
 * These tests FAIL until:
 *  - resolveReviewRecipients is wired into create-item.ts handler
 *  - When kind === "review" || kind === "escalation" || verb === "review",
 *    the resulting thread participants include human reviewers from org_edges
 *  - When no org_edges match, ALL human users are added as participants
 *  - For non-review kinds, no extra participants are added
 *
 * AC: When an agent creates a review item, the resulting thread includes
 *     the appropriate human(s) as participants — determined by
 *     resolveReviewRecipients() based on org_edges.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import {
	bets,
	type HyperIdleDb,
	orgEdges,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

const NOW = new Date().toISOString();
const TEST_TEAM_ID = "team-ad1";

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AD1 Team",
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: "tm-ad1",
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
	await db.insert(users).values([
		{
			id: "agent-ad1",
			kind: "ai",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: "founder-ad1",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
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
	// AC: review kind → human participants added via org_edges
	// -------------------------------------------------------------------------
	describe("AC: kind=review routes to matched human via org_edges", () => {
		it("adds matched human reviewer when direct org_edge exists for the agent", async () => {
			// Seed a second human NOT connected via org_edge
			await db.insert(users).values({
				id: "unrelated-human",
				kind: "human",
				name: "Unrelated Human",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// founder-ad1 reviews agent-ad1 directly
			await db.insert(orgEdges).values({
				id: "edge-direct-ad1",
				fromUserId: "founder-ad1",
				mechanism: "direct",
				target: "agent-ad1",
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

			// Thread participants must include founder-ad1 (the matched reviewer)
			expect(participants).toContain("founder-ad1");
			// unrelated-human should NOT be included (edge matched, so no fallback)
			expect(participants).not.toContain("unrelated-human");
		});

		it("falls back to all humans when no org_edges exist for the agent", async () => {
			// Seed a second human (no org_edges seeded)
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

			// Both humans must be in participants (fallback = all humans)
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

			// fallback: all humans (no org_edges seeded)
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
		it("deduplicates agent when agent is also a matched reviewer (edge case)", async () => {
			// Agent is the same user as an org_edge fromUserId (weird but possible)
			await db.insert(orgEdges).values({
				id: "edge-self",
				fromUserId: "agent-ad1",
				mechanism: "direct",
				target: "agent-ad1",
				createdAt: NOW,
			});

			const ctx = makeContext(db, eventBus);
			const result = await createItemTool.handler(
				{ title: "Self-review edge case", kind: "review" },
				ctx,
			);

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
