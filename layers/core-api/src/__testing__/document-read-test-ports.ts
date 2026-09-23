/**
 * @lore B21: `@hyperidle/document`'s legacy `getAgentIdentity`/`getParentedItem`
 * are deleted with the CRUD repository they lived in. Several `core-api/src`
 * integration tests build their own narrow `TaskRunResolverDeps`-shaped bag
 * that bypasses the real composition root (`task-run-resolver-bindings.ts` —
 * needs a full `AgentOrchestrationPort`/request context this narrower test
 * port doesn't carry) — so this mirrors that binding's own `getAgentIdentity`
 * exactly (architecture.md §8.3), off the same `search_documents` runner,
 * instead of each test reaching past the action mechanism for the deleted
 * direct-table function.
 *
 * @lore BC5 T7b: `getRoutinePrompt` deleted with the routine package — its
 * only callers were the routine-scheduler integration tests, deleted in the
 * same change.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { type AgentIdentityPort, createAgentIdentityPort } from "@hyperidle/user";
import type { ActionContext, SearchDocumentsRunFn } from "../actions/action.js";
import { buildStandaloneDocumentRunners } from "../actions/compose.js";
import { resolveAgentIdentityBody } from "../services/task-run-resolver-bindings.js";

function readCtx(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: new Date().toISOString() };
}

export function makeDocumentReadPorts(searchDocuments: SearchDocumentsRunFn): {
	readonly getAgentIdentity: (db: HyperIdleDb, agentId: string) => Promise<string | null>;
} {
	return {
		getAgentIdentity: (db, agentId) =>
			resolveAgentIdentityBody(readCtx(db, agentId), agentId, searchDocuments),
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
