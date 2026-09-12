import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { WorkerRegisterMessage } from "@hyperidle/harness-protocol";
import {
	AdapterPool,
	createReturnEnforcement,
	provisionHarnessEnvironment,
	RemoteHarnessAdapter,
	type WsLike,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import { returnStatusTool } from "@hyperidle/harness-registry/mcp";
import { create, recordConflict, reparent, update } from "@hyperidle/knowledge";
import type { RuntimeDeps, RuntimePorts } from "@hyperidle/run-orchestration";

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
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
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

/**
 * The `writeback`/`worker` composition slice every test runtime needs
 * (`startRuntime`'s `assertStartable` requires both present) — real knowledge
 * writeback, an inert worker pool nothing ever actually registers against.
 * Shared by `startTestRuntime` and `startTestRuntimeWithRealProvisioner` so
 * the two differ only in what `ports.sessionProvisioner` resolves to.
 */
function testRuntimeCompositionExtras(
	db: HyperIdleDb,
): Pick<RuntimeDeps["composition"], "writeback" | "worker"> {
	const workerPool = new AdapterPool();
	return {
		writeback: {
			db,
			knowledge: {
				create,
				async update(
					db2: HyperIdleDb,
					id: string,
					patch: Parameters<typeof update>[2],
					expectedVersion: number,
				) {
					return { ok: true, item: await update(db2, id, patch, expectedVersion) };
				},
				recordConflict,
				async reparentKnowledgeItem(
					db2: HyperIdleDb,
					id: string,
					input: Parameters<typeof reparent>[2],
				) {
					await reparent(db2, id, input);
				},
			},
		},
		worker: {
			pool: workerPool,
			adapterFactory: {
				create: (
					ws: unknown,
					registration: { readonly [key: string]: unknown; readonly id: string },
				) => {
					const message: WorkerRegisterMessage = {
						type: "register",
						id: registration.id,
						name: String(registration.name),
						modelProviders: Array.isArray(registration.modelProviders)
							? registration.modelProviders.map(String)
							: [],
						maxConcurrent: Number(registration.maxConcurrent),
					};
					return new RemoteHarnessAdapter(ws as WsLike, message);
				},
			},
		},
	};
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
	return composition.startRuntime(
		composition.runtimeDeps(db, eventBus, {
			runtime,
			ports: { ...base.ports, sessionProvisioner },
			composition: { ...base.composition, ...testRuntimeCompositionExtras(db) },
		}),
	);
}

/**
 * BA5 §4/§13 (L5, T8) — starts the public runtime with the REAL internal
 * provisioner (`admitSession`/`runSession`, `provisioner.ts`), not a stubbed
 * execution edge: `ports.sessionProvisioner` is left unset, so `startRuntime`'s
 * own default wraps its real `createProvisioner` around
 * `composition.provisioner` (real `harnessRuntime`/`toolProvider`/
 * `contextAssembly`, from `buildTestRunOrchestrationComposition`). Use this
 * when the thing under test is admission itself — the placement-failure hold
 * (Phase 4.5), not just the drain/claim machinery `startTestRuntime` proves
 * elsewhere. The only fake is `runtime.adapterPool`'s harness adapter — the
 * caller supplies it, since a real CLI harness has no place in a service test.
 */
export function startTestRuntimeWithRealProvisioner(
	db: HyperIdleDb,
	eventBus: EventBus,
	runtime: ProvisionSessionDeps,
	sandboxBasePath?: string,
) {
	const composition = buildTestRunOrchestrationComposition();
	const base = composition.runtimeDeps(db, eventBus);
	if (!base.ports) throw new Error("runtimeDeps did not provide production ports");
	return composition.startRuntime(
		composition.runtimeDeps(db, eventBus, {
			runtime,
			...(sandboxBasePath ? { sandboxBasePath } : {}),
			ports: base.ports,
			composition: { ...base.composition, ...testRuntimeCompositionExtras(db) },
		}),
	);
}
