import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus } from "@hyperidle/event-bus";
import type { PolicyDeps } from "@hyperidle/policy";
import { registerLifecyclePropagation } from "@hyperidle/policy";
import * as taskDb from "@hyperidle/task";
import { listMessages } from "@hyperidle/thread";
import { registerAgentHealthSessionEndReactions } from "./services/agent-health-session-end-reactions.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";
import { reapInbox } from "./services/inbox-reaper.js";
import { registerSessionNotReturnedNotice } from "./services/session-not-returned-notice.js";
import { registerWorkSessionEndReactions } from "./services/work-session-end-reactions.js";
import { registerWorkSessionStartedReactions } from "./services/work-session-started-reactions.js";

interface TaskDispatcherDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: unknown;
	readonly workspace: unknown;
	readonly sandboxBasePath: string;
	readonly mcpBridgeRegistry?: unknown;
	readonly mcpBaseUrl?: string;
	readonly mounter?: unknown;
}

const serviceBootstrapLog = createLogger({ pkg: "server.server-factory" });

function identifyBootstrapOwner(
	dispose: () => void,
	owner: string,
	cleanupEffect: string,
	constituents: readonly string[],
): () => void {
	return Object.assign(dispose, { owner, cleanupEffect, constituents });
}

/** Default staleness bound for the subscription-session reaper (1h). */
export const DEFAULT_REAPER_STALE_AFTER_MS = 60 * 60 * 1000;
const RETENTION_REAPER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const TERMINAL_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TASK_DISPATCH_ATTEMPT_REAP_BATCH_SIZE = 500;

export function reapTerminalTaskDispatchAttempts(
	db: HyperIdleDb,
	termCutoff: string,
	batchSize: number,
): Promise<number> {
	return taskDb.taskDispatchAttemptStore.reapTerminal(db, termCutoff, batchSize);
}

function buildPolicyDeps(
	editTask: PolicyDeps["editTask"],
	sendMessage: PolicyDeps["sendMessage"],
): PolicyDeps {
	return {
		work: {
			getTaskById: (exec: WriteExecutor, id: string) => taskDb.get(exec, "task", id),
			listChildTasks: (exec: WriteExecutor, parentTaskId: string) =>
				taskDb.list(exec, "task", { parentTaskId }),
			listAncestorIds: (exec: WriteExecutor, taskId: string) =>
				taskDb.listAncestorIds(exec, taskId),
		},
		conversation: {
			listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
				listMessages(db, {
					threadInitiatorId: initiatorId,
					types: ["verdict"],
					since: windowStart,
				}),
		},
		editTask,
		sendMessage,
	};
}

export function registerCoreDomainServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly editTask: PolicyDeps["editTask"];
	readonly sendMessage: import("./services/session-not-returned-notice.js").SendMessageRunFn;
	readonly editUser: import("./services/agent-health-session-end-reactions.js").EditUserRunFn;
	/** When true, generic (taskId) subscriptions auto-fire. */
	readonly canProvision?: boolean;
	readonly reaperStaleAfterMs?: number;
	readonly reaperCadenceMs?: number;
	/** Omitted from the type to avoid a core-module dependency on server harness types. */
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}): Array<() => void> {
	const { db, eventBus, editTask, sendMessage, editUser } = ctx;
	const disposers: Array<() => void> = [];

	disposers.push(
		identifyBootstrapOwner(
			registerAgentRunAdmissionReactions(db, eventBus, { sendMessage }),
			"agent-run-admission reactions",
			"unsubscribe",
			["agent_run_admission_failed subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerAgentHealthSessionEndReactions(db, eventBus, editUser),
			"agent-health session-end reactions",
			"unsubscribe",
			["session_ended subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionEndReactions(db, eventBus, editTask),
			"work session-end reactions",
			"unsubscribe",
			["agent_run_lifecycle_changed subscription", "session_ended subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerWorkSessionStartedReactions(db, eventBus, editTask),
			"work session-started reactions",
			"unsubscribe",
			["session_started subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerSessionNotReturnedNotice(db, eventBus, sendMessage),
			"session-not-returned notice",
			"unsubscribe",
			["session_not_returned subscription"],
		),
	);

	disposers.push(
		identifyBootstrapOwner(
			registerLifecyclePropagation(db, eventBus, buildPolicyDeps(editTask, sendMessage)),
			"lifecycle propagation registration",
			"unsubscribe",
			["lifecycle propagation"],
		),
	);
	const runRetentionSweep = async (): Promise<void> => {
		const nowMs = Date.now();
		const termCutoff = new Date(nowMs - TERMINAL_LOG_TTL_MS).toISOString();
		await reapInbox(db, termCutoff);
		await reapTerminalTaskDispatchAttempts(db, termCutoff, TASK_DISPATCH_ATTEMPT_REAP_BATCH_SIZE);
	};
	const retentionHandle = setInterval(() => {
		void runRetentionSweep().catch((err) => {
			serviceBootstrapLog.error("retention sweep failed", { err });
		});
	}, RETENTION_REAPER_INTERVAL_MS);
	disposers.push(
		identifyBootstrapOwner(
			() => clearInterval(retentionHandle),
			"retention reaper",
			"interval cleared",
			["retention interval"],
		),
	);

	return disposers;
}

export function registerAgentLayerServices(ctx: {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly agentOrchestration: AgentOrchestrationPort;
	readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
	readonly reaperStaleAfterMs?: number;
	/** When true, generic (taskId) subscriptions auto-fire. */
	readonly canProvision?: boolean;
	readonly reaperCadenceMs?: number;
}): Array<() => void> {
	const disposers: Array<() => void> = [];
	const reaperStaleAfterMs = ctx.reaperStaleAfterMs ?? DEFAULT_REAPER_STALE_AFTER_MS;

	void reaperStaleAfterMs;

	return disposers;
}
