import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	AdapterPool,
	createHarnessAdapter,
	createReturnEnforcement,
	provisionHarnessEnvironment,
} from "@hyperidle/harness-registry";
import { returnStatusTool } from "@hyperidle/harness-registry/mcp";
import { create, recordConflict, update } from "@hyperidle/knowledge";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import type { EventBus, WorkerRegisterMessage } from "@hyperidle/shared";

/**
 * @lore AU31 §2.1(b)/§5: `runtimeDeps`/`startRuntime` are no longer module-
 * level exports of a `services/run-orchestration-composition.js` this file
 * used to import by relative path (the file relocated into agent-
 * orchestration and its runtime composition became per-composition, not a
 * process-wide singleton — §3.2). This harness builds its OWN throwaway
 * execution adapters, the same real `createReturnEnforcement`/
 * `provisionHarnessEnvironment`/`returnStatusTool` pieces `bootAgentExecution`
 * wires production-side, then gets `runtimeDeps`/`startRuntime` off
 * `buildRunOrchestrationComposition` like any other composition root.
 */
export function buildTestHarnessRuntimeAdapter(): RunOrchestrationHarnessRuntimeAdapter {
	const enforcementRegistry = createReturnEnforcement();
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions) =>
			enforcementRegistry.createGate(requiredReturnActions),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		openMcpBridge: () => {
			throw new Error(
				"startTestRuntime never supplies an MCP bridge — this should be unreachable.",
			);
		},
		closeMcpBridge: async () => {},
	};
}

/**
 * A real `buildRunOrchestrationComposition`, built off throwaway (but real)
 * execution adapters — the shared entry every test file that used to call
 * the module-level `runSession`/`runtimeDeps`/`startRuntime` singleton now
 * uses instead (§3.2: no ambient composition, a value built per call site).
 */
export function buildTestRunOrchestrationComposition(): ReturnType<
	typeof buildRunOrchestrationComposition
> {
	return buildRunOrchestrationComposition({
		harnessRuntime: buildTestHarnessRuntimeAdapter(),
		returnStatusTool: { forRegistry: (registry) => returnStatusTool.forRegistry(registry) },
	});
}

/** Starts the public runtime with inert peripheral adapters and an injectable execution edge. */
export function startTestRuntime(
	db: HyperIdleDb,
	eventBus: EventBus,
	runtime: ProvisionSessionDeps,
	sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]>,
) {
	const composition = buildTestRunOrchestrationComposition();
	const base = composition.runtimeDeps(db, eventBus);
	if (!base.ports) throw new Error("runtimeDeps did not provide production ports");
	const workerPool = new AdapterPool();
	return composition.startRuntime(
		composition.runtimeDeps(db, eventBus, {
			runtime,
			ports: { ...base.ports, sessionProvisioner },
			composition: {
				...base.composition,
				writeback: {
					db,
					knowledge: {
						create,
						async update(db2, id, patch, expectedVersion) {
							return { ok: true, item: await update(db2, id, patch, expectedVersion) };
						},
						recordConflict,
					},
				},
				worker: {
					pool: workerPool,
					adapterFactory: {
						create: (ws, registration) => {
							const message: WorkerRegisterMessage = {
								type: "register",
								id: registration.id,
								name: String(registration.name),
								modelProviders: Array.isArray(registration.modelProviders)
									? registration.modelProviders.map(String)
									: [],
								maxConcurrent: Number(registration.maxConcurrent),
							};
							return createHarnessAdapter({ kind: "remote", ws, registration: message });
						},
					},
				},
			},
		}),
	);
}
