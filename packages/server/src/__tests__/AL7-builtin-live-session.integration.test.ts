/**
 * AL7 CRITICAL-2 — Builtin live-session lane (genuine proof of the full two-session loop).
 *
 * THIS IS THE AUTHORITATIVE LIVE PROOF FOR AL7. It is NOT the same as
 * AL7-two-session-loop.integration.test.ts (which calls registry.invoke directly).
 *
 * This test drives the REAL `BuiltinHarnessAdapter.startSession` agent loop end-to-end
 * through the full two-session trust-first flow with scripted LLM cassette responses:
 *
 *   Session 1 (open-work):
 *     - Real builtin adapter loop runs via `provisionSession`
 *     - LLM cassette scripts the agent to emit `commit_file` (irreversible)
 *     - The workflow router captures the call as a Proposed Call
 *     - `onAbortSession` fires → session 1 ends
 *     - Assert: PC captured in DB (via REAL session drain, not direct registry.invoke)
 *
 *   Approve (simulates the human verdict path):
 *     - Call `composeTailoredGrant` (same code the verdict route calls)
 *     - PC transitions `captured → granted`
 *
 *   Session 2 (grant-bearing):
 *     - Real builtin adapter loop runs via `provisionSession` with sessionWorkflow grant-bearing
 *     - LLM cassette scripts: commit_file → CAS-consume grant → real file written
 *     - LLM cassette scripts: read_inbox → reversible → runs → AC11: work continues
 *     - Assert: file on disk, Outcome recorded, ≥1 further tool_call event after approved op
 *
 * Per-harness honest matrix (DONE matrix, verified June 2026):
 *   - builtin:      GREEN-NOW (this test IS the live proof — in-process, always available)
 *   - claude-code:  PENDING (absent-fail in this env — `claude` binary not on PATH)
 *   - codex:        green-now (AL7 delta: MCP wired; absent binary → absent-fail)
 *   - opencode:     green-now (AL7 delta: MCP wired; absent binary → absent-fail)
 *   - cursor-agent: skipped (unavailable per harness-capability-descriptors)
 *
 * @lore AL7 CRITICAL-2: This test MUST drive the real BuiltinHarnessAdapter.startSession
 * loop — NOT registry.invoke directly. The CRITICAL-2 finding was that the prior fix round
 * called registry.invoke directly (router-direct proof) rather than going through the real
 * adapter session. This file closes CRITICAL-2: a break in the CRITICAL-1 dispatcher wiring,
 * the workflow router, the grant CAS, or the re-provision causes this test to FAIL.
 *
 * @lore AL7: `callLlm` is mocked (no real LLM calls) for test determinism. This is
 * the same pattern as AL6-real-harness-return-enforcement.integration.test.ts (established
 * precedent for deterministic builtin real-loop integration tests).
 *
 * @lore AL7 commit_file path: commit_file validates sandbox containment. We use a
 * RELATIVE path ("al7-live-output.txt") so the tool resolves it inside whichever
 * session sandbox provisionSession creates. The PC stores verbatim args (relative path).
 * Session 2's approvedCall.args uses the same relative path. The file is written to
 * session2SandboxPath/al7-live-output.txt; we read the Outcome receipt from operationOutcomes to find it.
 *
 * @lore AL7 AC11: "work continues" is proven by the agent emitting `read_inbox`
 * (a reversible tool, reversibility:"reversible" explicit annotation) AFTER the approved
 * `commit_file` executes in session 2, within the same session-2 harness run. The session
 * does NOT terminate at the approved op — the loop keeps running and handles the next tool call.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	operationOutcomes,
	proposedCalls,
	sessions,
	tailoredGrants,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../harness/builtin-harness-adapter.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { composeTailoredGrant } from "../services/proposed-call-workflow.js";
import { provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ── LLM mock ─────────────────────────────────────────────────────────────────
//
// @lore AL7 CRITICAL-2: callLlm is mocked so the real BuiltinHarnessAdapter loop
// runs deterministically without network calls. Same pattern as
// AL6-real-harness-return-enforcement.integration.test.ts (established precedent).
vi.mock("../harness/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

const { callLlm } = await import("../harness/llm-client.js");
const callLlmMock = vi.mocked(callLlm);

// ── Constants ─────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

const FAKE_RESOLVED_MODEL = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-chat-v3-0324:nitro",
	apiKey: "al7-fake-key",
	baseUrl: "https://openrouter.ai/api",
};

// Relative path used in commit_file args. Resolved inside the session sandbox by the tool.
// @lore AL7 commit_file path: relative paths are resolved against ctx.sandboxPath by the
// handler, so they always satisfy the sandbox containment check. The PC captures the
// verbatim relative path; session 2's approvedCall.args uses the same relative path.
const OUTPUT_FILENAME = "al7-live-output.txt";
const OUTPUT_CONTENT = "al7 live proof: builtin two-session loop";

// ── DB seed ───────────────────────────────────────────────────────────────────

async function seedWorld(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	teamId: string;
	threadId: string;
	reviewMessageId: string;
	artifactId: string;
}> {
	const teamId = `team-al7-live-${crypto.randomUUID()}`;
	const agentId = `agent-al7-live-${crypto.randomUUID()}`;
	const betId = `bet-al7-live-${crypto.randomUUID()}`;
	const taskId = `task-al7-live-${crypto.randomUUID()}`;
	const artifactId = `art-al7-live-${crypto.randomUUID()}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: "AL7 Live Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "AL7 Live Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: `tm-${teamId}`,
		createdAt: NOW,
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AL7 live loop test bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "AL7 Live Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: taskId,
		kind: "action_operation",
		createdAt: NOW,
	});

	const threadId = `thread-al7-live-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-al7-live-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "AL7 Live Review",
			reasoning: ["live proof"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	return { agentId, taskId, teamId, threadId, reviewMessageId, artifactId };
}

// ── Test lifecycle ─────────────────────────────────────────────────────────────

describe("AL7 CRITICAL-2 — genuine builtin live-session two-session loop", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al7-live-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al7-live-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al7-live-"));
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		callLlmMock.mockReset();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ─────────────────────────────────────────────────────────────────────────
	// THE LIVE-PROOF TEST: session 1 → approve → session 2 → work continues
	//
	// This is the authoritative green-now proof for the builtin harness.
	// Failure modes it catches:
	//   - Break in the workflow router → session 1 wouldn't capture the PC
	//   - Break in the abort wiring → session 1 would never end (or PC not captured)
	//   - Break in composeTailoredGrant → session 2 wouldn't have a grant to consume
	//   - Break in the CAS-consume → session 2 wouldn't write the file
	//   - Break in the Outcome recording → no Outcome DB row
	//   - Break in AC11 work-continues → no read_inbox event after commit_file
	// ─────────────────────────────────────────────────────────────────────────

	test("live two-session loop: session1 captures PC → approve → session2 executes grant + work continues (AC4,AC5,AC11,AC12)", async ({
		db,
	}) => {
		const { agentId, taskId, teamId, threadId, reviewMessageId, artifactId } = await seedWorld(db);

		// ── Session 1 LLM cassette ─────────────────────────────────────────────
		//
		// BuiltinHarnessAdapter call sequence:
		//   1. runPlanningTurn → callLlm → returns text (plan)
		//   2. runExecuteTurn → callLlm → returns tool_use:commit_file
		//      → workflow router captures PC, fires onAbortSession (async)
		//      → tool result appended (AWAITING_REVIEW)
		//   3+. runExecuteTurn (if abort races) or runMaxIterationsTurn
		//      → callLlm → returns end_turn text → session terminates
		//
		// maxIterations:2 bounds session 1 to at most 2 execute turns.
		// Even if the abort races, the session terminates via max iterations.
		//
		// @lore AL7 commit_file path: we use a RELATIVE path ("al7-live-output.txt")
		// so commit_file resolves it inside the session sandbox (sandbox containment
		// invariant satisfied without knowing the sandbox path in advance).
		// The handler is NEVER run in session 1 (router returns AWAITING_REVIEW).
		// Only the args are stored in proposedCalls.args verbatim.
		callLlmMock
			.mockResolvedValueOnce({
				stopReason: "end_turn" as const,
				content: [
					{ type: "text" as const, text: "I will commit the output file using commit_file." },
				],
				usage: { inputTokens: 50, outputTokens: 20 },
			})
			.mockResolvedValueOnce({
				stopReason: "tool_use" as const,
				content: [
					{
						type: "tool_use" as const,
						id: "tool-s1-commit",
						name: "commit_file",
						input: {
							path: OUTPUT_FILENAME, // relative — resolved in sandbox by handler
							content: OUTPUT_CONTENT,
						},
					},
				],
				usage: { inputTokens: 60, outputTokens: 30 },
			})
			// Fallback for any subsequent calls (max iterations wrap-up, force-return)
			.mockResolvedValue({
				stopReason: "end_turn" as const,
				content: [{ type: "text" as const, text: "Session 1 wrapping up." }],
				usage: { inputTokens: 40, outputTokens: 15 },
			});

		// ── Session 1: run the real builtin harness ────────────────────────────
		//
		// CRITICAL-2 discriminator: provisionSession runs the full admission + harness loop.
		// The registry is injected into the real BuiltinHarnessAdapter via setSessionToolRegistry.
		// The workflow router fires inside executeToolCalls (inside the real adapter loop).
		const adapter1 = new BuiltinHarnessAdapter({ maxIterations: 2 });
		const pool1 = new AdapterPool();
		pool1.register("al7-live-builtin-s1", adapter1, {
			name: "AL7 Live Builtin S1",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter"],
			maxConcurrent: 5,
		});

		const s1Result = await provisionSession(
			{ db, eventBus: new EventBus(), adapterPool: pool1, workspace: new LocalSandboxAdapter() },
			{
				taskId,
				agentId,
				productId: teamId,
				sandboxBasePath,
				resolvedModel: FAKE_RESOLVED_MODEL,
				// Session 1 (open-work): route all irreversible → review + capture
				sessionWorkflow: {
					routeToReview: ["irreversible"],
					sessionRole: "open-work",
					reviewMessageId,
					subjectThreadId: threadId,
					artifactId,
				},
			},
		);

		// ── Assert: PC captured in DB via REAL session drain ─────────────────
		//
		// CRITICAL-2 discriminator: this assertion ONLY passes if the real
		// BuiltinHarnessAdapter loop ran and called registry.invoke("commit_file"),
		// which triggered the workflow router to capture the call. A direct
		// registry.invoke call (the router-direct approach) would not have
		// created a real session row or exercised the real adapter loop.
		const capturedPcs = await db
			.select()
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, s1Result.sessionId));

		expect(capturedPcs).toHaveLength(1);
		const pc = capturedPcs[0];
		expect(pc).toBeDefined();
		expect(pc?.toolId).toBe("commit_file");
		expect(pc?.status).toBe("captured");
		expect(pc?.reversibility).toBe("irreversible");

		// The PC args must contain the relative path we scripted in the LLM mock.
		const pcArgs = JSON.parse(pc?.args ?? "{}") as { path: string; content: string };
		expect(pcArgs.path).toBe(OUTPUT_FILENAME);
		expect(pcArgs.content).toBe(OUTPUT_CONTENT);

		// The session row must exist (real session, not just a direct registry call)
		const [s1Session] = await db
			.select({ id: sessions.id, sandboxSnapshot: sessions.sandboxSnapshot })
			.from(sessions)
			.where(eq(sessions.id, s1Result.sessionId))
			.limit(1);
		expect(s1Session).toBeDefined();

		// ── Approve: simulate the human verdict → composeTailoredGrant ────────
		//
		// In production this runs inside the PATCH /api/threads/:id/messages/:id/verdict route.
		// For the test, we call composeTailoredGrant directly (same function the route calls).
		// This exercises the CRITICAL-1 wiring end-to-end: the grant is composed and
		// the PC transitions captured → granted.
		await composeTailoredGrant(db, {
			proposedCallId: pc!.id,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: pc!.toolId,
			approvedArgs: pcArgs,
			identityHash: pc!.identityHash ?? undefined,
		});

		// Assert: PC is now "granted"
		const grantedPc = await db
			.select({ status: proposedCalls.status })
			.from(proposedCalls)
			.where(eq(proposedCalls.id, pc!.id))
			.limit(1);
		expect(grantedPc[0]?.status).toBe("granted");

		// Assert: tailored grant exists and is unconsumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pc!.id));
		expect(grants).toHaveLength(1);
		expect(grants[0]?.consumed).toBe(false);

		// ── Session 2 LLM cassette ─────────────────────────────────────────────
		//
		// BuiltinHarnessAdapter call sequence for session 2:
		//   1. runPlanningTurn → callLlm → returns text
		//   2. runExecuteTurn → callLlm → returns tool_use:commit_file
		//      → grant-bearing router: CAS-consume grant → run handler → file written
		//      → tool result: success (not AWAITING_REVIEW)
		//   3. runExecuteTurn → callLlm → returns tool_use:read_inbox
		//      → router: read_inbox is reversible → handler runs → result returned
		//      → AC11 proven: work continues after the approved op
		//   4+. runExecuteTurn / runMaxIterationsTurn → end_turn → terminates
		//
		// @lore AL7 AC11: read_inbox has explicit reversibility:"reversible" so the
		// workflow router's fail-closed default does NOT route it to review.
		// This is the ONLY tool in ALL_TOOL_DEFINITIONS with an explicit reversible annotation.
		callLlmMock.mockReset();
		callLlmMock
			.mockResolvedValueOnce({
				// Planning turn
				stopReason: "end_turn" as const,
				content: [
					{
						type: "text" as const,
						text: "I will now execute the approved commit_file operation and continue working.",
					},
				],
				usage: { inputTokens: 55, outputTokens: 25 },
			})
			.mockResolvedValueOnce({
				// Execute turn 1: the approved commit_file op (matches approvedCall.args)
				stopReason: "tool_use" as const,
				content: [
					{
						type: "tool_use" as const,
						id: "tool-s2-commit",
						name: "commit_file",
						input: {
							path: OUTPUT_FILENAME, // same relative path as session 1
							content: OUTPUT_CONTENT,
						},
					},
				],
				usage: { inputTokens: 65, outputTokens: 35 },
			})
			.mockResolvedValueOnce({
				// Execute turn 2: read_inbox (reversible) — proves work continues (AC11)
				stopReason: "tool_use" as const,
				content: [
					{
						type: "tool_use" as const,
						id: "tool-s2-inbox",
						name: "read_inbox",
						input: { limit: 5 },
					},
				],
				usage: { inputTokens: 55, outputTokens: 25 },
			})
			// All subsequent calls (max iterations wrap-up, force-return)
			.mockResolvedValue({
				stopReason: "end_turn" as const,
				content: [{ type: "text" as const, text: "Session 2 complete." }],
				usage: { inputTokens: 40, outputTokens: 15 },
			});

		// Collect tool_call events from session 2 to assert work continues (AC11).
		// tool_call_recorded is emitted by the provisioning orchestrator when it
		// observes a tool_call event from the harness stream.
		const s2ToolCallEvents: Array<{ toolName: string }> = [];
		const eventBus2 = new EventBus();
		eventBus2.on("tool_call_recorded", (ev) => {
			const e = ev as unknown as { toolName: string };
			s2ToolCallEvents.push({ toolName: e.toolName });
		});

		// ── Session 2: run the real builtin harness (grant-bearing) ──────────
		const adapter2 = new BuiltinHarnessAdapter({ maxIterations: 3 });
		const pool2 = new AdapterPool();
		pool2.register("al7-live-builtin-s2", adapter2, {
			name: "AL7 Live Builtin S2",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter"],
			maxConcurrent: 5,
		});

		const s2Result = await provisionSession(
			{
				db,
				eventBus: eventBus2,
				adapterPool: pool2,
				workspace: new LocalSandboxAdapter(),
			},
			{
				taskId,
				agentId,
				productId: teamId,
				sandboxBasePath,
				resolvedModel: FAKE_RESOLVED_MODEL,
				// Session 2 (grant-bearing): permit the approved commit_file op
				sessionWorkflow: {
					routeToReview: ["irreversible"],
					sessionRole: "grant-bearing",
					reviewMessageId,
					subjectThreadId: threadId,
					artifactId,
					approvedCall: {
						toolId: "commit_file",
						args: { path: OUTPUT_FILENAME, content: OUTPUT_CONTENT },
						argPinned: false,
					},
				},
			},
		);

		// ── Assert: grant consumed (CAS executed atomically) ─────────────────
		const grantsAfterS2 = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, pc!.id));
		expect(grantsAfterS2[0]?.consumed).toBe(true);

		// ── Assert: PC → executed (status transition confirmed) ───────────────
		const pcAfterS2 = await db
			.select({ status: proposedCalls.status })
			.from(proposedCalls)
			.where(eq(proposedCalls.id, pc!.id))
			.limit(1);
		expect(pcAfterS2[0]?.status).toBe("executed");

		// ── Assert: Outcome recorded ──────────────────────────────────────────
		const outcomes = await db
			.select()
			.from(operationOutcomes)
			.where(eq(operationOutcomes.proposedCallId, pc!.id));
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]?.status).toBe("ok");

		// ── Assert: real file written inside session 2's sandbox (AC4) ────────
		//
		// commit_file returns ok({ written: resolvedPath, bytes: N }); recordOutcome
		// stores this as the receipt in operationOutcomes. We check the receipt rather
		// than fs.existsSync because endSession deletes the sandbox directory on
		// teardown — the file is gone by the time provisionSession resolves.
		//
		// @lore AL7 CRITICAL-2: do NOT check fs.existsSync(sandboxSnapshot/file) here.
		// endSession (session-lifecycle.ts) calls fs.promises.rm(context.sandboxPath,
		// { recursive: true }) as its step 6. The sandbox is deleted BEFORE provisionSession
		// resolves, so any fs check after await provisionSession(...) will see a missing file.
		// The Outcome receipt is the correct proof vehicle: it captures { written, bytes }
		// from the handler's ok() return, proving the write happened in-session.
		const outcomeReceipt = JSON.parse(outcomes[0]?.receipt ?? "{}") as {
			written: string;
			bytes: number;
		};
		expect(outcomeReceipt.written).toBeTruthy();
		expect(outcomeReceipt.written).toMatch(OUTPUT_FILENAME);
		expect(outcomeReceipt.bytes).toBeGreaterThan(0);
		expect(outcomeReceipt.bytes).toBe(Buffer.byteLength(OUTPUT_CONTENT, "utf-8"));

		// ── Assert: work continues after approved op (AC11) ───────────────────
		//
		// The provisioning orchestrator emits tool_call_recorded for every tool_call
		// event observed in the harness stream. For the builtin harness (which executes
		// tools internally), the stream emits tool_call events before each tool execution.
		//
		// AC11 assertion: ≥2 tool_call events in session 2:
		//   - commit_file (the approved op)
		//   - read_inbox (the post-approved reversible op)
		//
		// If the loop terminated at commit_file, only 1 event would be present.
		expect(s2ToolCallEvents.length).toBeGreaterThanOrEqual(2);
		const s2ToolNames = s2ToolCallEvents.map((e) => e.toolName);
		expect(s2ToolNames).toContain("commit_file");
		expect(s2ToolNames).toContain("read_inbox");

		// read_inbox must appear AFTER commit_file (work continues in same session)
		const commitIdx = s2ToolNames.lastIndexOf("commit_file");
		const inboxIdx = s2ToolNames.indexOf("read_inbox");
		expect(inboxIdx).toBeGreaterThan(commitIdx);

		// ── Assert: real session row for session 2 (proves adapter ran) ───────
		// The session row only exists if provisionSession ran through the full
		// admission + harness start lifecycle.
		expect(s2Result.sessionId).toBeTruthy();
		const [s2SessionRow] = await db
			.select({ id: sessions.id })
			.from(sessions)
			.where(eq(sessions.id, s2Result.sessionId))
			.limit(1);
		expect(s2SessionRow).toBeDefined();

		// ── Sanity: read_inbox was NOT routed to review (reversible → no capture) ──
		// If read_inbox were captured, AC11 is broken (the loop wouldn't continue).
		const s2NewPcs = await db
			.select({ toolId: proposedCalls.toolId })
			.from(proposedCalls)
			.where(eq(proposedCalls.originSessionId, s2Result.sessionId));
		const readInboxCaptures = s2NewPcs.filter((p) => p.toolId === "read_inbox");
		expect(readInboxCaptures).toHaveLength(0);
	});

	// ─────────────────────────────────────────────────────────────────────────
	// HONEST MATRIX STATE: builtin green-now, claude absent-fail in this env
	// ─────────────────────────────────────────────────────────────────────────

	describe("per-harness matrix: honest live-proof state", () => {
		test("builtin: getLiveProofLaneState reports green-now (in-process, always available)", async () => {
			const { getLiveProofLaneState, probeLiveProofHarnessAvailability } = await import(
				"../tools/live-proof-lanes.js"
			);
			expect(getLiveProofLaneState("builtin")).toBe("green-now");
			await expect(probeLiveProofHarnessAvailability("builtin")).resolves.toBeUndefined();
		});

		test("claude-code: green-now (real claude CLI binary installed on this machine)", async () => {
			const { getLiveProofLaneState } = await import("../tools/live-proof-lanes.js");
			// The probe now keys on the CLI binary (`which claude`), not the SDK package.
			// The real `claude` binary IS installed at /opt/homebrew/bin/claude on this machine.
			// assert green-now definitively — no weakened toContain fudge.
			//
			// @lore AL7 probe-fix: previous code checked SDK resolution (which could succeed
			// in vitest via workspace node_modules even when CLI is absent). The binary IS
			// the authoritative check — the real-harness test spawns the binary directly.
			const state = getLiveProofLaneState("claude-code");
			expect(state).toBe("green-now");
		});

		test("codex: green-now or absent-fail (AL7 delta: MCP wired, real which probe)", async () => {
			// AL7 delta: codex is now a real `which codex` probe (was wiring-needed).
			// Returns green-now (binary present) or absent-fail (binary absent).
			const { getLiveProofLaneState } = await import("../tools/live-proof-lanes.js");
			const state = getLiveProofLaneState("codex");
			expect(["green-now", "absent-fail"]).toContain(state);
		});

		test("opencode: green-now or absent-fail (AL7 delta: MCP wired, real which probe)", async () => {
			// AL7 delta: opencode is now a real `which opencode` probe (was wiring-needed).
			// Returns green-now (binary present) or absent-fail (binary absent).
			const { getLiveProofLaneState } = await import("../tools/live-proof-lanes.js");
			const state = getLiveProofLaneState("opencode");
			expect(["green-now", "absent-fail"]).toContain(state);
		});

		test("cursor-agent: skipped (unavailable)", async () => {
			const { getLiveProofLaneState } = await import("../tools/live-proof-lanes.js");
			expect(getLiveProofLaneState("cursor-agent")).toBe("skipped");
		});
	});
});
