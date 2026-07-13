import { randomUUID } from "node:crypto";
import {
	agentLifecycleInbox,
	explicitSessionStarts,
	type HyperIdleDb,
	taskDispatchAttempts,
} from "@hyperidle/db";
import * as work from "@hyperidle/work";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import * as routine from "../routine-service.js";

export const AGENT_LIFECYCLE_SOURCE_KINDS = [
	"assistant",
	"task",
	"knowledge",
	"routine",
	"decomposition",
	"proposed_call",
	"explicit_session_start",
] as const;

export const AGENT_LIFECYCLE_TERMINAL_STATES = ["completed", "failed", "cancelled"] as const;

type SourceKind = (typeof AGENT_LIFECYCLE_SOURCE_KINDS)[number];
type TerminalState = (typeof AGENT_LIFECYCLE_TERMINAL_STATES)[number];

export interface AgentLifecycleFact {
	readonly requestId: string;
	readonly sourceKind: SourceKind;
	readonly sourceId: string;
	readonly state: TerminalState;
	readonly sessionId?: string;
	readonly failureCode?: string;
}

type Projector = (db: HyperIdleDb, fact: AgentLifecycleFact) => Promise<void>;

const observeOnly: Projector = (db, fact) => {
	void db;
	void fact;
	return Promise.resolve();
};

const projectTask: Projector = async (db, fact) => {
	await db.transaction(async (tx) => {
		await tx
			.update(taskDispatchAttempts)
			.set({
				status: fact.state,
				sessionId: fact.sessionId ?? null,
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(taskDispatchAttempts.requestId, fact.requestId),
					or(
						eq(taskDispatchAttempts.status, "requested"),
						eq(taskDispatchAttempts.status, "running"),
					),
				),
			);
		await projectExplicitStart(tx, fact);
	});
};

const projectRoutine: Projector = async (db, fact) => {
	await routine.updateRoutineRunIfRunning(db, fact.sourceId, {
		outcome: fact.state === "completed" ? "success" : "error",
		endedAt: new Date().toISOString(),
		sessionId: fact.sessionId ?? null,
		errorMessage:
			fact.state === "completed"
				? null
				: (fact.failureCode ?? (fact.state === "cancelled" ? "cancelled" : "failed")),
	});
};

const projectDecomposition: Projector = async (db, fact) => {
	await work.updateBetDecompositionStatusIfRunning(db, fact.sourceId, {
		decompositionStatus: fact.state === "completed" ? "done" : "blocked",
		decompositionBlockerReason: fact.state === "completed" ? null : "failed",
	});
};

const projectExplicitStart: Projector = async (db, fact) => {
	await db
		.update(explicitSessionStarts)
		.set({
			status: fact.state,
			sessionId: fact.sessionId ?? null,
			failureCode: fact.state === "failed" ? (fact.failureCode ?? "INTERNAL_ERROR") : null,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.requestId, fact.requestId));
};

/**
 * Core owns projections, but several sources intentionally need no derived write.
 * @lore AU9: Explicit no-op projectors are part of the exhaustive contract: adding a
 * source cannot silently omit cancellation/failure handling from the registry.
 */
export const AGENT_LIFECYCLE_PROJECTORS: Record<SourceKind, Projector> = {
	assistant: observeOnly,
	task: projectTask,
	knowledge: observeOnly,
	routine: projectRoutine,
	decomposition: projectDecomposition,
	proposed_call: observeOnly,
	explicit_session_start: projectExplicitStart,
};

export async function drainAgentLifecycleInbox(
	db: HyperIdleDb,
	options: { now?: Date; leaseMs?: number; workerId?: string } = {},
): Promise<number> {
	// Inbox persistence/claiming is deliberately the delivery boundary. Projectors
	// never subscribe directly to the volatile event bus.
	let projected = 0;
	for (;;) {
		const now = options.now ?? new Date();
		const token = `${options.workerId ?? "core"}:${randomUUID()}`;
		const [candidate] = await db
			.select()
			.from(agentLifecycleInbox)
			.where(
				and(
					isNull(agentLifecycleInbox.projectedAt),
					or(
						isNull(agentLifecycleInbox.claimToken),
						lt(agentLifecycleInbox.claimExpiresAt, now.toISOString()),
					),
				),
			)
			.limit(1);
		if (!candidate) return projected;
		const [row] = await db
			.update(agentLifecycleInbox)
			.set({
				claimToken: token,
				claimExpiresAt: new Date(now.getTime() + (options.leaseMs ?? 30_000)).toISOString(),
				attempts: candidate.attempts + 1,
			})
			.where(
				and(
					eq(agentLifecycleInbox.requestId, candidate.requestId),
					isNull(agentLifecycleInbox.projectedAt),
					candidate.claimToken
						? eq(agentLifecycleInbox.claimToken, candidate.claimToken)
						: isNull(agentLifecycleInbox.claimToken),
				),
			)
			.returning();
		if (!row) continue;
		if (!AGENT_LIFECYCLE_SOURCE_KINDS.includes(row.sourceKind as SourceKind)) {
			await db
				.update(agentLifecycleInbox)
				.set({
					lastError: `Unsupported lifecycle source ${row.sourceKind}`,
					claimToken: null,
					claimExpiresAt: null,
				})
				.where(
					and(
						eq(agentLifecycleInbox.requestId, row.requestId),
						eq(agentLifecycleInbox.claimToken, token),
					),
				);
			throw new Error(`Unsupported lifecycle source ${row.sourceKind}`);
		}
		const fact: AgentLifecycleFact = {
			requestId: row.requestId,
			sourceKind: row.sourceKind as SourceKind,
			sourceId: row.sourceId,
			state: row.state as TerminalState,
			...(row.sessionId ? { sessionId: row.sessionId } : {}),
			...(row.failureCode ? { failureCode: row.failureCode } : {}),
		};
		try {
			await AGENT_LIFECYCLE_PROJECTORS[fact.sourceKind](db, fact);
			const acknowledged = await db
				.update(agentLifecycleInbox)
				.set({
					projectedAt: new Date().toISOString(),
					lastError: null,
					claimToken: null,
					claimExpiresAt: null,
				})
				.where(
					and(
						eq(agentLifecycleInbox.requestId, row.requestId),
						eq(agentLifecycleInbox.claimToken, token),
					),
				)
				.returning({ requestId: agentLifecycleInbox.requestId });
			projected += acknowledged.length;
		} catch (error) {
			await db
				.update(agentLifecycleInbox)
				.set({
					lastError: error instanceof Error ? error.message : String(error),
					claimToken: null,
					claimExpiresAt: null,
				})
				.where(
					and(
						eq(agentLifecycleInbox.requestId, row.requestId),
						eq(agentLifecycleInbox.claimToken, token),
					),
				);
			throw error;
		}
	}
}

/** Core-owned boot drain. Volatile events only accelerate this durable poller. */
export function startAgentLifecycleProjectionDrain(
	db: HyperIdleDb,
	options: { pollIntervalMs?: number } = {},
): () => void {
	let active = false;
	const drain = async () => {
		if (active) return;
		active = true;
		try {
			await drainAgentLifecycleInbox(db);
		} finally {
			active = false;
		}
	};
	void drain();
	const timer = setInterval(() => void drain(), options.pollIntervalMs ?? 1_000);
	timer.unref();
	return () => clearInterval(timer);
}
