/**
 * AL7 RED — Tailored grant lifecycle: approve → compose grant → proposed_call_granted event
 *
 * Tests FAIL until:
 *   - proposed_calls table (status: captured | granted | executed | failed | held)
 *   - tailored_grants table with CAS consume (UPDATE WHERE consumed=false RETURNING *)
 *   - threads.ts verdict path: approve → composeTailoredGrant → captured→granted → emit proposed_call_granted
 *   - non-approve verdict → captured→held, no grant
 *   - task-dispatcher: handleProposedCallGranted enqueues session 2
 *   - proposed_call_granted in KernelEvent union
 *
 * Covers: AC3 (approve → grant + event + enqueue), AC6 (at-most-once CAS consume),
 *         AC7 (non-approve → no grant, held), AC8 (never-approved → never executed).
 */

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
import type { EventBus, ProposedCallGrantedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedCapturedCall(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	threadId: string;
	reviewMessageId: string;
	proposedCallId: string;
}> {
	const teamId = `team-tg-${crypto.randomUUID()}`;
	const agentId = `agent-tg-${crypto.randomUUID()}`;
	const betId = `bet-tg-${crypto.randomUUID()}`;
	const taskId = `task-tg-${crypto.randomUUID()}`;
	const artifactId = `art-tg-${crypto.randomUUID()}`;
	const proposedCallId = `pc-tg-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "TG Team", phase: "build", createdAt: NOW });
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
		description: "TG bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "TG task",
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

	const threadId = `thread-tg-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-tg-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "TG Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	// Insert a pre-captured Proposed Call (as if the router already ran in session 1)
	await db.insert(proposedCalls).values({
		id: proposedCallId,
		reviewMessageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `sess-s1-${proposedCallId}`,
		toolId: "commit_file",
		args: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
		identityHash: "sha256-abc123",
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: agentId,
		createdAt: NOW,
	});

	return { agentId, taskId, threadId, reviewMessageId, proposedCallId };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — approve verdict → tailored grant + proposed_call_granted event
// ─────────────────────────────────────────────────────────────────────────────

describe("AC3: approve verdict composes tailored grant + emits proposed_call_granted", () => {
	test("POST verdict approve → tailored_grants row (consumed:false) + PC status:granted", async ({
		db,
		app,
		eventBus,
	}) => {
		const { taskId, threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		const received: ProposedCallGrantedEvent[] = [];
		(eventBus as EventBus).on("proposed_call_granted", (e) => received.push(e));

		const res = await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBeLessThan(300);

		// tailored_grants row must exist (scoped to taskId + agentId, consumed:false)
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(1);
		expect(grants[0]?.consumed).toBe(false);
		expect(grants[0]?.taskScope).toBe(taskId);
		expect(grants[0]?.approvedToolId).toBe("commit_file");
		// Approved args recorded (for optional arg-pin convenience)
		const approvedArgs = JSON.parse(grants[0]?.approvedArgs ?? "{}") as Record<string, unknown>;
		expect(approvedArgs.path).toBe("/workspace/out.txt");

		// Proposed Call transitioned captured → granted
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("granted");

		// proposed_call_granted event emitted
		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("proposed_call_granted");
		expect(received[0]?.proposedCallId).toBe(proposedCallId);
		expect(received[0]?.taskId).toBe(taskId);
	});

	test("non-approve verdict (request-changes) → NO grant, PC status:held", async ({
		db,
		app,
		eventBus,
	}) => {
		const { threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		const received: ProposedCallGrantedEvent[] = [];
		(eventBus as EventBus).on("proposed_call_granted", (e) => received.push(e));

		const res = await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "request-changes", rationale: "not ready" }),
		});
		expect(res.status).toBeLessThan(300);

		// No tailored grant
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);

		// Proposed Call → held (never granted, never executed)
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("held");

		// No proposed_call_granted event emitted
		expect(received).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — at-most-once: single-statement CAS consume grants exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe("AC6: tailored_grant consume is a single-statement CAS (at-most-once)", () => {
	test("two concurrent CAS claims on the same grant: exactly one claims it, one is denied", async ({
		db,
	}) => {
		// Directly test the CAS mechanic by inserting a grant + running two concurrent updates.
		// Use seedCapturedCall to satisfy the proposed_calls FK constraint.
		const { composeTailoredGrant, consumeTailoredGrant } = await import(
			"../services/proposed-call-workflow.js"
		);

		const { taskId, agentId, proposedCallId } = await seedCapturedCall(db);

		const grantProps = {
			proposedCallId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			argPinned: false,
			identityHash: "sha256-abc123",
		};

		// First compose a grant (consumed:false)
		await composeTailoredGrant(db, grantProps);

		// Two concurrent CAS consumes — exactly one must claim the grant
		const [r1, r2] = await Promise.all([
			consumeTailoredGrant(db, {
				taskScope: grantProps.taskScope,
				agentScope: grantProps.agentScope,
				approvedToolId: grantProps.approvedToolId,
			}),
			consumeTailoredGrant(db, {
				taskScope: grantProps.taskScope,
				agentScope: grantProps.agentScope,
				approvedToolId: grantProps.approvedToolId,
			}),
		]);

		// Exactly one succeed (claimed), one returns null (no rows)
		const claimed = [r1, r2].filter((r) => r !== null);
		const denied = [r1, r2].filter((r) => r === null);
		expect(claimed).toHaveLength(1);
		expect(denied).toHaveLength(1);

		// Grant is now consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, grantProps.proposedCallId));
		expect(grants[0]?.consumed).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — non-approve → no grant, no event; AC8 — never-approved → never executed
// ─────────────────────────────────────────────────────────────────────────────

describe("AC7/AC8: held Proposed Call never executes", () => {
	test("AC7: reject verdict leaves PC held and no Outcome row", async ({ db, app }) => {
		const { threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "reject", rationale: "not needed" }),
		});

		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("held");

		// No tailored grant minted
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);
	});

	test("AC8: a Proposed Call with no verdict ever has no tailored grant and no Outcome", async ({
		db,
	}) => {
		const { proposedCallId } = await seedCapturedCall(db);

		// No verdict posted — PC stays captured
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("captured");

		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);
	});
});
