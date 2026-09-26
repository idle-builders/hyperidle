/**
 * The one place an agent's identity document is written or looked up —
 * `edit_user` uses it for the identity a create/retire touches.
 *
 * An agent's identity is an `agent_file`-slotted document parented to the
 * agent (`parentKind:"agent"`, `parentId:<agentId>`), `scopeKind:"user"`,
 * `scopeId:<agentId>` — the binding context assembly reads through the parent
 * slot. Every read and write here goes through the injected
 * `search_documents`/`edit_document` runners, never `@hyperidle/document`
 * directly — and never `open_document`, so an identity lookup never counts
 * as a read.
 */
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ActionContext, EditDocumentRunFn, SearchDocumentsRunFn } from "./action-types.js";

export interface AgentIdentityDeps {
	readonly searchDocuments: SearchDocumentsRunFn;
	readonly editDocument: EditDocumentRunFn;
	readonly eventBus: EventBus;
}

export interface AgentIdentityPort {
	/**
	 * Give the agent its identity document, or return the one it already
	 * has — the body is NEVER overwritten once the document exists (a
	 * person's edit is theirs). `updatedBy` is the acting user's id.
	 */
	readonly upsertAgentIdentity: (
		db: WriteExecutor,
		input: {
			readonly agentId: string;
			readonly agentName: string;
			readonly body: string;
			readonly updatedBy: string;
		},
	) => Promise<string>;
	/** The identity document id for each of `agentIds` that has one. */
	readonly identityIdsFor: (
		db: HyperIdleDb,
		viewerActor: string,
		agentIds: readonly string[],
	) => Promise<ReadonlyMap<string, string>>;
	/** Archives every document parented to this agent — an agent delete/retire. */
	readonly archiveChildren: (
		db: HyperIdleDb,
		viewerActor: string,
		agentId: string,
	) => Promise<void>;
}

/** `internal: true` — this module is exactly the "system" that is allowed to
 * attach a document to an agent (`parent.kind:"agent"`, `edit_document`'s
 * `forbidden_parent_kind` invariant). */
function ctxFor(db: HyperIdleDb, deps: AgentIdentityDeps, actor: string): ActionContext {
	return { actor, db, eventBus: deps.eventBus, now: new Date().toISOString(), internal: true };
}

export function createAgentIdentityPort(deps: AgentIdentityDeps): AgentIdentityPort {
	return {
		async upsertAgentIdentity(db, input) {
			const realDb = db as HyperIdleDb;
			const ctx = ctxFor(realDb, deps, input.updatedBy);
			const existing = await deps.searchDocuments(ctx, {
				parent: { kind: "agent", id: input.agentId },
				slot: "agent_file",
			});
			const [firstExisting] = existing.ok ? existing.data : [];
			if (firstExisting) {
				return firstExisting.id;
			}
			const created = await deps.editDocument(ctx, {
				id: `doc_af_${input.agentId}`,
				title: `${input.agentName || input.agentId} — identity`,
				body: input.body,
				slot: "agent_file",
				status: "active",
				scopeKind: "user",
				scopeId: input.agentId,
				parent: { kind: "agent", id: input.agentId },
			});
			if (!created.ok) {
				throw new Error(
					`agent-identity: edit_document refused to seed agent ${input.agentId}'s identity: ` +
						JSON.stringify(created.problems),
				);
			}
			return created.data.document.id;
		},

		async identityIdsFor(db, viewerActor, agentIds) {
			if (agentIds.length === 0) return new Map();
			const ctx = ctxFor(db, deps, viewerActor);
			const result = await deps.searchDocuments(ctx, {
				parent: { kind: "agent", ids: [...agentIds] },
				slot: "agent_file",
				status: "active",
			});
			if (!result.ok) return new Map();
			return new Map(
				result.data.flatMap((row) => (row.parentId ? [[row.parentId, row.id] as const] : [])),
			);
		},

		async archiveChildren(db, viewerActor, agentId) {
			const ctx = ctxFor(db, deps, viewerActor);
			const found = await deps.searchDocuments(ctx, { parent: { kind: "agent", id: agentId } });
			if (!found.ok) return;
			for (const row of found.data) {
				await deps.editDocument(ctx, { id: row.id, status: "archived" });
			}
		},
	};
}
