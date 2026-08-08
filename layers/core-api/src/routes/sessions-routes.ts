import type {
	AgentOrchestrationExplicitStartView,
	AgentOrchestrationPort,
} from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { readServerConfig } from "@hyperidle/settings";
import { type AgentWorkIntentEvent, API_ERROR_CODES, type EventBus } from "@hyperidle/shared";
import {
	type HyperIdleEnv,
	projectExplicitStartOutcome,
	requireBoundary,
	sendStartProjection,
	validateBody,
} from "@hyperidle/shared/http";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { resolveOrCreateCallingThread } from "../services/calling-thread-bindings.js";

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

/**
 * Resolve the session row an admitted start points at, then hand both to the
 * shared wire projection.
 *
 * @lore AU26 A1: the projection itself moved to `@hyperidle/shared/http`
 * (`projectExplicitStartOutcome`) because `GET /api/sessions/starts/:startId` moved
 * to the orchestration app while `POST /api/sessions` stays here — both render the
 * same 202/422/429/500 contract and neither app may import the other's routes. Only
 * the row READ stays per-caller: each side reads `sessions` its own legal way.
 *
 * @lore AU26 B1a (§D-A's `sessions-routes.ts` split, AC5(d)): this side's legal way is
 * `AgentOrchestrationPort.sessions.getById` — a Layer route reading the other
 * Layer's data goes through the read door (§D-A rule 3), never a raw
 * `db.select().from(sessions)`. `getById` returns the FULL 18-column wire row on
 * purpose: the 202 branch returns it verbatim, so a narrowing here would silently
 * drop 11 fields from a shipped response.
 */
async function projectExplicitStart(
	start: AgentOrchestrationExplicitStartView,
	agentOrchestration: AgentOrchestrationPort,
) {
	if (start.status === "admitted" && start.sessionId) {
		return projectExplicitStartOutcome(
			start,
			await agentOrchestration.sessions.getById(start.sessionId),
		);
	}
	return projectExplicitStartOutcome(start, null);
}

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

/**
 * Create core-api's one remaining session route: `POST /api/sessions`.
 *
 * @param durableStartEnabled - AU11 AC-2: true when the composition root has
 *   an adapter pool wired. When true, POST /sessions creates and consumes an
 *   AgentSessionRequest instead of a bare DB insert (see `SessionRouteDeps`
 *   removal note above — this replaces the former `deps.adapterPool`
 *   presence check with a plain boolean, no harness type dependency).
 *
 * @lore AU26 B1a (§D-A's `sessions-routes.ts` split): this file used to register five routes; four moved
 * to `layers/agent-orchestration/src/routes/sessions.ts` (`GET /`,
 * `GET /starts/:startId`, `GET /:id/activity`, `PATCH /:id`) at their unchanged
 * paths. `POST /` stays because §D-A rule 3 gives a two-sided route exactly one
 * legal host, and this one is two-sided: `work.get`'s 404 gate reads `tasks`,
 * `resolveSessionStartRequest` bakes `users` + `server_config`, and the write
 * side is `explicit_session_starts` + `agent_work_intents` + `sessions`. The
 * file therefore sheds its `sessions` table import entirely — the row read goes
 * through `AgentOrchestrationPort.sessions.getById` and the legacy bare insert
 * through `run-orchestration`'s `createBareRun`.
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
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

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
				let start = await agentOrchestration.requests.findExplicitStartByIdempotencyKey(
					requestedBy,
					idempotencyKey,
				);
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
				let intent: { readonly id: string; readonly idempotencyKey: string } | null | undefined;
				if (!start) {
					const startId = crypto.randomUUID();
					// AU21 §6 Decision B: resolve + validate the session_start run AT
					// EMIT TIME (this Service's own domain state, plus the shared
					// ast-<userId> runnability invariant) and bake the full request
					// onto the intent — the drain dispatches it directly, with zero
					// domain reads. Resolved BEFORE the seam call, per §3 clause 2 —
					// core resolves the baked request from its own domain, the seam
					// never reaches back into core state.
					const bakedRequest = await resolveSessionStartRequest(
						db,
						{ taskId: body.taskId, requestedAgentId: body.agentId },
						{
							requireRunnableAgent,
							readServerConfig,
							// AU27 Increment 1 (Decision 0): also bake callingThreadId.
							resolveOrCreateCallingThread,
						},
					);
					// AU31 §3.2 — the atomic pair op: ONE orchestration-side
					// transaction creates the explicit start AND records the baked
					// `session_start` intent, preserving the atomicity this route had
					// before the seam existed.
					const result = await agentOrchestration.intents.createExplicitStart({
						startId,
						taskId: body.taskId,
						requestedAgentId: body.agentId,
						requestedModelTier: body.modelTier,
						requestedBy,
						idempotencyKey,
						intentIdempotencyKey: `explicit-session-start:${startId}`,
						bakedRequest,
					});
					start = result.start;
					intent = result.intent;
				}
				if (!start) throw new Error("Explicit session start was not persisted");
				c.header("Idempotency-Key", idempotencyKey);
				c.header("Location", `/api/sessions/starts/${start.id}`);
				if (start.status !== "requested") {
					const projection = await projectExplicitStart(start, agentOrchestration);
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
							const fresh = await agentOrchestration.requests.findExplicitStartById(
								committedStart.id,
							);
							if (fresh && fresh.status !== "requested")
								finish(await projectExplicitStart(fresh, agentOrchestration));
						};
						const unsubscribe = eventBus.on("*", () => void check());
						const timer = setTimeout(
							() => void projectExplicitStart(committedStart, agentOrchestration).then(finish),
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
			// @lore AU26 B1a (§D-A's `sessions-routes.ts` split) / AU31 §2.3: the
			// insert AND the `session_started` emit are seam-backed
			// (`runs.createBareRun`) — `@hyperidle/run-orchestration` is no longer a
			// core-api dependency. The 201 body is unchanged: the whole persisted
			// `sessions` row.
			const created = await agentOrchestration.runs.createBareRun({
				agentId: body.agentId,
				taskId: body.taskId,
				modelTier: body.modelTier,
			});
			return c.json(created, 201);
		},
	);

	return router;
}
