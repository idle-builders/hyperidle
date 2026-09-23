import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Local structural mirror of `layers/core-api/src/actions/action.ts`'s
 * `ActionContext`/`Action` — the same shape `@hyperidle/task` and
 * `@hyperidle/thread` each declare, and for the same reason: a nested
 * Service may not import the layer's own package. `caller` mirrors
 * `thread`'s copy (not `task`'s, which omits it) — `edit_document`'s
 * artifact stamp (architecture.md §3.6) is server-side from `ctx.caller`,
 * the same shape `send_message`'s `review.taskId` stamp already uses.
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
	 * composition root itself (the subscription internal path, the agent
	 * identity helper, the plugin installer), never set by the HTTP door or
	 * the MCP tool loop. The one thing it gates: `edit_document`'s
	 * `forbidden_parent_kind` invariant, which refuses a client-named
	 * `agent`/`subscription` parent (`@hyperidle/domain-model`'s
	 * `systemParentInvariants`).
	 */
	readonly internal?: boolean;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
