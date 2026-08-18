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
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { SessionEndedEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import { buildToolRegistry as buildToolRegistryFromDefinitions } from "@hyperidle/tool-handlers";
import type { BuildToolRegistryOptions, ToolContext, ToolRegistry } from "@hyperidle/tool-protocol";
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
	opts: { agentId: string; taskId: string; sessionId: string; sandboxPath: string },
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: opts.agentId,
		sessionId: opts.sessionId,
		taskId: opts.taskId,
		teamId: "team-loop",
		sandboxPath: opts.sandboxPath,
		ingestion: { dispose: (): void => {} },
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — Session 2 executes the approved op via CAS-consume + records Outcome
// The real file must exist on disk (not a stub proof).
// ─────────────────────────────────────────────────────────────────────────────

describe("AC4: session 2 executes approved commit_file via CAS-consume → Outcome + file on disk", () => {
	test("grant-bearing registry: commit_file CAS-consumes grant, writes file, records Outcome", async ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sandboxPath = makeSandbox("s2");
		const sessionId2 = `sess-s2-${crypto.randomUUID()}`;
		const pcId = `pc-loop-${crypto.randomUUID()}`;
		const outputFile = path.join(sandboxPath, "result.txt");

		// Pre-insert a granted Proposed Call + tailored grant (simulates the approve verdict path)
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "commit_file",
			args: JSON.stringify({ path: outputFile, content: "hello from approved op" }),
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
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: outputFile, content: "hello from approved op" }),
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
					toolId: "commit_file",
					args: { path: outputFile, content: "hello from approved op" },
					argPinned: false,
				},
			},
		} as BuildToolRegistryOptions<HyperIdleDb>);

		// Invoke commit_file — should CAS-consume the grant + run the handler
		const result = await registry.invoke("commit_file", {
			path: outputFile,
			content: "hello from approved op",
		});

		// The approved op SUCCEEDS (not AWAITING_REVIEW)
		expect(result.success).toBe(true);

		// AC4: the real file must exist on disk (not a stub)
		expect(fs.existsSync(outputFile)).toBe(true);
		const fileContent = fs.readFileSync(outputFile, "utf8");
		expect(fileContent).toBe("hello from approved op");

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
				updateTaskById: async () => {},
				createItem: async () => {},
			},
			conversation: {
				insertThread: async () => {},
				updateThread: async () => {},
				getThreadById: async () => undefined,
			},
			users: { getUserById: async () => undefined, listUsersByKind: async () => [] },
			org: { resolveReviewRecipients: async () => [] },
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
				systemPromptPath: null,
				teamId: null,
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
		// mock.calls[0] is typed as [WriteExecutor, ReviewAgentWorkIntentInput]
		// (Vitest v4 uses vi.fn<FunctionType> not vi.fn<Args, Return>).
		const mockRecord = vi.fn<ReviewPorts["intentRecorder"]["record"]>(async () => ({
			id: crypto.randomUUID(),
			idempotencyKey: crypto.randomUUID(),
		}));
		const unsub = registerReviewSubscriptions(
			db,
			eventBus,
			makeLivenessPorts({ record: mockRecord }),
		);
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
		expect(mockRecord.mock.calls[0]?.[1]).toMatchObject({
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

		const mockRecord = vi.fn<ReviewPorts["intentRecorder"]["record"]>(async () => ({
			id: crypto.randomUUID(),
			idempotencyKey: crypto.randomUUID(),
		}));
		const unsub = registerReviewSubscriptions(
			db,
			eventBus,
			makeLivenessPorts({ record: mockRecord }),
		);
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
//
// For the builtin in-process proof: after registry.invoke("commit_file")
// CAS-consumes the grant and returns success, a subsequent call to a
// REVERSIBLE tool (e.g. write_session_notes) ALSO succeeds — proving the
// registry/session does not terminate after the approved op.
//
// @lore AL7 NIT-3: this is the SAME session-2 run proceeding after the tool
// returns. No phantom second event, no second provisioning — just the next
// tool call in the loop hitting the registry and succeeding.
// ─────────────────────────────────────────────────────────────────────────────

describe("AC11: work continues in session 2 after the approved op executes", () => {
	test("registry stays functional after approved commit_file: reversible tool succeeds", async ({
		db,
		eventBus,
		buildToolRegistry,
	}) => {
		const { agentId, taskId, threadId, reviewMessageId, artifactId } = await seedWorld(db);
		const sandboxPath = makeSandbox("s2-ac11");
		const sessionId2 = `sess-s2-ac11-${crypto.randomUUID()}`;
		const pcId = `pc-loop-ac11-${crypto.randomUUID()}`;
		const outputFile = path.join(sandboxPath, "ac11-result.txt");

		// Pre-insert a granted Proposed Call + tailored grant
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `sess-s1-${pcId}`,
			toolId: "commit_file",
			args: JSON.stringify({ path: outputFile, content: "AC11 approved content" }),
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
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: outputFile, content: "AC11 approved content" }),
			argPinned: false,
			identityHash: "sha256-ac11",
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
					args: { path: outputFile, content: "AC11 approved content" },
					argPinned: false,
				},
			},
		} as BuildToolRegistryOptions<HyperIdleDb>);

		// Step 1: invoke the approved op (commit_file) — CAS-consumes grant + writes file
		const approvedResult = await registry.invoke("commit_file", {
			path: outputFile,
			content: "AC11 approved content",
		});
		expect(approvedResult.success).toBe(true);
		expect(fs.existsSync(outputFile)).toBe(true);

		// Grant is consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pcId));
		expect(grants[0]?.consumed).toBe(true);

		// Step 2: invoke a REVERSIBLE tool — it must succeed (work continues).
		// read_inbox is explicitly reversibility:"reversible" so the workflow router
		// lets it flow without routing it to review.
		// The session does NOT end after the approved op — the loop continues.
		//
		// @lore AL7 AC11: read_inbox is chosen because it is the only tool in
		// ALL_TOOL_DEFINITIONS with explicit reversibility:"reversible" annotation.
		// Any tool without an annotation defaults to irreversible (fail-closed),
		// which would make this test prove nothing if we chose a non-annotated tool.
		const continueResult = await registry.invoke("read_inbox", { limit: 5 });
		// read_inbox may fail in a test environment (no real inbox data) but it must
		// NOT return AWAITING_REVIEW — that would mean the registry routed a reversible
		// tool to review, which would prove the session ended at the approved call.
		if (!continueResult.success) {
			// Allowed: tool handler error (empty DB, etc.) — the handler ran, loop continues.
			// Forbidden: AWAITING_REVIEW — the router blocked a reversible tool.
			const failResult = continueResult as { success: false; code: string };
			expect(failResult.code).not.toBe("AWAITING_REVIEW");
		}
		// Confirmed: reversible tool ran after approved op → session 2 continues working.
	});
});
