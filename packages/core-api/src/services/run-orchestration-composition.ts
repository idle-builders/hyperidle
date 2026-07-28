/** Core API composition root for the run-orchestration service. */

import { applyProvisioningPlan, buildProvisioningPlan } from "@hyperidle/connections";
import type { AgentSessionRequest, HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { listFilesystems, startWatcher } from "@hyperidle/filesystems";
import {
	AdapterPool,
	createHarnessAdapter,
	createReturnEnforcement,
	provisionHarnessEnvironment,
} from "@hyperidle/harness-registry";
import { list as listKnowledge, rank as rankKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import {
	type RunOptions,
	type RunResult,
	type RunTransitionSpec,
	type RuntimeDeps,
	type RuntimePorts,
	runSession as runSessionInternal,
	startRuntime as startRuntimeInternal,
	transitionRun as transitionRunInternal,
} from "@hyperidle/run-orchestration";
import {
	claimSessionRequest,
	drainIntents,
	enqueueWorkIntent,
	findSessionRequest,
	listSessionRequests,
	reapExpired,
	releaseClaim,
	renewClaim,
	sessionRunRegistry,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import type { ToolContext, WorkerRegisterMessage } from "@hyperidle/shared";
import { EventBus, summarizeToolArgs } from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { transitionTask } from "@hyperidle/work";
import { costOps } from "./cost-bindings.js";
import { dispatchOps } from "./dispatch-bindings.js";
import { queueDeps } from "./durable-agent-queue.js";
import { buildToolRegistry, returnStatusTool, toolsForRole } from "./tool-provider-bindings.js";

const contextPorts: RuntimeDeps["composition"]["context"] = {
	knowledge: {
		list: (db, filters) => listKnowledge(db, filters),
		rankAndBudget: (db, items, scoringContext) =>
			rankKnowledge(db, [...items], { ...scoringContext, taskTags: [...scoringContext.taskTags] }),
		countTokens: (text) => Math.ceil(Buffer.byteLength(text, "utf8") / 4),
	},
	work: {
		getTaskById: (exec, id) => work.get(exec, "task", id),
		getBetById: (exec, id) => work.get(exec, "bet", id),
	},
	users: { getUserById: (db, id) => findUser(db, { id }) },
	routine: { getRoutineById: routineService.getRoutine },
	filesystems: { startWatcher },
	org: { getTeamById: (db, id) => getTeam(db, { id }) },
};

type SessionLifecyclePorts = NonNullable<RuntimeDeps["composition"]["provisioner"]>;
type SessionLifecycleRuntime = RuntimePorts["sessionLifecycle"];
type SessionContextPort = Parameters<SessionLifecycleRuntime["crashSession"]>[2];
type RuntimeInput = NonNullable<RuntimeDeps["runtime"]>;
type TransitionContext = Extract<RunTransitionSpec, { target: "session" }>["context"];
export type ProvisionSessionDeps = Pick<RuntimeInput, "db" | "eventBus" | "onHarnessStarted"> & {
	readonly adapterPool?: unknown;
	readonly workspace?: unknown;
};
type SessionLifecycleToolContext = Parameters<typeof buildToolRegistry>[0];
type ToolRegistryOptions = Parameters<typeof buildToolRegistry>[1];

const routineAccessor: SessionLifecyclePorts["routine"] = {
	getRoutineById: routineService.getRoutine,
	findRunningRoutineRun: (db, routineId) =>
		routineService
			.listRoutineRuns(db, { routineId, running: true, limit: 1 })
			.then((runs) => (runs[0] ? { id: runs[0].id } : undefined)),
	updateRoutineRunById: (exec, id, patch) => routineService.updateRoutineRun(exec, id, patch),
	updateRoutineById: routineService.updateRoutine,
	incrementRoutineCost: routineService.incrementRoutineCost,
};

const workAccessor: SessionLifecyclePorts["work"] = {
	getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
	updateTaskById: (
		exec: WriteExecutor,
		id: string,
		patch: { readonly state?: string; readonly auditTrail?: string },
	) => work.update(exec, "task", id, patch),
	getBetById: (exec: WriteExecutor, id: string) => work.get(exec, "bet", id),
	updateBetById: (exec: WriteExecutor, id: string, patch: { readonly tokensActualJson?: string }) =>
		work.update(exec, "bet", id, patch),
	transitionTask(db, eventBus, taskId, toState, dispatchOccasion) {
		return transitionTask(
			db,
			eventBus,
			taskId,
			toState,
			{
				workIntents: { record: enqueueWorkIntent },
				taskRunResolver: { requireRunnableAgent },
			},
			dispatchOccasion,
		);
	},
};

const userReader: SessionLifecyclePorts["users"] = {
	getUserById: (db, id) => findUser(db, { id }),
	getFirstUserByKind: (db, kind) => findUser(db, { kind }),
};

const settingsReader: SessionLifecyclePorts["settings"] = { readServerConfig };

const observabilityAccessor: SessionLifecyclePorts["observability"] = { summarizeToolArgs };

const filesystemsReader: SessionLifecyclePorts["filesystems"] = {
	listFilesystemIdsByAgent: async (db, agentId) => {
		const rows = await listFilesystems(db, { agentId });
		return rows.map((r) => r.id);
	},
	listFilesystemsByIds: (db, ids) => {
		if (ids.length === 0) return Promise.resolve([]);
		return listFilesystems(db, { ids: [...ids] });
	},
};

const connectionsProvisioner: SessionLifecyclePorts["connections"] = {
	buildProvisioningPlan: ({ db, resolver }) =>
		buildProvisioningPlan({
			db,
			resolver,
			users: { getFirstUserByKind: (db2, kind) => findUser(db2, { kind }) },
		}),
	applyProvisioningPlan,
};

const costAccessor: SessionLifecyclePorts["cost"] = {
	checkCostCap: costOps.check,
	recordCostAndCheck: costOps.record,
};

const enforcement = createReturnEnforcement();
const harnessRuntime: SessionLifecyclePorts["harnessRuntime"] = {
	enforcementRegistry: enforcement,
	createReturnGate: () => enforcement.createGate(),
	evaluateReturn: (gate, reason) => enforcement.evaluate(gate, reason),
	provisionReturnHook: async (options) => {
		await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
	},
	writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
};

function widenToToolContext(ctx: SessionLifecycleToolContext): ToolContext<HyperIdleDb> {
	return ctx as ToolContext<HyperIdleDb>;
}

const toolProvider: SessionLifecyclePorts["toolProvider"] = {
	buildToolRegistry(ctx, options) {
		return buildToolRegistry(widenToToolContext(ctx), {
			role: options.role,
			extraTools: options.extraTools as ToolRegistryOptions["extraTools"],
			sessionWorkflow: options.sessionWorkflow as ToolRegistryOptions["sessionWorkflow"],
			useOnlyExtraTools: options.useOnlyExtraTools,
		});
	},
	toolsForRole,
	returnStatusToolForRegistry(registry) {
		return returnStatusTool.forRegistry(registry);
	},
};

const sessionLifecyclePorts: SessionLifecyclePorts = {
	sessionRequests: {
		findSessionRequest,
		listSessionRequests,
		transitionSessionRequest: async (exec, transition) => {
			const result = await transitionSessionRequest(exec, transition);
			return result === undefined ? undefined : result;
		},
		abortSessionRun: (sessionId) => sessionRunRegistry.abort(sessionId),
		registerSessionRun: (sessionId, control) => sessionRunRegistry.register(sessionId, control),
		deregisterSessionRun: (sessionId) => sessionRunRegistry.deregister(sessionId),
	},
	routine: routineAccessor,
	work: workAccessor,
	users: userReader,
	settings: settingsReader,
	observability: observabilityAccessor,
	filesystems: filesystemsReader,
	connections: connectionsProvisioner,
	cost: costAccessor,
	harnessRuntime,
	toolProvider,
};
const transitionPorts: Parameters<typeof transitionRunInternal>[0]["ports"] = {
	sessionRequests: sessionLifecyclePorts.sessionRequests,
	routine: sessionLifecyclePorts.routine,
};

const sessionLifecyclePort: SessionLifecycleRuntime = {
	requestAgentTermination(db, input) {
		return transitionRunInternal(
			{ db, eventBus: new EventBus(), ports: transitionPorts },
			{
				target: "request",
				requestId: input.requestId,
				intent: "request-termination",
				reason: input.reason,
				requestedBy: input.requestedBy,
			},
		) as Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
	},
	recoverRequestedTerminations(db, eventBus) {
		return transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{ target: "request", intent: "recover-terminations" },
		) as Promise<number>;
	},
	async transitionAgentRunLifecycle(db, eventBus, input) {
		await transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{
				target: "request",
				requestId: input.requestId,
				intent: "terminalize",
				state: input.state,
				sessionId: input.sessionId,
				claimToken: input.claimToken,
				failureCode: input.failureCode,
			},
		);
	},
	async crashSession(
		db: HyperIdleDb,
		eventBus: EventBus,
		context: SessionContextPort,
		costInCents: number,
		baselineCost?: number,
	) {
		await transitionRunInternal(
			{ db, eventBus, ports: transitionPorts },
			{
				target: "session",
				context: context as TransitionContext,
				disposition: "crash",
				costInCents,
				baselineCost,
			},
		);
	},
};

// ---------------------------------------------------------------------------
// session-lifecycle's admission/execution surface — REAL since AU19
// Increment 3i, `@hyperidle/shared`'s `HarnessPort` (§7.4) satisfied by
// `session-lifecycle-bindings.ts`'s `harnessPort` export.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// dispatch — real, same-layer since AU19 Increment 3h, wired to
// dispatch-bindings.ts's bound dispatchOps.runAssistantTurn.
// ---------------------------------------------------------------------------

const dispatchPort: RuntimePorts["dispatch"] = {
	runAssistantTurn(deps: unknown, request: AgentSessionRequest): Promise<void> {
		// @lore boundary-crossing cast: `deps` is the real `AssistantTurnDeps` this
		// Service's own caller built — opaque-typed crossing the boundary
		// (`run-orchestration`'s own port keeps `deps: unknown`, never
		// inspecting `dispatch`'s internals, even though `dispatch` itself is
		// now a real migrated Service).
		return dispatchOps.runAssistantTurn(
			deps as Parameters<typeof dispatchOps.runAssistantTurn>[0],
			request,
		);
	},
};

const runOrchestrationPorts: RuntimePorts = {
	sessionRequests: {
		claimSessionRequest,
		findSessionRequest,
		listSessionRequests,
		releaseClaim,
		renewClaim,
		transitionSessionRequest,
		drainIntents,
		reapExpired,
	},
	sessionLifecycle: sessionLifecyclePort,
	dispatch: dispatchPort,
};

// ---------------------------------------------------------------------------
// harness-registry — INTERIM (NOT the final HarnessPort, §7.4 — a separate,
// later item builds that; see ports.ts's top `@lore`).
// ---------------------------------------------------------------------------

/** The live `AdapterPool` instance satisfies `RunOrchestrationAdapterPool` structurally — passed straight through, zero wrapper. */
/**
 * The ONE audited cast recovering `WorkerRegisterMessage` from this Service's
 * Mechanism-C-narrowed registration type (`ports.ts`'s top `@lore`) — the
 * SAME real object `worker-ws.ts` received off the wire, only its TYPE was
 * narrowed crossing the boundary. `registration`'s parameter type is `unknown`
 * (not a cast expression) so this is a single, contained assertion —
 * `design/no-unknown-cast` bans the `X as unknown as T` double-assertion
 * shape, not an audited single cast inside a named helper.
 */
// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/run-orchestration` directly for the deps-carrying functions.
// ---------------------------------------------------------------------------

const remoteHarnessAdapterFactory = {
	create(ws: unknown, registration: { readonly id: string; readonly [key: string]: unknown }) {
		return createHarnessAdapter({
			kind: "remote",
			ws,
			registration: widenWorkerRegistration(registration),
		});
	},
};

function widenWorkerRegistration(registration: unknown): WorkerRegisterMessage {
	return registration as WorkerRegisterMessage;
}

/** @lore AU6: production code must use this boundary naming — `durable-agent-queue.ts` re-exports it under the legacy alias (see this file's top `@lore`) for its own test-assertion-surface reasons; this module never declares that other name itself (au6-agent-boundary-guard bans re-declaring it as a local binding). */
export function runtimeDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides: Omit<Partial<RuntimeDeps>, "runtime"> & {
		readonly runtime?: ProvisionSessionDeps;
	} = {},
): RuntimeDeps {
	const { runtime, ...rest } = overrides;
	const adapterPool = runtime?.adapterPool instanceof AdapterPool ? runtime.adapterPool : undefined;
	return {
		db,
		eventBus,
		...rest,
		...(runtime ? { runtime: runtime as RuntimeInput } : {}),
		ports: overrides.ports ?? runOrchestrationPorts,
		// @lore AU21 §6 Decision B4: wire the real eventBus into the drain's own
		// deps bundle so `failOrRelease` can actually emit
		// `agent_run_admission_failed` in production, not just in tests that
		// build `queueDeps(db)` + `eventBus` by hand.
		durableQueue: overrides.durableQueue ?? { ...queueDeps(db), eventBus },
		composition: {
			context: contextPorts,
			provisioner: sessionLifecyclePorts,
			...(adapterPool
				? { worker: { pool: adapterPool, adapterFactory: remoteHarnessAdapterFactory } }
				: {}),
			...rest.composition,
		},
	};
}

export function runSession(deps: ProvisionSessionDeps, spec: RunOptions): Promise<RunResult> {
	return runSessionInternal(
		runtimeDeps(deps.db, deps.eventBus, { runtime: deps as RuntimeInput }),
		spec,
	);
}

export function transitionRun(
	db: HyperIdleDb,
	eventBus: EventBus,
	spec: Parameters<typeof transitionRunInternal>[1],
): ReturnType<typeof transitionRunInternal> {
	return transitionRunInternal({ db, eventBus, ports: transitionPorts }, spec);
}

export function startRuntime(deps: RuntimeDeps): ReturnType<typeof startRuntimeInternal> {
	return startRuntimeInternal(runtimeDeps(deps.db, deps.eventBus ?? new EventBus(), deps));
}
