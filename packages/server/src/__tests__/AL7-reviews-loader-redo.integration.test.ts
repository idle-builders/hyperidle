/**
 * AL7 RED — Reviews loader: proposedCall + verbatim args (trust-first redo)
 *
 * Tests FAIL until:
 *   - GET /api/reviews/:reviewMessageId returns proposedCall nested on artifact
 *   - proposedCall.args is the verbatim captured args object (deep-equal, not a summary string)
 *   - proposedCall.toolId is the verbatim tool name
 *   - proposedCall.status is captured | granted | executed | failed | held
 *   - outcome nested on proposedCall (when present): status, receipt|error, executedAt
 *   - No argsSummary string on proposedCall (old shape dropped — WARNING-2)
 *
 * Covers: AC10 (outcome visible + failure surfaces), AC10b (verbatim args so human's
 *         approve is grounded in the real call).
 */

import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	proposedCalls,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();
const TEST_API_KEY = "al7-reviews-loader-test-key";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
});

async function seedReviewWithProposedCall(
	db: HyperIdleDb,
	opts: {
		status: string;
		withOutcome?: { status: "ok" | "failed"; receipt?: string; error?: string };
	},
): Promise<{
	reviewMessageId: string;
	artifactId: string;
	proposedCallId: string;
	capturedArgs: Record<string, unknown>;
}> {
	const teamId = `team-rl-${crypto.randomUUID()}`;
	const agentId = `agent-rl-${crypto.randomUUID()}`;
	const betId = `bet-rl-${crypto.randomUUID()}`;
	const taskId = `task-rl-${crypto.randomUUID()}`;
	const artifactId = `art-rl-${crypto.randomUUID()}`;
	const proposedCallId = `pc-rl-${crypto.randomUUID()}`;

	// Verbatim args the agent called (AC10b: human sees exactly these)
	const capturedArgs = { path: "/workspace/result.txt", content: "feature done", pr: 42 };

	await db.insert(teams).values({ id: teamId, name: "RL Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "RL bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "RL task",
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

	const threadId = `thread-rl-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-rl-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "RL Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	await db.insert(proposedCalls).values({
		id: proposedCallId,
		reviewMessageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `sess-s1-${proposedCallId}`,
		toolId: "commit_file",
		// Verbatim args — exactly what the agent called
		args: JSON.stringify(capturedArgs),
		identityHash: "sha256-loadertest",
		reversibility: "irreversible",
		status: opts.status,
		stagedByAgentId: agentId,
		createdAt: NOW,
	});

	if (opts.withOutcome) {
		await db.insert(operationOutcomes).values({
			proposedCallId,
			status: opts.withOutcome.status,
			receipt: opts.withOutcome.receipt ?? null,
			error: opts.withOutcome.error ?? null,
			executedAt: NOW,
		});
	}

	return { reviewMessageId, artifactId, proposedCallId, capturedArgs };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC10b — verbatim args returned by the loader
// ─────────────────────────────────────────────────────────────────────────────

describe("AC10b: loader returns verbatim proposedCall.args (not a summary string)", () => {
	test("GET /api/reviews/:id returns proposedCall.args deep-equal to captured args object", async ({
		db,
		app,
	}) => {
		const { reviewMessageId, artifactId, capturedArgs } = await seedReviewWithProposedCall(db, {
			status: "captured",
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;

		// proposedCall must be nested on the artifact (not at top-level)
		expect(body.proposedCall).toBeUndefined();
		const arts = body.artifacts as Array<Record<string, unknown>>;
		const actionArt = arts.find((a) => a.id === artifactId);
		expect(actionArt).toBeDefined();

		const pc = actionArt?.proposedCall as Record<string, unknown>;
		expect(pc).toBeDefined();
		expect(pc.toolId).toBe("commit_file");
		expect(pc.status).toBe("captured");

		// AC10b: args is the verbatim object, not a summary string
		expect(typeof pc.args).toBe("object");
		expect(pc.args).not.toBeNull();
		const returnedArgs = pc.args as Record<string, unknown>;
		expect(returnedArgs.path).toBe(capturedArgs.path);
		expect(returnedArgs.content).toBe(capturedArgs.content);
		expect(returnedArgs.pr).toBe(capturedArgs.pr);

		// Old v1 fields must not appear (AC12)
		expect(pc.argsSummary).toBeUndefined();
		expect(pc.stagedOperationId).toBeUndefined();
		expect(pc.capabilityTool).toBeUndefined();
		expect(pc.operation).toBeUndefined();
		expect(pc.params).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC10 — outcome visible + failure surfaces (never silent)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC10: outcome is visible against the review; failure surfaces verbatim", () => {
	test("executed proposedCall returns outcome with status:ok and receipt", async ({ db, app }) => {
		const { reviewMessageId, artifactId } = await seedReviewWithProposedCall(db, {
			status: "executed",
			withOutcome: {
				status: "ok",
				receipt: JSON.stringify({ fileWritten: "/workspace/result.txt", bytes: 42 }),
			},
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const arts = body.artifacts as Array<Record<string, unknown>>;
		const actionArt = arts.find((a) => a.id === artifactId);
		const pc = actionArt?.proposedCall as Record<string, unknown>;

		expect(pc.status).toBe("executed");
		const outcome = pc.outcome as Record<string, unknown>;
		expect(outcome).toBeDefined();
		expect(outcome.status).toBe("ok");
		expect(outcome.receipt).toBeDefined();
		expect(outcome.error).toBeUndefined();
	});

	test("failed proposedCall returns outcome with status:failed and verbatim error (never truncated)", async ({
		db,
		app,
	}) => {
		const verbatimError =
			"GitHub error: 422 Unprocessable Entity\nPR #42 cannot be merged\nCode: merge_conflict\nFull stack:\n  at github.mergePr()";

		const { reviewMessageId, artifactId } = await seedReviewWithProposedCall(db, {
			status: "failed",
			withOutcome: { status: "failed", error: verbatimError },
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const arts = body.artifacts as Array<Record<string, unknown>>;
		const actionArt = arts.find((a) => a.id === artifactId);
		const pc = actionArt?.proposedCall as Record<string, unknown>;

		expect(pc.status).toBe("failed");
		const outcome = pc.outcome as Record<string, unknown>;
		expect(outcome.status).toBe("failed");
		// Verbatim error — never truncated, never silent
		expect(outcome.error).toBe(verbatimError);
		expect(outcome.receipt).toBeUndefined();
	});

	test("captured proposedCall (no outcome yet) returns proposedCall with no outcome", async ({
		db,
		app,
	}) => {
		const { reviewMessageId, artifactId } = await seedReviewWithProposedCall(db, {
			status: "captured",
		});

		const res = await app.request(`/api/reviews/${reviewMessageId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const arts = body.artifacts as Array<Record<string, unknown>>;
		const actionArt = arts.find((a) => a.id === artifactId);
		const pc = actionArt?.proposedCall as Record<string, unknown>;

		expect(pc.status).toBe("captured");
		expect(pc.outcome).toBeUndefined();
	});
});
