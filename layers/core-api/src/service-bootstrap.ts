import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus } from "@hyperidle/event-bus";
import type { PolicyDeps } from "@hyperidle/policy";
import { registerLifecyclePropagation } from "@hyperidle/policy";
import * as taskDb from "@hyperidle/task";
import { listMessages } from "@hyperidle/thread";
import { deleteReadInboxRowsBefore } from "@hyperidle/user";

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
	readonly editTask: PolicyDeps["editTask"];
	readonly sendMessage: PolicyDeps["sendMessage"];
	readonly reaperStaleAfterMs?: number;
	readonly reaperCadenceMs?: number;
}): Array<() => void> {
	const { db, eventBus, editTask, sendMessage } = ctx;
	const disposers: Array<() => void> = [];

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
		await deleteReadInboxRowsBefore(db, termCutoff);
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
