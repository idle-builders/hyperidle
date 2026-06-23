/**
 * AL7 RED — Review execution loop: staged-operation dispatcher integration tests.
 *
 * Tests FAIL until:
 * - schema: staged_operations + operation_outcomes tables added + migrated
 * - staged-operation-dispatcher.ts: resolveStagedOperations + sweepStrandedOperations
 * - threads.ts: approve verdict invokes resolveStagedOperations(dispatchDeps, resolvesMessageRow.id)
 * - app.ts: createThreadRoutes receives dispatchDeps (non-optional in live boot)
 *
 * Load-bearing correctness tests per architecture §8 + critique round-2 addendum:
 *
 * C1 — multi-review-per-thread isolation: approve on review B does NOT fire review A's op.
 * W4 — re-open identity: re-open posts a NEW review message; the old op is never re-fired.
 * C2 — crash sweep: stranded executing op → failed Outcome on boot.
 * C3 — prod boot wires dispatch: createApp constructs threads route with dispatchDeps.
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
import { eq } from "drizzle-orm";
import {
	resolveStagedOperations,
	type StagedOperationDispatchDeps,
	sweepStrandedOperations,
} from "../services/staged-operation-dispatcher.js";
import { describe, expect, test, vi } from "../test-fixtures.js";

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

async function seedBase(db: HyperIdleDb): Promise<{
	betId: string;
	taskId: string;
	agentId: string;
	founderId: string;
	artifactId: string;
}> {
	const teamId = "team-al7";
	const agentId = "agent-al7";
	const founderId = "founder-al7";
	const betId = "bet-al7";
	const taskId = "task-al7";
	const artifactId = "artifact-al7";

	await db.insert(teams).values({ id: teamId, name: "AL7 Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "tm-al7",
		teamId,
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: agentId,
			kind: "ai",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AL7 bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "AL7 task",
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

	return { betId, taskId, agentId, founderId, artifactId };
}

/** Seed a bet host thread + a review message. Returns ids. */
async function seedReviewThread(
	db: HyperIdleDb,
	opts: { betId: string; agentId: string; founderId: string; threadIdOverride?: string },
): Promise<{ threadId: string; reviewMessageId: string }> {
	const threadId = opts.threadIdOverride ?? `thread-${opts.betId}-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: opts.betId,
		initiatorId: opts.agentId,
		participants: JSON.stringify([opts.agentId, opts.founderId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	const reviewMessageId = `msg-review-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: opts.agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "Review",
			reasoning: ["reason"],
			artifactRef: { id: "artifact-al7", kind: "action_summary" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});
	return { threadId, reviewMessageId };
}

// Aliases for readability in tests.
const rs = resolveStagedOperations;
const sweep = sweepStrandedOperations;

// ─────────────────────────────────────────────────────────────────────────────

describe("AL7 — staged-operation dispatcher", () => {
	// ──────────────────────────────────────────────────────────────────────────
	// CORE: approve executes the staged op
	// ──────────────────────────────────────────────────────────────────────────
	describe("approve executes staged op", () => {
		test("approve resolves pending op → executed + ok Outcome", async ({ db, eventBus }) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-1",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "hello" }),
				idempotencyKey: `idem-${opId}`,
				reversibility: "reversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const executeCapability = vi.fn().mockResolvedValue({ payload: { echoed: "hello" } });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			await rs(deps, reviewMessageId);

			const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
			expect(op?.status).toBe("executed");

			const [outcome] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcome?.status).toBe("ok");
			expect(outcome?.error).toBeNull();
			expect(executeCapability).toHaveBeenCalledOnce();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// C1 — MULTI-REVIEW-PER-THREAD ISOLATION
	// ──────────────────────────────────────────────────────────────────────────
	describe("C1 — multi-review-per-thread isolation", () => {
		test("approving review B does NOT execute review A's pending op on the same thread", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const sharedThreadId = `thread-shared-${crypto.randomUUID()}`;

			await db.insert(threads).values({
				id: sharedThreadId,
				hostKind: "bet",
				hostId: "bet-al7",
				initiatorId: agentId,
				participants: JSON.stringify([agentId, "founder-al7"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});

			const reviewAId = `msg-A-${crypto.randomUUID()}`;
			const reviewBId = `msg-B-${crypto.randomUUID()}`;
			await db.insert(messages).values([
				{
					id: reviewAId,
					senderId: agentId,
					threadId: sharedThreadId,
					type: "review",
					payload: JSON.stringify({
						title: "Review A",
						reasoning: ["r"],
						artifactRef: { id: artifactId, kind: "action_summary" },
					}),
					clientKey: reviewAId,
					createdAt: NOW,
				},
				{
					id: reviewBId,
					senderId: agentId,
					threadId: sharedThreadId,
					type: "review",
					payload: JSON.stringify({
						title: "Review B",
						reasoning: ["r"],
						artifactRef: { id: artifactId, kind: "action_summary" },
					}),
					clientKey: reviewBId,
					createdAt: NOW,
				},
			]);

			const opAId = `op-a-${crypto.randomUUID()}`;
			const opBId = `op-b-${crypto.randomUUID()}`;

			await db.insert(stagedOperations).values([
				{
					id: opAId,
					reviewMessageId: reviewAId,
					subjectThreadId: sharedThreadId,
					artifactId,
					consequenceId: "con-a",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: JSON.stringify({ value: "A" }),
					idempotencyKey: `idem-a-${opAId}`,
					reversibility: "irreversible",
					status: "pending",
					stagedByAgentId: agentId,
					createdAt: NOW,
				},
				{
					id: opBId,
					reviewMessageId: reviewBId,
					subjectThreadId: sharedThreadId,
					artifactId,
					consequenceId: "con-b",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: JSON.stringify({ value: "B" }),
					idempotencyKey: `idem-b-${opBId}`,
					reversibility: "irreversible",
					status: "pending",
					stagedByAgentId: agentId,
					createdAt: NOW,
				},
			]);

			const executeCapability = vi.fn().mockResolvedValue({ payload: { ok: true } });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			// Approve ONLY review B
			await rs(deps, reviewBId);

			// op-B executed
			const [opB] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opBId));
			expect(opB?.status).toBe("executed");

			// op-A still pending — CRITICAL assertion
			const [opA] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opAId));
			expect(opA?.status).toBe("pending");

			// No outcome for op-A
			const outcomesA = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opAId));
			expect(outcomesA).toHaveLength(0);

			// executeCapability called exactly once (for B only)
			expect(executeCapability).toHaveBeenCalledOnce();
			const callArg = executeCapability.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(callArg?.idempotencyKey).toBe(`idem-b-${opBId}`);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// AT-MOST-ONCE: re-delivery idempotency
	// ──────────────────────────────────────────────────────────────────────────
	describe("at-most-once execution (re-delivery)", () => {
		test("calling resolveStagedOperations twice on same reviewMessageId executes exactly once", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-once-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-once",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "once" }),
				idempotencyKey: `idem-once-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const executeCapability = vi.fn().mockResolvedValue({ payload: { ok: true } });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			await rs(deps, reviewMessageId);
			await rs(deps, reviewMessageId); // re-delivery

			expect(executeCapability).toHaveBeenCalledOnce();

			const outcomes = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcomes).toHaveLength(1);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// W4 — RE-OPEN IDENTITY (the actual re-open shape)
	// Re-open posts a NEW review message. Approving the new message finds NO op
	// with that reviewMessageId → the original op is NOT re-fired.
	// ──────────────────────────────────────────────────────────────────────────
	describe("W4 — real re-open: original op not re-fired on new review message", () => {
		test("approve original → op executed; re-open + approve new message → op NOT re-executed", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-reopen-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId, // anchored to original review message M
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-reopen",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "reopen" }),
				idempotencyKey: `idem-reopen-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const executeCapability = vi.fn().mockResolvedValue({ payload: { ok: true } });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			// Step 1: approve M → op executes once
			await rs(deps, reviewMessageId);
			expect(executeCapability).toHaveBeenCalledOnce();

			const [opAfter] = await db
				.select()
				.from(stagedOperations)
				.where(eq(stagedOperations.id, opId));
			expect(opAfter?.status).toBe("executed");

			// Step 2: re-open posts a NEW review message R on the same thread
			const newReviewMessageId = `msg-new-${crypto.randomUUID()}`;
			await db.insert(messages).values({
				id: newReviewMessageId,
				senderId: agentId,
				threadId,
				type: "review",
				payload: JSON.stringify({
					title: "Re-review",
					reasoning: ["r"],
					artifactRef: { id: artifactId, kind: "action_summary" },
				}),
				clientKey: newReviewMessageId,
				createdAt: new Date(Date.now() + 1000).toISOString(),
			});

			// Step 3: approve new message R → no op anchored to R → nothing fires
			await rs(deps, newReviewMessageId);

			// executeCapability still called exactly once
			expect(executeCapability).toHaveBeenCalledOnce();

			// Original op still executed (not re-run)
			const [opFinal] = await db
				.select()
				.from(stagedOperations)
				.where(eq(stagedOperations.id, opId));
			expect(opFinal?.status).toBe("executed");

			// Still one outcome row
			const outcomes = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcomes).toHaveLength(1);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// NEVER APPROVED: op stays pending
	// ──────────────────────────────────────────────────────────────────────────
	describe("never-approved op is never executed", () => {
		test("pending op with no resolveStagedOperations call stays pending", async ({ db }) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-never-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-never",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "never" }),
				idempotencyKey: `idem-never-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
			expect(op?.status).toBe("pending");

			const outcomes = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcomes).toHaveLength(0);
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// DESCRIPTIVE ARTIFACTS: no staged op → executeCapability never called
	// ──────────────────────────────────────────────────────────────────────────
	describe("descriptive artifacts do not execute on approve", () => {
		test("approve with no staged_operations row → executeCapability not called", async ({
			db,
			eventBus,
		}) => {
			await seedBase(db);
			const { reviewMessageId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId: "agent-al7",
				founderId: "founder-al7",
			});

			const executeCapability = vi.fn().mockResolvedValue({ payload: {} });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			await rs(deps, reviewMessageId);

			expect(executeCapability).not.toHaveBeenCalled();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// EXECUTION FAILURE SURFACES: tool throws → failed Outcome, no exception
	// ──────────────────────────────────────────────────────────────────────────
	describe("execution failure surfaces as failed Outcome", () => {
		test("executeCapability throws → failed Outcome with verbatim error, does not throw", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-fail-${crypto.randomUUID()}`;
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
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const verbatimError = "Tool execution failed: card_declined — your card was declined.";
			const executeCapability = vi.fn().mockRejectedValue(new Error(verbatimError));
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			// Must NOT throw
			await expect(rs(deps, reviewMessageId)).resolves.toBeUndefined();

			const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
			expect(op?.status).toBe("failed");

			const [outcome] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcome?.status).toBe("failed");
			expect(outcome?.error).toBe(verbatimError);
			expect(outcome?.payload).toBeNull();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// UNKNOWN CAPABILITY: surfaces as failed Outcome, never silent skip
	// ──────────────────────────────────────────────────────────────────────────
	describe("unknown capability surfaces as failed Outcome", () => {
		test("op with unknown capabilityTool → failed Outcome (approve did nothing is forbidden)", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-unknown-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-unknown",
				capabilityTool: "github",
				operation: "merge_pr",
				params: JSON.stringify({ prNumber: 42 }),
				idempotencyKey: `idem-unknown-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const executeCapability = vi
				.fn()
				.mockRejectedValue(new Error("Unknown capability: github/merge_pr"));
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			await expect(rs(deps, reviewMessageId)).resolves.toBeUndefined();

			const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
			expect(op?.status).toBe("failed");

			const [outcome] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcome?.status).toBe("failed");
			expect(outcome?.error).toContain("Unknown capability");
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// C2 — CRASH RECOVERY: sweepStrandedOperations
	// ──────────────────────────────────────────────────────────────────────────
	describe("C2 — sweepStrandedOperations: stranded executing → failed", () => {
		test("stranded executing op with no Outcome → failed after sweep with interrupted message", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-stranded-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-stranded",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "stranded" }),
				idempotencyKey: `idem-stranded-${opId}`,
				reversibility: "irreversible",
				status: "executing", // crash-stranded
				stagedByAgentId: agentId,
				createdAt: NOW,
			});
			// No operation_outcomes row — crash before writeOutcome

			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability: vi.fn() };
			await sweep(deps);

			const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
			expect(op?.status).toBe("failed");

			const [outcome] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			expect(outcome?.status).toBe("failed");
			expect(outcome?.error).toContain("interrupted");
		});

		test("executing op WITH an Outcome row is NOT re-swept", async ({ db, eventBus }) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const opId = `op-already-ok-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-already",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "already" }),
				idempotencyKey: `idem-already-${opId}`,
				reversibility: "irreversible",
				status: "executing",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});
			await db.insert(operationOutcomes).values({
				stagedOperationId: opId,
				status: "ok",
				payload: JSON.stringify({ ok: true }),
				error: null,
				executedAt: NOW,
			});

			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability: vi.fn() };
			await sweep(deps);

			const [outcome] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.stagedOperationId, opId));
			// Still ok — not overwritten
			expect(outcome?.status).toBe("ok");
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// DB UNIQUE: idempotencyKey UNIQUE prevents duplicate staging
	// ──────────────────────────────────────────────────────────────────────────
	describe("DB-level: idempotencyKey UNIQUE constraint", () => {
		test("two staged ops with the same idempotencyKey — second insert throws", async ({ db }) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const sharedKey = `shared-idem-${crypto.randomUUID()}`;

			await db.insert(stagedOperations).values({
				id: `op-first-${crypto.randomUUID()}`,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-first",
				capabilityTool: "fixture:staged-op",
				operation: "echo",
				params: JSON.stringify({ value: "first" }),
				idempotencyKey: sharedKey,
				reversibility: "reversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			await expect(
				db.insert(stagedOperations).values({
					id: `op-second-${crypto.randomUUID()}`,
					reviewMessageId,
					subjectThreadId: threadId,
					artifactId,
					consequenceId: "con-second",
					capabilityTool: "fixture:staged-op",
					operation: "echo",
					params: JSON.stringify({ value: "second" }),
					idempotencyKey: sharedKey, // duplicate
					reversibility: "reversible",
					status: "pending",
					stagedByAgentId: agentId,
					createdAt: NOW,
				}),
			).rejects.toThrow();
		});
	});

	// ──────────────────────────────────────────────────────────────────────────
	// SPEC IMMUTABILITY: frozen params + idempotencyKey forwarded to tool
	// ──────────────────────────────────────────────────────────────────────────
	describe("spec immutability — frozen params forwarded to executeCapability", () => {
		test("executeCapability receives params + idempotencyKey from the row verbatim", async ({
			db,
			eventBus,
		}) => {
			const { agentId, artifactId } = await seedBase(db);
			const { reviewMessageId, threadId } = await seedReviewThread(db, {
				betId: "bet-al7",
				agentId,
				founderId: "founder-al7",
			});

			const frozenParams = { prNumber: 99, repo: "hyperidle/hyperidle" };
			const opId = `op-frozen-${crypto.randomUUID()}`;
			await db.insert(stagedOperations).values({
				id: opId,
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				consequenceId: "con-frozen",
				capabilityTool: "github",
				operation: "merge_pr",
				params: JSON.stringify(frozenParams),
				idempotencyKey: `idem-frozen-${opId}`,
				reversibility: "irreversible",
				status: "pending",
				stagedByAgentId: agentId,
				createdAt: NOW,
			});

			const executeCapability = vi.fn().mockResolvedValue({ payload: { merged: true } });
			const deps: StagedOperationDispatchDeps = { db, eventBus, executeCapability };

			await rs(deps, reviewMessageId);

			const callArg = executeCapability.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(callArg).toMatchObject({
				params: frozenParams,
				idempotencyKey: `idem-frozen-${opId}`,
				operation: "merge_pr",
				capabilityTool: "github",
			});
		});
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// C3 — PROD BOOT WIRES DISPATCH: approve via real app executes the staged op
// ──────────────────────────────────────────────────────────────────────────────
describe("C3 — live server boot wires dispatch", () => {
	test("approve verdict via HTTP executes staged op (createApp must wire dispatchDeps)", async ({
		db,
		app,
	}) => {
		const { agentId, artifactId, founderId } = await seedBase(db);
		const { reviewMessageId, threadId } = await seedReviewThread(db, {
			betId: "bet-al7",
			agentId,
			founderId,
		});

		const opId = `op-c3-${crypto.randomUUID()}`;
		await db.insert(stagedOperations).values({
			id: opId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			consequenceId: "con-c3",
			capabilityTool: "fixture:staged-op",
			operation: "echo",
			params: JSON.stringify({ value: "c3" }),
			idempotencyKey: `idem-c3-${opId}`,
			reversibility: "irreversible",
			status: "pending",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		// POST the approve verdict through the real app
		const res = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Identity": founderId,
			},
			body: JSON.stringify({
				type: "verdict",
				payload: {
					decision: "approve",
					resolvesMessageId: reviewMessageId,
					text: "Approved",
					refs: [],
				},
				clientKey: `verdict-${crypto.randomUUID()}`,
			}),
		});

		expect(res.status).toBe(201);

		// After approve through the real app, the op must be executed
		const [op] = await db.select().from(stagedOperations).where(eq(stagedOperations.id, opId));
		expect(op?.status).toBe("executed");

		const [outcome] = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.stagedOperationId, opId));
		expect(outcome?.status).toBe("ok");
	});
});
