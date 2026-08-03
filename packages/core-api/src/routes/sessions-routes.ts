import { resolveInjectedConnectionsForAgent } from "@hyperidle/connections";
import { type ExplicitSessionStart, type HyperIdleDb, sessions } from "@hyperidle/db";
import { resolveInjectedFilesystemsForAgent } from "@hyperidle/filesystems";
import {
	createSessionRequest,
	findSessionRequest,
	sessionRunRegistry,
} from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import {
	type AgentWorkIntentEvent,
	type AgentWorkIntentReader,
	type AgentWorkIntentRecorder,
	API_ERROR_CODES,
	type EventBus,
	type SessionEndedEvent,
	type SessionOutcome,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
	buildAgentOrchestrationPort,
	getRegisteredAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";
import { resolveOrCreateCallingThread } from "../services/calling-thread-bindings.js";
import { transitionRun } from "../services/run-orchestration-composition.js";

// @lore O2: harnessUrl, tokensInput, tokensOutput fields removed from session
// schemas. Those columns were stripped from the sessions kernel table as part
// of kernel/strategy separation. Cost and token tracking are strategy concerns.

const createSessionSchema = z.object({
	agentId: z.string(),
	taskId: z.string(),
	modelTier: z.enum(["reasoning", "workhorse", "fast"]),
});

export const EXPLICIT_SESSION_ADMISSION_WAIT_MS = 2_000;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,200}$/;

function pendingStart(start: ExplicitSessionStart) {
	return {
		status: "requested" as const,
		startId: start.id,
		taskId: start.taskId,
		requestedAgentId: start.requestedAgentId,
		requestedModelTier: start.requestedModelTier,
		idempotencyKey: start.idempotencyKey,
		pollUrl: `/api/sessions/starts/${start.id}` as const,
	};
}

async function projectExplicitStart(db: HyperIdleDb, start: ExplicitSessionStart) {
	if (start.status === "admitted" && start.sessionId) {
		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, start.sessionId))
			.limit(1);
		if (session) return { status: 202 as const, body: session };
	}
	if (start.status === "failed") {
		const code = start.failureCode ?? "INTERNAL_ERROR";
		const status =
			// @lore AU21 Increment 14a: "COST_CAP_EXCEEDED" removed from this
			// mapping — the cost-cap gate that used to produce it is HARD-DELETED,
			// no replacement admission-failure code.
			code === "NO_ELIGIBLE_HARNESS" ? 422 : code === "CONCURRENCY_LIMIT" ? 429 : 500;
		return {
			status,
			body: { error: code === "INTERNAL_ERROR" ? "Session provisioning failed" : code, code },
		};
	}
	return { status: 202 as const, body: pendingStart(start) };
}

function sendStartProjection(
	c: Context<HyperIdleEnv>,
	projection: Awaited<ReturnType<typeof projectExplicitStart>>,
) {
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

const updateSessionSchema = z.object({
	// @lore AC1 W-1: `state` is now optional. Previously it was REQUIRED, which
	// caused effectiveness-only PATCHes (no `state` field) to fail Zod validation
	// before reaching the handler. Making state optional allows the endpoint to
	// update effectiveness_score without changing session state.
	// When `state` is present, the session_ended event is emitted as before.
	// When `state` is absent, only the effectiveness fields are written.
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

/**
 * AU11 AC-2: `SessionRouteDeps` (AdapterPool/SandboxAdapter/McpBridgeRegistry-
 * typed) previously threaded a large runtime-execution deps object into this
 * route file, but only one field (`adapterPool`) was ever read — as a bare
 * presence gate (`deps?.adapterPool`), never as a value execution dependency.
 * Every other field (`workspaceAdapter`, `credentialResolver`,
 * `mcpBridgeRegistry`, `mcpBaseUrl`, `serviceConnectionResolver`, `mounter`)
 * was dead threading. Reclassified per the AU11 route-cleanup rule: the
 * composition root now computes the boolean directly, so this file carries
 * no harness/MCP/provisioning type dependency at all — same runtime
 * behavior (true iff the composition root wired an adapter pool).
 */

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
 * Create Hono routes for session endpoints (E6).
 *
 * @param durableStartEnabled - AU11 AC-2: true when the composition root has
 *   an adapter pool wired. When true, POST /sessions creates and consumes an
 *   AgentSessionRequest instead of a bare DB insert (see `SessionRouteDeps`
 *   removal note above — this replaces the former `deps.adapterPool`
 *   presence check with a plain boolean, no harness type dependency).
 *
 * @lore AU21 §6 Decision E / §9 Increment 7: `GET /:id/activity` no longer
 * takes an injected `SessionActivityBuffer` reference — the buffer relocated
 * to `@hyperidle/agent-execution` (agent-orchestration/execution's real
 * home), and this core-api route now reads it THROUGH
 * `AgentOrchestrationPort.sessions.getRecentActivity`, the same kind of
 * cross-Layer seam other `AgentOrchestrationPort` reads use (AU21 Increment
 * 14a: `tasks.ts`'s per-session cost display, the seam's original sibling
 * example, is HARD-DELETED — no replacement). Wire format is unchanged —
 * `useSessionActivity.test.tsx` stays green.
 */
/**
 * @lore AU19 §11 (AC-9): `agentWorkIntentRecorder`/`agentWorkIntentReader`
 * are the Application-injected cross-Layer ports (`@hyperidle/shared`,
 * Mechanism C) — this route (core-api) must not import
 * `@hyperidle/session-requests` (agent-orchestration) directly for the raw
 * `agent_work_intents` write/read below. `createApp` defaults them to the
 * real production binding (`durable-agent-queue.ts`); tests may
 * override.
 */
export function createSessionRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	durableStartEnabled: boolean | undefined,
	agentWorkIntentRecorder: AgentWorkIntentRecorder<HyperIdleDb>,
	agentWorkIntentReader: AgentWorkIntentReader<HyperIdleDb>,
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

	// @lore R1/AU1: When the composition root has wired an adapter pool
	// (durableStartEnabled), the route creates a task-backed AgentSessionRequest
	// and consumes it through the runtime (credential pre-flight → sandbox →
	// context assembly → harness → teardown). When absent it falls back to the
	// legacy bare DB insert returning 201 — this preserves backward compat for
	// tests and deployments that haven't wired the harness.
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createSessionSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createSessionSchema>;

			// ── Durable explicit-start path (agent layer present) ─────────────────
			if (durableStartEnabled || c.req.header("Idempotency-Key") !== undefined) {
				const task = await work.get(db, "task", body.taskId);
				if (!task) {
					return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
				}
				const suppliedKey = c.req.header("Idempotency-Key");
				if (suppliedKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(suppliedKey))
					return c.json(
						{ error: "Invalid Idempotency-Key", code: API_ERROR_CODES.VALIDATION_ERROR },
						400,
					);
				const idempotencyKey = suppliedKey ?? `session-start:${crypto.randomUUID()}`;
				const requestedBy = c.get("userId");
				let start = await findSessionRequest(db, {
					by: "explicitStart",
					requestedBy,
					idempotencyKey,
				});
				if (
					start &&
					(start.taskId !== body.taskId ||
						start.requestedAgentId !== body.agentId ||
						start.requestedModelTier !== body.modelTier)
				)
					return c.json(
						{
							error: "Idempotency key reused with different request",
							code: "IDEMPOTENCY_KEY_REUSED",
						},
						409,
					);
				let intent: Awaited<ReturnType<AgentWorkIntentRecorder<HyperIdleDb>["record"]>> | undefined;
				if (!start) {
					const startId = crypto.randomUUID();
					await db.transaction(async (tx) => {
						start = await createSessionRequest(tx as HyperIdleDb, {
							kind: "explicitStart",
							start: {
								id: startId,
								taskId: body.taskId,
								requestedAgentId: body.agentId,
								requestedModelTier: body.modelTier,
								requestedBy,
								idempotencyKey,
							},
						});
						// AU21 §6 Decision B: resolve + validate the session_start run AT
						// EMIT TIME (this Service's own domain state, plus the shared
						// ast-<userId> runnability invariant) and bake the full request
						// onto the intent — the drain dispatches it directly, with zero
						// domain reads.
						const bakedRequest = await resolveSessionStartRequest(
							tx as HyperIdleDb,
							{ taskId: body.taskId, requestedAgentId: body.agentId },
							{
								requireRunnableAgent,
								readServerConfig,
								resolveInjectedFilesystemsForAgent,
								resolveInjectedConnectionsForAgent: (execDb, agentId) =>
									resolveInjectedConnectionsForAgent(execDb, agentId, findUser),
								// AU27 Increment 1 (Decision 0): also bake callingThreadId.
								resolveOrCreateCallingThread,
							},
						);
						intent = await agentWorkIntentRecorder.record(tx as HyperIdleDb, {
							kind: "session_start",
							sourceKind: "explicit_session_start",
							sourceId: startId,
							requestedBy,
							idempotencyKey: `explicit-session-start:${startId}`,
							bakedRequest,
						});
					});
				}
				if (!(start && intent)) {
					if (!start) throw new Error("Explicit session start was not persisted");
					intent = await agentWorkIntentReader.findByKindAndSource(db, "session_start", start.id);
				}
				c.header("Idempotency-Key", idempotencyKey);
				c.header("Location", `/api/sessions/starts/${start.id}`);
				if (start.status !== "requested") {
					const projection = await projectExplicitStart(db, start);
					return sendStartProjection(c, projection);
				}
				const committedStart = start;
				const projectionPromise = new Promise<Awaited<ReturnType<typeof projectExplicitStart>>>(
					(resolve) => {
						let settled = false;
						const finish = (value: Awaited<ReturnType<typeof projectExplicitStart>>) => {
							if (!settled) {
								settled = true;
								unsubscribe();
								clearTimeout(timer);
								resolve(value);
							}
						};
						const check = async () => {
							const fresh = await findSessionRequest(db, {
								by: "explicitStart",
								startId: committedStart.id,
							});
							if (fresh && fresh.status !== "requested")
								finish(await projectExplicitStart(db, fresh));
						};
						const unsubscribe = eventBus.on("*", () => void check());
						const timer = setTimeout(
							() => void projectExplicitStart(db, committedStart).then(finish),
							EXPLICIT_SESSION_ADMISSION_WAIT_MS,
						);
						void check();
					},
				);
				if (intent)
					eventBus.emit({
						type: "agent_work_intent_recorded",
						streamId: `explicit-session-start:${start.id}`,
						intentId: intent.id,
						intentKind: "session_start",
						sourceKind: "explicit_session_start",
						sourceId: start.id,
						idempotencyKey: intent.idempotencyKey,
						timestamp: Date.now(),
					} satisfies AgentWorkIntentEvent);
				const projection = await projectionPromise;
				return sendStartProjection(c, projection);
			}

			// ── Legacy bare-insert path (no adapters) ─────────────────────────────
			const sessionId = crypto.randomUUID();
			const now = new Date().toISOString();

			await db.insert(sessions).values({
				id: sessionId,
				agentId: body.agentId,
				taskId: body.taskId,
				modelTier: body.modelTier,
				startedAt: now,
				state: "active",
			});

			eventBus.emit<"session_started">({
				type: "session_started",
				streamId: sessionId,
				sessionId,
				agentId: body.agentId,
				taskId: body.taskId,
				timestamp: Date.now(),
			} satisfies SessionStartedEvent);

			const [created] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
			return c.json(created, 201);
		},
	);

	router.get("/starts/:startId", requireBoundary({ kind: "public-data" }), async (c) => {
		const start = await findSessionRequest(db, {
			by: "explicitStart",
			startId: c.req.param("startId"),
		});
		if (!start || start.requestedBy !== c.get("userId"))
			return c.json({ error: "Session start not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		c.header("Idempotency-Key", start.idempotencyKey);
		c.header("Location", `/api/sessions/starts/${start.id}`);
		return sendStartProjection(c, await projectExplicitStart(db, start));
	});

	// GET /:id/activity — Session activity stream (Q1 §3.2)
	// Returns session metadata + recent activity entries, read through
	// `AgentOrchestrationPort` (AU21 §9 Increment 7, Decision E — the buffer
	// this used to read directly relocated to `@hyperidle/agent-execution`).
	// Capped at 50 most-recent entries to bound response size.
	router.get("/:id/activity", requireBoundary({ kind: "public-data" }), async (c) => {
		const sessionId = c.req.param("id");
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const agentOrchestrationPort = buildAgentOrchestrationPort(
			getRegisteredAgentOrchestrationTransport(),
		);
		const allEntries = await agentOrchestrationPort.sessions.getRecentActivity(sessionId);
		// Return 50 most-recent entries (tail of the insertion-ordered array)
		const activity = allEntries.slice(-50);

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
