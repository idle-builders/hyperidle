/**
 * L2 — PATCH /api/threads/:id/route — reassign a thread to a different
 * actor (or to "either" via null). Writes one `thread_routing_audit`
 * row per state-changing call. Self-reassign (when `to_actor_id`
 * already equals the current `routed_to_actor_id`) returns 200 with
 * `audit: null` — no thread update, no audit row. See `.plan-L2.md`
 * §3.5 for the contract.
 *
 * L4 — POST /api/threads/:threadId/verdict/undo — reverses the most
 * recent committed verdict on the requested item if (a) the agent has
 * not yet acted on it (`items.agent_acted_at IS NULL` or older than
 * the commit), (b) the configured undo window has not expired, and
 * (c) the requesting actor matches the original `approver_id`.
 * Writes a new append-only `responses` row with `transition='undo'`.
 * See `.plan-L4.md` §3.2.
 */
import { actors, type HyperIdleDb, items, recoveryAudit, responses, threads } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	DEFAULT_UNDO_WINDOW_SECONDS,
	rollbackRequestSchema,
} from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ActorEnv } from "../middleware/actor-context.js";
import { validateBody } from "../middleware/validate.js";
import { reassignThread } from "../services/thread-routing-service.js";

const routeBodySchema = z.object({
	to_actor_id: z.string().nullable(),
	reason: z.string().min(1).max(500),
});

// @lore L4 review (security CRIT, mirrors L2 review CRIT-2): identity is
// server-derived from `c.get("actorId")` (set by the X-Actor-Id middleware).
// We deliberately do NOT accept `actorId` from the request body — a body
// field would let any API-key holder forge another actor's verdict undo by
// posting `{ actorId: "actor:ceo" }`. Reject any body that includes
// `actorId` so callers fail loudly during the migration window.
const verdictUndoSchema = z
	.object({
		itemId: z.string().min(1),
		reason: z.string().max(500).optional(),
	})
	.strict();

export function createThreadRoutingRoutes(db: HyperIdleDb): Hono<ActorEnv> {
	const router = new Hono<ActorEnv>();

	router.patch("/:id/route", validateBody(routeBodySchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) {
			const response: ApiErrorResponse = {
				error: "No actor identified",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}

		const threadId = c.req.param("id");
		const body = c.req.valid("json");

		// Validate `to_actor_id` references a real actor (when non-null).
		if (body.to_actor_id !== null) {
			const target = db.select().from(actors).where(eq(actors.id, body.to_actor_id)).get();
			if (!target) {
				const response: ApiErrorResponse = {
					error: "Unknown to_actor_id",
					code: API_ERROR_CODES.VALIDATION_ERROR,
					details: { field: "to_actor_id", value: body.to_actor_id },
				};
				return c.json(response, 400);
			}
		}

		const result = reassignThread(db, {
			threadId,
			toActorId: body.to_actor_id,
			reason: body.reason,
			changedBy: actorId,
		});

		if (!result.ok) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		return c.json({ ...result.thread, audit: result.audit });
	});

	// L4 — POST /:threadId/verdict/undo
	//
	// @lore L4 review: all reads (thread, item, latest response) execute
	// inside the IMMEDIATE transaction alongside the INSERT so concurrent
	// undo posts and concurrent commit-after-read are serialised. Reads
	// outside the transaction would TOCTOU: two posts could both see the
	// same live commit, both 200, both write undo rows.
	router.post("/:threadId/verdict/undo", validateBody(verdictUndoSchema), (c) => {
		const threadId = c.req.param("threadId");
		const body = c.req.valid("json");

		// @lore L4 review (security CRIT): identity is server-derived only.
		// See verdictUndoSchema for why body.actorId is forbidden.
		const actorId = c.get("actorId");
		if (!actorId) {
			const response: ApiErrorResponse = {
				error: "No actor identified",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}

		type UndoOutcome =
			| {
					kind: "ok";
					undoResponseId: string;
					revertedResponseId: string;
					priorDecision: string;
					at: string;
			  }
			| { kind: "not_found" }
			| { kind: "actor_mismatch" }
			| { kind: "agent_already_acted"; auditRowId: string }
			| { kind: "expired"; expiredAtIso: string };

		const outcome = db.transaction(
			(tx): UndoOutcome => {
				const thread = tx.select().from(threads).where(eq(threads.id, threadId)).get();
				if (!thread) return { kind: "not_found" };

				const item = tx.select().from(items).where(eq(items.id, body.itemId)).get();
				if (!item || item.threadId !== threadId) return { kind: "not_found" };

				const latest = tx
					.select()
					.from(responses)
					.where(eq(responses.itemId, body.itemId))
					.orderBy(desc(responses.respondedAt))
					.limit(1)
					.get();

				if (!latest || latest.transition !== "commit") return { kind: "not_found" };

				if (latest.approverId !== actorId) return { kind: "actor_mismatch" };

				// @lore L4 review (adversary C2): the predicate is
				// `agent_acted_at > responded_at` — the plan required ordering
				// against the commit being undone. A bare `agentActedAt`
				// truthiness check would permanently lock out undo on every
				// item that has *ever* been agent-acted-on, because
				// `agent_acted_at` is not cleared across re-commit cycles.
				const commitMs = Date.parse(latest.respondedAt);
				if (!Number.isFinite(commitMs)) {
					throw new Error(
						`responses.responded_at unparseable for row ${latest.id}: ${latest.respondedAt}`,
					);
				}
				if (item.agentActedAt) {
					const ackMs = Date.parse(item.agentActedAt);
					if (Number.isFinite(ackMs) && ackMs > commitMs) {
						return { kind: "agent_already_acted", auditRowId: latest.id };
					}
				}

				const windowSeconds = latest.undoWindowSeconds ?? DEFAULT_UNDO_WINDOW_SECONDS;
				const expiresAtMs = commitMs + windowSeconds * 1000;
				if (Date.now() > expiresAtMs) {
					return { kind: "expired", expiredAtIso: new Date(expiresAtMs).toISOString() };
				}

				const id = crypto.randomUUID();
				const at = new Date().toISOString();

				// @lore L4 review (adversary W2 / arch W2): the undo row's
				// `decision` column stays NULL on undo. Synthesising a
				// fallback `'comment'` would (a) write a verdict that never
				// happened into the audit log, and (b) pollute later reads
				// of "current verdict" if the consumer forgets to filter on
				// `transition='commit'`. Readers MUST filter on
				// `transition='commit'` to reconstruct verdict state. The
				// schema @lore on `responses` documents this read recipe.
				tx.insert(responses)
					.values({
						id,
						itemId: body.itemId,
						decision: null,
						feedback: body.reason ?? null,
						approverId: actorId,
						respondedAt: at,
						transition: "undo",
						priorDecision: latest.decision,
						undoesResponseId: latest.id,
						undoWindowSeconds: null,
					})
					.run();

				return {
					kind: "ok",
					undoResponseId: id,
					revertedResponseId: latest.id,
					priorDecision: latest.decision,
					at,
				};
			},
			{ behavior: "immediate" },
		);

		if (outcome.kind === "not_found") {
			const response: ApiErrorResponse = {
				error: "no_recent_verdict",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		if (outcome.kind === "actor_mismatch") {
			const response: ApiErrorResponse = {
				error: "actor_mismatch",
				code: API_ERROR_CODES.FORBIDDEN,
			};
			return c.json(response, 403);
		}
		if (outcome.kind === "agent_already_acted") {
			return c.json(
				{
					error: "agent_already_acted",
					audit_row_id: outcome.auditRowId,
					code: API_ERROR_CODES.CONFLICT,
				},
				409,
			);
		}
		if (outcome.kind === "expired") {
			return c.json(
				{
					error: "undo_window_expired",
					expired_at: outcome.expiredAtIso,
					code: API_ERROR_CODES.GONE,
				},
				410,
			);
		}

		return c.json(
			{
				undo_response_id: outcome.undoResponseId,
				reverted_response_id: outcome.revertedResponseId,
				prior_decision: outcome.priorDecision,
				at: outcome.at,
			},
			200,
		);
	});

	// L7 — POST /:threadId/verdict/rollback
	//
	// Rolls back a previously committed verdict on a thread. Records an
	// append-only `recovery_audit` row with `verb='rollback'`. Cleanup
	// verb — bypasses the factory-paused guard.
	//
	// @lore L7 SECURITY: identity is server-derived from `c.get("actorId")`.
	// Body is `.strict()` so a smuggled `actorId` is rejected at the validator
	// layer (mirrors L4 verdict-undo hardening).
	router.post("/:threadId/verdict/rollback", validateBody(rollbackRequestSchema), (c) => {
		const threadId = c.req.param("threadId");
		const body = c.req.valid("json");

		const actorId = c.get("actorId");
		if (!actorId) {
			const response: ApiErrorResponse = {
				error: "No actor identified",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}

		type RollbackOutcome =
			| { kind: "ok"; auditId: string }
			| { kind: "not_found" }
			| { kind: "actor_mismatch" }
			| { kind: "already_rolled_back" };

		const outcome = db.transaction(
			(tx): RollbackOutcome => {
				const thread = tx.select().from(threads).where(eq(threads.id, threadId)).get();
				if (!thread) return { kind: "not_found" };

				// Find the latest committed verdict on any item in this thread.
				const latest = tx
					.select({
						id: responses.id,
						approverId: responses.approverId,
						respondedAt: responses.respondedAt,
					})
					.from(responses)
					.innerJoin(items, eq(items.id, responses.itemId))
					.where(and(eq(items.threadId, threadId), eq(responses.transition, "commit")))
					.orderBy(desc(responses.respondedAt))
					.limit(1)
					.get();

				if (!latest) return { kind: "not_found" };
				if (latest.approverId !== actorId) return { kind: "actor_mismatch" };

				// @lore L7 (ADV4 / ARCH4): the idempotency guard is keyed
				// per-(thread_id, response_id), NOT thread-level. The prior
				// implementation looked at the latest recovery_audit row
				// for the thread and rejected ALL subsequent rollbacks if it
				// was a rollback. That falsely 410'd the *next* commit's
				// rollback (a different response on the same thread). We
				// scan all rollback audits for this thread and reject only
				// when THIS specific response_id was already reverted.
				const priorRollbacks = tx
					.select({ meta: recoveryAudit.meta })
					.from(recoveryAudit)
					.where(
						and(
							eq(recoveryAudit.targetKind, "thread"),
							eq(recoveryAudit.targetId, threadId),
							eq(recoveryAudit.verb, "rollback"),
						),
					)
					.all();
				for (const row of priorRollbacks) {
					if (!row.meta) continue;
					try {
						const parsed = JSON.parse(row.meta) as { revertedResponseId?: string };
						if (parsed.revertedResponseId === latest.id) {
							return { kind: "already_rolled_back" };
						}
					} catch {
						// Malformed audit meta — ignore; the row cannot
						// claim to have reverted any response without a
						// machine-parseable id.
					}
				}

				const auditId = crypto.randomUUID();
				const now = new Date().toISOString();

				// @lore L7: rollback is best-effort. Until L9's
				// `artifact.reversibility` metadata ships, every rollback is
				// recorded as `succeeded`. The agent runtime may re-write
				// the row to `failed`/`partially` once the runtime signal
				// lands (see `.pipeline-plan.md` §7).
				tx.insert(recoveryAudit)
					.values({
						id: auditId,
						actorId,
						verb: "rollback",
						reason: body.reason,
						targetKind: "thread",
						targetId: threadId,
						at: now,
						outcome: "succeeded",
						meta: JSON.stringify({ revertedResponseId: latest.id }),
					})
					.run();

				return { kind: "ok", auditId };
			},
			{ behavior: "immediate" },
		);

		if (outcome.kind === "not_found") {
			const response: ApiErrorResponse = {
				error: "thread_or_verdict_not_found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		if (outcome.kind === "actor_mismatch") {
			const response: ApiErrorResponse = {
				error: "actor_mismatch",
				code: API_ERROR_CODES.FORBIDDEN,
			};
			return c.json(response, 403);
		}
		if (outcome.kind === "already_rolled_back") {
			// @lore L7 (ARCH4): mirrors L4's verdict-undo conflict
			// taxonomy. 410 GONE is reserved for L9's
			// `not_reversible_yet` outcome. "Already rolled back" is a
			// state-conflict (409 CONFLICT, like "another founder beat
			// you to it"), NOT a permanent gone state.
			const response: ApiErrorResponse = {
				error: "already_rolled_back",
				code: API_ERROR_CODES.CONFLICT,
			};
			return c.json(response, 409);
		}

		return c.json(
			{
				auditId: outcome.auditId,
				outcome: "succeeded" as const,
			},
			200,
		);
	});

	return router;
}
