/**
 * AL7 RED — Reviews loader: staged-op + Outcome returned by the reviews route.
 *
 * Tests FAIL until:
 * - createReviewRoutes(db) accepts a db argument
 * - Route queries staged_operations LEFT JOIN operation_outcomes by reviewMessageId
 * - executedAt is humanized at the boundary (not raw ISO)
 * - app.ts passes db to createReviewRoutes
 */

import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	stagedOperations,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedReviewWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	founderId: string;
	artifactId: string;
	threadId: string;
	reviewMessageId: string;
}> {
	const teamId = "team-rl7";
	const agentId = "agent-rl7";
	const founderId = "founder-rl7";
	const betId = "bet-rl7";
	const taskId = "task-rl7";
	const artifactId = "artifact-rl7";

	await db.insert(teams).values({ id: teamId, name: "RL7 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-rl7", teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values([
		{ id: agentId, kind: "ai", name: "Builder", role: "builder", status: "active", createdAt: NOW },
		{
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "RL7 bet", status: "active", createdAt: NOW });
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "RL7 task",
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

	const threadId = `thread-rl7-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId, founderId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-rl7-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "RL7 Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_summary" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, founderId, artifactId, threadId, reviewMessageId };
}

describe("AL7 — reviews loader: stagedOperation in GET /api/reviews/:reviewMessageId", () => {
	describe("W3 — loader returns executed outcome", () => {
		test("returns stagedOperation.outcome with humanized executedAt for executed op", async ({
			db,
			app,
		}) => {
			const { reviewMessageId, threadId, agentId, artifactId } = await seedReviewWorld(db);

			const opId = `op-loader-${crypto.randomUUID()}`;
			const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();

			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-loader",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "loader" }),
				idempotencyKey: `idem-loader-${opId}`,
				reversibility: "irreversible",
				status: "executed",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			await db.insert(operationOutcomes).values({
				stagedOperationId: opId,
				status: "ok",
				payload: JSON.stringify({ re_xxxxx: "refunded" }),
				error: null,
				executedAt: twoMinutesAgo,
			});

			const res = await app.request(`/api/reviews/${reviewMessageId}`);
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("stagedOperation");

			const stagedOp = body.stagedOperation as Record<string, unknown>;
			expect(stagedOp.status).toBe("executed");
			expect(stagedOp).toHaveProperty("outcome");

			const outcome = stagedOp.outcome as Record<string, unknown>;
			expect(outcome.status).toBe("ok");

			// executedAt must be humanized, NOT a raw ISO timestamp
			const executedAtDisplay = outcome.executedAt as string;
			expect(executedAtDisplay).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(typeof executedAtDisplay).toBe("string");
			expect(executedAtDisplay.length).toBeGreaterThan(0);
		});

		test("returns verbatim error for failed op (not truncated)", async ({ db, app }) => {
			const { reviewMessageId, threadId, agentId, artifactId } = await seedReviewWorld(db);

			const opId = `op-fail-${crypto.randomUUID()}`;
			const verbatimError =
				"Stripe error: card_declined\nYour card was declined.\nCode: card_declined\nRequest-ID: req_abc123\nFull stack:\n  at stripe.refund()";

			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-fail",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ simulateFailure: true }),
				idempotencyKey: `idem-fail-${opId}`,
				reversibility: "irreversible",
				status: "failed",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			await db.insert(operationOutcomes).values({
				stagedOperationId: opId,
				status: "failed",
				payload: null,
				error: verbatimError,
				executedAt: NOW,
			});

			const res = await app.request(`/api/reviews/${reviewMessageId}`);
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const stagedOp = body.stagedOperation as Record<string, unknown>;
			expect(stagedOp.status).toBe("failed");

			const outcome = stagedOp.outcome as Record<string, unknown>;
			expect(outcome.status).toBe("failed");
			// Error verbatim + un-truncated (multi-line intact)
			expect(outcome.error).toBe(verbatimError);
		});

		test("pending op returns stagedOperation with no outcome", async ({ db, app }) => {
			const { reviewMessageId, threadId, agentId, artifactId } = await seedReviewWorld(db);

			const opId = `op-pend-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-pend",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "pending" }),
				idempotencyKey: `idem-pend-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const res = await app.request(`/api/reviews/${reviewMessageId}`);
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const stagedOp = body.stagedOperation as Record<string, unknown>;
			expect(stagedOp.status).toBe("pending");
			expect(stagedOp.outcome).toBeUndefined();
		});

		test("review with no staged op returns no stagedOperation field", async ({ db, app }) => {
			const { reviewMessageId } = await seedReviewWorld(db);

			const res = await app.request(`/api/reviews/${reviewMessageId}`);
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.stagedOperation).toBeUndefined();
		});
	});
});
