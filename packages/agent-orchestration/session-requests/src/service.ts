import { randomUUID } from "node:crypto";
import type {
	AgentSessionRequest,
	AgentWorkIntent,
	Bet,
	ExplicitSessionStart,
	HyperIdleDb,
	KnowledgeItem,
	Message,
	ProposedCall,
	Routine,
	RoutineRun,
	TailoredGrant,
	Task,
	TaskDispatchAttempt,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import {
	agentLifecycleInbox,
	agentSessionRequests,
	agentWorkIntents,
	explicitSessionStarts,
	triggerResolutionHistory,
} from "@hyperidle/db";
import type {
	AgentRunAdmissionFailureCode,
	AgentSessionRequestInput,
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	ConfigurationKind,
	EventBus,
	ResolvedConfigurationItem,
	TriggerEventType,
	TriggerResolutionResult,
} from "@hyperidle/shared";
import {
	agentSessionRequestInputSchema,
	isAgentWorkIntentKind,
	isAgentWorkIntentSourceKind,
	isTriggerEventType,
	reportAdmissionFailure,
	TriggerRuleValueSchema,
} from "@hyperidle/shared";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

type LifecycleProjectionDeps = DurableAgentQueueDeps["lifecycleProjection"];
type LifecycleOptions = {
	readonly now?: Date;
	readonly leaseMs?: number;
	readonly workerId?: string;
	readonly maxAttempts?: number;
};
type IntentOptions = {
	readonly now?: () => Date;
	readonly leaseMs?: number;
	readonly maxAttempts?: number;
};
type ReapOptions = {
	readonly now?: Date;
	readonly retentionDays?: number;
	readonly batchSize?: number;
};
type TerminalInput =
	| {
			readonly requestId: string;
			readonly precondition: "running";
			readonly sessionId: string;
			readonly state: "completed" | "failed" | "cancelled";
			readonly failureCode?: string;
			readonly errorMessage?: string;
			readonly requireNoTerminationReason?: boolean;
	  }
	| {
			readonly requestId: string;
			readonly precondition: "claimed";
			readonly claimToken: string;
			readonly state: "failed";
			readonly failureCode?: string;
			readonly errorMessage?: string;
	  };

const lifecycleSourceKinds = [
	"assistant",
	"task",
	"knowledge",
	"routine",
	"decomposition",
	"proposed_call",
	"explicit_session_start",
] as const;
type LifecycleSourceKind = (typeof lifecycleSourceKinds)[number];
type Projector = (
	db: HyperIdleDb,
	fact: AgentLifecycleFact,
	deps: LifecycleProjectionDeps,
) => Promise<void>;
function isLifecycleSourceKind(value: string): value is LifecycleSourceKind {
	return (lifecycleSourceKinds as readonly string[]).includes(value);
}
function isTerminalState(value: string): value is AgentLifecycleFact["state"] {
	return value === "completed" || value === "failed" || value === "cancelled";
}
const observeOnly: Projector = async (db, fact, deps) => {
	void db;
	void fact;
	void deps;
};
const projectTask: Projector = async (db, fact, deps) => {
	await db.transaction(async (tx: WriteExecutor) => {
		await deps.work.updateTaskDispatchAttemptIfActive(tx, fact.requestId, {
			status: fact.state,
			sessionId: fact.sessionId ?? null,
		});
		await projectExplicitStart(tx, fact, deps);
	});
};
const projectRoutine: Projector = async (db, fact, deps) => {
	await deps.routine.updateRoutineRunIfRunning(db, fact.sourceId, {
		outcome: fact.state === "completed" ? "success" : "error",
		endedAt: /* @__PURE__ */ new Date().toISOString(),
		sessionId: fact.sessionId ?? null,
		errorMessage:
			fact.state === "completed"
				? null
				: (fact.failureCode ?? (fact.state === "cancelled" ? "cancelled" : "failed")),
	});
};
const projectDecomposition: Projector = async (db, fact, deps) => {
	await deps.work.updateBetDecompositionStatusIfRunning(db, fact.sourceId, {
		decompositionStatus: fact.state === "completed" ? "done" : "blocked",
		decompositionBlockerReason: fact.state === "completed" ? null : "failed",
	});
};
const projectExplicitStart: Projector = async (db, fact, deps) => {
	await deps.explicitSessionStarts.projectTerminalState(db, fact.requestId, {
		status: fact.state,
		sessionId: fact.sessionId ?? null,
		failureCode: fact.state === "failed" ? (fact.failureCode ?? "INTERNAL_ERROR") : null,
	});
};
const lifecycleProjectors: Record<LifecycleSourceKind, Projector> = {
	assistant: observeOnly,
	task: projectTask,
	knowledge: observeOnly,
	routine: projectRoutine,
	decomposition: projectDecomposition,
	proposed_call: observeOnly,
	explicit_session_start: projectExplicitStart,
};
async function processLifecycleInternal(
	db: HyperIdleDb,
	deps: LifecycleProjectionDeps,
	options: LifecycleOptions = {},
) {
	let projected = 0;
	for (;;) {
		const now = options.now ?? /* @__PURE__ */ new Date();
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
				claimExpiresAt: new Date(now.getTime() + (options.leaseMs ?? 3e4)).toISOString(),
				attempts: candidate.attempts + 1,
			})
			.where(
				and(
					eq(agentLifecycleInbox.requestId, candidate.requestId),
					isNull(agentLifecycleInbox.projectedAt),
					candidate.claimToken
						? and(
								eq(agentLifecycleInbox.claimToken, candidate.claimToken),
								eq(agentLifecycleInbox.claimExpiresAt, candidate.claimExpiresAt ?? ""),
								lt(agentLifecycleInbox.claimExpiresAt, now.toISOString()),
							)
						: isNull(agentLifecycleInbox.claimToken),
				),
			)
			.returning();
		if (!row) continue;
		try {
			if (!(isLifecycleSourceKind(row.sourceKind) && isTerminalState(row.state))) {
				throw new Error(`Unsupported lifecycle source ${row.sourceKind}`);
			}
			const fact: AgentLifecycleFact = {
				requestId: row.requestId,
				sourceKind: row.sourceKind,
				sourceId: row.sourceId,
				state: row.state,
				...(row.sessionId ? { sessionId: row.sessionId } : {}),
				...(row.failureCode ? { failureCode: row.failureCode } : {}),
			};
			await lifecycleProjectors[row.sourceKind](db, fact, deps);
			const acknowledged = await db
				.update(agentLifecycleInbox)
				.set({
					projectedAt: /* @__PURE__ */ new Date().toISOString(),
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
			const poison = row.attempts >= (options.maxAttempts ?? 3);
			await db
				.update(agentLifecycleInbox)
				.set({
					lastError: error instanceof Error ? error.message : String(error),
					...(poison
						? {
								projectedAt: /* @__PURE__ */ new Date().toISOString(),
								claimToken: null,
								claimExpiresAt: null,
							}
						: {}),
				})
				.where(
					and(
						eq(agentLifecycleInbox.requestId, row.requestId),
						eq(agentLifecycleInbox.claimToken, token),
					),
				);
		}
	}
}
function startLifecycleInternal(
	db: HyperIdleDb,
	deps: LifecycleProjectionDeps,
	options: { readonly pollIntervalMs?: number } = {},
) {
	let active = false;
	const drain = async () => {
		if (active) return;
		active = true;
		try {
			await processLifecycleInternal(db, deps);
		} finally {
			active = false;
		}
	};
	void drain();
	// Node clamps overflowing delays to 1ms, which turns a disabled/long-lived
	// drain into a hot loop. Clamp explicitly to the largest supported delay.
	const pollIntervalMs = Math.min(Math.max(1, options.pollIntervalMs ?? 1e3), 2_147_483_647);
	const timer = setInterval(() => void drain(), pollIntervalMs);
	timer.unref();
	return () => clearInterval(timer);
}

async function appendLifecycleFactInternal(
	exec: WriteExecutor,
	fact: AgentLifecycleFact & { readonly occurredAt: string },
) {
	await exec
		.insert(agentLifecycleInbox)
		.values({
			requestId: fact.requestId,
			sourceKind: fact.sourceKind,
			sourceId: fact.sourceId,
			state: fact.state,
			sessionId: fact.sessionId,
			failureCode: fact.failureCode,
			occurredAt: fact.occurredAt,
		})
		.onConflictDoNothing();
}
function listReapableLifecycleInternal(exec: WriteExecutor, cutoff: string, batchSize: number) {
	return exec
		.select({ requestId: agentLifecycleInbox.requestId })
		.from(agentLifecycleInbox)
		.where(
			and(isNotNull(agentLifecycleInbox.projectedAt), lt(agentLifecycleInbox.occurredAt, cutoff)),
		)
		.limit(batchSize);
}
async function deleteLifecycleFactsInternal(exec: WriteExecutor, requestIds: string[]) {
	if (requestIds.length === 0) return;
	await exec.delete(agentLifecycleInbox).where(inArray(agentLifecycleInbox.requestId, requestIds));
}

function nowIso() {
	return /* @__PURE__ */ new Date().toISOString();
}
function rowToRequest(row: AgentSessionRequest): AgentSessionRequest {
	return row;
}
async function findRequestIdentityInternal(
	db: HyperIdleDb,
	key: {
		readonly sourceKind: AgentSessionSourceKind;
		readonly sourceId: string;
		readonly idempotencyKey: string;
	},
) {
	const [existing] = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, key.sourceKind),
				eq(agentSessionRequests.sourceId, key.sourceId),
				eq(agentSessionRequests.idempotencyKey, key.idempotencyKey),
			),
		)
		.limit(1);
	return existing;
}
async function findRequestSessionInternal(db: HyperIdleDb, sessionId: string) {
	const [row] = await db
		.select({ id: agentSessionRequests.id })
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sessionId, sessionId))
		.limit(1);
	return row;
}
async function findRequestIdInternal(db: HyperIdleDb, requestId: string) {
	const [row] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, requestId))
		.limit(1);
	return row;
}
function listRequestsSourceInternal(
	db: HyperIdleDb,
	sourceKind: AgentSessionSourceKind,
	sourceId: string,
) {
	return db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, sourceKind),
				eq(agentSessionRequests.sourceId, sourceId),
			),
		)
		.orderBy(asc(agentSessionRequests.createdAt), asc(agentSessionRequests.id));
}
function listRunningRequestsInternal(db: HyperIdleDb) {
	return db.select().from(agentSessionRequests).where(eq(agentSessionRequests.status, "running"));
}
async function hasActiveRequestClaimInternal(
	db: HyperIdleDb,
	input: { readonly requestId: string; readonly claimToken: string; readonly now: Date },
) {
	const [owned] = await db
		.select({ id: agentSessionRequests.id })
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.id, input.requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, input.claimToken),
				gt(agentSessionRequests.claimExpiresAt, input.now.toISOString()),
			),
		)
		.limit(1);
	return Boolean(owned);
}
async function insertRequestInternal(db: HyperIdleDb, input: AgentSessionRequestInput) {
	const parsed = agentSessionRequestInputSchema.parse(input);
	const existing = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, parsed.sourceKind),
				eq(agentSessionRequests.sourceId, parsed.sourceId),
				eq(agentSessionRequests.idempotencyKey, parsed.idempotencyKey),
			),
		)
		.limit(1);
	if (existing[0]) return rowToRequest(existing[0]);
	const ts = nowIso();
	const id = randomUUID();
	const values = {
		id,
		sourceKind: parsed.sourceKind,
		sourceId: parsed.sourceId,
		streamId: parsed.streamId,
		taskId: parsed.taskId ?? null,
		agentId: parsed.agentId,
		teamId: parsed.teamId ?? null,
		userId: parsed.userId ?? null,
		promptMode: parsed.promptMode,
		payloadJson: parsed.payloadJson ?? null,
		sourceCorrelationJson: JSON.stringify(parsed.sourceCorrelation),
		idempotencyKey: parsed.idempotencyKey,
		status: "pending",
		createdAt: ts,
		updatedAt: ts,
	};
	const inserted = await db
		.insert(agentSessionRequests)
		.values(values)
		.onConflictDoNothing({
			target: [
				agentSessionRequests.sourceKind,
				agentSessionRequests.sourceId,
				agentSessionRequests.idempotencyKey,
			],
		})
		.returning();
	const insertedRow = inserted[0];
	if (insertedRow) return rowToRequest(insertedRow);
	const [racedExisting] = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, parsed.sourceKind),
				eq(agentSessionRequests.sourceId, parsed.sourceId),
				eq(agentSessionRequests.idempotencyKey, parsed.idempotencyKey),
			),
		)
		.limit(1);
	if (!racedExisting) throw new Error("Failed to create agent session request");
	return rowToRequest(racedExisting);
}
async function claimNextRequestInternal(
	db: HyperIdleDb,
	workerId: string,
	options: Pick<ClaimOptions, "now" | "leaseMs">,
) {
	const now = options.now.toISOString();
	const candidates = await db
		.select()
		.from(agentSessionRequests)
		.where(
			or(
				eq(agentSessionRequests.status, "pending"),
				and(
					eq(agentSessionRequests.status, "claimed"),
					lt(agentSessionRequests.claimExpiresAt, now),
				),
			),
		)
		.orderBy(asc(agentSessionRequests.createdAt))
		.limit(1);
	const candidate = candidates[0];
	if (!candidate) return null;
	return claimRequestIdInternal(db, candidate.id, workerId, options);
}
async function claimRequestIdInternal(
	db: HyperIdleDb,
	requestId: string,
	workerId: string,
	options: Pick<ClaimOptions, "now" | "leaseMs">,
) {
	const now = options.now.toISOString();
	const expires = new Date(options.now.getTime() + options.leaseMs).toISOString();
	const token = randomUUID();
	const [observed] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, requestId))
		.limit(1);
	if (!observed) return null;
	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "claimed",
			claimedBy: workerId,
			claimedAt: now,
			claimExpiresAt: expires,
			claimToken: token,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentSessionRequests.id, requestId),
				observed.status === "pending"
					? and(
							eq(agentSessionRequests.status, "pending"),
							eq(agentSessionRequests.updatedAt, observed.updatedAt),
						)
					: and(
							eq(agentSessionRequests.status, "claimed"),
							eq(agentSessionRequests.claimToken, observed.claimToken ?? ""),
							eq(agentSessionRequests.claimExpiresAt, observed.claimExpiresAt ?? ""),
							lt(agentSessionRequests.claimExpiresAt, now),
						),
			),
		)
		.returning();
	return updated[0] ? rowToRequest(updated[0]) : null;
}
async function extendRequestClaimInternal(
	db: HyperIdleDb,
	input: Pick<ClaimOptions, "now" | "leaseMs"> & {
		readonly requestId: string;
		readonly claimToken: string;
	},
) {
	const expires = new Date(input.now.getTime() + input.leaseMs).toISOString();
	const renewed = await db
		.update(agentSessionRequests)
		.set({
			claimExpiresAt: expires,
			updatedAt: input.now.toISOString(),
		})
		.where(
			and(
				eq(agentSessionRequests.id, input.requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, input.claimToken),
				gt(agentSessionRequests.claimExpiresAt, input.now.toISOString()),
			),
		)
		.returning({ id: agentSessionRequests.id });
	return renewed.length === 1;
}
async function admitClaimedRequestInternal(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
	claimToken: string,
	now: Date = new Date(),
) {
	const predicate = and(
		eq(agentSessionRequests.id, requestId),
		eq(agentSessionRequests.status, "claimed"),
		eq(agentSessionRequests.claimToken, claimToken),
		gt(agentSessionRequests.claimExpiresAt, now.toISOString()),
	);
	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "running",
			sessionId,
			claimedBy: null,
			claimedAt: null,
			claimToken: null,
			claimExpiresAt: null,
			updatedAt: nowIso(),
		})
		.where(predicate)
		.returning({ id: agentSessionRequests.id });
	if (updated.length !== 1) throw new Error(`Lost request custody before admission: ${requestId}`);
	await db
		.update(triggerResolutionHistory)
		.set({ sessionId })
		.where(eq(triggerResolutionHistory.requestId, requestId));
}
async function requeueClaimedRequestInternal(
	db: HyperIdleDb,
	requestId: string,
	claimToken: string,
) {
	const released = await db
		.update(agentSessionRequests)
		.set({
			status: "pending",
			claimedBy: null,
			claimedAt: null,
			claimToken: null,
			claimExpiresAt: null,
			updatedAt: nowIso(),
		})
		.where(
			and(
				eq(agentSessionRequests.id, requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, claimToken),
			),
		)
		.returning({ id: agentSessionRequests.id });
	return released.length === 1;
}
async function finishRequestInTxInternal(tx: WriteExecutor, input: TerminalInput) {
	const now = nowIso();
	const baseSet = {
		status: input.state,
		errorCode: input.failureCode ?? null,
		errorMessage: input.errorMessage ?? null,
		claimToken: null,
		claimExpiresAt: null,
		claimedBy: null,
		claimedAt: null,
		updatedAt: now,
	};
	const predicate =
		input.precondition === "running"
			? and(
					eq(agentSessionRequests.id, input.requestId),
					eq(agentSessionRequests.status, "running"),
					eq(agentSessionRequests.sessionId, input.sessionId),
					input.requireNoTerminationReason
						? sql`${agentSessionRequests.terminationReason} is null`
						: sql`true`,
				)
			: and(
					eq(agentSessionRequests.id, input.requestId),
					eq(agentSessionRequests.status, "claimed"),
					eq(agentSessionRequests.claimToken, input.claimToken),
				);
	const [winner] = await tx
		.update(agentSessionRequests)
		.set(input.precondition === "running" ? { ...baseSet, sessionId: input.sessionId } : baseSet)
		.where(predicate)
		.returning();
	if (!winner) return null;
	await appendLifecycleFactInternal(tx, {
		requestId: winner.id,
		sourceKind: winner.sourceKind,
		sourceId: winner.sourceId,
		state: input.state,
		...(input.precondition === "running" ? { sessionId: input.sessionId } : {}),
		...(input.failureCode ? { failureCode: input.failureCode } : {}),
		occurredAt: now,
	});
	return winner;
}
async function finishRequestInternal(db: HyperIdleDb, input: TerminalInput) {
	return db.transaction((tx: WriteExecutor) => finishRequestInTxInternal(tx, input));
}
async function findTerminationInternal(tx: WriteExecutor, requestId: string) {
	const [current] = await tx
		.select({ terminationReason: agentSessionRequests.terminationReason })
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, requestId))
		.limit(1);
	return current?.terminationReason;
}
async function requestTerminationInternal(
	db: HyperIdleDb,
	input: { readonly requestId: string; readonly reason: string; readonly requestedBy?: string },
) {
	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, input.requestId))
		.limit(1);
	if (!request) throw new Error(`Unknown agent request ${input.requestId}`);
	if (["completed", "failed", "cancelled"].includes(request.status)) return "terminal";
	if (request.terminationReason === input.reason) return "idempotent";
	if (request.terminationReason) return "conflict";
	const now = /* @__PURE__ */ new Date().toISOString();
	const updated = await db
		.update(agentSessionRequests)
		.set({
			terminationReason: input.reason,
			terminationRequestedAt: now,
			terminationRequestedBy: input.requestedBy ?? null,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentSessionRequests.id, input.requestId),
				eq(agentSessionRequests.status, "running"),
				sql`${agentSessionRequests.terminationReason} is null`,
			),
		)
		.returning({ id: agentSessionRequests.id });
	return updated.length === 1 ? "accepted" : "conflict";
}

var DEFAULT_LEASE_MS = 3e4;
var DEFAULT_MAX_ATTEMPTS = 5;
var MAX_BACKOFF_MS = 6e4;
var InvalidAgentWorkSourceError = class extends Error {};
async function claimIntentInternal(
	db: HyperIdleDb,
	input: { readonly now: Date; readonly leaseMs: number; readonly workerId: string },
) {
	const nowIso2 = input.now.toISOString();
	const [candidate] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			or(
				and(eq(agentWorkIntents.status, "pending"), lte(agentWorkIntents.updatedAt, nowIso2)),
				and(eq(agentWorkIntents.status, "claimed"), lt(agentWorkIntents.claimExpiresAt, nowIso2)),
			),
		)
		.orderBy(asc(agentWorkIntents.createdAt))
		.limit(1);
	if (!candidate) return null;
	const token = randomUUID();
	const expires = new Date(input.now.getTime() + input.leaseMs).toISOString();
	const predicate =
		candidate.status === "pending"
			? and(
					eq(agentWorkIntents.id, candidate.id),
					eq(agentWorkIntents.status, "pending"),
					eq(agentWorkIntents.updatedAt, candidate.updatedAt),
				)
			: and(
					eq(agentWorkIntents.id, candidate.id),
					eq(agentWorkIntents.status, "claimed"),
					eq(agentWorkIntents.claimToken, candidate.claimToken ?? ""),
					eq(agentWorkIntents.claimExpiresAt, candidate.claimExpiresAt ?? ""),
					lt(agentWorkIntents.claimExpiresAt, nowIso2),
				);
	const [claimed] = await db
		.update(agentWorkIntents)
		.set({
			status: "claimed",
			claimToken: token,
			claimExpiresAt: expires,
			attempts: candidate.attempts + 1,
			updatedAt: nowIso2,
		})
		.where(predicate)
		.returning();
	return claimed ?? null;
}
async function failOrRelease(
	db: HyperIdleDb,
	deps: DurableAgentQueueDeps,
	intent: AgentWorkIntent,
	error: unknown,
	options: IntentOptions,
) {
	if (!intent.claimToken) throw new Error(`Claimed intent ${intent.id} has no claim token`);
	const now = (options.now ?? (() => /* @__PURE__ */ new Date()))();
	const terminal =
		error instanceof InvalidAgentWorkSourceError ||
		intent.attempts >= (options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
	const delay = Math.min(1e3 * 2 ** Math.max(0, intent.attempts - 1), MAX_BACKOFF_MS);
	// @lore AU21 §10: this classification also drives the NEW
	// `agent_run_admission_failed` event's `failureCode` below, not just the
	// row's `lastErrorCode` — see that emission for why a non-terminal attempt
	// still needs a value even though architecture.md doesn't pin one exactly
	// (flagged CONFUSION in this wave's report).
	const failureCode: AgentRunAdmissionFailureCode =
		error instanceof InvalidAgentWorkSourceError ? "INVALID_WORK_SOURCE" : "MAX_ATTEMPTS_EXCEEDED";
	await db
		.update(agentWorkIntents)
		.set({
			status: terminal ? "failed" : "pending",
			claimToken: null,
			claimExpiresAt: null,
			lastError: error instanceof Error ? error.message : String(error),
			lastErrorCode: terminal ? failureCode : null,
			updatedAt: terminal ? now.toISOString() : new Date(now.getTime() + delay).toISOString(),
		})
		.where(
			and(eq(agentWorkIntents.id, intent.id), eq(agentWorkIntents.claimToken, intent.claimToken)),
		);
	// @lore AU21 §6 Decision B4/§13: the OLD direct
	// `deps.routine.updateRoutineRunIfRunning` write for a terminal
	// `routine_run` failure is GONE — replaced by this event, reacted to by a
	// core-api subscriber (`registerAgentRunAdmissionReactions`), for EVERY
	// kind, not just `routine_run`. `deps.eventBus` is optional (back-compat
	// with every pre-existing `queueDeps(db)` call site that never wired one).
	// `reportAdmissionFailure` (the shared `@hyperidle/shared` construction+
	// emission point) is also called by `run-orchestration`'s
	// `runClaimedRequest` for the provisioning-time failure site (§12).
	if (
		deps.eventBus &&
		isAgentWorkIntentKind(intent.kind) &&
		isAgentWorkIntentSourceKind(intent.sourceKind)
	) {
		reportAdmissionFailure(deps.eventBus, {
			intentId: intent.id,
			kind: intent.kind,
			sourceKind: intent.sourceKind,
			sourceId: intent.sourceId,
			failureCode,
			terminal,
			timestamp: now.getTime(),
		});
	}
}
/**
 * AU21 Decision B‴ — before claiming/dispatching, check whether a FRESHER
 * pending/claimed intent already exists for the same `(kind, sourceId)` work
 * identity (a re-emit bumped `idempotencyKey` for outstanding work). Reuses
 * the existing identity shape + AU9 CAS; own-state only, no core-api read.
 */
async function findNewerPendingSiblingInternal(
	db: HyperIdleDb,
	intent: AgentWorkIntent,
): Promise<AgentWorkIntent | undefined> {
	const [newer] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, intent.kind),
				eq(agentWorkIntents.sourceId, intent.sourceId),
				sql`${agentWorkIntents.id} != ${intent.id}`,
				inArray(agentWorkIntents.status, ["pending", "claimed"]),
				or(
					gt(agentWorkIntents.createdAt, intent.createdAt),
					and(eq(agentWorkIntents.createdAt, intent.createdAt), gt(agentWorkIntents.id, intent.id)),
				),
			),
		)
		.orderBy(asc(agentWorkIntents.createdAt), asc(agentWorkIntents.id))
		.limit(1);
	return newer;
}
async function markSupersededInternal(db: HyperIdleDb, intent: AgentWorkIntent): Promise<void> {
	if (!intent.claimToken) throw new Error(`Claimed intent ${intent.id} has no claim token`);
	await db
		.update(agentWorkIntents)
		.set({
			status: "superseded",
			claimToken: null,
			claimExpiresAt: null,
			lastError: null,
			updatedAt: /* @__PURE__ */ new Date().toISOString(),
		})
		.where(
			and(eq(agentWorkIntents.id, intent.id), eq(agentWorkIntents.claimToken, intent.claimToken)),
		);
}
/** `intent.bakedRequestJson` parsed, or `undefined` for a not-yet-migrated kind. */
function parseBakedRequest(intent: AgentWorkIntent): BakedWorkIntentRequest | undefined {
	if (!intent.bakedRequestJson) return undefined;
	return JSON.parse(intent.bakedRequestJson) as BakedWorkIntentRequest;
}
/**
 * AU21 §9 Increment 3 co-existence scaffolding — an already-baked request is
 * used DIRECTLY (zero domain reads): reconstruct the full `triggered` request
 * shape from the persisted baked fields plus the two pieces trivially
 * re-derivable from the intent row itself (`eventType`, `idempotencyKey`),
 * then insert the session request straight away — no trigger-rule matching,
 * no re-validation. The emit-time resolver already did that work.
 */
async function createFromBakedRequestInternal(
	db: HyperIdleDb,
	intent: AgentWorkIntent,
	baked: BakedWorkIntentRequest,
): Promise<{ readonly request: AgentSessionRequest }> {
	const requestInput = agentSessionRequestInputSchema.parse({
		sourceKind: baked.sourceKind,
		sourceId: baked.sourceId,
		streamId: baked.streamId,
		agentId: baked.defaultAgentId,
		teamId: baked.teamId,
		userId: baked.userId,
		taskId: baked.taskId,
		promptMode: PROMPT_MODE_BY_SOURCE[baked.sourceKind],
		idempotencyKey: intent.idempotencyKey,
		sourceCorrelation: baked.sourceCorrelation,
	});
	const request = await insertRequestInternal(db, requestInput);
	return { request };
}
async function handOffInternal(
	db: HyperIdleDb,
	intent: AgentWorkIntent,
	claimToken: string,
	now: Date,
	createRequest: (tx: WriteExecutor) => Promise<{ readonly request: AgentSessionRequest }>,
): Promise<void> {
	await db.transaction(async (tx: WriteExecutor) => {
		const { request } = await createRequest(tx);
		const checkpoint = await tx
			.update(agentWorkIntents)
			.set({
				status: "handed_off",
				requestId: request.id,
				claimToken: null,
				claimExpiresAt: null,
				lastError: null,
				updatedAt: now.toISOString(),
			})
			.where(and(eq(agentWorkIntents.id, intent.id), eq(agentWorkIntents.claimToken, claimToken)))
			.returning({ id: agentWorkIntents.id });
		if (checkpoint.length !== 1) throw new Error(`Lost intent custody ${intent.id}`);
	});
}
async function processIntentsInternal(
	db: HyperIdleDb,
	deps: DurableAgentQueueDeps,
	options: IntentOptions = {},
) {
	for (;;) {
		const now = (options.now ?? (() => /* @__PURE__ */ new Date()))();
		const intent = await claimIntentInternal(db, {
			now,
			leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
			workerId: "drain",
		});
		if (!intent) return;
		if (!intent.claimToken) throw new Error(`Claimed intent ${intent.id} has no claim token`);
		const claimToken = intent.claimToken;

		const supersededBy = await findNewerPendingSiblingInternal(db, intent);
		if (supersededBy) {
			await markSupersededInternal(db, intent);
			continue;
		}

		try {
			const baked = parseBakedRequest(intent);
			if (baked) {
				await handOffInternal(db, intent, claimToken, now, (tx) =>
					createFromBakedRequestInternal(tx, intent, baked),
				);
			} else {
				// AU21 §6 Decision B / §9 Increment 4: every one of the seven
				// intent kinds now resolves + bakes its request at EMIT time
				// (`resolveIntentInputInternal`'s per-kind drain-time resolution —
				// the last surviving case, `routine_run` — is deleted). An intent
				// reaching the drain with no baked payload is not a kind to resolve
				// here; it is an invalid work source (the same terminal-failure
				// shape a truly invalid source always produced).
				throw new InvalidAgentWorkSourceError(
					`Intent ${intent.id} (kind ${intent.kind}) carries no baked request`,
				);
			}
		} catch (error) {
			await failOrRelease(db, deps, intent, error, options);
		}
	}
}

var defaultRetentionDays = 30;
var defaultRetentionBatchSize = 500;
async function insertIntentInternal(db: WriteExecutor, input: WorkIntentInput) {
	const existing = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, input.kind),
				eq(agentWorkIntents.sourceId, input.sourceId),
				eq(agentWorkIntents.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	if (existing[0]) return existing[0];
	const timestamp = /* @__PURE__ */ new Date().toISOString();
	const [inserted] = await db
		.insert(agentWorkIntents)
		.values({
			id: randomUUID(),
			kind: input.kind,
			sourceKind: input.sourceKind,
			sourceId: input.sourceId,
			requestedBy: input.requestedBy ?? null,
			idempotencyKey: input.idempotencyKey,
			status: "pending",
			bakedRequestJson: input.bakedRequest ? JSON.stringify(input.bakedRequest) : null,
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.onConflictDoNothing()
		.returning();
	if (inserted) return inserted;
	const [raced] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, input.kind),
				eq(agentWorkIntents.sourceId, input.sourceId),
				eq(agentWorkIntents.idempotencyKey, input.idempotencyKey),
			),
		);
	if (!raced) throw new Error("Failed to record agent work intent");
	return raced;
}
async function findIntentSourceInternal(
	db: HyperIdleDb,
	kind: WorkIntentInput["kind"],
	sourceId: string,
) {
	const [row] = await db
		.select()
		.from(agentWorkIntents)
		.where(and(eq(agentWorkIntents.kind, kind), eq(agentWorkIntents.sourceId, sourceId)))
		.limit(1);
	return row;
}
async function findIntentRequestInternal(db: HyperIdleDb, requestId: string) {
	// @lore AU21 §12: widened to also select `id`/`kind` (the exported overload
	// already TYPED this Pick shape — `id`/`idempotencyKey` were declared but
	// never actually selected, a latent pre-existing mismatch nothing had
	// tripped since no caller read those fields). Now genuinely needed:
	// `reportAdmissionFailure`'s provisioning-time call site correlates a
	// post-handoff `AgentSessionRequest` failure back to the ORIGINAL intent's
	// identity (`id`/`kind`/`sourceId`/`sourceKind`) to emit
	// `agent_run_admission_failed` with the right shape.
	const [row] = await db
		.select({
			id: agentWorkIntents.id,
			kind: agentWorkIntents.kind,
			sourceId: agentWorkIntents.sourceId,
			sourceKind: agentWorkIntents.sourceKind,
			idempotencyKey: agentWorkIntents.idempotencyKey,
		})
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.requestId, requestId))
		.limit(1);
	return row;
}
async function reapIntentsInternal(
	db: HyperIdleDb,
	deps: DurableAgentQueueDeps,
	options: ReapOptions = {},
) {
	const now = options.now ?? /* @__PURE__ */ new Date();
	const retentionDays = options.retentionDays ?? defaultRetentionDays;
	const batchSize = options.batchSize ?? defaultRetentionBatchSize;
	const cutoff = new Date(now.getTime() - retentionDays * 864e5).toISOString();
	return await db.transaction(async (tx: WriteExecutor) => {
		const projected = await listReapableLifecycleInternal(tx, cutoff, batchSize);
		if (projected.length > 0) {
			await deleteLifecycleFactsInternal(
				tx,
				projected.map((row) => row.requestId),
			);
		}
		const candidates = (await tx.execute(sql`
			select i.id
			from agent_work_intents i
			left join agent_session_requests r on r.id = i.request_id
			where i.status in ('handed_off', 'failed')
			  and i.updated_at < ${cutoff}
			  and (i.request_id is null or r.status in ('completed', 'failed', 'cancelled'))
			order by i.updated_at, i.id
			limit ${batchSize}
		`)) as { readonly rows: ReadonlyArray<{ readonly id: string }> };
		const ids = candidates.rows.map((row) => row.id);
		if (ids.length > 0) {
			await tx.delete(agentWorkIntents).where(inArray(agentWorkIntents.id, ids));
		}
		const oldStarts = await tx
			.delete(explicitSessionStarts)
			.where(
				and(
					inArray(explicitSessionStarts.status, ["completed", "failed", "cancelled"]),
					lt(explicitSessionStarts.updatedAt, cutoff),
				),
			)
			.returning({ id: explicitSessionStarts.id });
		const taskAttempts = await deps.work.reapTerminalTaskDispatchAttempts(tx, cutoff, batchSize);
		return {
			inbox: projected.length,
			intents: ids.length,
			explicitStarts: oldStarts.length,
			taskAttempts,
		};
	});
}

async function findStartInternal(db: HyperIdleDb, id: string) {
	const [row] = await db
		.select()
		.from(explicitSessionStarts)
		.where(eq(explicitSessionStarts.id, id))
		.limit(1);
	return row;
}
async function admitStartInternal(
	db: HyperIdleDb,
	input: { readonly id: string; readonly requestId: string; readonly sessionId: string },
) {
	await db
		.update(explicitSessionStarts)
		.set({
			status: "admitted",
			requestId: input.requestId,
			sessionId: input.sessionId,
			updatedAt: /* @__PURE__ */ new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.id, input.id));
}
async function failStartInternal(
	db: HyperIdleDb,
	input: { readonly id: string; readonly failureCode: string },
) {
	await db
		.update(explicitSessionStarts)
		.set({
			status: "failed",
			failureCode: input.failureCode,
			updatedAt: /* @__PURE__ */ new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.id, input.id));
}
async function findStartIdentityInternal(
	db: HyperIdleDb,
	input: { readonly requestedBy: string; readonly idempotencyKey: string },
) {
	const [row] = await db
		.select()
		.from(explicitSessionStarts)
		.where(
			and(
				eq(explicitSessionStarts.requestedBy, input.requestedBy),
				eq(explicitSessionStarts.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	return row;
}
async function insertStartInternal(
	exec: WriteExecutor,
	input: Extract<CreateSessionRequestInput, { kind: "explicitStart" }>["start"],
) {
	const now = /* @__PURE__ */ new Date().toISOString();
	const [row] = await exec
		.insert(explicitSessionStarts)
		.values({
			id: input.id ?? randomUUID(),
			taskId: input.taskId,
			requestedAgentId: input.requestedAgentId,
			requestedModelTier: input.requestedModelTier ?? "fast",
			requestedBy: input.requestedBy,
			idempotencyKey: input.idempotencyKey,
			status: "requested",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Explicit session start insert returned no row");
	return row;
}
async function projectStartInternal(
	exec: WriteExecutor,
	input: {
		readonly requestId: string;
		readonly state: "completed" | "failed" | "cancelled";
		readonly sessionId: string | null;
		readonly failureCode: string | null;
	},
) {
	await exec
		.update(explicitSessionStarts)
		.set({
			status: input.state,
			sessionId: input.sessionId,
			failureCode: input.failureCode,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.requestId, input.requestId));
}
function queryRequestInternal(exec: HyperIdleDb, query: FindQuery) {
	switch (query.by) {
		case "id":
			return findRequestIdInternal(exec, query.requestId);
		case "idempotencyKey":
			return findRequestIdentityInternal(exec, {
				sourceKind: query.sourceKind,
				sourceId: query.sourceId,
				idempotencyKey: query.idempotencyKey,
			});
		case "sessionId":
			return findRequestSessionInternal(exec, query.sessionId);
		case "terminationReason":
			return findTerminationInternal(exec, query.requestId);
		case "claimActive":
			return hasActiveRequestClaimInternal(exec, {
				requestId: query.requestId,
				claimToken: query.claimToken,
				now: query.now,
			});
		case "explicitStart":
			if ("startId" in query) {
				return findStartInternal(exec, query.startId);
			}
			return findStartIdentityInternal(exec, {
				requestedBy: query.requestedBy,
				idempotencyKey: query.idempotencyKey,
			});
		case "intentSource":
			if ("kind" in query) {
				return findIntentSourceInternal(exec, query.kind, query.sourceId);
			}
			return findIntentRequestInternal(exec, query.requestId);
	}
}
function mutateRequestInternal(
	db: HyperIdleDb,
	spec: TransitionSpec,
	deps: DurableAgentQueueDeps | undefined,
	options: { readonly now?: Date; readonly existingTransaction?: boolean } = {},
) {
	void deps;
	if ("target" in spec) {
		if ("requestId" in spec && spec.to !== "admitted") {
			return projectStartInternal(db, {
				requestId: spec.requestId,
				state: spec.to,
				sessionId: spec.sessionId,
				failureCode: spec.failureCode,
			});
		}
		if (spec.to === "admitted") {
			return admitStartInternal(db, {
				id: spec.startId,
				requestId: spec.requestId,
				sessionId: spec.sessionId,
			});
		}
		return failStartInternal(db, {
			id: spec.startId,
			failureCode: spec.failureCode,
		});
	}
	if (spec.to === "running") {
		return admitClaimedRequestInternal(
			db,
			spec.requestId,
			spec.sessionId,
			spec.claimToken,
			options.now,
		);
	}
	if (spec.to === "termination-requested") {
		return requestTerminationInternal(db, {
			requestId: spec.requestId,
			reason: spec.reason,
			requestedBy: spec.requestedBy,
		});
	}
	const terminalInput: TerminalInput =
		spec.precondition === "running"
			? {
					requestId: spec.requestId,
					precondition: "running",
					sessionId: spec.sessionId,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
					requireNoTerminationReason: spec.requireNoTerminationReason,
				}
			: {
					requestId: spec.requestId,
					precondition: "claimed",
					claimToken: spec.claimToken,
					state: spec.to,
					failureCode: spec.failureCode,
					errorMessage: spec.errorMessage,
				};
	return options.existingTransaction
		? finishRequestInTxInternal(db, terminalInput)
		: finishRequestInternal(db, terminalInput);
}
const PROMPT_MODE_BY_SOURCE: Record<string, string> = {
	task: "task",
	assistant: "conversation",
	routine: "routine",
	knowledge: "knowledge",
	decomposition: "decomposition",
	proposed_call: "proposed_call",
};

async function createTriggeredInternal(
	db: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "triggered" }>["request"],
	deps: DurableAgentQueueDeps,
): Promise<{
	readonly request: AgentSessionRequest;
	readonly resolution?: TriggerResolutionResult;
}> {
	const existing = await findRequestIdentityInternal(db, {
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		idempotencyKey: input.idempotencyKey,
	});
	if (existing) return { request: existing };
	if (!isTriggerEventType(input.eventType))
		throw new Error(`Unknown trigger event type: ${input.eventType}`);
	const entries = await deps.config.listConfiguration(db, { kind: "trigger" });
	const candidates = entries
		.filter((entry) => entry.active)
		.flatMap((entry) => {
			const parsed = TriggerRuleValueSchema.safeParse(entry.activeValue);
			if (!parsed.success) return [];
			const rule = parsed.data;
			if (rule.eventType !== input.eventType || rule.sourceKind !== input.sourceKind) return [];
			if (rule.scope?.sourceId !== undefined && rule.scope.sourceId !== input.sourceId) return [];
			if (rule.scope?.teamId !== undefined && rule.scope.teamId !== input.teamId) return [];
			if (rule.scope?.userId !== undefined && rule.scope.userId !== input.userId) return [];
			const specificity =
				(rule.scope?.sourceId ? 4 : 0) +
				(rule.scope?.teamId ? 2 : 0) +
				(rule.scope?.userId ? 1 : 0);
			return [{ entry, rule, specificity }];
		})
		.sort(
			(left, right) =>
				right.specificity - left.specificity ||
				(right.rule.priority ?? 0) - (left.rule.priority ?? 0) ||
				left.entry.key.localeCompare(right.entry.key),
		);
	const selected = candidates[0];
	const chosenAgentId =
		input.sourceKind === "proposed_call"
			? input.defaultAgentId
			: (selected?.rule.agentId ?? input.defaultAgentId);
	const resolution: TriggerResolutionResult = {
		eventType: input.eventType,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		triggerKey: selected?.entry.key ?? null,
		triggerSource: selected?.entry.valueSource ?? "fallback",
		result: selected ? "matched" : "fallback",
		chosenAgentId,
		prompt: selected?.rule.prompt ?? null,
		promptSource: selected?.rule.prompt
			? `${selected.entry.valueSource}:${selected.entry.key}`
			: null,
		conflicts: candidates.slice(1).map((candidate) => candidate.entry.key),
		deterministicOrder: candidates.map((candidate) => candidate.entry.key),
		reason:
			input.sourceKind === "proposed_call" && selected
				? "matched_trigger_preserved_granted_agent"
				: selected
					? "matched_trigger"
					: "no_matching_trigger",
	};
	const membership = input.teamId
		? await deps.teams.getTeamMembersByTeamId(db, input.teamId)
		: undefined;
	const agent = await deps.users.getUserByIdScopedToTeam(db, chosenAgentId, membership?.id);
	if (!agent || agent.kind !== "ai" || !["active", "idle"].includes(agent.status)) {
		const failed: TriggerResolutionResult = {
			...resolution,
			result: "failed",
			triggerSource: "failed",
			chosenAgentId: null,
			prompt: null,
			promptSource: null,
			reason: "ineligible_agent",
		};
		await db
			.insert(triggerResolutionHistory)
			.values({
				id: randomUUID(),
				sourceKind: input.sourceKind,
				sourceId: input.sourceId,
				streamId: input.streamId,
				eventType: input.eventType,
				result: "failed",
				triggerKey: failed.triggerKey,
				triggerSource: "failed",
				chosenAgentId: null,
				promptSource: null,
				requestId: null,
				resolutionJson: JSON.stringify(failed),
				createdAt: new Date().toISOString(),
			})
			.onConflictDoNothing();
		throw new Error(`Trigger resolution chose ineligible agent for ${input.eventType}`);
	}
	const payload = {
		...(input.payload ?? {}),
		...(selected
			? {
					trigger: {
						key: selected.entry.key,
						source: selected.entry.valueSource,
						...(selected.rule.prompt ? { prompt: selected.rule.prompt } : {}),
					},
				}
			: {}),
	};
	const requestInput = agentSessionRequestInputSchema.parse({
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		streamId: input.streamId,
		agentId: chosenAgentId,
		teamId: input.teamId,
		userId: input.userId,
		taskId: input.taskId,
		promptMode: PROMPT_MODE_BY_SOURCE[input.sourceKind],
		idempotencyKey: input.idempotencyKey,
		payloadJson: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
		sourceCorrelation: input.buildSourceCorrelation?.(resolution) ?? input.sourceCorrelation,
	});
	const request = await insertRequestInternal(db, requestInput);
	await db
		.insert(triggerResolutionHistory)
		.values({
			id: randomUUID(),
			sourceKind: input.sourceKind,
			sourceId: input.sourceId,
			streamId: input.streamId,
			eventType: input.eventType,
			result: resolution.result,
			triggerKey: resolution.triggerKey,
			triggerSource: resolution.triggerSource,
			chosenAgentId,
			promptSource: resolution.promptSource,
			requestId: request.id,
			resolutionJson: JSON.stringify(resolution),
			createdAt: new Date().toISOString(),
		})
		.onConflictDoNothing();
	return { request, resolution };
}

/**
 * AU21 §6 Decision B / §10 — the emit-time-resolved request a migrated
 * family's core-api resolver produces: the exact shape
 * `resolveIntentInputInternal` returns per kind today, minus the fields
 * (`eventType`, `idempotencyKey`) trivially re-derivable from the intent row
 * itself at drain time. When an intent carries this, the drain dispatches it
 * directly with ZERO domain reads instead of falling through to its per-kind
 * resolution branch (the co-existence scaffolding — §9 Increment 3).
 */
export type BakedWorkIntentRequest = {
	readonly defaultAgentId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId?: string | null;
	readonly teamId?: string;
	readonly userId?: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
};
export type WorkIntentInput = {
	readonly kind:
		| "assistant_turn"
		| "session_start"
		| "knowledge_action"
		| "routine_run"
		| "bet_decomposition"
		| "task_run"
		| "reengagement";
	readonly sourceKind:
		| "thread_message"
		| "explicit_session_start"
		| "knowledge_action"
		| "routine_run"
		| "bet"
		| "task_dispatch_attempt"
		| "proposed_call";
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	/** See `BakedWorkIntentRequest`. Absent for a not-yet-migrated kind (`routine_run` only, by the end of Increment 3). */
	readonly bakedRequest?: BakedWorkIntentRequest;
};
export type CreateSessionRequestInput =
	| { readonly kind: "direct"; readonly request: AgentSessionRequestInput }
	| {
			readonly kind: "explicitStart";
			readonly start: {
				readonly id?: string;
				readonly requestedBy: string;
				readonly requestedAgentId: string;
				readonly requestedModelTier?: string;
				readonly taskId: string;
				readonly idempotencyKey: string;
			};
	  }
	| {
			readonly kind: "triggered";
			readonly request: {
				readonly eventType: TriggerEventType;
				readonly sourceKind: AgentSessionSourceKind;
				readonly sourceId: string;
				readonly streamId: string;
				readonly defaultAgentId: string;
				readonly idempotencyKey: string;
				readonly sourceCorrelation: AgentSessionSourceCorrelation;
				readonly buildSourceCorrelation?: (
					resolution: TriggerResolutionResult,
				) => AgentSessionSourceCorrelation;
				readonly teamId?: string;
				readonly userId?: string;
				readonly taskId?: string | null;
				readonly payload?: Record<string, unknown>;
			};
	  };
export type FindQuery =
	| { readonly by: "id"; readonly requestId: string }
	| { readonly by: "sessionId"; readonly sessionId: string }
	| {
			readonly by: "idempotencyKey";
			readonly sourceKind: AgentSessionSourceKind;
			readonly sourceId: string;
			readonly idempotencyKey: string;
	  }
	| {
			readonly by: "claimActive";
			readonly requestId: string;
			readonly claimToken: string;
			readonly now: Date;
	  }
	| { readonly by: "intentSource"; readonly requestId: string }
	| {
			readonly by: "intentSource";
			readonly kind: WorkIntentInput["kind"];
			readonly sourceId: string;
	  }
	| { readonly by: "terminationReason"; readonly requestId: string }
	| { readonly by: "explicitStart"; readonly startId: string }
	| { readonly by: "explicitStart"; readonly requestedBy: string; readonly idempotencyKey: string };
type TransitionSpec =
	| {
			readonly requestId: string;
			readonly to: "running";
			readonly sessionId: string;
			readonly claimToken: string;
	  }
	| {
			readonly requestId: string;
			readonly to: "termination-requested";
			readonly reason: string;
			readonly requestedBy?: string;
	  }
	| {
			readonly requestId: string;
			readonly to: "completed" | "failed" | "cancelled";
			readonly precondition: "running";
			readonly sessionId: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
			readonly requireNoTerminationReason?: boolean;
	  }
	| {
			readonly requestId: string;
			readonly to: "failed";
			readonly precondition: "claimed";
			readonly claimToken: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
	  }
	| {
			readonly target: "explicitStart";
			readonly to: "admitted";
			readonly startId: string;
			readonly requestId: string;
			readonly sessionId: string;
	  }
	| {
			readonly target: "explicitStart";
			readonly to: "failed";
			readonly startId: string;
			readonly failureCode: string;
	  }
	| {
			readonly target: "explicitStart";
			readonly to: "completed" | "failed" | "cancelled";
			readonly requestId: string;
			readonly sessionId: string | null;
			readonly failureCode: string | null;
	  };
export type SessionRequestTransition = TransitionSpec & {
	readonly transaction?: "existing";
};
export interface ClaimOptions {
	readonly workerId: string;
	readonly now: Date;
	readonly leaseMs: number;
}
export type AgentLifecycleFact = {
	readonly requestId: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly state: "completed" | "failed" | "cancelled";
	readonly sessionId?: string;
	readonly failureCode?: string;
};
export interface DurableAgentQueueDeps {
	readonly db: HyperIdleDb;
	readonly lifecycleProjection: {
		readonly routine: {
			updateRoutineRunIfRunning(
				exec: WriteExecutor,
				id: string,
				patch: {
					readonly outcome: "success" | "error";
					readonly endedAt: string;
					readonly sessionId: string | null;
					readonly errorMessage: string | null;
				},
			): Promise<void>;
		};
		readonly work: {
			updateTaskDispatchAttemptIfActive(
				exec: WriteExecutor,
				requestId: string,
				patch: {
					readonly status: "completed" | "failed" | "cancelled";
					readonly sessionId: string | null;
				},
			): Promise<void>;
			updateBetDecompositionStatusIfRunning(
				exec: WriteExecutor,
				id: string,
				patch: {
					readonly decompositionStatus: "done" | "blocked";
					readonly decompositionBlockerReason: string | null;
				},
			): Promise<void>;
		};
		readonly explicitSessionStarts: {
			projectTerminalState(
				exec: WriteExecutor,
				requestId: string,
				patch: {
					readonly status: "completed" | "failed" | "cancelled";
					readonly sessionId: string | null;
					readonly failureCode: string | null;
				},
			): Promise<void>;
		};
	};
	readonly config: {
		listConfiguration(
			db: HyperIdleDb,
			filter: { readonly kind?: ConfigurationKind; readonly key?: string },
		): Promise<ResolvedConfigurationItem[]>;
	};
	readonly teams: {
		getTeamMembersByTeamId(exec: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
	};
	readonly users: {
		getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
		getUserByIdScopedToTeam(
			db: HyperIdleDb,
			id: string,
			teamMembersId?: string,
		): Promise<User | undefined>;
		listUsersByTeam(exec: WriteExecutor, teamMembersId: string): Promise<User[]>;
	};
	readonly work: {
		getTaskById(exec: WriteExecutor, id: string): Promise<Task | undefined>;
		getBetById(exec: WriteExecutor, id: string): Promise<Bet | undefined>;
		getTaskDispatchAttemptById(
			exec: WriteExecutor,
			id: string,
		): Promise<TaskDispatchAttempt | undefined>;
		reapTerminalTaskDispatchAttempts(
			exec: WriteExecutor,
			cutoff: string,
			batchSize: number,
		): Promise<number>;
	};
	readonly routine: {
		getRoutineRunById(exec: WriteExecutor, id: string): Promise<RoutineRun | undefined>;
		getRoutineById(exec: WriteExecutor, id: string): Promise<Routine | undefined>;
	};
	/**
	 * @lore AU21 §6 Decision B4: the pre-handoff failure report-back channel.
	 * Optional so every existing `queueDeps(db)` call site (which never wired
	 * one) keeps compiling unchanged — `failOrRelease` simply skips emission
	 * when absent. Production call sites pass the real bus (composition-root
	 * `{ ...queueDeps(db), eventBus }`) so the channel is genuinely live.
	 */
	readonly eventBus?: EventBus;
	readonly conversation: {
		getMessageById(exec: WriteExecutor, id: string): Promise<Message | undefined>;
	};
	readonly review: {
		findGrantedProposedCall(
			exec: WriteExecutor,
			id: string,
		): Promise<{ readonly call: ProposedCall; readonly grant: TailoredGrant } | undefined>;
	};
	readonly knowledge: { findById(exec: WriteExecutor, id: string): Promise<KnowledgeItem | null> };
	readonly agentSelection: {
		isAtCapacity(exec: WriteExecutor, agentId: string): Promise<boolean>;
		selectAgent(input: {
			readonly db: WriteExecutor;
			readonly surface: "routine_delegate";
			readonly teamId: string | null;
			readonly workKey: string;
			readonly excludeAgentId: string;
			readonly skillId: string;
		}): Promise<{ readonly agentId: string | null }>;
	};
}

export function enqueueWorkIntent(exec: WriteExecutor, input: WorkIntentInput) {
	return insertIntentInternal(exec, input);
}
export function createSessionRequest(
	exec: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "direct" }>,
	deps?: DurableAgentQueueDeps,
): Promise<AgentSessionRequest>;
export function createSessionRequest(
	exec: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "explicitStart" }>,
	deps?: DurableAgentQueueDeps,
): Promise<ExplicitSessionStart>;
export function createSessionRequest(
	exec: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "triggered" }>,
	deps: DurableAgentQueueDeps,
): Promise<AgentSessionRequest>;
export function createSessionRequest(
	exec: HyperIdleDb,
	input: CreateSessionRequestInput,
	deps?: DurableAgentQueueDeps,
) {
	if (input.kind === "direct") return insertRequestInternal(exec, input.request);
	if (input.kind === "explicitStart") return insertStartInternal(exec, input.start);
	if (!deps) throw new Error("Triggered session creation requires durable queue dependencies");
	return createTriggeredInternal(exec, input.request, deps).then((result) => result.request);
}
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "id" }>,
): Promise<AgentSessionRequest | undefined>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "idempotencyKey" }>,
): Promise<AgentSessionRequest | undefined>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "sessionId" }>,
): Promise<Pick<AgentSessionRequest, "id"> | undefined>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "terminationReason" }>,
): Promise<string | null | undefined>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "claimActive" }>,
): Promise<boolean>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "explicitStart" }>,
): Promise<ExplicitSessionStart | undefined>;
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "intentSource" }>,
): Promise<
	Pick<AgentWorkIntent, "id" | "kind" | "idempotencyKey" | "sourceId" | "sourceKind"> | undefined
>;
export function findSessionRequest(exec: HyperIdleDb, query: FindQuery) {
	return queryRequestInternal(exec, query);
}
export function listSessionRequests(
	exec: HyperIdleDb,
	filter:
		| { readonly source: { readonly kind: AgentSessionSourceKind; readonly id: string } }
		| { readonly status: "running" },
): Promise<AgentSessionRequest[]> {
	return "source" in filter
		? listRequestsSourceInternal(exec, filter.source.kind, filter.source.id)
		: listRunningRequestsInternal(exec);
}
export function claimSessionRequest(
	exec: HyperIdleDb,
	selector: { readonly next: true } | { readonly id: string },
	options: ClaimOptions,
) {
	const claim = { now: options.now, leaseMs: options.leaseMs };
	return "id" in selector
		? claimRequestIdInternal(exec, selector.id, options.workerId, claim)
		: claimNextRequestInternal(exec, options.workerId, claim);
}
export function renewClaim(
	exec: HyperIdleDb,
	requestId: string,
	claimToken: string,
	options: Pick<ClaimOptions, "now" | "leaseMs">,
) {
	return extendRequestClaimInternal(exec, { requestId, claimToken, ...options });
}
export function releaseClaim(exec: HyperIdleDb, requestId: string, claimToken: string) {
	return requeueClaimedRequestInternal(exec, requestId, claimToken);
}
export function transitionSessionRequest(
	exec: WriteExecutor,
	transition: SessionRequestTransition & { readonly transaction: "existing" },
	deps?: DurableAgentQueueDeps,
	options?: { readonly now?: Date },
): ReturnType<typeof mutateRequestInternal>;
export function transitionSessionRequest(
	exec: HyperIdleDb,
	transition: SessionRequestTransition,
	deps?: DurableAgentQueueDeps,
	options?: { readonly now?: Date },
): ReturnType<typeof mutateRequestInternal>;
export function transitionSessionRequest(
	exec: HyperIdleDb | WriteExecutor,
	transition: SessionRequestTransition,
	deps?: DurableAgentQueueDeps,
	options?: { readonly now?: Date },
) {
	const { transaction, ...spec } = transition;
	const invoke = mutateRequestInternal;
	return invoke(exec, spec, deps, {
		...options,
		existingTransaction: transaction === "existing",
	});
}
export function drainIntents(
	deps: DurableAgentQueueDeps,
	options?: { readonly now?: () => Date; readonly leaseMs?: number; readonly maxAttempts?: number },
) {
	return processIntentsInternal(deps.db, deps, options);
}
export function drainLifecycleProjections(
	deps: DurableAgentQueueDeps,
	options?: {
		readonly now?: Date;
		readonly leaseMs?: number;
		readonly workerId?: string;
		readonly maxAttempts?: number;
	},
) {
	return processLifecycleInternal(deps.db, deps.lifecycleProjection, options);
}
export function startLifecycleProjectionDrain(
	deps: DurableAgentQueueDeps,
	options?: { readonly pollIntervalMs?: number },
) {
	return startLifecycleInternal(deps.db, deps.lifecycleProjection, options);
}
export function reapExpired(
	deps: DurableAgentQueueDeps,
	options?: { readonly now?: Date; readonly retentionDays?: number; readonly batchSize?: number },
) {
	return reapIntentsInternal(deps.db, deps, options);
}
