import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Local structural mirror of `layers/core-api/src/actions/action.ts`'s
 * `ActionContext`/`Action` — the same shape `@hyperidle/document`'s
 * `action-types.ts`, `@hyperidle/task` and `@hyperidle/thread` each declare,
 * and for the same reason: a nested Service may not import the layer's own
 * package. `agent-identity.ts` and `validate-agent-config.ts` (both moved
 * into this package verbatim) and `user-actions.ts` all share this one copy
 * instead of each declaring their own.
 */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
	readonly caller?: {
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly threadId: string | null;
	};
	/**
	 * `true` only for an in-process, system-initiated call — bound by the
	 * composition root itself, never set by the HTTP door or the MCP tool
	 * loop. Gates `edit_document`'s `forbidden_parent_kind` invariant, which
	 * refuses a client-named `agent`/`subscription` parent.
	 */
	readonly internal?: boolean;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** `search_documents`'s bound `run`, injected — the same shape
 * `routes/plugins.ts`/`platform-actions.ts` established. */
export type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: import("@hyperidle/domain-model").SearchDocumentsInput,
) => Promise<ActionResult<readonly import("@hyperidle/domain-model").DocumentRow[]>>;

/** `edit_document`'s bound `run`, injected the same way. */
export type EditDocumentRunFn = (
	ctx: ActionContext,
	input: import("@hyperidle/domain-model").EditDocumentInput,
) => Promise<ActionResult<import("@hyperidle/domain-model").DocumentView>>;
