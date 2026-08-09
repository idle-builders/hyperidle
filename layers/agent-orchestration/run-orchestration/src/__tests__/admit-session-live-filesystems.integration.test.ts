/**
 * AU26 F2 — `admitSession` Phase 4.5 mounts what the LIVE record says.
 *
 * History: Decision F2 (AU21 §9 Increment 8) had Phase 4.5 call the seam
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`. AU21 §9 Increment
 * 12 replaced that seam with an emit-time BAKE frozen onto the request. AU26 F2
 * deletes the bake: `filesystems` / `filesystem_injections` are
 * agent-orchestration's own tables now, so Phase 4.5 asks
 * `ProvisionSessionDeps.injectedFilesystems` — an in-layer reader port the
 * Application backs with `@hyperidle/filesystems` — at spawn time.
 *
 * This file proves the closure at the `admitSession` level (any of the six
 * intent kinds can reach this Phase — this test exercises it directly via
 * `provisioner.admit`, kind-agnostic). The structural half of the proof is
 * unchanged and still stronger than a runtime spy: `SessionLifecyclePorts`
 * declares no `filesystems` field at all, so there is no core-api seam left for
 * Phase 4.5 to reach even if it wanted to. What changed is where the list comes
 * from — the port is asked for THIS agent, and nothing about filesystems rides
 * the request. The end-to-end staleness proof (assign after emit, still
 * mounted) lives in `filesystems-added-after-emit.integration.test.ts`.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { Filesystem, FilesystemMounter } from "@hyperidle/filesystem-contract";
import { describe, vi } from "vitest";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type InjectedFilesystem = Awaited<
	ReturnType<
		NonNullable<ProvisionSessionDeps["injectedFilesystems"]>["listInjectedForProvisioning"]
	>
>[number];
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

/** A harness adapter that is never actually invoked by `admitSession` (Phases 1-7 stop short of harness spawn). */
function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: () => Promise.reject(new Error("must not be called by admitSession")),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error("must not be called by admitSession");
			},
		}),
		stopSession: () => Promise.reject(new Error("must not be called by admitSession")),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

/**
 * Every field admitSession's Phases 1-7 do not exercise in this test's
 * scenario is a `vi.fn()` that throws if ever called — an unexpected
 * invocation fails loudly instead of silently no-op'ing.
 */
function buildHarnessPorts(overrides: Partial<SessionLifecyclePorts>): SessionLifecyclePorts {
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
			registerSessionRun: neverCalled("sessionRequests.registerSessionRun"),
			deregisterSessionRun: neverCalled("sessionRequests.deregisterSessionRun"),
		},
		observability: {
			summarizeToolArgs: () => "",
		},
		// The `filesystems` seam reader is DELETED from `SessionLifecyclePorts`
		// entirely (not merely wired as `neverCalled`) — a stronger proof than a
		// runtime spy: there is no core-api port left to call. AU26 F2: the only
		// source `mountFilesystemsForAgent` reads from is the in-layer
		// `ProvisionSessionDeps.injectedFilesystems` port these tests supply.
		// AU21 Increment 14a: `SessionLifecyclePorts` no longer carries a `cost`
		// field at all — the cap-gate port is deleted, no replacement.
		harnessRuntime: {
			enforcementRegistry: {
				register: neverCalled("harnessRuntime.enforcementRegistry.register"),
				get: neverCalled("harnessRuntime.enforcementRegistry.get"),
				incrementForce: neverCalled("harnessRuntime.enforcementRegistry.incrementForce"),
				unregister: neverCalled("harnessRuntime.enforcementRegistry.unregister"),
			},
			createReturnGate: neverCalled("harnessRuntime.createReturnGate"),
			evaluateReturn: neverCalled("harnessRuntime.evaluateReturn"),
			provisionReturnHook: neverCalled("harnessRuntime.provisionReturnHook"),
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
			buildToolRegistry: neverCalled("toolProvider.buildToolRegistry"),
			toolsForRole: () => [],
			returnStatusToolForRegistry: neverCalled("toolProvider.returnStatusToolForRegistry"),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: neverCalled("contextAssembly.writeSandboxAgentsMd"),
		},
	};
	return { ...base, ...overrides };
}

function buildDeps(
	db: HyperIdleDb,
	mounter: FilesystemMounter,
	injected: readonly InjectedFilesystem[] = [],
	asked: string[] = [],
): ProvisionSessionDeps {
	return {
		db,
		// AU26 F2: the in-layer reader port. Production backs it with
		// `@hyperidle/filesystems`' `listInjectedFilesystemsForProvisioning`;
		// here it records which agent Phase 4.5 asked about.
		injectedFilesystems: {
			listInjectedForProvisioning: async (agentId: string) => {
				asked.push(agentId);
				return injected;
			},
		},
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
			spawn: async () => ({ sandboxId: "sbx-1", path: "/tmp/au21-admit-session-baked-fs" }),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
		// AO2 Phase 4.5 only runs mount when a mounter is present.
		mounter,
	};
}

describe("admitSession mounts what the live injection record says", () => {
	test("asks the in-layer reader for THIS agent and mounts what it returns", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-baked-fs-1",
			kind: "ai",
			name: "Baked FS Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const mountCalls: Filesystem[] = [];
		const mounter: FilesystemMounter = {
			mount: async (input) => {
				mountCalls.push(input.filesystem);
				return { success: true, sandboxPath: input.sandboxPath };
			},
			captureBack: async () => ({ success: true, captured: true }),
		};

		const ports = buildHarnessPorts({});
		const provisioner = createProvisioner(ports);

		const liveFilesystem: InjectedFilesystem = {
			id: "fs-baked-1",
			teamId: "team-baked-1",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: { kind: "doc_set", folder: "/docs" },
			writeback: "file",
			state: "attached",
			createdAt: now,
		};

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-baked-fs-1",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-baked-fs",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			harnessDisabled: [],
		} as ProvisionSessionParams;

		const asked: string[] = [];
		const admitted = await provisioner.admit(
			buildDeps(db as HyperIdleDb, mounter, [liveFilesystem], asked),
			params,
		);

		// Nothing about filesystems rode the request; the port was asked instead.
		expect(asked).toEqual(["agent-baked-fs-1"]);
		expect(admitted.mountedFilesystems).toHaveLength(1);
		expect(admitted.mountedFilesystems[0]?.id).toBe("fs-baked-1");
		expect(mountCalls).toHaveLength(1);
		expect(mountCalls[0]?.resourceRef).toEqual({ kind: "doc_set", folder: "/docs" });
	});

	test("an agent with NO injected filesystems mounts nothing — unchanged from today's behavior", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-baked-fs-2",
			kind: "ai",
			name: "Baked FS Agent 2",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const mounter: FilesystemMounter = {
			mount: vi.fn(),
			captureBack: vi.fn(),
		} as unknown as FilesystemMounter;

		const ports = buildHarnessPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-baked-fs-2",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-baked-fs",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			harnessDisabled: [],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, mounter), params);

		expect(admitted.mountedFilesystems).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});
});
