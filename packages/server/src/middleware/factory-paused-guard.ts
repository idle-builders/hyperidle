/**
 * L7 — factory-paused-guard middleware. Returns 423 Locked when the
 * `factory_state` singleton row is paused. Mounted SELECTIVELY by
 * `app.ts` on the routes that mutate or trigger NEW agent work
 * (verdict commit, session create, …). Recovery verbs themselves
 * (pause / resume / rollback / session-pause / session-resume) and
 * pure reads MUST NOT be guarded — see `.pipeline-plan.md` §8.
 *
 * @lore L7: state is read on every request (DB row); a future
 * refactor can cache with an invalidation hook fed by the recovery
 * service, but the cheap singleton read keeps the surface honest in
 * the face of multi-process deployments.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { MiddlewareHandler } from "hono";
import { readFactoryState } from "../services/recovery-service.js";

export function createFactoryPausedGuard(db: HyperIdleDb): MiddlewareHandler {
	return async (c, next) => {
		const state = readFactoryState(db);
		if (state.paused) {
			const response: ApiErrorResponse = {
				error: "factory_paused",
				code: API_ERROR_CODES.LOCKED,
				details: {
					pausedBy: state.pausedBy,
					pausedAt: state.pausedAt,
					pausedReason: state.pausedReason,
				},
			};
			return c.json(response, 423);
		}
		await next();
	};
}
