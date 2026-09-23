/**
 * @lore B21: `@hyperidle/document`'s legacy `getAgentIdentity`/`getParentedItem`
 * are deleted with the CRUD repository they lived in. Several `core-api/src`
 * integration tests build their own narrow ports (a `RoutineSchedulerPorts`
 * for a direct `fireGenericRoutine` call, or a `TaskRunResolverDeps`-shaped
 * bag) that bypass the real composition roots (`routine-scheduler-bindings.ts`,
 * `task-run-resolver-bindings.ts` — both need a full `AgentOrchestrationPort`/
 * request context these narrower test ports don't carry) — so this mirrors
 * those bindings' own `getAgentIdentity`/`getRoutinePrompt` exactly
 * (architecture.md §8.3), off the same `search_documents` runner, instead of
 * each test reaching past the action mechanism for the deleted direct-table
 * functions.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { getRoutine } from "@hyperidle/routine";
import { type AgentIdentityPort, createAgentIdentityPort } from "@hyperidle/user";
import type { ActionContext, SearchDocumentsRunFn } from "../actions/action.js";
import { buildStandaloneDocumentRunners } from "../actions/compose.js";
import { resolveAgentIdentityBody } from "../services/task-run-resolver-bindings.js";

function readCtx(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: new Date().toISOString() };
}

export function makeDocumentReadPorts(searchDocuments: SearchDocumentsRunFn): {
	readonly getAgentIdentity: (db: HyperIdleDb, agentId: string) => Promise<string | null>;
	readonly getRoutinePrompt: (db: HyperIdleDb, routineId: string) => Promise<string | null>;
} {
	return {
		getAgentIdentity: (db, agentId) =>
			resolveAgentIdentityBody(readCtx(db, agentId), agentId, searchDocuments),
		getRoutinePrompt: async (db, routineId) => {
			const routine = await getRoutine(db, routineId);
			if (!routine) return null;
			// @lore knowledge-attachment-slot: no status filter, on purpose — a
			// manually archived prompt keeps being read exactly as it is today.
			const result = await searchDocuments(readCtx(db, routine.ownerAgentId), {
				parent: { kind: "routine", id: routineId },
				slot: "prompt",
			});
			return result.ok ? (result.data[0]?.body ?? null) : null;
		},
	};
}

/**
 * The real `AgentIdentityPort` (`routes/agent-identity.ts`) — the production
 * replacement for the deleted `@hyperidle/document`'s `upsertAgentIdentity`/
 * `getAgentIdentityIds` — wired against a standalone `search_documents`/
 * `edit_document` pair, for tests that need to seed or read an agent's
 * identity document without going through a full HTTP composition root.
 */
export function makeAgentIdentityTestPort(): AgentIdentityPort {
	const { searchDocuments, editDocument } = buildStandaloneDocumentRunners();
	return createAgentIdentityPort({ searchDocuments, editDocument, eventBus: new EventBus() });
}
