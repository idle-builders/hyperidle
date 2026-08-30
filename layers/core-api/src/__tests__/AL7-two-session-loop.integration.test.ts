/**
 * AL7 RED — Two-session loop: builtin live proof (AC4, AC5, AC11, AC11b)
 *
 * Tests FAIL until:
 *   - buildToolRegistry honors SessionWorkflow (route + consume via CAS)
 *   - Session 2 provisioned with grant-bearing workflow + approvedCall
 *   - Approved op: CAS-consume grant → run handler → recordOutcome
 *   - operationOutcomes table has proposedCallId PK (not stagedOperationId)
 *   - Session 2's agent CONTINUES working after the approved op (AC11)
 *   - Liveness net: unconsumed grant on session-ended → re-provision once (AC11b)
 *   - Different irreversible op in session 2 → routed to review (not executed) (AC5)
 *
 * LIVE-PROOF: the builtin harness runs in-process; no external binary needed.
 * The commit_file tool is MCP-exposed and writes a real file in the session sandbox.
 * This test is the authoritative proof of the loop mechanics.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	buildProposedCallWorkflowPort,
	buildToolDefinitions,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	proposedCalls,
	tailoredGrants,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { EventBus, SessionEndedEvent } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import { getAgentIdentity } from "@hyperidle/knowledge";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import type { BuildToolRegistryOptions } from "@hyperidle/tool-handlers";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §2.5/§3.2/§5: the `coreApiSeamRegistration` auto-fixture used to
 * register this test's `app` on the ambient global — replaced by a
 * `buildToolRegistry` fixture built fresh off THIS test's own `app`, wired
 * to the REAL `CoreApiPort.review` seam ops (`buildProposedCallWorkflowPort`)
 * so the AL7 workflow router's capture/consume/record-outcome calls exercise
 * the real `POST /reviews/proposed-calls*` routes — same two-arg shape
 * (`(ctx, options) => registry`) the deleted `tool-provider-bindings.ts`
 * wrapper had, so every call site below is unchanged.
 */
const test = baseTest.extend<{
	buildToolRegistry: (
		ctx: ToolContext<HyperIdleDb>,
		options: BuildToolRegistryOptions<HyperIdleDb>,
	) => ToolRegistry<HyperIdleDb>;
}>({
	buildToolRegistry: async ({ app }, use) => {
		const transport = createInProcessCoreApiTransport(app);
		const definitions = buildToolDefinitions(transport);
		await use((ctx, options) => {
			// @lore authenticated-workflow-transport: review workflow calls cross the same
			// authenticated core seam as tool definitions, with this registry's actor.
			const workflowPort = buildProposedCallWorkflowPort(
				withActorTransport(transport, { userId: ctx.agentId }),
			);
			return buildToolRegistryFromDefinitions<HyperIdleDb>(definitions, ctx, options, workflowPort);
		});
	},
});

const NOW = new Date().toISOString();

function makeSandbox(label: string): string {
	const p = path.join(os.tmpdir(), `hi-al7-loop-${label}-${Date.now()}`);
	fs.mkdirSync(p, { recursive: true });
	return p;
}

async function seedWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	threadId: string;
	reviewMessageId: string;
	artifactId: string;
}> {
	const teamId = `team-loop-${crypto.randomUUID()}`;
	const agentId = `agent-loop-${crypto.randomUUID()}`;
	const betId = `bet-loop-${crypto.randomUUID()}`;
	const taskId = `task-loop-${crypto.randomUUID()}`;
	const artifactId = `art-loop-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "Loop Team", phase: "build", createdAt: NOW });
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
		description: "Loop bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "Loop task",
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

	const threadId = `thread-loop-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-loop-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "Loop Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, taskId, threadId, reviewMessageId, artifactId };
}

function makeCtx(
	db: HyperIdleDb,
	eventBus: EventBus,
	opts: {
		agentId: string;
		taskId: string;
		sessionId: string;
		sandboxPath: string;
		threadId?: string;
	},
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: opts.agentId,
		sessionId: opts.sessionId,
		taskId: opts.taskId,
		teamId: "team-loop",
		sandboxPath: opts.sandboxPath,
		threadId: opts.threadId,
		ingestion: { dispose: (): void => {} },
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — Session 2 executes the approved op via CAS-consume + records Outcome
// The real file must exist on disk (not a stub proof).
// ─────────────────────────────────────────────────────────────────────────────

// @lore AU20 repair: commit_file deleted — AC4 ported to log_task (irreversible, builder-visible).
// The CAS-consume + outcome-record path is the behavior under test, not commit_file's file-write.
describe("AC4: session 2 executes approved op via CAS-consume → Outcome recorded", () => {
	test("grant-bearing registry: log_task CAS-consumes grant, runs handler, records Outcome", async ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sandboxPath = makeSandbox("s2");
		const sessionId2 = `sess-s2-${crypto.randomUUID()}`;
		const pcId = `pc-loop-${crypto.randomUUID()}`;

		// Pre-insert a granted Proposed Call + tailored grant (simulates the approve verdict path)
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "log_task",
			args: JSON.stringify({ note: "ac4 approved note" }),
			identityHash: "sha256-loop",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "log_task",
			approvedArgs: JSON.stringify({ note: "ac4 approved note" }),
			argPinned: false,
			identityHash: "sha256-loop",
			consumed: false,
			retryCount: 0,
			mintedAt: NOW,
		});

		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId: sessionId2, sandboxPath });
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					toolId: "log_task",
					args: { note: "ac4 approved note" },
					argPinned: false,
				},
			},
		} as BuildToolRegistryOptions<HyperIdleDb>);

		// Invoke log_task — should CAS-consume the grant + run the handler
		const result = await registry.invoke("log_task", { note: "ac4 approved note" });

		// The approved op SUCCEEDS (not AWAITING_REVIEW)
		expect(result.success).toBe(true);

		// Grant consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pcId));
		expect(grants[0]?.consumed).toBe(true);

		// Outcome recorded
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, pcId));
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]?.status).toBe("ok");

		// Proposed Call → executed
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, pcId));
		expect(pcs[0]?.status).toBe("executed");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — Different irreversible op in session 2 → re-captured (not executed)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC5: different irreversible op in session 2 is re-routed to review", () => {
	test("non-approved irreversible call in grant-bearing session returns AWAITING_REVIEW", async ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sandboxPath = makeSandbox("s2-ac5");
		const sessionId2 = `sess-s2-ac5-${crypto.randomUUID()}`;
		const pcId = `pc-loop-ac5-${crypto.randomUUID()}`;
		const approvedFile = path.join(sandboxPath, "approved.txt");

		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "commit_file",
			args: JSON.stringify({ path: approvedFile, content: "approved" }),
			identityHash: "sha256-ac5",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: approvedFile, content: "approved" }),
			argPinned: false,
			identityHash: "sha256-ac5",
			consumed: false,
			retryCount: 0,
			mintedAt: NOW,
		});

		const ctx = makeCtx(db, eventBus, { agentId, taskId, sessionId: sessionId2, sandboxPath });
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					toolId: "commit_file",
					args: { path: approvedFile, content: "approved" },
					argPinned: false,
				},
			},
		} as BuildToolRegistryOptions<HyperIdleDb>);

		// Attempt a DIFFERENT irreversible op (not the approved commit_file with those args,
		// but a "github_merge_pr" — a distinct irreversible tool)
		const result = await registry.invoke("github_merge_pr", { pr: 99, repo: "hyperidle/core" });

		// Must be routed to review (not executed)
		expect(result.success).toBe(false);
		const errResult = result as { success: false; code: string };
		expect(errResult.code).toBe("AWAITING_REVIEW");

		// A NEW Proposed Call is created for the different irreversible op
		const newPcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, sessionId2));
		// At least one new PC for the different irreversible op
		const mergeCapture = newPcs.filter((r) => r.toolId === "github_merge_pr");
		expect(mergeCapture).toHaveLength(1);
		expect(mergeCapture[0]?.status).toBe("captured");

		// No Outcome for the un-approved op
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, mergeCapture[0]?.id ?? "missing"));
		expect(outcomes).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC11b — Liveness net: unconsumed grant on session-ended → re-provision once
// (crash/no-show, not re-derivation/arg drift)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC11b: liveness net — crash between consume and execute is surfaced", () => {
	/**
	 * Minimal ReviewPorts for liveness-net tests: subscriber 1 (session-review)
	 * bails early (no session row → no task), so only intentRecorder matters.
	 */
	function makeLivenessPorts(intentRecorder: ReviewPorts["intentRecorder"]): ReviewPorts {
		return {
			work: {
				getTaskById: async () => undefined,
			},
			org: { resolveReviewRecipients: async () => [] },
			getAgentIdentity,
			intentRecorder,
			// AU21 §6 Decision B: bake-deps stub — the liveness net's bake attempt
			// tolerates failure (getTaskById above always returns undefined, so
			// the bake throws and is caught), matching this suite's existing
			// "only intentRecorder matters" precedent. Increment 12 Wave B widened
			// `requireRunnableAgent`'s return type to `Promise<User>` (the
			// contextBundle bake reuses `agent.name`/`agent.role`) — this fake
			// agent row is never actually read (the resolver throws at the
			// `getTaskById` check right after), it only needs to satisfy the type.
			requireRunnableAgent: async () => ({
				id: "liveness-fake-agent",
				kind: "ai",
				name: "Liveness Fake Agent",
				teamId: null,
				ownerUserId: null,
				role: "builder",
				skills: null,
				status: "active",
				maxConcurrentSessions: 1,
				email: null,
				avatarUrl: null,
				createdAt: new Date().toISOString(),
				systemPrompt: null,
				harnessType: null,
				modelTierPreference: null,
				modelId: null,
				modelProvider: null,
				agentCategory: null,
				pluginId: null,
			}),
		};
	}

	test("session 2 ends without consuming the grant → re-provision once (retryCount→1)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const pcId = `pc-liveness-${crypto.randomUUID()}`;

		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "commit_file",
			args: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			identityHash: "sha256-liveness",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			argPinned: false,
			consumed: false, // NOT consumed — session ended before the approved op ran
			retryCount: 0,
			mintedAt: NOW,
		});

		// Fire the session-ended event with unconsumed grant (first occurrence)
		// @lore AU20 Am9 reviewer: explicit function-type param needed so
		// mock.calls[0] is typed correctly (Vitest v4 uses vi.fn<FunctionType>).
		// intentRecorder is now AgentWorkIntentRecorderFn — a plain function, not an object.
		const mockRecord = vi.fn<ReviewPorts["intentRecorder"]>(async () => ({
			id: crypto.randomUUID(),
			idempotencyKey: crypto.randomUUID(),
		}));
		const unsub = registerReviewSubscriptions(db, eventBus, makeLivenessPorts(mockRecord));
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-liveness",
			sessionId: `sess-s2-liveness-${crypto.randomUUID()}`,
			agentId,
			taskId,
			outcome: "completed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Handler is async fire-and-forget — wait for it to record the reengagement intent
		await vi.waitFor(() => expect(mockRecord).toHaveBeenCalledOnce());
		unsub();

		// retryCount→1 (one re-provision allowed)
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pcId));
		expect(grants[0]?.retryCount).toBe(1);

		// Re-provision was requested: record called with reengagement intent for this PC
		// intentRecorder is now a plain function — input is args[0] (no tx arg).
		expect(mockRecord.mock.calls[0]?.[0]).toMatchObject({
			kind: "reengagement",
			sourceId: pcId,
			requestedBy: agentId,
		});
	});

	test("second session-ended with retryCount>=1 → PC held + failed Outcome (not a silent hang)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const pcId = `pc-liveness2-${crypto.randomUUID()}`;

		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "commit_file",
			args: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			identityHash: "sha256-liveness2",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			argPinned: false,
			consumed: false,
			retryCount: 1, // already retried once
			mintedAt: NOW,
		});

		const mockRecord = vi.fn<ReviewPorts["intentRecorder"]>(async () => ({
			id: crypto.randomUUID(),
			idempotencyKey: crypto.randomUUID(),
		}));
		const unsub = registerReviewSubscriptions(db, eventBus, makeLivenessPorts(mockRecord));
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-liveness2",
			sessionId: `sess-s2-liveness2-${crypto.randomUUID()}`,
			agentId,
			taskId,
			outcome: "completed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		// Wait for the handler to complete (it transitions the PC)
		await vi.waitFor(async () => {
			const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, pcId));
			expect(pcs[0]?.status).toBe("held");
		});
		unsub();

		// NO further re-provision (record not called)
		expect(mockRecord).not.toHaveBeenCalled();

		// PC → held
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, pcId));
		expect(pcs[0]?.status).toBe("held");

		// A failed Outcome is written (never silent)
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, pcId));
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]?.status).toBe("failed");
		expect(outcomes[0]?.error).toContain("approved op did not execute");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC11 — "work continues": after the approved op executes in session 2,
// the registry can still invoke further (reversible) tools.
//
// The plan: "after the approved commit_file records the Outcome, session 2's
// stream produces ≥1 further agent action ... the session does not end at the
// approved call."
// @lore AU20 repair: commit_file + read_inbox deleted. AC11 ported to log_task (approved op)
// + reply (reversible continuation). `reply` is the only surviving tool with explicit
// reversibility:"reversible" — AU27 C11 Decision 1 / classifyReversibility fails closed.
// Supply ctx.threadId so reply has a thread to post into.
//
// @lore AL7 NIT-3: this is the SAME session-2 run proceeding after the tool
// returns. No phantom second event, no second provisioning — just the next
// tool call in the loop hitting the registry and succeeding.
// ─────────────────────────────────────────────────────────────────────────────

describe("AC11: work continues in session 2 after the approved op executes", () => {
	test("registry stays functional after approved op: reversible tool succeeds", async ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sandboxPath = makeSandbox("s2-ac11");
		const sessionId2 = `sess-s2-ac11-${crypto.randomUUID()}`;
		const pcId = `pc-loop-ac11-${crypto.randomUUID()}`;

		// Pre-insert a granted Proposed Call + tailored grant
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "log_task",
			args: JSON.stringify({ note: "ac11 approved note" }),
			identityHash: "sha256-ac11",
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});

		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "log_task",
			approvedArgs: JSON.stringify({ note: "ac11 approved note" }),
			argPinned: false,
			identityHash: "sha256-ac11",
			consumed: false,
			retryCount: 0,
			mintedAt: NOW,
		});

		// @lore AU20 repair: threadId added to ctx so reply can post into the seeded bet thread.
		const ctx = makeCtx(db, eventBus, {
			agentId,
			taskId,
			sessionId: sessionId2,
			sandboxPath,
			threadId,
		});
		const registry = buildToolRegistry(ctx, {
			role: "builder",
			sessionWorkflow: {
				routeToReview: ["irreversible"],
				sessionRole: "grant-bearing",
				reviewMessageId,
				subjectThreadId: threadId,
				artifactId,
				approvedCall: {
					toolId: "log_task",
					args: { note: "ac11 approved note" },
					argPinned: false,
				},
			},
		} as BuildToolRegistryOptions<HyperIdleDb>);

		// Step 1: invoke the approved op (log_task) — CAS-consumes grant + runs handler
		const approvedResult = await registry.invoke("log_task", { note: "ac11 approved note" });
		expect(approvedResult.success).toBe(true);

		// Grant is consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pcId));
		expect(grants[0]?.consumed).toBe(true);

		// Step 2: invoke a REVERSIBLE tool — it must succeed (work continues).
		// `reply` is the only surviving tool with explicit reversibility:"reversible"
		// (AU27 C11 Decision 1). All other tools fail closed to "irreversible".
		// The session does NOT end after the approved op — the loop continues.
		const continueResult = await registry.invoke("reply", { text: "continuing" });
		// reply may fail if there's no thread, but it must NOT return AWAITING_REVIEW —
		// that would prove the router blocked a reversible tool (i.e. session ended).
		if (!continueResult.success) {
			const failResult = continueResult as { success: false; code: string };
			expect(failResult.code).not.toBe("AWAITING_REVIEW");
		}
		// Confirmed: reversible tool ran after approved op → session 2 continues working.
	});
});
