import { randomUUID } from "node:crypto";
import type {
	AgentSessionRequest,
	AgentWorkIntent,
	HyperIdleDb,
	WriteExecutor,
} from "@hyperidle/db";
import { agentSessionRequests, agentWorkIntents } from "@hyperidle/db";
import type {
	AgentSessionRequestInput,
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	BakedContextBundle,
	BakedSessionResumeRequest,
} from "@hyperidle/domain-model";
import { agentSessionRequestInputSchema } from "@hyperidle/domain-model";
import type { AgentRunAdmissionFailureCode, EventBus } from "@hyperidle/event-bus";
import { and, asc, eq, gt, inArray, lt, lte, or, sql } from "drizzle-orm";
import { executeRows } from "./execute-rows.js";
import { isAgentWorkIntentKind, isAgentWorkIntentSourceKind } from "./guards.js";

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
	eventBus: EventBus | undefined,
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
	// @lore AU21 §6 Decision B4/§13: every terminal failure is reported through
	// this event, reacted to by a core-api subscriber
	// (`registerAgentRunAdmissionReactions`), for EVERY kind — no service here
	// writes a run-row outcome directly. `deps.eventBus` is optional (back-compat
	// with every pre-existing `queueDeps(db)` call site that never wired one).
	// @lore AU29 §2.4: the typed construction+emit used to be
	// the framework's `reportAdmissionFailure`, also called by
	// `run-orchestration`'s `runClaimedRequest` for the provisioning-time
	// failure site (§12). Now inlined at both sites — the two services
	// deliberately do not import each other, and now share the event *type*
	// (`events.ts`, now in `@hyperidle/domain-model`), not an emit helper.
	if (
		eventBus &&
		isAgentWorkIntentKind(intent.kind) &&
		isAgentWorkIntentSourceKind(intent.sourceKind)
	) {
		eventBus.emit({
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
 * Before claiming/dispatching, check whether a FRESHER
 * pending/claimed intent already exists for the same `(kind, sourceId)` work
 * identity (a re-emit bumped `idempotencyKey` for outstanding work). Reuses
 * the existing identity shape and its compare-and-set; own-state only, no core-api read.
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
 * @lore BA2: the `session_resume` kind bakes a resume, not a start request. Same
 * column, different shape — see `insertIntentInternal`.
 */
function parseBakedResume(intent: AgentWorkIntent): BakedSessionResumeRequest | undefined {
	if (!intent.bakedRequestJson) return undefined;
	return JSON.parse(intent.bakedRequestJson) as BakedSessionResumeRequest;
}

/**
 * Turn a baked resume into the session request that carries it.
 *
 * @lore BA2: A resumed session IS a session — it takes the same provisioning
 * path as any other, which already opens the MCP bridge, drains the stream,
 * accounts tokens, posts output back to the thread and tears down once. The
 * difference is one branch at harness start, and it is expressed here as a
 * source kind of its own rather than by borrowing one that misdescribes it.
 */
async function createResumeRequestInternal(
	db: HyperIdleDb,
	intent: AgentWorkIntent,
	resume: BakedSessionResumeRequest,
): Promise<{ readonly request: AgentSessionRequest }> {
	const requestInput = agentSessionRequestInputSchema.parse({
		sourceKind: "review_resume",
		sourceId: intent.sourceId,
		streamId: `review_resume:${intent.sourceId}`,
		agentId: resume.agentId,
		taskId: null,
		promptMode: "resume",
		idempotencyKey: intent.idempotencyKey,
		sourceCorrelation: {
			reviewMessageId: intent.sourceId,
			threadId: resume.threadId,
			resumedSessionId: resume.sessionId,
		},
		// `agentConfig` rides the same key every other kind uses, so the drain's
		// existing `parseBakedAgentConfig` finds it with no special case.
		//
		// @lore BA2: `callingThreadId` is the thread the human gave the verdict in,
		// and a resumed session needs it for the same reason any other session with
		// a calling thread does — it is where the agent's answer belongs, and it is
		// where the never-silent net posts when a turn ends without returning.
		// Without it a resumed agent that says nothing leaves the human who
		// approved staring at silence, which is the exact defect this package
		// exists to remove. Observed on codex: the resume ran, carried its context,
		// and ended `not_returned` with nothing posted anywhere.
		payloadJson: JSON.stringify({
			resume,
			callingThreadId: resume.threadId,
			...(resume.agentConfig ? { agentConfig: resume.agentConfig } : {}),
		}),
	});
	const request = await insertRequestInternal(db, requestInput);
	return { request };
}
/**
 * Co-existence scaffolding — an already-baked request is
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
		// The assistant_turn family's baked transcript, the
		// task_run/subscription_run families' baked
		// contextBundle, and EVERY kind's baked
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
						// The session's calling thread id.
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
	eventBus: EventBus | undefined,
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
			// Every intent kind bakes at
			// emit time; an unbaked intent row is production-unreachable. bakedRequest
			// is required on WorkIntentInput.
			// @lore AU44: unbaked intents are production-unreachable (bakedRequest is
			// required at emit time), but legacy rows with bakedRequestJson=null must
			// fail cleanly via INVALID_WORK_SOURCE rather than being stuck claimed.
			if (intent.kind === "session_resume") {
				const resume = parseBakedResume(intent);
				if (!resume) {
					throw new InvalidAgentWorkSourceError(
						`Intent ${intent.id} (kind: session_resume) has no baked resume`,
					);
				}
				await handOffInternal(db, intent, claimToken, now, (tx) =>
					createResumeRequestInternal(tx as HyperIdleDb, intent, resume),
				);
				continue;
			}
			const baked = parseBakedRequest(intent);
			if (baked) {
				await handOffInternal(db, intent, claimToken, now, (tx) =>
					createFromBakedRequestInternal(tx, intent, baked),
				);
			} else {
				throw new InvalidAgentWorkSourceError(
					`Intent ${intent.id} (kind: ${intent.kind}) has no bakedRequestJson — unbaked intents are production-unreachable since AU44`,
				);
			}
		} catch (error) {
			await failOrRelease(db, eventBus, intent, error, options);
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
			// @lore BA2: session_resume bakes a resume rather than a start request —
			// it returns to a session that already exists, so there is no agent to
			// resolve and no context to assemble. Same column, different shape,
			// read back by the drain branch that owns the kind.
			bakedRequestJson: JSON.stringify(
				input.kind === "session_resume" ? input.resume : input.bakedRequest,
			),
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
		const candidates = (await tx.execute(sql`
			select i.id
			from agent_work_intents i
			left join agent_session_requests r on r.id = i.request_id
			where i.status in ('handed_off', 'failed')
			  and i.updated_at < ${cutoff}
			  and (i.request_id is null or r.status in ('completed', 'failed', 'cancelled'))
			order by i.updated_at, i.id
			limit ${batchSize}
		`)) as unknown as
			| ReadonlyArray<{ readonly id: string }>
			| { readonly rows: ReadonlyArray<{ readonly id: string }> };
		const ids = executeRows(candidates).map((row) => row.id);
		if (ids.length > 0) {
			await tx.delete(agentWorkIntents).where(inArray(agentWorkIntents.id, ids));
		}
		return { intents: ids.length };
	});
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

export type WorkIntentInput =
	| {
			// @lore BC3 architecture.md §5 B5: renamed from "assistant_turn".
			readonly kind: "thread_turn" | "task_run" | "subscription_run";
			readonly sourceKind: "thread_message" | "task_dispatch_attempt" | "subscription";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			readonly bakedRequest: BakedWorkIntentRequest;
	  }
	| {
			/**
			 * @lore BA2: return an agent to a session it already had, carrying a human's
			 * verdict. Nothing is started, so nothing is resolved or assembled —
			 * `resume` is the whole payload, and it takes `bakedRequest`'s column.
			 */
			readonly kind: "session_resume";
			readonly sourceKind: "review_verdict";
			readonly sourceId: string;
			readonly requestedBy?: string;
			readonly idempotencyKey: string;
			readonly resume: BakedSessionResumeRequest;
	  };
/**
 * Extended baked work-intent payload for session-requests' own drain logic.
 *
 * @lore AU44-b8: `@hyperidle/work-intent-port` dissolved into `@hyperidle/domain-model`.
 * `BakedContextBundle` and `BakedContextDocument` are now imported from there.
 * This type stays local because it adds `harnessDisabled` and `callingThreadId` —
 * session-requests-specific extension fields not in domain-model's `BakedWorkIntentRequest`.
 * It is a structural superset, not a mirror.
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
	 * The `assistant_turn` family's baked
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
	 * The `task_run`/`subscription_run` families' baked entity content
	 * (task/bet/agent/team, or subscription/agent/team) plus the
	 * ranked+budgeted knowledge items `@hyperidle/knowledge`'s
	 * `assembleSessionKnowledge` produces. Absent for `assistant_turn` (bakes
	 * `transcript` instead) — see `BakedWorkIntentRequest` in
	 * `@hyperidle/work-intent-port` for the full `@lore`.
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * Every kind's baked
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
	 * The session's calling thread id. Absent
	 * for `subscription_run` — see `BakedWorkIntentRequest` in
	 * `@hyperidle/work-intent-port` for the full `@lore`.
	 */
	readonly callingThreadId?: string;
};
// BakedContextDocument and BakedContextBundle are now imported from @hyperidle/domain-model above.
// The local mirrors existed because @hyperidle/work-intent-port's audience excluded session-requests;
// work-intent-port dissolved into domain-model (reach: everyone).
export type FindQuery =
	| { readonly by: "id"; readonly requestId: string }
	| { readonly by: "sessionId"; readonly sessionId: string }
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
type DurableQueueDeps = {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
};

export function enqueueWorkIntent(exec: WriteExecutor, input: WorkIntentInput) {
	return insertIntentInternal(exec, input);
}
// @lore BC3 architecture.md §3.10/§5 B5: `listPendingIntentsByKind` DELETED
// with its only caller, the deleted coherence trigger — its own doc comment
// assumed "sourceId IS the triggering message id", which the wake rule's
// `(message, agent)` identity (§3.10) makes false; a live function whose
// doc comment is false is the worse option.
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
export function drainIntents(
	deps: DurableQueueDeps,
	options?: { readonly now?: () => Date; readonly leaseMs?: number; readonly maxAttempts?: number },
) {
	return processIntentsInternal(deps.db, deps.eventBus, options);
}
export function reapExpired(
	db: HyperIdleDb,
	options?: { readonly now?: Date; readonly retentionDays?: number; readonly batchSize?: number },
) {
	return reapIntentsInternal(db, options);
}
