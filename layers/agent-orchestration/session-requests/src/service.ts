import { randomUUID } from "node:crypto";
import type {
	AgentSessionRequest,
	AgentWorkIntent,
	ExplicitSessionStart,
	HyperIdleDb,
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
} from "@hyperidle/domain-model";
import {
	agentSessionRequestInputSchema,
	isAgentWorkIntentKind,
	isAgentWorkIntentSourceKind,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
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
const projectExplicitStart: Projector = async (db, fact, deps) => {
	await deps.explicitSessionStarts.projectTerminalState(db, fact.requestId, {
		status: fact.state,
		sessionId: fact.sessionId ?? null,
		failureCode: fact.state === "failed" ? (fact.failureCode ?? "INTERNAL_ERROR") : null,
	});
};
const lifecycleProjectors: Record<LifecycleSourceKind, Projector> = {
	assistant: observeOnly,
	// @lore AU21 §9 Increment 10 (Decision H1): `task`'s post-session
	// writeback (`taskDispatchAttempts` finalize) moved to a core-api event
	// subscriber (`work-session-end-reactions.ts`, subscribing
	// `agent_run_lifecycle_changed` directly) — the same migration `routine`
	// went through in Increment 4. This drain's job for `task` is now purely
	// observational; it must never call `deps.work`/`updateTaskDispatchAttemptIfActive`
	// again (that port + `DurableAgentQueueDeps.lifecycleProjection.work` are
	// deleted entirely, not merely unused).
	task: observeOnly,
	knowledge: observeOnly,
	// @lore AU21 §6 Decision B″ correction: `routine` used to run its own
	// `projectRoutine` (a direct `updateRoutineRunIfRunning` cross-layer
	// write). Wave C's `registerRoutineRunSessionEndReactions` (core-api,
	// `routine-run-session-end-reactions.ts`) already finalizes routineRuns
	// off `session_ended`/`agent_run_lifecycle_changed` — the proper
	// event-driven mechanism — so this drain's job for `routine` is now
	// purely observational, same as `assistant`/`knowledge`/`proposed_call`.
	routine: observeOnly,
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
	// @lore AU29 §2.4: the typed construction+emit used to be
	// the framework's `reportAdmissionFailure`, also called by
	// `run-orchestration`'s `runClaimedRequest` for the provisioning-time
	// failure site (§12). Now inlined at both sites — the two services
	// deliberately do not import each other, and now share the event *type*
	// (`events.ts`, now in `@hyperidle/domain-model`), not an emit helper.
	if (
		deps.eventBus &&
		isAgentWorkIntentKind(intent.kind) &&
		isAgentWorkIntentSourceKind(intent.sourceKind)
	) {
		deps.eventBus.emit({
			type: "agent_run_admission_failed",
			streamId: `${intent.kind}:${intent.sourceId}`,
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
		// AU21 §9 Increment 11 (Decision H2) / Increment 12 (Decision H3): the
		// assistant_turn family's baked transcript, the
		// task_run/routine_run/knowledge_action/reengagement families' baked
		// contextBundle, and (Wave E) EVERY kind's baked
		// agentConfig/harnessDisabled ride the existing generic `payloadJson`
		// pass-through column onto the created `AgentSessionRequest`.
		//
		// @lore AU26 G1: the per-agent model override (`modelId`/`modelProvider`)
		// is no longer baked — those columns moved into `agent_run_config`,
		// orchestration's own table, so `dispatch` reads them live instead.
		...(baked.transcript !== undefined ||
		baked.contextBundle !== undefined ||
		baked.agentConfig !== undefined ||
		baked.harnessDisabled !== undefined ||
		baked.callingThreadId !== undefined
			? {
					payloadJson: JSON.stringify({
						...(baked.transcript !== undefined ? { transcript: baked.transcript } : {}),
						...(baked.contextBundle !== undefined ? { contextBundle: baked.contextBundle } : {}),
						...(baked.agentConfig !== undefined ? { agentConfig: baked.agentConfig } : {}),
						...(baked.harnessDisabled !== undefined
							? { harnessDisabled: baked.harnessDisabled }
							: {}),
						// AU27 Increment 1 (Decision 1): the session's calling thread id.
						...(baked.callingThreadId !== undefined
							? { callingThreadId: baked.callingThreadId }
							: {}),
					}),
				}
			: {}),
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
	// `run-orchestration`'s provisioning-time `agent_run_admission_failed`
	// emit site correlates a post-handoff `AgentSessionRequest` failure back
	// to the ORIGINAL intent's identity (`id`/`kind`/`sourceId`/`sourceKind`)
	// to emit with the right shape.
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
async function reapIntentsInternal(db: HyperIdleDb, options: ReapOptions = {}) {
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
		return {
			inbox: projected.length,
			intents: ids.length,
			explicitStarts: oldStarts.length,
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
	proposed_call: "proposed_call",
};

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
	/**
	 * AU21 §9 Increment 11 (Decision H2): the `assistant_turn` family's baked
	 * thread transcript (`conversation`'s `resolveAssistantTurnRequest`).
	 * Absent for every other kind — carried through onto the created
	 * `AgentSessionRequest.payloadJson` so `dispatch` sources the harness
	 * conversation from the baked payload instead of a live read.
	 */
	readonly transcript?: ReadonlyArray<{
		readonly senderId: string;
		readonly payload: string;
		readonly type: string;
	}>;
	/**
	 * AU21 §9 Increment 12 (Decision H3): the `task_run`/`knowledge_action`/
	 * `routine_run`/`reengagement` families' baked entity content (task/bet/
	 * agent/team, or routine/agent/team) plus the ranked+budgeted knowledge
	 * items `@hyperidle/knowledge`'s `assembleSessionKnowledge` produces.
	 * Absent for `assistant_turn` (bakes `transcript` instead) — see
	 * `BakedWorkIntentRequest` in `@hyperidle/work-intent-port` for the full `@lore`.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — every kind's baked
	 * agent-runnability snapshot / disabled-harness-types list. See
	 * `BakedWorkIntentRequest` in `@hyperidle/work-intent-port` for the full `@lore`.
	 */
	readonly agentConfig?: {
		readonly kind: string;
		readonly status: string;
		readonly role: string;
		readonly teamId: string | null;
	};
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU27 Increment 1 (Decision 1) — the session's calling thread id. Absent
	 * for `routine_run`/`knowledge_action` — see `BakedWorkIntentRequest` in
	 * `@hyperidle/work-intent-port` for the full `@lore`.
	 */
	readonly callingThreadId?: string;
};

/** One ranked+budgeted knowledge item as baked onto a `BakedContextBundle` (local mirror — see `@hyperidle/work-intent-port`). */
export interface BakedContextKnowledgeItem {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly version: number;
	readonly layer: string | null;
}

/** Local mirror of `@hyperidle/work-intent-port`'s `BakedContextBundle` — see there for the full `@lore`. */
export type BakedContextBundle =
	| {
			readonly kind: "task";
			readonly task: {
				readonly id: string;
				readonly title: string;
				readonly description: string | null;
				readonly state: string;
			};
			readonly bet: {
				readonly id: string;
				readonly description: string;
				readonly appetite: string;
				readonly doneCondition: string | null;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  }
	| {
			readonly kind: "routine";
			readonly routine: {
				readonly id: string;
				readonly name: string;
				readonly description: string | null;
				readonly lastRunSummary: string | null;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly team: { readonly id: string; readonly name: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  }
	| {
			readonly kind: "knowledge";
			readonly item: {
				readonly id: string;
				readonly title: string;
				readonly body: string;
				readonly format: string;
				readonly version: number;
			};
			readonly agent: { readonly id: string; readonly name: string; readonly role: string };
			readonly knowledge: readonly BakedContextKnowledgeItem[];
	  };

export type WorkIntentInput = {
	readonly kind:
		| "assistant_turn"
		| "session_start"
		| "knowledge_action"
		| "routine_run"
		| "task_run"
		| "reengagement";
	readonly sourceKind:
		| "thread_message"
		| "explicit_session_start"
		| "knowledge_action"
		| "routine_run"
		| "task_dispatch_attempt"
		| "proposed_call";
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	/** See `BakedWorkIntentRequest`. Absent for a not-yet-migrated kind (`routine_run` only, by the end of Increment 3). */
	readonly bakedRequest?: BakedWorkIntentRequest;
};
/**
 * @lore AU21 §9 Increment 9: the `"triggered"` kind (trigger-rule config
 * matching against `settings`'s `kind:"trigger"` entries, target-agent
 * resolution) REMOVED — confirmed via git archaeology + a full production
 * call-site grep that `createTriggeredInternal` (this variant's only
 * consumer) had ZERO real callers: routine firing has called
 * `enqueueWorkIntent` directly since before AU21 even started (verified at
 * `7b64e8d1^`'s dispatch/service.ts and AU20's original session-requests
 * rewrite, `d6dcfa2c`), and every other family's real resolve-at-emit
 * migration (architecture.md §9 Increment 3) bakes straight onto
 * `enqueueWorkIntent` too. The ONLY caller anywhere in the repo was
 * `layers/core-api/src/__tests__/trigger-resolution.integration.test.ts`
 * (deleted alongside this) — test-only-reachable code is dead code (see
 * `.claude` rule: tests/stories never count as production reachability).
 * `settings`'s `kind:"trigger"` config entity (`SettingsAgentBehavior.tsx`'s
 * "Triggers" tab, `agent-behavior-config-impl.ts`) remains fully editable in
 * the UI but — confirmed by this same archaeology — has had NO code path
 * anywhere that reads it to affect real agent selection, pre-dating AU21.
 * That is a genuine, pre-existing, orphaned-feature product gap, out of
 * AU21's boundary-seam scope; flagged for founder attention, not fixed here.
 */
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
	/**
	 * @lore AU21 §9 Increment 10 (Decision H1): `work` (the
	 * `updateTaskDispatchAttemptIfActive` port `lifecycleProjection.work` used
	 * to carry) is REMOVED ENTIRELY — `task`'s post-session writeback now
	 * lives core-side as an `agent_run_lifecycle_changed` event subscriber
	 * (`core-api`'s `work-session-end-reactions.ts`), the same migration
	 * `routine` already went through in Increment 4 (see
	 * `lifecycleProjectors.routine`'s `observeOnly` entry below and
	 * `routine-run-session-end-reactions.ts`). `lifecycleProjectors.task` is
	 * now `observeOnly` too, so this drain has no port left through which to
	 * reach `work` for a `task`-sourced fact — `explicitSessionStarts` is the
	 * only surviving projection target.
	 */
	readonly lifecycleProjection: {
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
	/**
	 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): `config`
	 * (`listConfiguration`), `teams` (`getTeamMembersByTeamId`), and `users`
	 * (`getUserByIdScopedToTeam`) REMOVED in their entirety — their one and
	 * only consumer, `createTriggeredInternal` (the drain-time trigger-rule +
	 * target-agent resolution for the `"triggered"` `CreateSessionRequestInput`
	 * kind), is deleted alongside this: confirmed via git archaeology + a full
	 * production call-site grep that it had ZERO real callers, in AU21 or
	 * before (see `CreateSessionRequestInput`'s own doc comment above).
	 *
	 * @lore AU21 §9 Increment 10 (Decision H1): the top-level `work` field
	 * (`reapTerminalTaskDispatchAttempts`) is ALSO REMOVED ENTIRELY —
	 * relocated out of this drain's `reapExpired` atomic transaction into
	 * `layers/core-api/src/server-factory.ts`'s generic retention reaper
	 * (a harmless atomicity split; pure terminal-row GC, no invariant depends
	 * on it sharing the intent/start-delete transaction), calling
	 * `taskDispatchAttemptStore.reapTerminal` directly there. Together with
	 * the `lifecycleProjection.work` removal above, `session-requests` now
	 * holds ZERO `→ work` edge of any kind, closing the
	 * `DEFERRED_FOLLOWUP` (`session-requests::work`) gap the anti-regrowth
	 * guard tracked through Increment 9's forensic-triage wave.
	 *
	 * @lore AU21 §6 Decision B4: the pre-handoff failure report-back channel.
	 * Optional so every existing `queueDeps(db)` call site (which never wired
	 * one) keeps compiling unchanged — `failOrRelease` simply skips emission
	 * when absent. Production call sites pass the real bus (composition-root
	 * `{ ...queueDeps(db), eventBus }`) so the channel is genuinely live.
	 */
	readonly eventBus?: EventBus;
	/**
	 * @lore AU21 §9 Increment 9: `conversation`/`review`/`routine`/`knowledge`
	 * groups REMOVED in their entirety — confirmed zero real call sites
	 * anywhere in this file (`getMessageById`/`findGrantedProposedCall`/
	 * `getRoutineRunById`/`getRoutineById`/`findById` were declared but never
	 * invoked; each family's real resolve-at-emit migration
	 * (architecture.md §9 Increment 3) already deleted the call sites, this
	 * dead composition wiring was simply never cleaned up alongside it).
	 */
}

export function enqueueWorkIntent(exec: WriteExecutor, input: WorkIntentInput) {
	return insertIntentInternal(exec, input);
}
/**
 * AU21 §9 Increment 11 (Decision H2 "Coherence — reconciled via Decision B‴",
 * Wave B) — every still-outstanding (`pending`/`claimed`) intent for `kind`,
 * oldest first. The ONE reader this Service exposes for a core-api trigger to
 * find "is there outstanding work for this identity" without adding a
 * `threadId` column to `agent_work_intents`: `sourceId` already IS the
 * triggering message id for `assistant_turn`, so the caller (core-api's B‴
 * coherence trigger, `assistant-turn-coherence-trigger.ts`) resolves each
 * candidate's owning thread itself via `@hyperidle/conversation`'s
 * `findMessage(sourceId)`, then re-bakes + re-emits via `resolveAssistantTurnRequest`
 * + `enqueueWorkIntent` for the ones matching the just-appended reply's
 * thread. Reuses the existing `agent_work_intents_status_created_idx` (no new
 * index needed).
 */
export function listPendingIntentsByKind(
	db: HyperIdleDb,
	kind: WorkIntentInput["kind"],
): Promise<readonly AgentWorkIntent[]> {
	return db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, kind),
				inArray(agentWorkIntents.status, ["pending", "claimed"]),
			),
		)
		.orderBy(asc(agentWorkIntents.createdAt));
}
export function createSessionRequest(
	exec: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "direct" }>,
): Promise<AgentSessionRequest>;
export function createSessionRequest(
	exec: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "explicitStart" }>,
): Promise<ExplicitSessionStart>;
export function createSessionRequest(exec: HyperIdleDb, input: CreateSessionRequestInput) {
	if (input.kind === "direct") return insertRequestInternal(exec, input.request);
	return insertStartInternal(exec, input.start);
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
	return reapIntentsInternal(deps.db, options);
}
