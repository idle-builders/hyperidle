/**
 * AU27 Increment 5 (Decision 5) — `provisioner.ts` forwards
 * `params.callingThreadId` onto the `session_not_returned` event it already
 * emits on a not-returned verdict, giving the never-silent net's
 * `conversation` subscriber somewhere to post. Zero new read: the value is
 * the same already-baked field Increment 1 introduced.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, type SessionNotReturnedEvent } from "@hyperidle/shared";
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
		startSession: async (config) => ({ sessionId: config.sessionId }),
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* no events — the agent never calls a return action */
			},
		}),
		stopSession: async () => ({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

function buildHarnessPorts(): SessionLifecyclePorts {
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
			// Force the not_returned verdict this test observes.
			evaluateReturn: () => "not_returned" as const,
			provisionReturnHook: async () => undefined,
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
			openMcpBridge: neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
		},
		agentRunConfig: {
			// AU26 G1: `admitSession` reads the six run-config fields live from
			// `agent_run_config` instead of the emit-time bake. This fixture
			// returns the all-null default; tests that care override it.
			readAgentRunConfig: async () => ({
				systemPrompt: null,
				harnessType: null,
				modelTierPreference: null,
				modelId: null,
				modelProvider: null,
				maxConcurrentSessions: 1,
			}),
		},
		toolProvider: {
			buildToolRegistry: () => ({ invoke: async () => ({ success: true, data: undefined }) }),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
}

describe("session_not_returned carries callingThreadId (Increment 5)", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a not-returned session with a baked callingThreadId emits session_not_returned carrying it", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: "agent-not-returned-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-not-returned-"));
		sandboxDirs.push(sandboxPath);

		const eventBus = new EventBus();
		const captured: SessionNotReturnedEvent[] = [];
		eventBus.on("session_not_returned", (event) => {
			captured.push(event);
		});

		const ports = buildHarnessPorts();
		const provisioner = createProvisioner(ports);
		const deps: ProvisionSessionDeps = {
			db: db as HyperIdleDb,
			eventBus,
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
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				destroy: async () => undefined,
			},
		};

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-not-returned-1",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			harnessDisabled: [],
			callingThreadId: "thread-not-returned-1",
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		const result = await provisioner.run(deps, params, admitted);

		expect(result.outcome).toBe("not_returned");
		expect(captured).toHaveLength(1);
		expect(captured[0]?.callingThreadId).toBe("thread-not-returned-1");
	});

	test("a not-returned session with no callingThreadId omits the field (unchanged)", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: "agent-not-returned-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-not-returned-"));
		sandboxDirs.push(sandboxPath);

		const eventBus = new EventBus();
		const captured: SessionNotReturnedEvent[] = [];
		eventBus.on("session_not_returned", (event) => {
			captured.push(event);
		});

		const ports = buildHarnessPorts();
		const provisioner = createProvisioner(ports);
		const deps: ProvisionSessionDeps = {
			db: db as HyperIdleDb,
			eventBus,
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
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				destroy: async () => undefined,
			},
		};

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-not-returned-2",
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

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.callingThreadId).toBeUndefined();
	});
});
