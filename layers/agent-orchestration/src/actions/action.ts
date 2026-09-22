import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * This Layer's own structural mirror of `layers/core-api/src/actions/
 * action.ts`'s `ActionContext`/`Action` — architecture.md §5: "deliberate
 * duplication... `ActionContext` carries `db` and `eventBus`, which is
 * exactly why it is not in `framework/domain-model`... `@hyperidle/task`
 * already declares its own mirror of `Action` for the same reason." This
 * Layer may not import `@hyperidle/core-api` (the crossing this whole item
 * exists to avoid), so it declares the identical shape and relies on
 * TypeScript's structural typing — `@hyperidle/run-orchestration`'s own
 * local mirror (`session-actions.ts`) agrees with this one by shape, not by
 * import, exactly as `@hyperidle/document`'s `Action` agrees with core-api's.
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
	readonly internal?: boolean;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
