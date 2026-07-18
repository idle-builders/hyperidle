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
 */

import { createAgentSelectionService } from "@hyperidle/agent-selection";
import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { findById as findKnowledgeItemById } from "@hyperidle/knowledge";
import {
	type AgentLifecycleInboxFact,
	deleteLifecycleInboxByRequestIds,
	insertLifecycleInboxFactIfAbsent,
	listProjectedLifecycleInboxBefore,
} from "@hyperidle/lifecycle-projection";
import { getTeamMembers } from "@hyperidle/org";
import { findGrantedProposedCall } from "@hyperidle/review";
import * as routineService from "@hyperidle/routine";
import {
	type AgentWorkIntentReapDeps,
	type AgentWorkIntentWorkerDeps,
	claimAgentWorkIntent as claimAgentWorkIntentInternal,
	createAgentSessionRequest,
	drainAgentWorkIntents as drainAgentWorkIntentsInternal,
	findAgentSessionRequestByIdempotencyKey,
	findAgentSessionRequestBySessionId,
	findAgentWorkIntentByKindAndSource,
	type MarkRequestRunningDeps,
	markRequestRunning as markRequestRunningInternal,
	reapTerminalAgentWorkIntents as reapTerminalAgentWorkIntentsInternal,
	recordAgentWorkIntent,
	renewAgentWorkIntentLease as renewAgentWorkIntentLeaseInternal,
	resolveAuthoritativeInput as resolveAuthoritativeInputInternal,
	type SessionRequestsLifecycleInboxFact,
	type TerminalizeAgentSessionRequestInput,
	type TerminalizeSessionRequestDeps,
	terminalizeAgentSessionRequestInTx as terminalizeAgentSessionRequestInTxInternal,
	terminalizeAgentSessionRequest as terminalizeAgentSessionRequestInternal,
} from "@hyperidle/session-requests";
import { listConfiguration } from "@hyperidle/settings";
import type { AgentWorkIntentReader, AgentWorkIntentRecorder } from "@hyperidle/shared";
import {
	createTriggeredAgentSessionRequest,
	recordSessionForResolutionHistory,
	type TriggerResolutionDeps,
} from "@hyperidle/trigger-resolution";
import {
	getUserById,
	getUserByIdScopedToTeam,
	listActiveAiUsersByTeams,
	listUsersByTeam,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";

// ---------------------------------------------------------------------------
// trigger-resolution's OWN deps — `sessionRequests` now wired to
// `@hyperidle/session-requests`'s real exports (no longer interim, Inc 3a's
// `triggerResolutionDeps` moved + finalized here).
// ---------------------------------------------------------------------------

const triggerResolutionDeps: TriggerResolutionDeps = {
	sessionRequests: {
		findByIdempotencyKey: findAgentSessionRequestByIdempotencyKey,
		create: createAgentSessionRequest,
	},
	config: { listConfiguration },
	users: { getUserByIdScopedToTeam },
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
};

// ---------------------------------------------------------------------------
// agent-selection — resolved to `@hyperidle/agent-selection`'s real exports
// (Increment 3e; was the last remaining INTERIM forward-reference since
// Increment 3b, see this file's top `@lore`). Bound once, at the composition
// root, to `agent-selection`'s own `users`/`org` ports (Mechanism C).
// ---------------------------------------------------------------------------

const agentSelectionService = createAgentSelectionService({
	users: { getUserById, listActiveAiUsersByTeams },
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
});

// ---------------------------------------------------------------------------
// agent_lifecycle_inbox — resolved to `@hyperidle/lifecycle-projection`'s
// real exports (Increment 3d; was an INTERIM raw-table-ops implementation
// since Increment 3b, see `@hyperidle/session-requests`'s `ports.ts` top
// `@lore`). `lifecycle-projection` is the real `TABLE_OWNER` of
// `agent_lifecycle_inbox` — `session-requests` now reaches it through an
// ordinary same-layer DI port (both are agent-orchestration Services)
// instead of a raw table access, closing the forward-reference.
// ---------------------------------------------------------------------------

const lifecycleInboxWriter = {
	insertIfAbsent(tx: HyperIdleDb, fact: SessionRequestsLifecycleInboxFact): Promise<void> {
		return insertLifecycleInboxFactIfAbsent(tx, fact satisfies AgentLifecycleInboxFact);
	},
};

const lifecycleInboxReaper = {
	listProjectedBefore(tx: HyperIdleDb, cutoff: string, batchSize: number) {
		return listProjectedLifecycleInboxBefore(tx, cutoff, batchSize);
	},
	deleteByRequestIds(tx: HyperIdleDb, requestIds: readonly string[]): Promise<void> {
		return deleteLifecycleInboxByRequestIds(tx, requestIds);
	},
};

// ---------------------------------------------------------------------------
// Aggregate deps bundles
// ---------------------------------------------------------------------------

const agentWorkIntentWorkerDeps: AgentWorkIntentWorkerDeps = {
	routine: {
		getRoutineRunById: routineService.getRoutineRun,
		getRoutineById: routineService.getRoutine,
		updateRoutineRunIfRunning: (exec, id, patch) =>
			routineService.updateRoutineRun(exec, id, patch, { onlyIfRunning: true }),
	},
	work: { getTaskById: work.getTaskById, getBetById: work.getBetById },
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
	users: { getUserById, listUsersByTeam },
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
	review: { findGrantedProposedCall },
	knowledge: { findById: findKnowledgeItemById },
	triggerResolver: {
		resolveAndCreate: (db, input) =>
			createTriggeredAgentSessionRequest(
				db,
				input as Parameters<typeof createTriggeredAgentSessionRequest>[1],
				triggerResolutionDeps,
			),
	},
};

const agentWorkIntentReapDeps: AgentWorkIntentReapDeps = {
	lifecycleInbox: lifecycleInboxReaper,
};

const terminalizeSessionRequestDeps: TerminalizeSessionRequestDeps = {
	lifecycleInbox: lifecycleInboxWriter,
};

const markRequestRunningDeps: MarkRequestRunningDeps = {
	triggerHistory: { recordSessionForResolutionHistory },
};

// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/session-requests` directly for the deps-carrying functions.
// (`claimAgentWorkIntent`/`renewAgentWorkIntentLease`/
// `createAgentSessionRequest`/`claimNextAgentSessionRequest`/etc. take no
// deps and are re-exported unchanged below for a single import surface.)
// ---------------------------------------------------------------------------

export { findAgentSessionRequestBySessionId, recordAgentWorkIntent };

export function drainAgentWorkIntents(
	db: HyperIdleDb,
	options?: Parameters<typeof drainAgentWorkIntentsInternal>[2],
): Promise<void> {
	return drainAgentWorkIntentsInternal(db, agentWorkIntentWorkerDeps, options);
}

export function resolveAuthoritativeInput(
	db: HyperIdleDb,
	intent: Parameters<typeof resolveAuthoritativeInputInternal>[1],
): ReturnType<typeof resolveAuthoritativeInputInternal> {
	return resolveAuthoritativeInputInternal(db, intent, agentWorkIntentWorkerDeps);
}

export function reapTerminalAgentWorkIntents(
	db: HyperIdleDb,
	options?: Parameters<typeof reapTerminalAgentWorkIntentsInternal>[2],
): ReturnType<typeof reapTerminalAgentWorkIntentsInternal> {
	return reapTerminalAgentWorkIntentsInternal(db, agentWorkIntentReapDeps, options);
}

export function markRequestRunning(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
	claimToken?: string,
): Promise<void> {
	return markRequestRunningInternal(db, requestId, sessionId, markRequestRunningDeps, claimToken);
}

export function terminalizeAgentSessionRequestInTx(
	tx: HyperIdleDb,
	input: TerminalizeAgentSessionRequestInput,
): ReturnType<typeof terminalizeAgentSessionRequestInTxInternal> {
	return terminalizeAgentSessionRequestInTxInternal(tx, input, terminalizeSessionRequestDeps);
}

export function terminalizeAgentSessionRequest(
	db: HyperIdleDb,
	input: TerminalizeAgentSessionRequestInput,
): ReturnType<typeof terminalizeAgentSessionRequestInternal> {
	return terminalizeAgentSessionRequestInternal(db, input, terminalizeSessionRequestDeps);
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
export { findAgentWorkIntentByKindAndSource };

// ---------------------------------------------------------------------------
// AC-9 (§11) — Application-injected cross-Layer recorder/reader ports.
// ---------------------------------------------------------------------------

export const agentWorkIntentRecorder: AgentWorkIntentRecorder<HyperIdleDb> = {
	record: recordAgentWorkIntent,
};

export const agentWorkIntentReader: AgentWorkIntentReader<HyperIdleDb> = {
	findByKindAndSource: findAgentWorkIntentByKindAndSource,
};
