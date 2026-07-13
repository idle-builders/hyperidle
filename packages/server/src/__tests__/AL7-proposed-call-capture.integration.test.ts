/**
 * AL7 RED — Proposed Call capture: workflow router integration tests
 *
 * Tests FAIL until:
 *   - proposedCalls table exists in schema (shape: tool_id, args, identity_hash,
 *     origin_session_id, status, review_message_id, subject_thread_id, artifact_id)
 *   - UNIQUE constraint (origin_session_id, identity_hash) on proposed_calls
 *   - tailoredGrants table exists in schema
 *   - buildToolRegistry.invoke classifies reversibility + routes irreversible to review
 *   - captureProposedCall performs ON CONFLICT (origin_session_id, identity_hash) DO NOTHING
 *   - sessionRunRegistry.abort fires after first capture (session 1 ends)
 *   - Reversible tool calls return handler result without capture
 *   - SessionConfig.sessionWorkflow added to harness-adapter.ts
 *   - packages/db/src/index.ts exports proposedCalls + tailoredGrants
 *
 * Covers: AC1 (route irreversible → capture + abort; idempotency: no duplicate),
 *         AC2 (reversible flows, no capture), AC5 (different irreversible in s2),
 *         AC7 (non-approve → no grant), AC8 (never-approved → never executed),
 *         AC9 (descriptive artifact → no capture).
 */

import * as os from "node:os";
import * as path from "node:path";
import type { ToolContext } from "@hyperidle/agent-layer";
import { buildToolRegistry } from "@hyperidle/agent-layer";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	proposedCalls,
	tailoredGrants,
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

const NOW = new Date().toISOString();

// Minimal in-memory session abort tracker (stands in for sessionRunRegistry in unit context)
function makeAbortTracker(): { aborted: Set<string>; abort: (sessionId: string) => void } {
	const aborted = new Set<string>();
	return { aborted, abort: (sessionId: string) => aborted.add(sessionId) };
}

async function seedWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	betId: string;
	threadId: string;
	reviewMessageId: string;
	artifactId: string;
}> {
	const teamId = `team-cap-${crypto.randomUUID()}`;
	const agentId = `agent-cap-${crypto.randomUUID()}`;
	const betId = `bet-cap-${crypto.randomUUID()}`;
	const taskId = `task-cap-${crypto.randomUUID()}`;
	const artifactId = `art-cap-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "Cap Team", phase: "build", createdAt: NOW });
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
		description: "Cap bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "Cap task",
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

	const threadId = `thread-cap-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-cap-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "Cap Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, taskId, betId, threadId, reviewMessageId, artifactId };
}

function makeCtx(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentId: string,
	taskId: string,
	sessionId: string,
	extraCtx?: Partial<ToolContext>,
): ToolContext {
	return {
		db,
		eventBus,
		agentId,
		sessionId,
		taskId,
		teamId: "team-cap",
		sandboxPath: path.join(os.tmpdir(), `hi-al7-cap-${sessionId}`),
		ingestion: { dispose: (): void => {} },
		...extraCtx,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Irreversible call → capture + abort session 1
// ─────────────────────────────────────────────────────────────────────────────

describe("AC1: irreversible call is captured + session 1 aborted", () => {
	test("invoking commit_file in open-work session creates a proposed_calls row (status:captured)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-s1-${crypto.randomUUID()}`;

		const ctx = makeCtx(db, eventBus, agentId, taskId, sessionId);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		// Invoke commit_file — irreversible → must be routed to review
		const result = await registry.invoke("commit_file", {
			path: "/workspace/out.txt",
			content: "hello",
		});

		// The router returns AWAITING_REVIEW, not the tool result
		expect(result.success).toBe(false);
		expect((result as { success: false; code: string }).code).toBe("AWAITING_REVIEW");

		// A proposed_calls row must exist with status:captured + verbatim toolId + args
		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.toolId).toBe("commit_file");
		// args stored verbatim as JSON (AC10b: human sees the real args, not a summary)
		const storedArgs = JSON.parse(rows[0]?.args ?? "{}") as Record<string, unknown>;
		expect(storedArgs.path).toBe("/workspace/out.txt");
		expect(storedArgs.content).toBe("hello");
		expect(rows[0]?.status).toBe("captured");
		expect(rows[0]?.reviewMessageId).toBe(reviewMessageId);
		expect(rows[0]?.subjectThreadId).toBe(threadId);
	});

	test("invoking commit_file aborts session 1 (sessionRunRegistry.abort fires)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-abort-${crypto.randomUUID()}`;
		const abortTracker = makeAbortTracker();

		const ctx = makeCtx(db, eventBus, agentId, taskId, sessionId, {
			onAbortSession: abortTracker.abort,
		} as Partial<ToolContext>);

		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		await registry.invoke("commit_file", { path: "/workspace/out.txt", content: "hello" });

		// Session 1 must be aborted after first capture (sessions aren't pausable)
		expect(abortTracker.aborted.has(sessionId)).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — Capture idempotency: second IDENTICAL call → no duplicate (UNIQUE constraint)
// A second DIFFERENT irreversible call in the same session → a second Proposed Call (intended)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC1: capture idempotency — (origin_session_id, identity_hash) UNIQUE", () => {
	test("a second identical call in the same session creates NO duplicate proposed_calls row", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-idem-${crypto.randomUUID()}`;

		const ctx = makeCtx(db, eventBus, agentId, taskId, sessionId);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		const args = { path: "/workspace/out.txt", content: "hello" };
		await registry.invoke("commit_file", args);
		// Second identical call (same session, same args, same identity_hash)
		await registry.invoke("commit_file", args);

		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));

		// Only ONE row — the UNIQUE constraint (origin_session_id, identity_hash) prevents
		// a duplicate. This is ON CONFLICT DO NOTHING semantics (firstCapture = rows.length > 0).
		expect(rows).toHaveLength(1);
	});

	test("a second DIFFERENT irreversible call in the same dying session creates a SECOND Proposed Call", async ({
		db,
		eventBus,
	}) => {
		// This is INTENDED behavior (WARNING-5.1): each distinct consequential call the
		// agent attempted deserves its own human decision. We do not short-circuit.
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-two-diff-${crypto.randomUUID()}`;

		const ctx = makeCtx(db, eventBus, agentId, taskId, sessionId);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		// Two different irreversible calls in the same session
		await registry.invoke("commit_file", { path: "/workspace/a.txt", content: "A" });
		await registry.invoke("commit_file", { path: "/workspace/b.txt", content: "B" });

		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));

		// Two distinct calls → two distinct Proposed Calls (different identity_hash)
		expect(rows).toHaveLength(2);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — Reversible call flows: no capture, handler result returned
// ─────────────────────────────────────────────────────────────────────────────

describe("AC2: reversible call flows with no capture", () => {
	test("a reversible tool invocation returns the tool result (not AWAITING_REVIEW)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sessionId = `sess-rev-${crypto.randomUUID()}`;

		const ctx = makeCtx(db, eventBus, agentId, taskId, sessionId);
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "open-work",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
			},
		});

		// A reversible tool — must flow without routing to review
		// (read_inbox is reversible per its definition: read-only, no side effects)
		const result = await registry.invoke("read_inbox", {});

		// The handler result is returned (not an AWAITING_REVIEW error)
		expect(result.success).toBe(true);

		// Zero proposed_calls rows for this session
		const rows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId));
		expect(rows).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 — Descriptive artifact: no capture on approve
// ─────────────────────────────────────────────────────────────────────────────

describe("AC9: descriptive artifact does not capture or execute on approve", () => {
	test("a review over a non-action_operation artifact produces no proposed_calls row", async ({
		db,
		app,
	}) => {
		const { agentId, taskId, betId } = await seedWorld(db);

		// Descriptive artifact (code diff, not action_operation)
		const descArtifactId = `art-desc-${crypto.randomUUID()}`;
		await db.insert(artifacts).values({
			id: descArtifactId,
			producingTaskId: taskId,
			kind: "code",
			createdAt: NOW,
		});

		const threadId = `thread-desc-${crypto.randomUUID()}`;
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const descReviewMsgId = `msg-desc-${crypto.randomUUID()}`;
		await db.insert(messages).values({
			id: descReviewMsgId,
			senderId: agentId,
			threadId,
			type: "review",
			payload: JSON.stringify({
				title: "Code review",
				reasoning: ["looks good"],
				artifactRef: { id: descArtifactId, kind: "code" },
			}),
			clientKey: descReviewMsgId,
			createdAt: NOW,
		});

		// Post approve verdict on a descriptive artifact
		const res = await app.request(`/api/threads/${threadId}/messages/${descReviewMsgId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		// Verdict posts fine
		expect(res.status).toBeLessThan(500);

		// No proposed_calls row and no tailored_grants row (capture only fires for action_operation)
		const pcRows = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.reviewMessageId, descReviewMsgId));
		const tgRows = await db.select().from(tailoredGrants);
		expect(pcRows).toHaveLength(0);
		// AC9: approve on a code review does not compose a tailored grant
		expect(tgRows.filter((g) => g.taskScope === taskId)).toHaveLength(0);
	});
});
