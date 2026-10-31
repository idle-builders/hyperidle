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
import { agentRunConfig, type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, vi } from "vitest";
import {
	buildRunningHarnessPorts,
	type FakeHarnessAdapter,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

type WorkspaceAdapterType = ProvisionSessionDeps["workspace"];

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

function makeSpyWorkspace(newSandboxPath: string): {
	workspace: WorkspaceAdapterType;
	adoptedPaths: string[];
	spawnedPaths: string[];
} {
	const adoptedPaths: string[] = [];
	const spawnedPaths: string[] = [];
	const workspace: WorkspaceAdapterType = {
		spawn: async (baseDir: string) => {
			spawnedPaths.push(baseDir);
			return { sandboxId: "sb-new", path: newSandboxPath };
		},
		exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
		adopt: async (p: string) => {
			adoptedPaths.push(p);
			return { sandboxId: "sb-adopted", path: p };
		},
		destroy: async () => undefined,
	};
	return { workspace, adoptedPaths, spawnedPaths };
}

async function seedAgent(db: HyperIdleDb, agentId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Cursor Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(agentRunConfig).values({
		agentUserId: agentId,
		harnessType: "cursor-agent",
	});
}

function makeDeps(
	db: HyperIdleDb,
	adapter: FakeHarnessAdapter,
	workspace: WorkspaceAdapterType,
	adapterType = "cursor-agent",
): ProvisionSessionDeps {
	return {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "cursor-pool-entry",
				adapter,
				meta: {
					name: "cursor-agent",
					kind: "local" as const,
					type: adapterType,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "no adapter",
		},
		workspace,
	};
}

describe("cursor-agent hold-and-handover", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("adopts the prior sandbox and calls resumeSession with the held user message", async ({
		db,
	}) => {
		const agentId = "cursor-handover-agent-1";
		const threadId = "cursor-handover-thread-1";
		const prevSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-prev-"));
		const newSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-new-"));
		sandboxDirs.push(prevSandbox, newSandbox);

		await seedAgent(db as HyperIdleDb, agentId);

		await (db as HyperIdleDb).insert(sessions).values({
			id: "cursor-prev-session-1",
			agentId,
			modelTier: "fast",
			startedAt: new Date(Date.now() - 60_000).toISOString(),
			state: "completed",
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
		const { workspace, adoptedPaths, spawnedPaths } = makeSpyWorkspace(newSandbox);
		const deps = makeDeps(db as HyperIdleDb, adapter, workspace);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId,
			productId: "task-free",
			sandboxBasePath: "/base",
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

		// The prior sandbox must be adopted, not a fresh one spawned.
		expect(adoptedPaths).toContain(prevSandbox);
		expect(spawnedPaths).toHaveLength(0);

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
	}) => {
		const agentId = "cursor-handover-agent-2";
		const threadId = "cursor-handover-thread-2";
		const newSandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-fresh-"));
		sandboxDirs.push(newSandbox);

		await seedAgent(db as HyperIdleDb, agentId);
		// No prior session for this thread.

		const adapter = makeCursorAdapter();
		const { workspace, adoptedPaths, spawnedPaths } = makeSpyWorkspace(newSandbox);
		const deps = makeDeps(db as HyperIdleDb, adapter, workspace);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId,
			productId: "task-free",
			sandboxBasePath: "/base",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			callingThreadId: threadId,
			transcript: [{ role: "user", content: "first message" }],
		};

		const provisioner = createProvisioner(buildRunningHarnessPorts());
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(spawnedPaths.length).toBeGreaterThan(0);
		expect(adoptedPaths).toHaveLength(0);
		expect(adapter.startSession).toHaveBeenCalled();
		expect(adapter.resumeSession).not.toHaveBeenCalled();
	});
});
