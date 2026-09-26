/**
 * Shared `admitSession`/`provisionSession` test fixture — the
 * `SessionLifecyclePorts` shape and two fake harness adapters were copied
 * near-verbatim into every provisioner test file; this is their one home.
 */

import { vi } from "vitest";
import type { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
export type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
export type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
export type ProvisionSessionDeps = AdmitArgs[0];
export type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
export type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

/** A `vi.fn()` that throws if ever called — an unexpected invocation fails loudly instead of silently no-op'ing. */
export function neverCalled(label: string) {
	return vi.fn(() => {
		throw new Error(`${label}: must not be called in this test scenario`);
	});
}

/**
 * `SessionLifecyclePorts` fixture where every field a scenario does not
 * exercise is a `vi.fn()` that throws if ever called — an unexpected
 * invocation fails loudly instead of silently no-op'ing. For `admitSession`-
 * only scenarios that never reach harness spawn.
 */
export function buildNeverCalledPorts(
	overrides: Partial<SessionLifecyclePorts> = {},
): SessionLifecyclePorts {
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
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
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
			assembleSubscriptionPrompt: neverCalled("contextAssembly.assembleSubscriptionPrompt"),
			writeSandboxAgentsMd: neverCalled("contextAssembly.writeSandboxAgentsMd"),
		},
	};
	return { ...base, ...overrides };
}

/**
 * `SessionLifecyclePorts` fixture for scenarios that run a session all the
 * way through harness spawn and teardown — `registerSessionRun`/
 * `deregisterSessionRun`/the enforcement registry are live `vi.fn()`s (the
 * runtime calls them on every run), and the six fields below are the ones
 * that differ per scenario across the files that used to copy this whole
 * object by hand.
 */
export function buildRunningHarnessPorts(
	options: {
		readonly createReturnGate?: SessionLifecyclePorts["harnessRuntime"]["createReturnGate"];
		readonly evaluateReturn?: SessionLifecyclePorts["harnessRuntime"]["evaluateReturn"];
		readonly openMcpBridge?: SessionLifecyclePorts["harnessRuntime"]["openMcpBridge"];
		readonly closeMcpBridge?: SessionLifecyclePorts["harnessRuntime"]["closeMcpBridge"];
		readonly buildToolRegistry?: SessionLifecyclePorts["toolProvider"]["buildToolRegistry"];
		readonly assembleAgentContext?: SessionLifecyclePorts["contextAssembly"]["assembleAgentContext"];
	} = {},
): SessionLifecyclePorts {
	return {
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
			createReturnGate:
				options.createReturnGate ?? (() => ({ observe: () => undefined, returned: false })),
			evaluateReturn: options.evaluateReturn ?? (() => "returned" as const),
			provisionReturnHook: async () => undefined,
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: options.openMcpBridge ?? neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: options.closeMcpBridge ?? neverCalled("harnessRuntime.closeMcpBridge"),
		},
		toolProvider: {
			buildToolRegistry:
				options.buildToolRegistry ??
				(() => ({ invoke: async () => ({ success: true, data: undefined }) })),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			assembleAgentContext:
				options.assembleAgentContext ?? neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleSubscriptionPrompt: neverCalled("contextAssembly.assembleSubscriptionPrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
}

/** A harness adapter that rejects every method — for scenarios where admission never reaches harness spawn. */
export function rejectingHarnessAdapter(
	reason = "must not be called by admitSession",
): FakeHarnessAdapter {
	return {
		startSession: () => Promise.reject(new Error(reason)),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error(reason);
			},
		}),
		stopSession: () => Promise.reject(new Error(reason)),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

/** A harness adapter that starts, streams nothing, and completes immediately. */
export function completingHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: async (config: { sessionId: string }) => ({ sessionId: config.sessionId }),
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
