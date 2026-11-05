import { randomUUID } from "node:crypto";
import type { AgentSessionRequest, HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { agentSessionRequests } from "@hyperidle/db";
import type {
	AgentSessionRequestInput,
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedAgentRunnableConfig,
	BakedContextBundle,
	BakedSessionResumeRequest,
} from "@hyperidle/domain-model";
import { agentSessionRequestInputSchema } from "@hyperidle/domain-model";
import { and, asc, eq, gt, inArray, lt, notInArray, or, sql } from "drizzle-orm";

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

function nowIso() {
	return /* @__PURE__ */ new Date().toISOString();
}
function rowToRequest(row: AgentSessionRequest): AgentSessionRequest {
	return row;
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
function listPendingByStreamInternal(db: HyperIdleDb, streamId: string) {
	return db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.streamId, streamId),
				inArray(agentSessionRequests.status, ["pending", "claimed"]),
			),
		);
}
export function listPendingByStream(db: HyperIdleDb, streamId: string) {
	return listPendingByStreamInternal(db, streamId);
}

/** Cancel the runs still waiting to start on these tasks, so a stop also stops what has not begun. */
export async function cancelPendingForTasks(
	db: HyperIdleDb,
	taskIds: readonly string[],
	now: string,
): Promise<number> {
	if (taskIds.length === 0) return 0;
	const cancelled = await db
		.update(agentSessionRequests)
		.set({ status: "cancelled", updatedAt: now })
		.where(
			and(
				inArray(agentSessionRequests.taskId, [...taskIds]),
				eq(agentSessionRequests.status, "pending"),
			),
		)
		.returning({ id: agentSessionRequests.id });
	return cancelled.length;
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
	skipAgentIds: readonly string[],
	options: Pick<ClaimOptions, "now" | "leaseMs">,
) {
	const now = options.now.toISOString();
	const candidates = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				or(
					eq(agentSessionRequests.status, "pending"),
					and(
						eq(agentSessionRequests.status, "claimed"),
						lt(agentSessionRequests.claimExpiresAt, now),
					),
				),
				skipAgentIds.length > 0
					? notInArray(agentSessionRequests.agentId, [...skipAgentIds])
					: undefined,
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
	return winner;
}
function finishRequestInternal(db: HyperIdleDb, input: TerminalInput) {
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

/** Turn a baked resume into the session request that carries it. Resume takes the same provisioning path; sourceKind of its own so it's not mistaken for a new start. */
function queueResumeInternal(
	db: HyperIdleDb,
	reviewMessageId: string,
	resume: BakedSessionResumeRequest,
	idempotencyKey: string,
): Promise<AgentSessionRequest> {
	const requestInput = agentSessionRequestInputSchema.parse({
		sourceKind: "review_resume",
		sourceId: reviewMessageId,
		streamId: `review_resume:${reviewMessageId}`,
		agentId: resume.agentId,
		taskId: resume.taskId ?? null,
		promptMode: "resume",
		idempotencyKey,
		sourceCorrelation: {
			reviewMessageId,
			threadId: resume.threadId,
			resumedSessionId: resume.sessionId,
		},
		// @lore: callingThreadId in resume — the thread the verdict came in; where the agent's answer belongs; absent → resumed agent's silence reaches nobody
		payloadJson: JSON.stringify({
			resume,
			callingThreadId: resume.threadId,
			...(resume.agentConfig ? { agentConfig: resume.agentConfig } : {}),
		}),
	});
	return insertRequestInternal(db, requestInput);
}

/** Queue a run the runner built from an inbox row; the same key twice is one request. */
function queueRunInternal(
	db: HyperIdleDb,
	baked: BakedRunRequest,
	idempotencyKey: string,
): Promise<AgentSessionRequest> {
	const requestInput = agentSessionRequestInputSchema.parse({
		sourceKind: baked.sourceKind,
		sourceId: baked.sourceId,
		streamId: baked.streamId,
		agentId: baked.defaultAgentId,
		teamId: baked.teamId,
		userId: baked.userId,
		taskId: baked.taskId,
		promptMode: PROMPT_MODE_BY_SOURCE[baked.sourceKind],
		idempotencyKey,
		sourceCorrelation: baked.sourceCorrelation,
		// baked transcript/contextBundle/agentConfig/callingThreadId ride payloadJson onto the created AgentSessionRequest; model override is NOT baked (dispatch reads it live from agent_run_config)
		...(baked.transcript !== undefined ||
		baked.contextBundle !== undefined ||
		baked.agentConfig !== undefined ||
		baked.callingThreadId !== undefined
			? {
					payloadJson: JSON.stringify({
						...(baked.transcript !== undefined ? { transcript: baked.transcript } : {}),
						...(baked.contextBundle !== undefined ? { contextBundle: baked.contextBundle } : {}),
						...(baked.agentConfig !== undefined ? { agentConfig: baked.agentConfig } : {}),
						// The session's calling thread id.
						...(baked.callingThreadId !== undefined
							? { callingThreadId: baked.callingThreadId }
							: {}),
					}),
				}
			: {}),
	});
	return insertRequestInternal(db, requestInput);
}
function queryRequestInternal(exec: HyperIdleDb, query: FindQuery) {
	switch (query.by) {
		case "id":
			return findRequestIdInternal(exec, query.requestId);
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
	}
}
function mutateRequestInternal(
	db: HyperIdleDb,
	spec: TransitionSpec,
	options: { readonly now?: Date; readonly existingTransaction?: boolean } = {},
) {
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
	knowledge: "knowledge",
	subscription: "subscription",
};

/** A run the runner built from an inbox row: who runs, what it is about, and what the session reads. */
export type BakedRunRequest = {
	readonly defaultAgentId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId?: string | null;
	readonly teamId?: string;
	readonly userId?: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
	/** A thread turn's transcript, oldest first. Absent for task and subscription runs, which carry a `contextBundle`. */
	readonly transcript?: ReadonlyArray<{
		readonly senderId: string;
		readonly payload: string;
		readonly type: string;
	}>;
	readonly contextBundle?: BakedContextBundle;
	readonly agentConfig?: BakedAgentRunnableConfig;
	/** The thread the session answers in. Absent for a subscription run. */
	readonly callingThreadId?: string;
};
export type FindQuery =
	| { readonly by: "id"; readonly requestId: string }
	| { readonly by: "sessionId"; readonly sessionId: string }
	| {
			readonly by: "claimActive";
			readonly requestId: string;
			readonly claimToken: string;
			readonly now: Date;
	  }
	| { readonly by: "terminationReason"; readonly requestId: string };
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
	  };
export type SessionRequestTransition = TransitionSpec & {
	readonly transaction?: "existing";
};
export interface ClaimOptions {
	readonly workerId: string;
	readonly now: Date;
	readonly leaseMs: number;
}

export function queueRun(db: HyperIdleDb, baked: BakedRunRequest, idempotencyKey: string) {
	return queueRunInternal(db, baked, idempotencyKey);
}
export function queueResume(
	db: HyperIdleDb,
	input: {
		readonly reviewMessageId: string;
		readonly resume: BakedSessionResumeRequest;
		readonly idempotencyKey: string;
	},
) {
	return queueResumeInternal(db, input.reviewMessageId, input.resume, input.idempotencyKey);
}
export function findSessionRequest(
	exec: HyperIdleDb,
	query: Extract<FindQuery, { by: "id" }>,
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
	selector:
		| { readonly next: true; readonly skipAgentIds?: readonly string[] }
		| { readonly id: string },
	options: ClaimOptions,
) {
	const claim = { now: options.now, leaseMs: options.leaseMs };
	return "id" in selector
		? claimRequestIdInternal(exec, selector.id, options.workerId, claim)
		: claimNextRequestInternal(exec, options.workerId, selector.skipAgentIds ?? [], claim);
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
	options?: { readonly now?: Date },
): ReturnType<typeof mutateRequestInternal>;
export function transitionSessionRequest(
	exec: HyperIdleDb,
	transition: SessionRequestTransition,
	options?: { readonly now?: Date },
): ReturnType<typeof mutateRequestInternal>;
export function transitionSessionRequest(
	exec: HyperIdleDb | WriteExecutor,
	transition: SessionRequestTransition,
	options?: { readonly now?: Date },
) {
	const { transaction, ...spec } = transition;
	return mutateRequestInternal(exec, spec, {
		...options,
		existingTransaction: transaction === "existing",
	});
}
