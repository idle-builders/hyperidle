/**
 * Unified parameterised lookup — replaces the 8-9 individual find-/is-
 * exports with one discriminated-query function.
 *
 * @lore AU20 Ag3b (METHOD-COLLAPSE): `findAgentSessionRequestById`,
 * `findAgentSessionRequestByIdempotencyKey`, `findAgentSessionRequestBySessionId`,
 * `findAgentSessionRequestTerminationReasonInTx`, `isAgentSessionRequestClaimActive`,
 * `findExplicitSessionStartById`, `findExplicitSessionStartByRequesterAndIdempotencyKey`,
 * `findAgentWorkIntentByKindAndSource`, and `findAgentWorkIntentSourceByRequestId`
 * collapse into one `findSessionRequest(exec, query)` — new discriminant arm
 * for any future lookup dimension, zero new method sprawl. Old implementations
 * remain in their source files as internal helpers; barrel no longer exports
 * them individually.
 */

import type {
	AgentSessionRequest,
	AgentWorkIntent,
	ExplicitSessionStart,
	HyperIdleDb,
} from "@hyperidle/db";
import type { AgentSessionSourceKind } from "@hyperidle/shared";
import {
	findAgentSessionRequestById,
	findAgentSessionRequestByIdempotencyKey,
	findAgentSessionRequestBySessionId,
	findAgentSessionRequestTerminationReasonInTx,
	isAgentSessionRequestClaimActive,
} from "./agent-session-requests.js";
import {
	type AgentWorkIntentKind,
	findAgentWorkIntentByKindAndSource,
	findAgentWorkIntentSourceByRequestId,
} from "./agent-work-intents.js";
import {
	findExplicitSessionStartById,
	findExplicitSessionStartByRequesterAndIdempotencyKey,
} from "./explicit-session-starts.js";

// ---------------------------------------------------------------------------
// Overloads — each `by:` arm has a precise return type.
// ---------------------------------------------------------------------------

/** `by: 'id'` — full row by primary key. */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "id"; requestId: string },
): Promise<AgentSessionRequest | undefined>;

/** `by: 'idempotencyKey'` — full row by source + key (dedupe check). */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: {
		by: "idempotencyKey";
		sourceKind: AgentSessionSourceKind;
		sourceId: string;
		idempotencyKey: string;
	},
): Promise<AgentSessionRequest | undefined>;

/** `by: 'sessionId'` — id-only projection by session id. */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "sessionId"; sessionId: string },
): Promise<Pick<AgentSessionRequest, "id"> | undefined>;

/** `by: 'terminationReason'` — tx-scoped termination reason lookup. */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "terminationReason"; requestId: string },
): Promise<string | null | undefined>;

/** `by: 'claimActive'` — boolean custody check (was `isAgentSessionRequestClaimActive`). */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "claimActive"; requestId: string; claimToken: string; now: Date },
): Promise<boolean>;

/** `by: 'explicitStart'` via `startId` — full row by explicit-start primary key. */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "explicitStart"; startId: string },
): Promise<ExplicitSessionStart | undefined>;

/** `by: 'explicitStart'` via requester + key — idempotency-keyed dedupe lookup. */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "explicitStart"; requestedBy: string; idempotencyKey: string },
): Promise<ExplicitSessionStart | undefined>;

/** `by: 'intentSource'` via `kind` + `sourceId` — intent metadata by source (was `findAgentWorkIntentByKindAndSource`). */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "intentSource"; kind: AgentWorkIntentKind; sourceId: string },
): Promise<Pick<AgentWorkIntent, "id" | "idempotencyKey"> | undefined>;

/** `by: 'intentSource'` via `requestId` — source coords from linked request (was `findAgentWorkIntentSourceByRequestId`). */
export function findSessionRequest(
	exec: HyperIdleDb,
	query: { by: "intentSource"; requestId: string },
): Promise<Pick<AgentWorkIntent, "sourceId" | "sourceKind"> | undefined>;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function findSessionRequest(
	exec: HyperIdleDb,
	query:
		| { by: "id"; requestId: string }
		| {
				by: "idempotencyKey";
				sourceKind: AgentSessionSourceKind;
				sourceId: string;
				idempotencyKey: string;
		  }
		| { by: "sessionId"; sessionId: string }
		| { by: "terminationReason"; requestId: string }
		| { by: "claimActive"; requestId: string; claimToken: string; now: Date }
		| { by: "explicitStart"; startId: string }
		| { by: "explicitStart"; requestedBy: string; idempotencyKey: string }
		| { by: "intentSource"; kind: AgentWorkIntentKind; sourceId: string }
		| { by: "intentSource"; requestId: string },
): Promise<
	| AgentSessionRequest
	| Pick<AgentSessionRequest, "id">
	| string
	| null
	| boolean
	| ExplicitSessionStart
	| Pick<AgentWorkIntent, "id" | "idempotencyKey">
	| Pick<AgentWorkIntent, "sourceId" | "sourceKind">
	| undefined
> {
	switch (query.by) {
		case "id":
			return findAgentSessionRequestById(exec, query.requestId);

		case "idempotencyKey":
			return findAgentSessionRequestByIdempotencyKey(exec, {
				sourceKind: query.sourceKind,
				sourceId: query.sourceId,
				idempotencyKey: query.idempotencyKey,
			});

		case "sessionId":
			return findAgentSessionRequestBySessionId(exec, query.sessionId);

		case "terminationReason":
			return findAgentSessionRequestTerminationReasonInTx(exec, query.requestId);

		case "claimActive":
			return isAgentSessionRequestClaimActive(exec, {
				requestId: query.requestId,
				claimToken: query.claimToken,
				now: query.now,
			});

		case "explicitStart":
			if ("startId" in query) {
				return findExplicitSessionStartById(exec, query.startId);
			}
			return findExplicitSessionStartByRequesterAndIdempotencyKey(exec, {
				requestedBy: query.requestedBy,
				idempotencyKey: query.idempotencyKey,
			});

		case "intentSource":
			if ("kind" in query) {
				return findAgentWorkIntentByKindAndSource(exec, query.kind, query.sourceId);
			}
			return findAgentWorkIntentSourceByRequestId(exec, query.requestId);
	}
}
