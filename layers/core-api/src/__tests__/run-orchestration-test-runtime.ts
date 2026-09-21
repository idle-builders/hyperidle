import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
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
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { buildStandaloneDocumentRunners } from "../actions/compose.js";

/**
 * A real document writeback port, bound to the REAL `edit_document`/
 * `search_documents` actions (`buildStandaloneDocumentRunners`,
 * architecture.md §8.4) — never a hand-rolled Drizzle stub, and never the
 * legacy repository functions the pre-document-module version of this file
 * called directly. `openParent` is unreachable through this standalone
 * bag (compose.ts's own documented invariant): every writeback call this
 * test harness's callers make either sits under a real directory ancestor or
 * has no task/thread parent at all, so a document is never parented to a
 * task/thread through this port. `db`/`eventBus` are bound once, matching the
 * real `CoreApiBoot.editDocument`/`searchDocuments` shape (fixed at boot,
 * `caller`/`input` only per call).
 */
export function realDocumentWritebackPort(
	db: HyperIdleDb,
	eventBus: EventBus,
): {
	readonly editDocument: (
		caller: {
			readonly actor: string;
			readonly sessionId: string;
			readonly taskId: string | null;
			readonly threadId: string | null;
		},
		input: Parameters<ReturnType<typeof buildStandaloneDocumentRunners>["editDocument"]>[1],
	) => Promise<ActionResult<DocumentView>>;
	readonly searchDocuments: (
		caller: { readonly actor: string },
		input: Parameters<ReturnType<typeof buildStandaloneDocumentRunners>["searchDocuments"]>[1],
	) => Promise<ActionResult<readonly DocumentRow[]>>;
} {
	const runners = buildStandaloneDocumentRunners();
	return {
		editDocument: (caller, input) =>
			runners.editDocument(
				{
					actor: caller.actor,
					db,
					eventBus,
					now: new Date().toISOString(),
					caller: { sessionId: caller.sessionId, taskId: caller.taskId, threadId: caller.threadId },
				},
				input,
			),
		searchDocuments: (caller, input) =>
			runners.searchDocuments(
				{ actor: caller.actor, db, eventBus, now: new Date().toISOString() },
				input,
			) as Promise<ActionResult<readonly DocumentRow[]>>,
	};
}

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
					document: realDocumentWritebackPort(db, eventBus),
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
							return new RemoteHarnessAdapter(ws as WsLike, message);
						},
					},
				},
			},
		}),
	);
}
