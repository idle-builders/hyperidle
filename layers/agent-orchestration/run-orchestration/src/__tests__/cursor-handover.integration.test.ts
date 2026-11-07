/**
 * When a user sends a message to a thread where cursor-agent ran before,
 * the provisioner must resume the same cursor chat instead of starting fresh.
 *
 * cursor-agent keys its chat by md5(cwd). A new directory loses all context
 * and exits 0 silently. The fix: adopt the original sandbox, call resumeSession
 * with the held message as the next turn.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { agentRunConfig, type RunnerDb, sessions } from "@hyperidle/runner-db";
import { afterEach, beforeEach, describe, vi } from "vitest";
import {
	buildRunningHarnessPorts,
	expect,
	type FakeHarnessAdapter,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	test,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

function makeCursorAdapter(): FakeHarnessAdapter & {
	resumeSession: ReturnType<typeof vi.fn>;
	startSession: ReturnType<typeof vi.fn>;
} {
	const startSession = vi.fn(async (config: { sessionId: string }) => ({
		sessionId: config.sessionId,
	}));
	const resumeSession = vi.fn(async (_nativeId: string, _msg: string, _cfg: unknown) => ({
		sessionId: "resumed-session",
	}));
	return {
		startSession,
		resumeSession,
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* empty — drain completes immediately */
			},
		}),
		stopSession: async () => ({
			outcome: "completed" as const,
			tokenUsage: { byTier: {} },
		}),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	} as FakeHarnessAdapter & {
		resumeSession: ReturnType<typeof vi.fn>;
		startSession: ReturnType<typeof vi.fn>;
	};
}

async function seedAgent(db: HyperIdleDb, runnerDb: RunnerDb, agentId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Cursor Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await runnerDb.insert(agentRunConfig).values({
		agentUserId: agentId,
		harnessType: "cursor-agent",
	});
}

function makeDeps(
	runnerDb: RunnerDb,
	adapter: FakeHarnessAdapter,
	adapterType = "cursor-agent",
): ProvisionSessionDeps {
	return {
		db: runnerDb,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "cursor-pool-entry",
				adapter,
				meta: {
					name: "cursor-agent",
					type: adapterType,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "no adapter",
		},
	};
}

describe("cursor-agent hold-and-handover", () => {
	const sandboxDirs: string[] = [];
	beforeEach(() => {
		const spacesDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-spaces-"));
		sandboxDirs.push(spacesDir);
		vi.stubEnv("HYPERIDLE_SPACES_DIR", spacesDir);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("adopts the prior sandbox and calls resumeSession with the held user message", async ({
		db,
		runnerDb,
	}) => {
		const agentId = "cursor-handover-agent-1";
		const threadId = "cursor-handover-thread-1";
		const prevSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-prev-"));
		sandboxDirs.push(prevSandbox);

		await seedAgent(db, runnerDb, agentId);

		await runnerDb.insert(sessions).values({
			id: "cursor-prev-session-1",
			agentId,
			modelTier: "fast",
			startedAt: new Date(Date.now() - 60_000).toISOString(),
			state: "done",
			sandboxSnapshot: prevSandbox,
			harnessSessionId: "cursor-chat-uuid-abc",
			sourceKind: "assistant",
			sourceId: "msg-seed-1",
			sourceCorrelationJson: JSON.stringify({
				threadId,
				messageId: "msg-seed-1",
				userId: "u1",
				agentId,
			}),
		});

		const adapter = makeCursorAdapter();
		const deps = makeDeps(runnerDb, adapter);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId,
			productId: "task-free",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			callingThreadId: threadId,
			transcript: [
				{ role: "assistant", content: "I did the first task." },
				{ role: "user", content: "CODEWORD-HANDOVER-TEST" },
			],
		};

		const provisioner = createProvisioner(buildRunningHarnessPorts());
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		// resumeSession must receive the held user message (last user turn in transcript).
		expect(adapter.resumeSession).toHaveBeenCalledWith(
			"cursor-chat-uuid-abc",
			"CODEWORD-HANDOVER-TEST",
			expect.objectContaining({ sandboxPath: prevSandbox }),
		);
		expect(adapter.startSession).not.toHaveBeenCalled();
	});

	test("spawns a fresh sandbox when no prior cursor session exists for the thread", async ({
		db,
		runnerDb,
	}) => {
		const agentId = "cursor-handover-agent-2";
		const threadId = "cursor-handover-thread-2";

		await seedAgent(db, runnerDb, agentId);
		// No prior session for this thread.

		const adapter = makeCursorAdapter();
		const deps = makeDeps(runnerDb, adapter);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId,
			productId: "task-free",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			callingThreadId: threadId,
			transcript: [{ role: "user", content: "first message" }],
		};

		const provisioner = createProvisioner(buildRunningHarnessPorts());
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(adapter.startSession).toHaveBeenCalled();
		expect(adapter.resumeSession).not.toHaveBeenCalled();
	});
});
