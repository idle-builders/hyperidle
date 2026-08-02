/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure) — GREEN phase.
 *
 * Decision H3 (Increment 12) already established the pattern: core bakes
 * everything a session needs into the request AT EMIT TIME, keyed off the
 * resolved agentId, so run-orchestration never reads core-api back at
 * provisioning time — this landed for task/bet/team/routine content, ranked
 * knowledge, and agentConfig/harnessDisabled (all six intent kinds). Decision
 * F2 (Increment 8) left ONE seam call standing that H3's later, more
 * complete principle should have superseded but never revisited:
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`, called from
 * `mountFilesystemsForAgent` inside `admitSession`'s Phase 4.5 (after sandbox
 * spawn, before context assembly).
 *
 * This file proves the closure at the `admitSession` level (any of the six
 * intent kinds can reach this Phase — this test exercises it directly via
 * `provisioner.admit`, kind-agnostic): with the agent's injected-filesystems
 * list baked onto `params.injectedFilesystems` (mirroring how
 * `params.agentConfig`/`params.contextBundle` are already baked, Wave E),
 * Phase 4.5 mounts from the BAKED list alone. Proof is now STRUCTURAL, not
 * merely a runtime spy: `SessionLifecyclePorts` no longer declares a
 * `filesystems` field at all (deleted, not wired as `neverCalled` — see
 * `provisioner.ts`'s own top-of-file `filesystems` `@lore`), so there is no
 * seam reader left for Phase 4.5 to reach even if it wanted to.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import type { Filesystem, FilesystemMounter } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { describe, vi } from "vitest";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
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
 * `filesystems.listFilesystemsByAgent` is the ONE port this file cares about:
 * it must NEVER be called once the baked `injectedFilesystems` list is
 * present.
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
		// AU21 §9 Increment 12 follow-up (F2 gap closure) — GREEN phase: the
		// `filesystems` seam reader is DELETED from `SessionLifecyclePorts`
		// entirely (not merely wired as `neverCalled`) — a stronger proof than a
		// runtime spy: there is no port left to call. The baked
		// `params.injectedFilesystems` list this file's own tests assert on is
		// the ONLY source `mountFilesystemsForAgent` reads from now.
		cost: {
			checkCostCap: vi.fn(async () => ({ allowed: true })),
			recordCostAndCheck: neverCalled("cost.recordCostAndCheck"),
		},
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
			composeAssistantPrompt: neverCalled("contextAssembly.composeAssistantPrompt"),
			writeSandboxAgentsMd: neverCalled("contextAssembly.writeSandboxAgentsMd"),
		},
	};
	return { ...base, ...overrides };
}

function buildDeps(db: HyperIdleDb, mounter: FilesystemMounter): ProvisionSessionDeps {
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
			spawn: async () => ({ sandboxId: "sbx-1", path: "/tmp/au21-admit-session-baked-fs" }),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
		// AO2 Phase 4.5 only runs mount when a mounter is present.
		mounter,
	};
}

describe("admitSession mounts from the baked injected-filesystems list", () => {
	test("mounts the baked injectedFilesystems list — the filesystems seam reader is NEVER called", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-baked-fs-1",
			kind: "ai",
			name: "Baked FS Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
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

		const bakedFilesystem = {
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
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			},
			harnessDisabled: [],
			// AU21 §9 Increment 12 follow-up (F2 gap closure) — the field this fix
			// adds: NOT yet declared on `ProvisionSessionParams` (RED). Every
			// per-kind resolver will bake this from the SAME
			// `resolveInjectedFilesystemsForAgent(db, agentId)` call the emit-time
			// resolver makes, one layer up.
			injectedFilesystems: [bakedFilesystem],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, mounter), params);

		expect(admitted.mountedFilesystems).toHaveLength(1);
		expect(admitted.mountedFilesystems[0]?.id).toBe("fs-baked-1");
		expect(mountCalls).toHaveLength(1);
		expect(mountCalls[0]?.resourceRef).toEqual({ kind: "doc_set", folder: "/docs" });
	});

	test("an agent with NO baked injected filesystems mounts nothing — unchanged from today's behavior, still zero reader call", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-baked-fs-2",
			kind: "ai",
			name: "Baked FS Agent 2",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
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
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			},
			harnessDisabled: [],
			injectedFilesystems: [],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, mounter), params);

		expect(admitted.mountedFilesystems).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});
});
