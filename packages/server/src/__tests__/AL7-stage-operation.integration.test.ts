/**
 * AL7 — stage_operation tool integration tests.
 *
 * CRITICAL-3: Stage-time capability validation — an agent cannot stage an op
 * for a capability the kernel does not hold. The stage is REJECTED at the write
 * boundary (not silently accepted to fail at dispatch).
 *
 * WARNING-1: subjectThreadId is derived from reviewMessageId (not agent-supplied).
 * An agent cannot misalign the thread anchor.
 *
 * AC table row: "(a) stage against a capability the agent does NOT hold → stage rejected"
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	stagedOperations,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";
import { stageOperationTool } from "../tools/stage-operation.js";
import type { ToolContext } from "../tools/tool-registry.js";

const NOW = new Date().toISOString();

function makeCtx(db: HyperIdleDb, eventBus: EventBus, agentId: string): ToolContext {
	return {
		db,
		eventBus,
		agentId,
		sessionId: "session-stage-test",
		taskId: "task-stage-test",
		sandboxPath: path.join(os.tmpdir(), `hi-al7-stage-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	artifactId: string;
	threadId: string;
	reviewMessageId: string;
}> {
	const teamId = "team-so7";
	const agentId = "agent-so7";
	const betId = "bet-so7";
	const taskId = "task-so7";
	const artifactId = "artifact-so7";

	await db.insert(teams).values({ id: teamId, name: "SO7 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-so7", teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "SO7 bet", status: "active", createdAt: NOW });
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "SO7 task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: taskId,
		kind: "action_operation",
		createdAt: NOW,
	});

	const threadId = `thread-so7-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-so7-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "SO7 Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_summary" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, artifactId, threadId, reviewMessageId };
}

describe("AL7 — stage_operation tool", () => {
	// ─────────────────────────────────────────────────────────────────────────
	// CRITICAL-3: Stage-time capability validation
	// ─────────────────────────────────────────────────────────────────────────
	describe("CRITICAL-3: stage-time capability validation", () => {
		test("staging a known capability (fixture:staged-op/echo) succeeds", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId, threadId, reviewMessageId } = await seedWorld(db);
			const ctx = makeCtx(db, eventBus, agentId);

			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId,
					consequenceId: "con-known",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: { value: "hello" },
					idempotencyKey: `idem-known-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(true);

			// Row was inserted
			const [row] = await db
				.select()
				.from(stagedOperations)
				.where(eq(stagedOperations.reviewMessageId, reviewMessageId));
			expect(row?.status).toBe("pending");
			// WARNING-1: subjectThreadId derived from message, not agent-supplied
			expect(row?.subjectThreadId).toBe(threadId);
		});

		test("staging an UNKNOWN capability is REJECTED at stage time (not silently accepted)", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId, reviewMessageId } = await seedWorld(db);
			const ctx = makeCtx(db, eventBus, agentId);

			// "stripe/refund_payment" is NOT in KNOWN_CAPABILITY_KEYS
			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId,
					consequenceId: "con-unknown",
					capabilityTool: "stripe",
					operation: "refund_payment",
					params: { chargeId: "ch_123" },
					idempotencyKey: `idem-unknown-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(false);
			expect((result as { success: false; code: string }).code).toBe("FORBIDDEN");
			expect((result as { success: false; code: string; error: string }).error).toContain(
				"stripe/refund_payment",
			);

			// No row was inserted
			const rows = await db
				.select()
				.from(stagedOperations)
				.where(eq(stagedOperations.reviewMessageId, reviewMessageId));
			expect(rows).toHaveLength(0);
		});

		test("staging 'github/merge_pr' (real capability) succeeds", async ({ db, eventBus }) => {
			const { agentId, artifactId, reviewMessageId } = await seedWorld(db);
			const ctx = makeCtx(db, eventBus, agentId);

			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId,
					consequenceId: "con-github",
					capabilityTool: "github",
					operation: "merge_pr",
					params: { owner: "test-org", repo: "test-repo", prNumber: 1 },
					idempotencyKey: `idem-github-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(true);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// WARNING-1: subjectThreadId derived from reviewMessageId
	// ─────────────────────────────────────────────────────────────────────────
	describe("WARNING-1: subjectThreadId derived from reviewMessageId", () => {
		test("staged op's subjectThreadId matches the review message's thread", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId, threadId, reviewMessageId } = await seedWorld(db);
			const ctx = makeCtx(db, eventBus, agentId);

			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId,
					consequenceId: "con-derive",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: { value: "derive" },
					idempotencyKey: `idem-derive-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			const [row] = await db
				.select()
				.from(stagedOperations)
				.where(eq(stagedOperations.reviewMessageId, reviewMessageId));
			// Must equal the actual thread of the review message — not any agent-supplied value
			expect(row?.subjectThreadId).toBe(threadId);
		});

		test("staging with non-existent reviewMessageId returns NOT_FOUND", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedWorld(db);
			const ctx = makeCtx(db, eventBus, agentId);

			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId: "msg-does-not-exist",
					consequenceId: "con-404",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: {},
					idempotencyKey: `idem-404-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(false);
			expect((result as { success: false; code: string }).code).toBe("NOT_FOUND");
		});

		test("staging against a plain message type (not review/questionnaire) returns INVALID_INPUT", async ({
			db,
			eventBus,
		}) => {
			// Seed a plain message (not type="review")
			const { agentId, artifactId, threadId } = await seedWorld(db);
			const plainMessageId = `msg-plain-${crypto.randomUUID()}`;
			await db.insert(messages).values({
				id: plainMessageId,
				senderId: agentId,
				threadId,
				type: "plain",
				payload: JSON.stringify({ text: "hello" }),
				clientKey: plainMessageId,
				createdAt: NOW,
			});

			const ctx = makeCtx(db, eventBus, agentId);

			const result = await stageOperationTool.handler(
				{
					artifactId,
					reviewMessageId: plainMessageId,
					consequenceId: "con-plain",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: {},
					idempotencyKey: `idem-plain-${crypto.randomUUID()}`,
					reversibility: "irreversible",
				},
				ctx,
			);

			expect(result.success).toBe(false);
			expect((result as { success: false; code: string }).code).toBe("INVALID_INPUT");
			expect((result as { success: false; code: string; error: string }).error).toContain("plain");
		});
	});
});
