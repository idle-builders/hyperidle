/**
 * AU26 B1a (§D-A's `sessions-routes.ts` split) — the four `/api/sessions` registrations that moved off
 * core-api's app onto agent-orchestration's own.
 *
 * `GET /`, `GET /starts/:startId`, `GET /:id/activity` and `PATCH /:id` all
 * touch only tables this Layer owns (`sessions`, `explicit_session_starts`,
 * `agent_session_requests`) plus the in-process run registry and the relocated
 * activity buffer, so §D-A rule 2 puts them here. **`POST /api/sessions` did
 * NOT move** — its handler gates on `tasks` and bakes `users`/`server_config`,
 * a two-sided table set, and §D-A rule 3 gives a two-sided route exactly one
 * legal host (core-api). It stays in `core-api/src/routes/sessions-routes.ts`.
 *
 * **The path strings are unchanged** (§D-A rule 7): both apps mount on the same
 * `/api` router, so a route changes host app while keeping its URL byte-
 * identical — which is what makes AU26's "zero `layers/web` diff" reachable.
 * The cost is that a duplicate `method + path` across the two apps would
 * resolve silently by registration order; AC10's route-table collision
 * assertion closes it (`two-app-mount-session-routes.integration.test.ts`).
 *
 * @lore AU26 B1a: `GET /:id/activity` DROPS the `AgentOrchestrationPort`
 * indirection it carried in core-api (`sessions-routes.ts:536-539` at HEAD).
 * The buffer is in-layer for orchestration, so the port hop was pure overhead
 * once the route landed on the owning side. The response shape is unchanged —
 * `useSessionActivity.test.tsx` stays green.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { findSessionRequest, sessionRunRegistry } from "@hyperidle/session-requests";
import {
	type ActivityEntry,
	API_ERROR_CODES,
	type EventBus,
	type SessionEndedEvent,
	type SessionOutcome,
} from "@hyperidle/shared";
import {
	type HyperIdleEnv,
	projectExplicitStartOutcome,
	requireBoundary,
	sendStartProjection,
	validateBody,
} from "@hyperidle/shared/http";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import { transitionRun } from "../services/run-transition.js";

const updateSessionSchema = z.object({
	// @lore AC1 W-1: `state` is optional. An effectiveness-only PATCH (no `state`
	// field) must not fail Zod validation before reaching the handler. When
	// `state` is present the session_ended event is emitted as before; when it is
	// absent only the effectiveness fields are written.
	state: z.enum(["done", "crashed"]).optional(),
	outcome: z.string().optional(),
	notes: z.string().optional(),
	/**
	 * AC1: Session effectiveness score (float 0-1).
	 *
	 * @lore AC1 S-1: Validated as number at the API boundary (Zod min/max).
	 * Stored as text in the DB (existing schema convention for non-integers).
	 * Use .toString() on write, parseFloat() + Number.isNaN() guard on read.
	 */
	effectivenessScore: z.number().min(0).max(1).optional(),
});

/** Input for a state-changing PATCH (§4 abort-or-guarded-write). */
interface StateChangePatchInput {
	readonly sessionId: string;
	readonly existing: typeof sessions.$inferSelect;
	readonly state: "done" | "crashed";
	readonly outcome?: string;
	readonly notes?: string;
	readonly effectivenessScore?: number;
	readonly actor?: string;
	readonly now: string;
}

/**
 * AF7 §4: apply a state-changing PATCH. The runtime is the sole terminal-state
 * writer for a running session, so this:
 *   - rejects (409) a PATCH on an already-terminal session (no desync, no double
 *     session_ended);
 *   - if a live runtime entry exists, ABORTS it and lets the runtime teardown do
 *     the terminal write + single session_ended emit;
 *   - otherwise does a CAS-guarded direct write (active→terminal only) and emits
 *     session_ended IFF the CAS affected a row (§4.3 rowcount invariant).
 * Returns a `{ status, body }` so the caller emits the response.
 */
async function applyStateChangePatch(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: StateChangePatchInput,
): Promise<{ status: 200 | 202 | 409; body: unknown }> {
	const { sessionId, existing, state, now, actor } = input;

	// Guard: reject a PATCH that would move an already-terminal session.
	if (existing.state !== "active") {
		return {
			status: 409,
			body: {
				error: `Session is already ${existing.state}; cannot transition via PATCH`,
				code: API_ERROR_CODES.CONFLICT,
			},
		};
	}

	// If a live runtime entry exists, abort it — the runtime teardown performs the
	// DB transition + session_ended emit exactly once. We do NOT write state here.
	//
	// @lore AF7 §4 M3: `abort()` only awaits the harness `stopSession`; the terminal
	// DB write happens LATER, in the detached `runSession` teardown (the runtime is
	// the SOLE terminal writer — §4.3). The row is therefore still `state:"active"`
	// at this point, so we MUST NOT read it back and return it as the body — that
	// would assert a stale terminal state the caller cannot trust. Instead we return
	// 202 Accepted (in-flight abort acknowledged) and direct the caller to poll
	// `GET /api/sessions/:id` for terminal convergence. We do NOT block on teardown
	// here because that would couple the route to the harness's full stream drain.
	if (sessionRunRegistry.has(sessionId)) {
		if (!existing.requestId) {
			return {
				status: 409,
				body: { error: "Active session has no agent request", code: API_ERROR_CODES.CONFLICT },
			};
		}
		const termination = await transitionRun(db, eventBus, {
			target: "request",
			intent: "request-termination",
			requestId: existing.requestId,
			reason: state === "done" ? "user_done" : "user_crashed",
			...(actor ? { requestedBy: actor } : {}),
		});
		if (termination === "conflict" || termination === "terminal") {
			return {
				status: 409,
				body: { error: "Session termination already settled", code: API_ERROR_CODES.CONFLICT },
			};
		}
		await sessionRunRegistry.abort(sessionId);
		return {
			status: 202,
			body: {
				sessionId,
				state: "aborting",
				message:
					"Abort requested; the runtime is tearing the session down. Poll GET /api/sessions/:id for the terminal state.",
			},
		};
	}

	// Fallback: no running loop. Before the session CAS, persist/confirm the
	// termination cause and terminalize the correlated request (if any) through
	// the durable single terminal writer — the request/inbox side of the AC5
	// contract does not depend on a live runtime existing to drive it.
	if (existing.requestId) {
		const reason: "user_done" | "user_crashed" = state === "done" ? "user_done" : "user_crashed";
		const termination = await transitionRun(db, eventBus, {
			target: "request",
			intent: "request-termination",
			requestId: existing.requestId,
			reason,
			...(actor ? { requestedBy: actor } : {}),
		});
		if (termination === "conflict" || termination === "terminal") {
			return {
				status: 409,
				body: { error: "Session termination already settled", code: API_ERROR_CODES.CONFLICT },
			};
		}
		await transitionRun(db, eventBus, {
			target: "request",
			intent: "terminalize",
			requestId: existing.requestId,
			state: reason === "user_done" ? "cancelled" : "failed",
			sessionId,
		});
	}

	// Fallback: no running loop. CAS-guarded direct write (active → terminal only).
	const outcome: SessionOutcome = state === "crashed" ? "crashed" : "completed";
	// W-1: a combined PATCH may carry effectivenessScore alongside state.
	const stateUpdates: Record<string, unknown> = {
		state,
		outcome: input.outcome ?? outcome,
		notes: input.notes,
		endedAt: now,
	};
	if (input.effectivenessScore !== undefined) {
		stateUpdates.effectivenessScore = input.effectivenessScore.toString();
		stateUpdates.effectivenessRecordedAt = now;
		stateUpdates.effectivenessRecordedBy = actor ?? existing.agentId;
	}
	const transitioned = await db
		.update(sessions)
		.set(stateUpdates)
		.where(and(eq(sessions.id, sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });

	// Emit session_ended IFF we actually transitioned a row (CAS, §4.3).
	if (transitioned.length > 0) {
		eventBus.emit<"session_ended">({
			type: "session_ended",
			streamId: sessionId,
			sessionId,
			agentId: existing.agentId,
			taskId: existing.taskId,
			timestamp: Date.now(),
			outcome,
		} satisfies SessionEndedEvent);
	}

	const [updated] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
	return { status: 200, body: updated };
}

/**
 * The four moved `/api/sessions` registrations, on agent-orchestration's app.
 *
 * @param getRecentActivity - reads the `SessionActivityBuffer` this Layer's own
 *   boot owns and starts (`boot.ts`). In-layer, so no port hop.
 */
export function createOrchestrationSessionRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — List sessions with optional filtering by task_id, agent_id, state.
	// @lore I6: replaces the bounded resource descriptor with actual filtering.
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const taskId = c.req.query("task_id");
		const agentId = c.req.query("agent_id");
		const state = c.req.query("state");
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0", 10) || 0;

		const conditions = [];
		if (taskId) conditions.push(eq(sessions.taskId, taskId));
		if (agentId) conditions.push(eq(sessions.agentId, agentId));
		if (state) conditions.push(eq(sessions.state, state));

		const result =
			conditions.length > 0
				? await db
						.select()
						.from(sessions)
						.where(and(...conditions))
						.limit(limit)
						.offset(offset)
				: await db.select().from(sessions).limit(limit).offset(offset);

		return c.json(result);
	});

	// GET /starts/:startId — the explicit-start projection for the caller's own
	// start. The projection itself is `@hyperidle/shared/http`'s pure
	// `projectExplicitStartOutcome` (A1), shared with core-hosted `POST /` so one
	// wire shape has exactly one implementation; only the `sessions` row READ is
	// per-caller — this side reads it in-layer, core's side goes through the port.
	router.get("/starts/:startId", requireBoundary({ kind: "public-data" }), async (c) => {
		const start = await findSessionRequest(db, {
			by: "explicitStart",
			startId: c.req.param("startId"),
		});
		if (!start || start.requestedBy !== c.get("userId"))
			return c.json({ error: "Session start not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		c.header("Idempotency-Key", start.idempotencyKey);
		c.header("Location", `/api/sessions/starts/${start.id}`);
		let session: typeof sessions.$inferSelect | null = null;
		if (start.status === "admitted" && start.sessionId) {
			const [row] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, start.sessionId))
				.limit(1);
			session = row ?? null;
		}
		return sendStartProjection(c, projectExplicitStartOutcome(start, session));
	});

	// GET /:id/activity — Session activity stream (Q1 §3.2). Session metadata +
	// recent activity entries, capped at the 50 most recent to bound the response.
	router.get("/:id/activity", requireBoundary({ kind: "public-data" }), async (c) => {
		const sessionId = c.req.param("id");
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const activity = getRecentActivity(sessionId).slice(-50);

		return c.json({
			session: {
				id: session.id,
				agentId: session.agentId,
				taskId: session.taskId,
				state: session.state,
				startedAt: session.startedAt,
				modelTier: session.modelTier,
			},
			activity,
		});
	});

	// PATCH /:id — Update session state and/or effectiveness score
	router.patch(
		"/:id",
		requireBoundary({ kind: "public-data" }),
		validateBody(updateSessionSchema),
		async (c) => {
			const sessionId = c.req.param("id");
			const body = c.req.valid("json" as never) as z.infer<typeof updateSessionSchema>;

			const [existing] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, sessionId))
				.limit(1);
			if (!existing) {
				return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}

			const now = new Date().toISOString();
			const actor = c.get("userId");

			// AF7 §4 (Z8-094/095): a state-changing PATCH must REQUEST termination, not
			// assert it. The runtime is the sole terminal-state writer for a session it
			// is actively running. Delegated to a helper to keep this handler simple.
			if (body.state !== undefined) {
				const result = await applyStateChangePatch(db, eventBus, {
					sessionId,
					existing,
					state: body.state,
					outcome: body.outcome,
					notes: body.notes,
					effectivenessScore: body.effectivenessScore,
					actor,
					now,
				});
				return c.json(result.body, result.status);
			}

			// Effectiveness-only PATCH (no state) — never ends a session.
			const updates: Record<string, unknown> = {};
			if (body.outcome !== undefined) updates.outcome = body.outcome;
			if (body.notes !== undefined) updates.notes = body.notes;

			// AC1: Record effectiveness score when present.
			// @lore AC1 S-1: stored as text, validated as number[0,1] at API boundary.
			// Use .toString() on write, parseFloat() + Number.isNaN() guard on read.
			if (body.effectivenessScore !== undefined) {
				updates.effectivenessScore = body.effectivenessScore.toString();
				updates.effectivenessRecordedAt = now;
				// Use actor from auth context; fall back to session's agentId (for agent-authored writes)
				updates.effectivenessRecordedBy = actor ?? existing.agentId;
			}

			if (Object.keys(updates).length > 0) {
				await db.update(sessions).set(updates).where(eq(sessions.id, sessionId));
			}

			const [updated] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
			return c.json(updated);
		},
	);

	return router;
}
