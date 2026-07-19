/**
 * @lore AU19 Increment 3b: `@hyperidle/session-requests`'s
 * `drainAgentWorkIntents`/`resolveAuthoritativeInput`/`reapTerminalAgentWorkIntents`/
 * `terminalizeAgentSessionRequest(InTx)`/`markRequestRunning` need injected
 * `routine`/`work`/`agent-selection`/`conversation`/`users`/`org`/`review`/
 * `trigger-resolution` ports (Mechanism C — `session-requests` never imports
 * another Service). `agent_lifecycle_inbox` was an interim forward-reference
 * (owned by `lifecycle-projection`) — resolved at Increment 3d:
 * `lifecycleInboxWriter`/`lifecycleInboxReaper` below now call
 * `@hyperidle/lifecycle-projection`'s real exports instead of raw table ops.
 * This module builds
 * each bound singleton ONCE, at the composition root, so every real call
 * site (`agent-layer-boot.ts`, `session-lifecycle.ts`, `agent-session-runtime.ts`,
 * `routes/threads.ts`, `routes/sessions-routes.ts`, `routes/tasks.ts`,
 * `routes/bets.ts`, `routes/knowledge.ts`, `routes/routines-routes.ts`,
 * `routine-scheduler.ts`, `session-provisioning.ts`, `policy-bindings.ts`,
 * `app.ts`, `server-factory.ts`) imports the already-wired function — same
 * factory-curry idiom as `policy-bindings.ts`'s `handoff`/`computeApprovalRate`
 * (Increment 2a).
 *
 * @lore AU19 Increment 3e: `agentSelection` — the LAST interim forward-
 * reference this module carried — is resolved: `@hyperidle/session-requests`'s
 * `SessionRequestsAgentSelector` port (`isAgentAtWipLimit`/
 * `selectAgentByAppDefaults`) now wires to `@hyperidle/agent-selection`'s real
 * `createAgentSelectionOps(...)`-bound exports instead of the deleted
 * `./agent-selection.js` flat module. Same resolution shape as
 * `lifecycle-projection`'s own Increment 3d closure above.
 *
 * The AC-9 (§11) cross-Layer `agentWorkIntentRecorder`/`agentWorkIntentReader`
 * singletons at the bottom are the concrete `@hyperidle/shared`-typed ports
 * `createApp`/`createServer` inject into `routes/threads.ts`/
 * `routes/sessions-routes.ts` — the only two accessors that needed the
 * Application-injection treatment (raw table access bypassing the canonical
 * writer/reader); every other consumer above just imports
 * `recordAgentWorkIntent` from this module directly (an ordinary same-process
 * `packages/server` composition-root import, not a route→Service import).
 *
 * @lore AU20 Ag3b (METHOD-COLLAPSE): `findAgentSessionRequestByIdempotencyKey`/
 * `findAgentSessionRequestBySessionId`/`findAgentWorkIntentByKindAndSource`/
 * `markRequestRunning`/`terminalizeAgentSessionRequest(InTx)` replaced by
 * `findSessionRequest`/`transitionSessionRequest`/`transitionSessionRequestInTx`
 * from the unified surface. `markExplicitSessionStartAdmitted`,
 * `markExplicitSessionStartFailed`, and `projectExplicitSessionStartTerminalState`
 * are now exported as bound wrappers from this module (instead of being
 * raw re-exports from the barrel) — run-orchestration-bindings.ts and
 * lifecycle-projection-bindings.ts import them from here.
 */

import { createAgentSelectionService } from "@hyperidle/agent-selection";
import { findMessage } from "@hyperidle/conversation";
import type {
	AgentSessionRequest,
	AgentWorkIntent,
	HyperIdleDb,
	WriteExecutor,
} from "@hyperidle/db";
import { get as getKnowledgeItem } from "@hyperidle/knowledge";
import { getTeamMembers } from "@hyperidle/org";
import { findProposedCall } from "@hyperidle/review";
import * as routineService from "@hyperidle/routine";
import {
	type AgentWorkIntentKind,
	claimAgentWorkIntent as claimAgentWorkIntentInternal,
	createAgentSessionRequest,
	type DurableAgentQueueDeps,
	drainAgentWorkIntents as drainAgentWorkIntentsInternal,
	findSessionRequest,
	reapTerminalAgentWorkIntents as reapTerminalAgentWorkIntentsInternal,
	recordAgentWorkIntent,
	renewAgentWorkIntentLease as renewAgentWorkIntentLeaseInternal,
	resolveAuthoritativeInput as resolveAuthoritativeInputInternal,
	transitionSessionRequest,
	transitionSessionRequestInTx,
} from "@hyperidle/session-requests";
import { listConfiguration } from "@hyperidle/settings";
import type { AgentWorkIntentReader, AgentWorkIntentRecorder } from "@hyperidle/shared";
import {
	createTriggeredAgentSessionRequest,
	recordSessionForResolutionHistory,
	type TriggerResolutionDeps,
} from "@hyperidle/trigger-resolution";
import { findUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";

// ---------------------------------------------------------------------------
// Local type alias preserving the old TerminalizeAgentSessionRequestInput shape
// (uses `state` field) so that session-lifecycle's port binding continues to
// work without touching session-lifecycle's internal port interface.
// @lore AU20 Ag3b: `TerminalizeAgentSessionRequestInput` removed from barrel;
// this local alias keeps the composition-root wrappers structurally compatible
// with `SessionLifecyclePorts["sessionRequests"].terminalizeAgentSessionRequestInTx`.
// ---------------------------------------------------------------------------
type TerminalizeInput =
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

// ---------------------------------------------------------------------------
// trigger-resolution's OWN deps — `sessionRequests.findByIdempotencyKey` now
// calls `findSessionRequest` with `by: 'idempotencyKey'`.
// ---------------------------------------------------------------------------

const triggerResolutionDeps: TriggerResolutionDeps = {
	sessionRequests: {
		findByIdempotencyKey: (db, key) =>
			findSessionRequest(db, {
				by: "idempotencyKey",
				sourceKind: key.sourceKind,
				sourceId: key.sourceId,
				idempotencyKey: key.idempotencyKey,
			}),
		create: createAgentSessionRequest,
	},
	config: { listConfiguration },
	users: {
		getUserByIdScopedToTeam: (db, userId, teamId) =>
			findUser(db, teamId !== undefined ? { id: userId, teamIds: [teamId] } : { id: userId }),
	},
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
};

// ---------------------------------------------------------------------------
// agent-selection — resolved to `@hyperidle/agent-selection`'s real exports
// (Increment 3e; was the last remaining INTERIM forward-reference since
// Increment 3b, see this file's top `@lore`). Bound once, at the composition
// root, to `agent-selection`'s own `users`/`org` ports (Mechanism C).
// ---------------------------------------------------------------------------

const agentSelectionService = createAgentSelectionService({
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listActiveAiUsersByTeams: (db, teamIds) =>
			listUsers(db, { teamIds, kind: "ai", status: "active" }),
	},
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
});

// ---------------------------------------------------------------------------
// DurableAgentQueueDeps — single composition-root deps bundle (AU20 Ag3a).
//
// @lore AU20 Ag3a: previously 4 separate mini-bundle consts were built and
// passed to individual functions. DurableAgentQueueDeps is a structural
// superset of all four: TypeScript structural typing means passing `deps`
// (or `{ lifecycleInbox: deps.lifecycleInbox }` / `{ triggerHistory: deps.triggerHistory }`)
// satisfies every internal function's mini-bundle parameter type without
// runtime wrapping or casting. The individual SessionRequests* port types and
// mini-bundles remain as internal building blocks inside ports.ts.
// ---------------------------------------------------------------------------

const deps: DurableAgentQueueDeps = {
	routine: {
		getRoutineRunById: routineService.getRoutineRun,
		getRoutineById: routineService.getRoutine,
		updateRoutineRunIfRunning: (exec, id, patch) =>
			routineService.updateRoutineRun(exec, id, patch, { onlyIfRunning: true }),
	},
	work: {
		getTaskById: (exec: import("@hyperidle/db").WriteExecutor, id: string) =>
			work.get(exec, "task", id),
		getBetById: (exec: import("@hyperidle/db").WriteExecutor, id: string) =>
			work.get(exec, "bet", id),
	},
	agentSelection: {
		// @lore AU20 Ab4: adapts new AgentSelectionService methods to session-requests'
		// SessionRequestsAgentSelector structural-mirror port (unchanged in ports.ts).
		isAgentAtWipLimit: (db, agentId) => agentSelectionService.isAtCapacity(db, agentId),
		selectAgentByAppDefaults: (req) => {
			// session-requests only calls this with routine_delegate (AU15 drain-time
			// delegation — see agent-work-intent-worker.ts). bet_* surfaces are handled
			// by work's selectOwner path. Guard for completeness.
			if (req.surface === "routine_delegate" && req.skillId && req.excludeAgentId) {
				return agentSelectionService.selectAgent({
					surface: "routine_delegate",
					db: req.db,
					teamId: req.teamId,
					workKey: req.workKey,
					skillId: req.skillId,
					excludeAgentId: req.excludeAgentId,
				});
			}
			return Promise.resolve({ agentId: null });
		},
	},
	conversation: { getMessageById: (db, id) => findMessage(db, { id }) },
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listUsersByTeam: (db, teamId) => listUsers(db, { teamIds: [teamId] }),
	},
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
	review: {
		findGrantedProposedCall: async (db, proposedCallId) => {
			const view = await findProposedCall(db, {
				by: { id: proposedCallId },
				include: { grant: true },
			});
			if (!view?.grant) return undefined;
			return { call: view.call, grant: view.grant };
		},
	},
	knowledge: {
		findById: (db: import("@hyperidle/db").HyperIdleDb, id: string) => getKnowledgeItem(db, id),
	},
	triggerResolver: {
		resolveAndCreate: (db, input) =>
			createTriggeredAgentSessionRequest(
				db,
				input as Parameters<typeof createTriggeredAgentSessionRequest>[1],
				triggerResolutionDeps,
			),
	},
	triggerHistory: { recordSessionForResolutionHistory },
};

// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/session-requests` directly for the deps-carrying functions.
// (`claimAgentWorkIntent`/`renewAgentWorkIntentLease`/
// `createAgentSessionRequest`/`claimNextAgentSessionRequest`/etc. take no
// deps and are re-exported unchanged below for a single import surface.)
// ---------------------------------------------------------------------------

/** Session-id lookup, narrow projection (was direct re-export, now wraps `findSessionRequest`). */
export function findAgentSessionRequestBySessionId(
	db: HyperIdleDb,
	sessionId: string,
): Promise<Pick<AgentSessionRequest, "id"> | undefined> {
	return findSessionRequest(db, { by: "sessionId", sessionId });
}

export { recordAgentWorkIntent };

export function drainAgentWorkIntents(
	db: HyperIdleDb,
	options?: Parameters<typeof drainAgentWorkIntentsInternal>[2],
): Promise<void> {
	return drainAgentWorkIntentsInternal(db, deps, options);
}

export function resolveAuthoritativeInput(
	db: HyperIdleDb,
	intent: Parameters<typeof resolveAuthoritativeInputInternal>[1],
): ReturnType<typeof resolveAuthoritativeInputInternal> {
	return resolveAuthoritativeInputInternal(db, intent, deps);
}

export function reapTerminalAgentWorkIntents(
	db: HyperIdleDb,
	options?: Parameters<typeof reapTerminalAgentWorkIntentsInternal>[1],
): ReturnType<typeof reapTerminalAgentWorkIntentsInternal> {
	return reapTerminalAgentWorkIntentsInternal(db, options);
}

export function markRequestRunning(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
	claimToken?: string,
): Promise<void> {
	return transitionSessionRequest(db, { to: "running", requestId, sessionId, claimToken }, deps);
}

/**
 * Tx-scoped terminal write, accepting the old `{state}` field shape for
 * structural compatibility with `SessionLifecyclePorts["sessionRequests"].terminalizeAgentSessionRequestInTx`.
 * Internally maps `state` → `to` for `transitionSessionRequestInTx`.
 */
export function terminalizeAgentSessionRequestInTx(
	tx: HyperIdleDb,
	input: TerminalizeInput,
): Promise<AgentSessionRequest | null> {
	const spec =
		input.precondition === "running"
			? ({
					to: input.state,
					precondition: "running" as const,
					requestId: input.requestId,
					sessionId: input.sessionId,
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
					requireNoTerminationReason: input.requireNoTerminationReason,
				} as const)
			: ({
					to: "failed" as const,
					precondition: "claimed" as const,
					requestId: input.requestId,
					claimToken: input.claimToken,
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
				} as const);
	return transitionSessionRequestInTx(tx, spec);
}

/**
 * Non-tx terminal write (opens own transaction).
 * Same `{state}` field shape as above for backwards compatibility.
 */
export function terminalizeAgentSessionRequest(
	db: HyperIdleDb,
	input: TerminalizeInput,
): Promise<AgentSessionRequest | null> {
	const spec =
		input.precondition === "running"
			? ({
					to: input.state,
					precondition: "running" as const,
					requestId: input.requestId,
					sessionId: input.sessionId,
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
					requireNoTerminationReason: input.requireNoTerminationReason,
				} as const)
			: ({
					to: "failed" as const,
					precondition: "claimed" as const,
					requestId: input.requestId,
					claimToken: input.claimToken,
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
				} as const);
	return transitionSessionRequest(db, spec);
}

/** Pre-admission admitted transition (bound; was direct barrel import in run-orchestration-bindings). */
export function markExplicitSessionStartAdmitted(
	db: HyperIdleDb,
	input: { readonly id: string; readonly requestId: string; readonly sessionId: string },
): Promise<void> {
	return transitionSessionRequest(db, {
		target: "explicitStart",
		to: "admitted",
		startId: input.id,
		requestId: input.requestId,
		sessionId: input.sessionId,
	});
}

/** Pre-admission failed transition (bound; was direct barrel import in run-orchestration-bindings). */
export function markExplicitSessionStartFailed(
	db: HyperIdleDb,
	input: { readonly id: string; readonly failureCode: string },
): Promise<void> {
	return transitionSessionRequest(db, {
		target: "explicitStart",
		to: "failed",
		startId: input.id,
		failureCode: input.failureCode,
	});
}

/**
 * Post-run explicit-start terminal projection (bound; was direct barrel import
 * in lifecycle-projection-bindings). Called inside an existing tx by
 * lifecycle-projection's drain. `exec` is a Drizzle tx which IS `HyperIdleDb`
 * at runtime; cast mirrors the `tx as HyperIdleDb` pattern already used in
 * `terminalizeAgentSessionRequest`.
 */
export function projectExplicitSessionStartTerminalState(
	exec: WriteExecutor,
	requestId: string,
	patch: {
		readonly status: "completed" | "failed" | "cancelled";
		readonly sessionId: string | null;
		readonly failureCode: string | null;
	},
): Promise<void> {
	return transitionSessionRequestInTx(exec as HyperIdleDb, {
		target: "explicitStart",
		requestId,
		to: patch.status,
		sessionId: patch.sessionId,
		failureCode: patch.failureCode,
	});
}

export const claimAgentWorkIntent = claimAgentWorkIntentInternal;
export const renewAgentWorkIntentLease = renewAgentWorkIntentLeaseInternal;

/**
 * @lore AU9 R1 (pre-move alias, kept for the "production module offers one
 * drain" test's assertion surface): `executeAgentRunRequest` now lives in
 * `@hyperidle/run-orchestration` (migrated Increment 3c), wired through
 * `run-orchestration-bindings.ts` — this is a convenience alias, not
 * `session-requests`' own behavior, so it stays at the composition root
 * rather than moving into the new package.
 */
export { executeAgentRunRequest as consumeAgentSessionRequest } from "./run-orchestration-bindings.js";

/** Intent-source lookup by kind+sourceId (was direct barrel re-export, now wraps `findSessionRequest`). */
export function findAgentWorkIntentByKindAndSource(
	db: HyperIdleDb,
	kind: AgentWorkIntentKind,
	sourceId: string,
): Promise<Pick<AgentWorkIntent, "id" | "idempotencyKey"> | undefined> {
	return findSessionRequest(db, { by: "intentSource", kind, sourceId });
}

// ---------------------------------------------------------------------------
// AC-9 (§11) — Application-injected cross-Layer recorder/reader ports.
// ---------------------------------------------------------------------------

export const agentWorkIntentRecorder: AgentWorkIntentRecorder<HyperIdleDb> = {
	record: recordAgentWorkIntent,
};

export const agentWorkIntentReader: AgentWorkIntentReader<HyperIdleDb> = {
	findByKindAndSource: findAgentWorkIntentByKindAndSource,
};
