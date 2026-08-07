/**
 * The explicit-session-start wire projection — one home, both applications.
 *
 * @lore AU26 A1 (architecture §D-A's `sessions-routes.ts` split): `POST /api/sessions` stays core-hosted
 * (its handler gates on `tasks`, a core table) while `GET /api/sessions/starts/:id`
 * moves to the orchestration app. Both render the SAME 202/422/429/500 projection,
 * and neither app may import the other's route module. Duplicating the transform
 * would give one wire contract two implementations — `tsc` catches an outright
 * omission but never a silent divergence.
 *
 * The split here is deliberate: this module is a PURE transform over rows the
 * caller already holds. Each caller reads its own `sessions` row (core through the
 * orchestration read port, orchestration in-layer), so no table access crosses a
 * layer boundary to make the projection shared.
 *
 * @lore AU26 A1 shape hazard: the admitted branch returns the session row WHOLE.
 * The row has 18 columns; a narrowed 7-field projection would silently drop 11
 * fields from `POST /api/sessions`'s 202 body, which no route test would catch
 * (no `layers/core-ui` file consumes that response). Hence the generic — the caller's
 * row type flows through untouched.
 */
import type { Context } from "hono";
import type { HyperIdleEnv } from "./env.js";

/**
 * The subset of an `explicit_session_starts` row the projection reads. Declared
 * structurally so `shared` does not import `@hyperidle/db` (which depends on it).
 */
export interface ExplicitStartRow {
	readonly id: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier: string;
	readonly idempotencyKey: string;
	readonly status: string;
	readonly sessionId: string | null;
	readonly failureCode: string | null;
}

/** The body returned while a start is still queued. */
export interface PendingStartBody {
	readonly status: "requested";
	readonly startId: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier: string;
	readonly idempotencyKey: string;
	readonly pollUrl: string;
}

/** The body returned when admission failed. */
export interface StartFailureBody {
	readonly error: string;
	readonly code: string;
}

export type ExplicitStartProjection<TSession> =
	| { readonly status: 202; readonly body: TSession | PendingStartBody }
	| { readonly status: 422 | 429 | 500; readonly body: StartFailureBody };

/** The still-queued projection: what the caller polls on. */
export function pendingStart(start: ExplicitStartRow): PendingStartBody {
	return {
		status: "requested",
		startId: start.id,
		taskId: start.taskId,
		requestedAgentId: start.requestedAgentId,
		requestedModelTier: start.requestedModelTier,
		idempotencyKey: start.idempotencyKey,
		pollUrl: `/api/sessions/starts/${start.id}`,
	};
}

/**
 * Project a start row (plus the session row the caller resolved, if any) onto the
 * wire. Pure — no DB access, no I/O.
 *
 * @lore AU21 Increment 14a: "COST_CAP_EXCEEDED" is absent from the failure-code
 * map — the cost-cap gate that produced it is HARD-DELETED, with no replacement
 * admission-failure code.
 */
export function projectExplicitStartOutcome<TSession extends object>(
	start: ExplicitStartRow,
	session: TSession | null,
): ExplicitStartProjection<TSession> {
	if (start.status === "admitted" && start.sessionId && session) {
		return { status: 202, body: session };
	}
	if (start.status === "failed") {
		const code = start.failureCode ?? "INTERNAL_ERROR";
		const status = code === "NO_ELIGIBLE_HARNESS" ? 422 : code === "CONCURRENCY_LIMIT" ? 429 : 500;
		return {
			status,
			body: { error: code === "INTERNAL_ERROR" ? "Session provisioning failed" : code, code },
		};
	}
	return { status: 202, body: pendingStart(start) };
}

/** Render a projection onto a Hono response at its own status code. */
export function sendStartProjection<TSession extends object>(
	c: Context<HyperIdleEnv>,
	projection: ExplicitStartProjection<TSession>,
): Response {
	switch (projection.status) {
		case 422:
			return c.json(projection.body, 422);
		case 429:
			return c.json(projection.body, 429);
		case 500:
			return c.json(projection.body, 500);
		default:
			return c.json(projection.body, 202);
	}
}
