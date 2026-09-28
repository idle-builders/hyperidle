import type { HyperIdleDb } from "@hyperidle/db";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { Hono } from "hono";
import type { Action } from "./action.js";

/**
 * the HTTP loop: mount `POST /api/actions/<name>` for every declared
 * action, parsed with the action's own zod shape, run as the authenticated
 * actor. Mounting is structural — this loop mounts every declaration or
 * none, so the governance rule (`actions-projected.ts`) has no "is it
 * mounted" clause.
 */
export function createActionsRouter(
	actions: readonly Action[],
	deps: { readonly db: HyperIdleDb; readonly eventBus: EventBus },
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	for (const action of actions) {
		router.post(
			`/${action.declaration.name}`,
			validateBody(action.declaration.input),
			async (c) => {
				// @lore: @hono/zod-validator typechecks against its own deduped zod; server schemas are a different instance; this cast is required
				const input = c.req.valid("json" as never);
				const result = await action.run(
					{
						actor: c.get("userId"),
						db: deps.db,
						eventBus: deps.eventBus,
						now: new Date().toISOString(),
					},
					input,
				);
				return result.ok ? c.json(result, 200) : c.json(result, 422);
			},
		);
	}

	return router;
}
