import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Local structural mirror of `layers/core-api/src/actions/action.ts`'s
 * `ActionContext`/`Action` — the same shape `@hyperidle/task`'s
 * `action-types.ts` declares, and for the same reason: a nested Service may
 * not import the layer's own package. `caller` is the one optional field
 * beyond the base context; this mirror carries it too, structurally.
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
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
