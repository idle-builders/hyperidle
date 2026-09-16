import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionDeclaration, ActionResult } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

/**
 * the layer's own composition code for actions, next to
 * `compose-api-application.ts`. Lives here, not in `framework/domain-model`,
 * because it carries `db` (the architecture doc §5).
 *
 * `ActionContext` carries no session id and gains none — everything a
 * dispatch branch needs about a running session it reads from the
 * task-owned `task_dispatch_attempts` table.
 */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
}

/**
 * `Action<I, O>` is deliberately structural, not a nominal export a nested
 * Service imports: `createTaskActions` (in `@hyperidle/task`, a nested
 * Service under this layer) declares its own local mirror of this exact
 * shape and returns it — a nested Service may not import the layer's own
 * package (`layers/core-api/package.json` exports only `.`, `./app`,
 * `./boot`), so the two types agree by shape, not by import.
 */
export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}
