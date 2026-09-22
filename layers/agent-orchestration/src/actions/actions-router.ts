import type { HyperIdleDb } from "@hyperidle/db";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { Hono } from "hono";
import type { Action } from "./action.js";

/**
 * This Layer's own copy of `core-api/src/actions/actions-router.ts`'s HTTP
 * loop — architecture.md §5: mount `POST /actions/<name>` for every declared
 * session action, parsed with the action's own zod shape, run as the
 * authenticated actor. Both layer apps sit on one `/api` router
 * (`composeApiApplication`), so `POST /api/actions/stop_session` resolves
 * here while `POST /api/actions/edit_task` resolves on core's own mount —
 * no join needed on the HTTP side.
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
