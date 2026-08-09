import type { ExplicitSessionStart, HyperIdleDb } from "@hyperidle/db";
import { type AgentWorkIntentEvent, API_ERROR_CODES } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	type HyperIdleEnv,
	projectExplicitStartOutcome,
	requireBoundary,
	sendStartProjection,
	validateBody,
} from "@hyperidle/http-middleware";
import { createBareRun } from "@hyperidle/run-orchestration";
import { createSessionRequest, findSessionRequest } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { resolveSessionStartRequest } from "@hyperidle/work";
import type { AgentWorkIntentReader, AgentWorkIntentRecorder } from "@hyperidle/work-intent-port";
import { Hono } from "hono";
import z from "zod";
import {
	buildAgentOrchestrationPort,
	getRegisteredAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";
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
 * @lore AU26 A1: the projection itself moved to `@hyperidle/http-middleware`
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
async function projectExplicitStart(start: ExplicitSessionStart) {
	if (start.status === "admitted" && start.sessionId) {
		const port = buildAgentOrchestrationPort(getRegisteredAgentOrchestrationTransport());
		return projectExplicitStartOutcome(start, await port.sessions.getById(start.sessionId));
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
 * are the Application-injected cross-Layer ports (`@hyperidle/work-intent-port`,
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
					const projection = await projectExplicitStart(start);
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
							if (fresh && fresh.status !== "requested") finish(await projectExplicitStart(fresh));
						};
						const unsubscribe = eventBus.on("*", () => void check());
						const timer = setTimeout(
							() => void projectExplicitStart(committedStart).then(finish),
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
			// @lore AU26 B1a (§D-A's `sessions-routes.ts` split): the insert AND the `session_started` emit
			// are `run-orchestration`'s `createBareRun` now — core asking the owning
			// Layer to create its own record is a downward command (§D-A rule 3), not
			// a Port method. `@hyperidle/run-orchestration` was already a core-api
			// dependency, so no package edge is added. The 201 body is unchanged: the
			// whole persisted `sessions` row.
			const created = await createBareRun(db, eventBus, {
				agentId: body.agentId,
				taskId: body.taskId,
				modelTier: body.modelTier,
			});
			return c.json(created, 201);
		},
	);

	return router;
}
