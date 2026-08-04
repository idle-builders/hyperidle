/**
 * AU27 Increment 1 (Decision 1) — `provisioner.ts`'s Phase 8 forwards
 * `params.callingThreadId` straight onto the session-scoped
 * `ToolContext.threadId` the `reply` tool (Increment 2) reads. Proven by
 * capturing the `ToolContext` the harness's tool registry is built with, over
 * a real (fake-adapter) `admit` + `run` pass — no live orchestration -> core
 * read, the value is forwarded verbatim from `params`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
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

/** A harness adapter that starts, streams zero events, and stops cleanly. */
function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: async (config) => ({ sessionId: config.sessionId }),
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* no events — the drain completes immediately */
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
	};
}

/** Every port method not exercised by this scenario throws if called. */
function buildHarnessPorts(captured: {
	toolContext?: { readonly threadId?: string };
}): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	const base: SessionLifecyclePorts = {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
		observability: {
			summarizeToolArgs: () => "",
		},
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
		},
		toolProvider: {
			buildToolRegistry: (ctx) => {
				captured.toolContext = ctx;
				return { invoke: async () => ({ success: true, data: undefined }) };
			},
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			composeAssistantPrompt: neverCalled("contextAssembly.composeAssistantPrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
	return base;
}

function buildDeps(db: HyperIdleDb, sandboxPath: string): ProvisionSessionDeps {
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
		},
		workspace: {
			spawn: async () => ({
				sandboxId: "sbx-1",
				path: sandboxPath,
			}),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
	};
}

describe("provisioner.run — ToolContext.threadId forwarded from params.callingThreadId", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
	test("a session with a baked callingThreadId gets a ToolContext.threadId matching it", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-thread-ctx-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		});

		const captured: { toolContext?: { readonly threadId?: string } } = {};
		const ports = buildHarnessPorts(captured);
		const provisioner = createProvisioner(ports);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-provisioner-thread-id-"));
		sandboxDirs.push(sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-thread-ctx-1",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			},
			harnessDisabled: [],
			callingThreadId: "thread-provisioner-ctx-1",
		} as ProvisionSessionParams;

		const deps = buildDeps(db as HyperIdleDb, sandboxPath);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.toolContext?.threadId).toBe("thread-provisioner-ctx-1");
	});

	test("a session with no baked callingThreadId gets no ToolContext.threadId (routine_run/knowledge_action)", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-thread-ctx-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		});

		const captured: { toolContext?: { readonly threadId?: string } } = {};
		const ports = buildHarnessPorts(captured);
		const provisioner = createProvisioner(ports);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-provisioner-thread-id-"));
		sandboxDirs.push(sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-thread-ctx-2",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			},
			harnessDisabled: [],
		} as ProvisionSessionParams;

		const deps = buildDeps(db as HyperIdleDb, sandboxPath);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.toolContext?.threadId).toBeUndefined();
	});
});
