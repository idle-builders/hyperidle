/**
 * The one place an agent's identity document is written or looked up —
 * architecture.md §8.3: `routes/agents.ts`, `routes/org.ts`, `routes/users.ts`
 * and `routes/teams-routes.ts` all reduce to this one shared helper instead
 * of each calling the retired `upsertAgentIdentity`/`getAgentIdentityIds`
 * repository functions directly.
 *
 * An agent's identity is an `agent_file`-slotted document parented to the
 * agent (`parentKind:"agent"`, `parentId:<agentId>`), `scopeKind:"user"`,
 * `scopeId:<agentId>` — the binding context assembly reads through the parent
 * slot. Every read and write here goes through the injected
 * `search_documents`/`edit_document` runners, never `@hyperidle/document`
 * directly (architecture.md §8.1: a neighbour reaches documents only through
 * the three actions, in-process, as the acting user) — and never
 * `open_document`, so an identity lookup never counts as a read (§6.7).
 */
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type {
	ActionResult,
	DocumentRow,
	DocumentView,
	EditDocumentInput,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ActionContext } from "../actions/action.js";

export type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<readonly DocumentRow[]>>;

export type EditDocumentRunFn = (
	ctx: ActionContext,
	input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;

export interface AgentIdentityDeps {
	readonly searchDocuments: SearchDocumentsRunFn;
	readonly editDocument: EditDocumentRunFn;
	readonly eventBus: EventBus;
}

export interface AgentIdentityPort {
	/**
	 * `OrgUserDirectory.upsertAgentIdentity`-shaped — the signature
	 * `@hyperidle/org`'s `persistScaffoldedAgents` (scaffold creation) and
	 * `routes/agents.ts` (direct creation) both call. Give the agent its
	 * identity document, or return the one it already has — the body is
	 * NEVER overwritten once the document exists (a person's edit is theirs).
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
	/** Archives every document parented to this agent — an agent delete. */
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

/**
 * @lore architecture.md §8.3 names the shape of a scaffold-created identity
 * (`doc_af_${agentId}`, read-then-edit) but not an actor for it:
 * `persistScaffoldedAgents` (`layers/core-api/org/src/scaffold-agents.ts`,
 * not owned by this block) passes the literal "scaffold" through
 * `input.updatedBy`, which is not a row in `users` at all — and
 * `edit_document`'s `changes.actor` FK (`references users.id`, restrict)
 * needs a real one, unlike the free-text `documents.updated_by` this
 * replaces. `system:propagation` is the codebase's own established
 * system-initiated `ActionContext.actor` (`app.ts`'s dependency-watcher uses
 * the same sentinel for the same reason: no human triggered this write), so
 * a scaffolded agent's identity is attributed to it rather than invented.
 * `routes/agents.ts`'s direct, human-driven create already resolves a real
 * `users.id` before calling this, so that path is untouched.
 */
const SYSTEM_ACTOR = "system:propagation";

export function createAgentIdentityPort(deps: AgentIdentityDeps): AgentIdentityPort {
	return {
		async upsertAgentIdentity(db, input) {
			const realDb = db as HyperIdleDb;
			const actor = input.updatedBy === "scaffold" ? SYSTEM_ACTOR : input.updatedBy;
			const ctx = ctxFor(realDb, deps, actor);
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
