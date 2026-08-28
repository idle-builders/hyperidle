/**
 * AU27 Increment 4 (Decision 2) — the generic transcript, re-provided as a
 * capability every kind can use, not assistant-specific. `params.transcript`
 * (baked at emit — Increment 1's `callingThreadId` sibling) reaches:
 *   1. the `## Conversation` prompt section (every harness reads it from
 *      AGENTS.md/CLAUDE.md), replacing the raw machine-id Correlation line;
 *   2. `SessionConfig.messages` (selects the builtin adapter's chat
 *      completion over the planning loop, generically);
 *   3. `SessionConfig.requiredReturnActions` — Decision 3's structural rule
 *      (`callingThreadId != null && taskId == null` ⇒ `["reply"]`), plus the
 *      one-line reply orientation in the prompt.
 *
 * Uses `deps.onBeforeHarnessStart`'s abort return to observe the fully
 * assembled `SessionConfig` without spawning a real harness process.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, describe, vi } from "vitest";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: () =>
			Promise.reject(new Error("must not be called — onBeforeHarnessStart aborts")),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error("must not be called — onBeforeHarnessStart aborts");
			},
		}),
		stopSession: () =>
			Promise.reject(new Error("must not be called — onBeforeHarnessStart aborts")),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

function buildHarnessPorts(
	opts: { readonly allowContextAssembly?: boolean } = {},
): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	return {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
		observability: { summarizeToolArgs: () => "" },
		harnessRuntime: {
			enforcementRegistry: {
				register: vi.fn(),
				get: vi.fn(() => undefined),
				incrementForce: vi.fn(),
				unregister: vi.fn(),
			},
			createReturnGate: () => ({ observe: () => undefined, returned: false }),
			evaluateReturn: () => "returned" as const,
			provisionReturnHook: async () => undefined,
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
		},
		toolProvider: {
			buildToolRegistry: () => ({ invoke: async () => ({ success: true, data: undefined }) }),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			// Phase 6 calls assembleAgentContext whenever params.requestContext is
			// set (task-free durable-request path) — a no-op stub for the one
			// scenario here that sets requestContext (no-transcript regression
			// check); every other scenario omits requestContext, so the
			// never-called guard still applies there.
			assembleAgentContext: opts.allowContextAssembly
				? vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" }))
				: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
}

describe("generic transcript delivery (Increment 4)", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(users).values({
			id,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
	}

	async function seedTask(db: HyperIdleDb, taskId: string): Promise<void> {
		const now = new Date().toISOString();
		const teamId = `${taskId}-team`;
		const betId = `${taskId}-bet`;
		await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "Generic transcript test bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			title: "Generic transcript test task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});
	}

	function buildDeps(
		db: HyperIdleDb,
		sandboxPath: string,
		captured: { sessionConfig?: SessionConfig },
	): ProvisionSessionDeps {
		return {
			db,
			eventBus: new EventBus(),
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildFakeHarnessAdapter(),
					meta: {
						name: "Fake",
						kind: "local",
						type: undefined,
						modelProviders: [],
						maxConcurrent: 5,
					},
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				destroy: async () => undefined,
			},
			onBeforeHarnessStart: (ctx) => {
				captured.sessionConfig = ctx.sessionConfig;
				return "abort";
			},
		};
	}

	function baseParams(agentId: string, sandboxPath: string): ProvisionSessionParams {
		return {
			taskId: null,
			agentId,
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			harnessDisabled: [],
		} as ProvisionSessionParams;
	}

	test("a session with a baked transcript + calling thread + no task gets ## Conversation, chat messages, and requiredReturnActions:['reply']", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-1");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts();
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-1", sandboxPath),
			callingThreadId: "thread-transcript-1",
			transcript: [
				{ role: "user", content: "What's the status of the launch?" },
				{ role: "assistant", content: "On track for Friday." },
			],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig).toBeDefined();
		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("## Conversation");
		expect(prompt).toContain("What's the status of the launch?");
		expect(prompt).toContain("On track for Friday.");
		expect(prompt).toContain("call `reply`");
		expect(prompt).not.toContain("Correlation:");

		expect(captured.sessionConfig?.messages).toEqual([
			{ role: "user", content: "What's the status of the launch?" },
			{ role: "assistant", content: "On track for Friday." },
		]);
		expect(captured.sessionConfig?.requiredReturnActions).toEqual(["reply"]);
	});

	test("a task_run session (has a taskId) with a transcript does NOT get requiredReturnActions:['reply'] — the trio still satisfies", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-2");
		await seedTask(db, "task-transcript-2");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts({ allowContextAssembly: true });
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-2", sandboxPath),
			taskId: "task-transcript-2",
			callingThreadId: "thread-transcript-2",
			transcript: [{ role: "user", content: "Any updates?" }],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.requiredReturnActions).toBeUndefined();
	});

	test("a session with no transcript renders the original Correlation line, unchanged (no regression)", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-3");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts({ allowContextAssembly: true });
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-3", sandboxPath),
			requestContext: {
				requestId: "req-transcript-3",
				sourceKind: "task",
				sourceId: "task-transcript-3",
				sourceCorrelation: { taskId: "task-transcript-3", teamId: "team-transcript-3" },
			},
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("Correlation:");
		expect(prompt).not.toContain("## Conversation");
		expect(captured.sessionConfig?.messages).toBeUndefined();
	});
});
