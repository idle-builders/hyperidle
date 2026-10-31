/**
 * cursor-agent hold-and-handover — real-binary proof.
 *
 * LOCAL-ONLY LANE: needs real cursor-agent binary and LLM credentials.
 * Never a GitHub Actions job.
 *
 * Turn 1 starts a fresh cursor session and plants a task ID (codeword) in
 * the conversation. Phase 3.5 finds no prior "done" session, so startSession
 * runs normally.
 *
 * Turn 2 is admitted with the same callingThreadId and a held user message
 * as the last transcript entry. Phase 3.5 queries for the prior "done" session
 * via sourceCorrelationJson LIKE, resolves the handover, and Phase 4 adopts
 * the original sandbox path. Phase 9 calls resumeSession with the held message
 * (not "proceed").
 *
 * Asserts:
 *   admitted2.harnessHandover.harnessSessionId === chatId from turn 1
 *   admitted2.harnessHandover.message === held message text (not "proceed")
 *   sess2.harnessSessionId === chatId from turn 1 (resume keeps same id)
 *
 * @lore: codeword framing — "Task ID" framing avoids security-heuristic refusals that block codeword exchanges
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { agentRunConfig, type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { createLocalAdapterPool } from "@hyperidle/harness-registry";
import { requireHarnessAuthed } from "@hyperidle/harness-registry/test-fixtures";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { desc, eq } from "drizzle-orm";
import { afterEach, describe } from "vitest";
import {
	buildRunningHarnessPorts,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

// Non-guessable task ID — keeps the probe semantically neutral vs "codeword".
const TASK_ID = "KESTREL-4829";
const PHASE1_PROMPT = `The task ID for this session is ${TASK_ID}. Acknowledge with PHASE1_OK.`;
const PHASE2_PROMPT = `What task ID was assigned at the start of this conversation? Reply with just the task ID.`;

describe("cursor-agent handover — real binary", () => {
	requireHarness("cursor-agent");

	afterEach(() => {
		stopAllLiveHarnessSessions();
	});

	test("turn 2 resumes the same cursor chat with the held message, not 'proceed'", async ({
		db,
	}) => {
		await requireHarnessAuthed("cursor-agent");

		const agentId = "handover-real-1";
		const threadId = "handover-real-thread-1";
		const model = HARNESS_TEST_MODELS["cursor-agent"].model;

		await (db as HyperIdleDb).insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Handover Test Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await (db as HyperIdleDb).insert(agentRunConfig).values({
			agentUserId: agentId,
			harnessType: "cursor-agent",
			modelId: model,
		});

		const pool = await createLocalAdapterPool();
		const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-base-"));

		try {
			const workspace = makeWorkspace();
			const deps: ProvisionSessionDeps = {
				db: db as HyperIdleDb,
				eventBus: new EventBus(),
				adapterPool: pool,
				workspace,
			};
			// Write minimal AGENTS.md + CLAUDE.md so cursor-agent receives a clear,
			// short instruction and exits in seconds rather than exploring indefinitely.
			// @lore: writeSandboxAgentsMd override — without real context files cursor-agent
			// gets -p proceed with no AGENTS.md and runs open-ended tool calls for 3+ minutes;
			// writing a one-sentence instruction keeps each turn under 60s.
			const minimal =
				"You are in an automated integration test. Reply with exactly one word: OK. Do not run any tools or explore the sandbox.\n";
			const ports = buildRunningHarnessPorts({
				assembleAgentContext: async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" }),
				writeSandboxAgentsMd: (sandboxPath: string) => {
					fs.mkdirSync(sandboxPath, { recursive: true });
					fs.writeFileSync(path.join(sandboxPath, "AGENTS.md"), minimal);
					fs.writeFileSync(path.join(sandboxPath, "CLAUDE.md"), minimal);
				},
			});
			const provisioner = createProvisioner(ports);

			// ── Turn 1: fresh session — plants TASK_ID in the chat ────────────
			const turn1Params: ProvisionSessionParams = {
				taskId: null,
				agentId,
				productId: "task-free",
				sandboxBasePath: baseDir,
				agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
				callingThreadId: threadId,
				transcript: [{ role: "user", content: PHASE1_PROMPT }],
				// requestContext needed so the session row gets sourceCorrelationJson populated,
				// which Phase 3.5 queries via LIKE '%"threadId":"<id>"%'.
				requestContext: {
					requestId: "turn1-req",
					sourceKind: "assistant",
					sourceId: "turn1-msg",
					sourceCorrelation: { threadId, messageId: "turn1-msg", userId: "u1", agentId },
				},
			};

			const admitted1 = await provisioner.admit(deps, turn1Params);
			expect(
				admitted1.harnessHandover,
				"turn 1 must have no handover — no prior done session exists",
			).toBeUndefined();
			await provisioner.run(deps, turn1Params, admitted1);

			// Read session 1 row from DB.
			const [sess1] = await (db as HyperIdleDb)
				.select({
					harnessSessionId: sessions.harnessSessionId,
					state: sessions.state,
				})
				.from(sessions)
				.where(eq(sessions.agentId, agentId))
				.orderBy(desc(sessions.startedAt))
				.limit(1);

			expect(
				sess1?.harnessSessionId,
				"turn 1 must capture a harnessSessionId for cursor-agent",
			).toBeTruthy();
			expect(sess1?.state, "turn 1 session must end in 'done' state").toBe("done");
			const chatId1 = sess1?.harnessSessionId ?? "";
			expect(chatId1.length, "cursor chat id must be non-empty").toBeGreaterThan(0);

			// ── Turn 2: held user message via same threadId ────────────────────
			// Phase 3.5 must find the prior "done" session by threadId LIKE query
			// and resolve a handover to the same cursor chat.
			const turn2Params: ProvisionSessionParams = {
				taskId: null,
				agentId,
				productId: "task-free",
				sandboxBasePath: baseDir,
				agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
				callingThreadId: threadId,
				// Transcript has the held message as the last user turn.
				transcript: [
					{ role: "user", content: PHASE1_PROMPT },
					{ role: "assistant", content: "PHASE1_OK" },
					{ role: "user", content: PHASE2_PROMPT },
				],
			};

			const admitted2 = await provisioner.admit(deps, turn2Params);

			// Core assertions: handover must point at the same chat with the held message.
			expect(
				admitted2.harnessHandover?.harnessSessionId,
				"Phase 3.5 must resolve the handover to the same cursor chat id as turn 1",
			).toBe(chatId1);
			expect(
				admitted2.harnessHandover?.message,
				"handover message must be the held user message, not the 'proceed' default",
			).toBe(PHASE2_PROMPT);

			await provisioner.run(deps, turn2Params, admitted2);

			// After Phase 10 drain, the native id written back is chatId1
			// (resumeSession carries the same id through; cli-harness-adapter.ts line 1240).
			const [sess2] = await (db as HyperIdleDb)
				.select({ harnessSessionId: sessions.harnessSessionId })
				.from(sessions)
				.where(eq(sessions.agentId, agentId))
				.orderBy(desc(sessions.startedAt))
				.limit(1);

			expect(
				sess2?.harnessSessionId,
				"turn 2 session row must carry the same cursor chat id as turn 1",
			).toBe(chatId1);
		} finally {
			try {
				fs.rmSync(baseDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors — test result is not affected.
			}
		}
	}, 240_000);
});

/** Inline workspace — spawn creates subdirs under the base it receives; adopt recreates paths; destroy is no-op (cleaned up by finally). */
function makeWorkspace(): ProvisionSessionDeps["workspace"] {
	let counter = 0;
	return {
		spawn: async (base: string) => {
			counter += 1;
			const id = `sb-${counter}-${Date.now()}`;
			const p = path.join(base, id);
			fs.mkdirSync(p, { recursive: true });
			return { sandboxId: id, path: p };
		},
		adopt: async (p: string) => {
			counter += 1;
			fs.mkdirSync(p, { recursive: true });
			return { sandboxId: `adopted-${counter}`, path: p };
		},
		exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
		destroy: async () => undefined,
	};
}
