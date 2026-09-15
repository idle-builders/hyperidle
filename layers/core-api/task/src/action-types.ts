import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * Local structural mirror of `layers/core-api/src/actions/action.ts`'s
 * `ActionContext`/`Action`. A nested Service may not import the layer's own
 * package (`@hyperidle/core-api` exports only `.`/`./app`/`./boot`), so this
 * package declares the identical shape and relies on TypeScript's structural
 * typing to make `createTaskActions`'s return value assignable at the
 * composition root (`layers/core-api/src/index.ts`'s `buildCoreActions`).
 * See the architecture doc §5.
 */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
