import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { type AgentIdentityPort, createAgentIdentityPort } from "@hyperidle/user";
import type { ActionContext, SearchDocumentsRunFn } from "../actions/action.js";
import { buildStandaloneDocumentRunners } from "../actions/compose.js";

function readCtx(db: HyperIdleDb, actor: string): ActionContext {
	return { actor, db, eventBus: new EventBus(), now: new Date().toISOString() };
}

async function resolveAgentIdentityBody(
	ctx: ActionContext,
	agentId: string,
	searchDocuments: SearchDocumentsRunFn,
): Promise<string | null> {
	const result = await searchDocuments(ctx, {
		parent: { kind: "agent", id: agentId },
		slot: "agent_file",
		status: "active",
	});
	return result.ok ? (result.data[0]?.body ?? null) : null;
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
