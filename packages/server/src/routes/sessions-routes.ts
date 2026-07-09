import { type HyperIdleDb, sessions, tasks, users } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	ConcurrencyLimitError,
	CostCapExceededError,
	type EventBus,
	MissingCredentialError,
	NoEligibleHarnessError,
	type SessionEndedEvent,
	type SessionOutcome,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import z from "zod";
import type { AdapterPool } from "../harness/adapter-pool.js";
import type { SandboxAdapter } from "../harness/sandbox-adapter.js";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { consumeAgentSessionRequest } from "../services/agent-session-runtime.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { resolveAgentModel, resolveModelTier } from "../services/model-gateway.js";
import { readServerConfig } from "../services/server-config.js";
import type { SessionActivityBuffer } from "../services/session-activity-buffer.js";
import { sessionRunRegistry } from "../services/session-run-registry.js";
import { createTriggeredAgentSessionRequest } from "../services/trigger-resolution.js";

// @lore O2: harnessUrl, tokensInput, tokensOutput fields removed from session
// schemas. Those columns were stripped from the sessions kernel table as part
// of kernel/strategy separation. Cost and token tracking are strategy concerns.

const createSessionSchema = z.object({
	agentId: z.string(),
	taskId: z.string(),
	modelTier: z.enum(["reasoning", "workhorse", "fast"]),
});

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
 * Optional dependency injection for session route runtime execution (R1/AU1).
 * When `adapterPool` and `workspaceAdapter` are both present, POST /sessions
 * creates and consumes an AgentSessionRequest instead of a bare DB insert.
 *
 * @lore R1: The adapters are injected via this interface rather than being
 * constructed inside the route handler so tests can supply scripted mocks
 * without touching process.env or module internals.
 * @lore S2: renamed harnessAdapter → adapterPool (S2 migration).
 */
export interface SessionRouteDeps {
	readonly adapterPool?: AdapterPool;
	readonly workspaceAdapter?: SandboxAdapter;
	readonly sandboxBasePath?: string;
	readonly credentialResolver?: CredentialResolver;
	/** X2: MCP bridge registry. When present, a per-session bridge is created. */
	readonly mcpBridgeRegistry?: McpBridgeRegistry;
	/** X2: Base URL for MCP bridge (e.g., "http://localhost:3001"). */
	readonly mcpBaseUrl?: string;
	/**
	 * AN2: Already-constructed ServiceConnectionResolver.
	 * When present, held connections are provisioned into each session sandbox.
	 */
	readonly serviceConnectionResolver?: import("../services/session-provisioning.js").ProvisionSessionDeps["serviceConnectionResolver"];
	/** AO2: Optional filesystem mounter for mount + captureBack hooks. */
	readonly mounter?: import("@hyperidle/shared").FilesystemMounter;
}

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
 * @param activityBuffer - Optional in-memory ring buffer for session activity
 *   (Q1 §3.2). When wired, GET /:id/activity returns entries from the buffer.
 * @param deps - Optional adapter deps for request-mediated runtime path (R1/AU1).
 */
export function createSessionRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	activityBuffer?: SessionActivityBuffer,
	deps?: SessionRouteDeps,
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

	// @lore R1/AU1: When `deps.adapterPool` and `deps.workspaceAdapter` are both
	// present, the route creates a task-backed AgentSessionRequest and consumes it
	// through the runtime (credential pre-flight → sandbox → context assembly →
	// harness → teardown). When adapters are absent it
	// falls back to the legacy bare DB insert returning 201 — this preserves
	// backward compat for tests and deployments that haven't wired the harness.
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		validateBody(createSessionSchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof createSessionSchema>;

			// ── Full request-mediated runtime path (adapters present) ─────────────
			if (deps?.adapterPool && deps.workspaceAdapter) {
				// AH2: Load agent first so resolveAgentModel can pick per-agent model
				// over the tier fallback. Agent lookup happens before DB writes.
				const [agent] = await db
					.select({ modelId: users.modelId, modelProvider: users.modelProvider })
					.from(users)
					.where(eq(users.id, body.agentId))
					.limit(1);

				// X4 A-IMP-1 / AH2: credential pre-flight via gateway — must fail BEFORE any DB write.
				// AH2: switched from resolveModelTier to resolveAgentModel so per-agent model
				// wins over the tier config when the agent has modelId/modelProvider set.
				//
				// @lore X4: In local mode (no credentialResolver), the adapter reads from process.env.
				// The pre-flight here is a best-effort check — it catches shared-mode missing credentials
				// early. Local mode may proceed with null from the resolver if the key is in env.
				let resolvedModel: import("@hyperidle/shared").ResolvedModel | undefined;
				let resolvedFastModel: import("@hyperidle/shared").ResolvedModel | undefined;
				if (deps.credentialResolver) {
					try {
						const serverCfg = await readServerConfig(db);
						// AH2: resolveAgentModel uses per-agent model when set, falls back to tier.
						resolvedModel = await resolveAgentModel(
							{ modelId: agent?.modelId ?? null, modelProvider: agent?.modelProvider ?? null },
							body.modelTier,
							serverCfg.modelGateway,
							deps.credentialResolver,
						);
						// Resolve the fast tier for use by the builtin harness summarizer.
						// Failure is non-fatal — the harness falls back to the primary tier.
						//
						// @lore X6: Fast tier is resolved alongside primary so the builtin harness
						// can use a cheaper/faster model for context-window summarization passes,
						// avoiding the full primary-tier cost for what is effectively a compression
						// operation. If the fast tier credential is missing, summarization silently
						// falls back to resolvedModel.
						try {
							resolvedFastModel = await resolveModelTier(
								"fast",
								serverCfg.modelGateway,
								deps.credentialResolver,
							);
						} catch {
							// Non-fatal: fast tier unavailable — builtin harness will use primary tier
						}
					} catch (err) {
						if (err instanceof MissingCredentialError) {
							return c.json(
								{
									error: err.message,
									code: "MISSING_CREDENTIAL",
								},
								500,
							);
						}
						throw err;
					}
				}

				// Look up task to get productId.
				const [task] = await db.select().from(tasks).where(eq(tasks.id, body.taskId)).limit(1);
				if (!task) {
					return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
				}

				const sandboxBasePath = deps.sandboxBasePath ?? "/tmp/hyperidle-workspaces";

				try {
					// AF7 §2 (Z8-047): admit the session synchronously (phases 1-7) and
					// DETACH the long-running harness run (phases 8-11) so the HTTP caller
					// is not blocked for the full agent run. Returns as soon as the active
					// session row is committed. All admission failures (cost 422 /
					// concurrency 429 / missing credential 500) throw from admit BEFORE the
					// row insert, so they still map to HTTP status here, not the tail.
					const { request } = await createTriggeredAgentSessionRequest(db, {
						eventType: "task.accepted",
						sourceKind: "task",
						sourceId: body.taskId,
						streamId: `task:${body.taskId}`,
						taskId: body.taskId,
						defaultAgentId: body.agentId,
						teamId: task.teamId,
						idempotencyKey: `session-route:${crypto.randomUUID()}`,
						sourceCorrelation: {
							taskId: body.taskId,
							teamId: task.teamId,
						},
					});

					const result = await consumeAgentSessionRequest(
						{
							db,
							eventBus,
							adapterPool: deps.adapterPool,
							workspace: deps.workspaceAdapter,
							mcpBridgeRegistry: deps.mcpBridgeRegistry,
							mcpBaseUrl: deps.mcpBaseUrl,
							// AN2: thread the already-constructed resolver (encapsulates serverSecret).
							serviceConnectionResolver: deps.serviceConnectionResolver,
							// AO2: pass through the mounter if present.
							...(deps.mounter ? { mounter: deps.mounter } : {}),
						},
						request,
						{
							sandboxBasePath,
							modelTier: body.modelTier,
							resolvedModel,
							resolvedFastModel,
							detachAfterAdmission: true,
							enforceResolvedModelGuard: true,
						},
					);

					const [sessionRow] = await db
						.select()
						.from(sessions)
						.where(eq(sessions.id, result.sessionId))
						.limit(1);
					// AF7 §2: 202 Accepted — the session is admitted (active) but the work
					// is not done. The body is the freshly-inserted ACTIVE row (no outcome).
					return c.json(sessionRow, 202);
				} catch (err) {
					if (err instanceof CostCapExceededError) {
						return c.json({ error: err.message, code: "COST_CAP_EXCEEDED" }, 422);
					}
					if (err instanceof ConcurrencyLimitError) {
						return c.json({ error: err.message, code: "CONCURRENCY_LIMIT" }, 429);
					}
					// AF7 §2 (WARNING-2): the synchronous resolvedModel-presence guard in
					// admitSession throws MissingCredentialError (local mode, builtin,
					// resolvedModel absent) BEFORE the row insert — map it to 500 here so the
					// failure surfaces on the POST path, not as a later crashed session.
					if (err instanceof MissingCredentialError) {
						return c.json({ error: err.message, code: "MISSING_CREDENTIAL" }, 500);
					}
					// AH2: NoEligibleHarnessError means agent's harnessType has no matching
					// adapter in the pool (or none that supports its provider). Surfaces as
					// 422 so the caller knows this is a configuration issue, not a server fault.
					if (err instanceof NoEligibleHarnessError) {
						return c.json({ error: err.message, code: "NO_ELIGIBLE_HARNESS" }, 422);
					}
					return c.json({ error: "Session provisioning failed", code: "INTERNAL_ERROR" }, 500);
				}
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

	// GET /:id/activity — Session activity stream (Q1 §3.2)
	// Returns session metadata + recent activity entries from the in-memory buffer.
	// Capped at 50 most-recent entries to bound response size.
	router.get("/:id/activity", requireBoundary({ kind: "public-data" }), async (c) => {
		const sessionId = c.req.param("id");
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const allEntries = activityBuffer ? activityBuffer.getActivity(sessionId) : [];
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
