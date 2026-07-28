/**
 * @lore AU19 Increment 3b: `@hyperidle/session-requests`'s
 * Composition root for the durable agent queue.
 * Durable queue transitions need injected
 * `routine`/`work`/`agent-selection`/`conversation`/`users`/`org`/`review`/
 * `trigger-resolution` ports (Mechanism C — `session-requests` never imports
 * another Service). `@hyperidle/session-requests` is the current owner of lifecycle projection.
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
 * `SessionRequestsAgentSelector` now wires to the shared composition-root
 * `AgentSelectionService` singleton. Same resolution shape as
 * `lifecycle-projection`'s own Increment 3d closure above.
 *
 * The AC-9 (§11) cross-Layer `agentWorkIntentRecorder`/`agentWorkIntentReader`
 * singletons at the bottom are the concrete `@hyperidle/shared`-typed ports
 * `createApp`/`createServer` inject into `routes/threads.ts`/
 * `routes/sessions-routes.ts` — the only two accessors that needed the
 * Application-injection treatment (raw table access bypassing the canonical
 * writer/reader); every other consumer above just imports
 * `enqueueWorkIntent` from this module directly (an ordinary same-process
 * `packages/server` composition-root import, not a route→Service import).
 *
 * @lore AU20: this composition root supplies dependencies to the unified
 * durable-queue operations; compatibility transition wrappers were deleted.
 */

import { findMessage } from "@hyperidle/conversation";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { get as getKnowledgeItem } from "@hyperidle/knowledge";
import { getTeamMembers } from "@hyperidle/org";
import { findProposedCall } from "@hyperidle/review";
import * as routineService from "@hyperidle/routine";
import { type DurableAgentQueueDeps, transitionSessionRequest } from "@hyperidle/session-requests";
import { listConfiguration } from "@hyperidle/settings";
import { findUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { agentSelectionService } from "./agent-selection-bindings.js";

// ---------------------------------------------------------------------------
// agent-selection — resolved to `@hyperidle/agent-selection`'s real exports
// (Increment 3e; was the last remaining INTERIM forward-reference since
// Increment 3b, see this file's top `@lore`). Bound once, at the composition
// root, to `agent-selection`'s own `users`/`org` ports (Mechanism C).
// ---------------------------------------------------------------------------

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

const ports = {
	config: { listConfiguration },
	routine: {
		getRoutineRunById: routineService.getRoutineRun,
		getRoutineById: routineService.getRoutine,
	},
	work: {
		getTaskById: (exec: import("@hyperidle/db").WriteExecutor, id: string) =>
			work.get(exec, "task", id),
		getBetById: (exec: import("@hyperidle/db").WriteExecutor, id: string) =>
			work.get(exec, "bet", id),
		getTaskDispatchAttemptById: work.taskDispatchAttemptStore.get,
		reapTerminalTaskDispatchAttempts: work.taskDispatchAttemptStore.reapTerminal,
	},
	agentSelection: {
		isAtCapacity: agentSelectionService.isAtCapacity,
		selectAgent: agentSelectionService.selectAgent,
	},
	conversation: { getMessageById: (db: HyperIdleDb, id: string) => findMessage(db, { id }) },
	users: {
		getUserById: (db: HyperIdleDb, id: string) => findUser(db, { id }),
		getUserByIdScopedToTeam: (db: HyperIdleDb, userId: string, teamId?: string) =>
			findUser(db, teamId ? { id: userId, teamIds: [teamId] } : { id: userId }),
		listUsersByTeam: (db: HyperIdleDb, teamId: string) => listUsers(db, { teamIds: [teamId] }),
	},
	teams: {
		getTeamMembersByTeamId: (db: HyperIdleDb, teamId: string) => getTeamMembers(db, { teamId }),
	},
	review: {
		findGrantedProposedCall: async (db: HyperIdleDb, proposedCallId: string) => {
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
	lifecycleProjection: {
		routine: {
			updateRoutineRunIfRunning: (exec: WriteExecutor, id: string, patch: object) =>
				routineService.updateRoutineRun(exec, id, patch, { onlyIfRunning: true }),
		},
		work: {
			updateTaskDispatchAttemptIfActive: work.taskDispatchAttemptStore.updateIfActive,
			updateBetDecompositionStatusIfRunning: async (
				exec: WriteExecutor,
				id: string,
				patch: object,
			) => {
				await work.transition(exec, "bet", {
					id,
					guard: { field: "decompositionStatus", equals: "running" },
					patch,
				});
			},
		},
		explicitSessionStarts: {
			projectTerminalState: async (
				exec: WriteExecutor,
				requestId: string,
				patch: {
					readonly status: "completed" | "failed" | "cancelled";
					readonly sessionId: string | null;
					readonly failureCode: string | null;
				},
			) => {
				await transitionSessionRequest(exec, {
					target: "explicitStart",
					transaction: "existing",
					requestId,
					to: patch.status,
					sessionId: patch.sessionId,
					failureCode: patch.failureCode,
				});
			},
		},
	},
};

export function queueDeps(db: HyperIdleDb): DurableAgentQueueDeps {
	return { db, ...ports };
}
