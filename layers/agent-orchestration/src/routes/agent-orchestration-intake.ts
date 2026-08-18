/**
 * AU31 §3 — `AgentOrchestrationPort`'s WRITE side, hosted here for the same
 * reason `agent-orchestration-sessions.ts` hosts the read side: the data,
 * the query/write logic and now the HTTP door are all on the layer that
 * owns `session-requests`/`run-orchestration`/`agent-run-config`/
 * `filesystems`. Mounted at `/agent-orchestration` beside the read routes
 * (`app.ts`) — an internal seam prefix, never the public `/sessions` or
 * `/filesystems` paths those stay reserved for.
 *
 * Every route here is dialled ONLY through `AgentOrchestrationPort` (core-api's
 * `agent-orchestration-port-composition.ts`) — never directly by a UI client —
 * same trust model as the existing seam: it mounts behind the application's
 * normal auth/boundary stack (architecture.md §9), and the internal
 * `X-API-Key` credential the port injects is what actually authenticates it.
 *
 * @lore AU31 §13 item 2: this door superseds AU26 H1/H2's "the door stays
 * read-only" — `AgentOrchestrationPort` is now core's one door into this
 * layer, both directions.
 */

import {
	type DEFAULT_AGENT_RUN_CONFIG,
	readAgentRunConfig,
	readAgentRunConfigs,
	writeAgentRunConfig,
} from "@hyperidle/agent-run-config";
import type {
	AgentOrchestrationRunConfigPatch,
	AgentOrchestrationWorkIntentInput,
	AgentOrchestrationWorkIntentKind,
} from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { getFilesystem, saveInjection as saveFilesystemInjection } from "@hyperidle/filesystems";
import { type HyperIdleEnv, requireBoundary, validateBody } from "@hyperidle/http-middleware";
import { endRunForHandoff, requestRunStopForTasks } from "@hyperidle/run-orchestration";
import {
	enqueueWorkIntent,
	listPendingIntentsByKind,
	sessionRunRegistry,
	type WorkIntentInput,
} from "@hyperidle/session-requests";
import { Hono } from "hono";
import { z } from "zod";

const WORK_INTENT_KINDS = [
	"assistant_turn",
	"session_start",
	"knowledge_action",
	"routine_run",
	"task_run",
	"reengagement",
] as const;

function isWorkIntentKind(value: string): value is AgentOrchestrationWorkIntentKind {
	return (WORK_INTENT_KINDS as readonly string[]).includes(value);
}

/**
 * The ONE audited cast: `AgentOrchestrationWorkIntentInput.sourceKind` is
 * wire-loose (`string`) at the port boundary, and `bakedRequest` is carried
 * opaque (`unknown`) — neither is inspected here, both are only forwarded.
 * `enqueueWorkIntent` treats them the same way (`insertIntentInternal` writes
 * `sourceKind` straight through and `JSON.stringify`s `bakedRequest` without
 * narrowing either), so asserting them onto `WorkIntentInput`'s narrower
 * wire-mirror types here is a single audited cast per field, not a
 * type-defeating `as unknown as T` launder — `kind`/`sourceId`/`requestedBy`/
 * `idempotencyKey` all type-check structurally with no cast at all.
 */
function toWorkIntentInput(body: AgentOrchestrationWorkIntentInput): WorkIntentInput {
	return {
		kind: body.kind,
		sourceKind: body.sourceKind as WorkIntentInput["sourceKind"],
		sourceId: body.sourceId,
		requestedBy: body.requestedBy,
		idempotencyKey: body.idempotencyKey,
		bakedRequest: body.bakedRequest as WorkIntentInput["bakedRequest"],
	};
}

const workIntentInputSchema = z.object({
	kind: z.enum(WORK_INTENT_KINDS),
	sourceKind: z.string().min(1),
	sourceId: z.string().min(1),
	requestedBy: z.string().optional(),
	idempotencyKey: z.string().min(1),
	bakedRequest: z.unknown().optional(),
}) satisfies z.ZodType<AgentOrchestrationWorkIntentInput>;

export function createAgentOrchestrationIntakeRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── intents.submit — POST /agent-orchestration/intents ──────────────────
	router.post(
		"/intents",
		requireBoundary({ kind: "public-data" }),
		validateBody(workIntentInputSchema),
		async (c) => {
			const body = c.req.valid("json");
			const intent = await enqueueWorkIntent(db, toWorkIntentInput(body));
			return c.json({ id: intent.id, idempotencyKey: intent.idempotencyKey });
		},
	);

	// ── requests.listPendingIntentsByKind — GET /agent-orchestration/requests/pending-intents?kind= ──
	router.get("/requests/pending-intents", requireBoundary({ kind: "public-data" }), async (c) => {
		const kind = c.req.query("kind");
		if (!(kind && isWorkIntentKind(kind))) {
			return c.json(
				{
					error: "kind is required and must be a known intent kind",
					code: API_ERROR_CODES.VALIDATION_ERROR,
				},
				400,
			);
		}
		const pending = await listPendingIntentsByKind(db, kind);
		return c.json({
			entries: pending.map((p) => ({ id: p.id, sourceId: p.sourceId, requestedBy: p.requestedBy })),
		});
	});

	// ── runs.abort — POST /agent-orchestration/runs/abort ────────────────────
	router.post(
		"/runs/abort",
		requireBoundary({ kind: "public-data" }),
		validateBody(z.object({ sessionId: z.string().min(1) })),
		async (c) => {
			const { sessionId } = c.req.valid("json");
			await sessionRunRegistry.abort(sessionId);
			return c.json({ ok: true });
		},
	);

	// ── runs.stopForTasks — POST /agent-orchestration/runs/stop-for-tasks ────
	router.post(
		"/runs/stop-for-tasks",
		requireBoundary({ kind: "public-data" }),
		validateBody(
			z.object({
				taskIds: z.array(z.string().min(1)),
				reason: z.literal("bet_killed"),
			}),
		),
		async (c) => {
			const body = c.req.valid("json");
			const stopped = await requestRunStopForTasks(db, body.taskIds, { reason: body.reason });
			return c.json({ stopped });
		},
	);

	// ── runs.endForHandoff — POST /agent-orchestration/runs/end-for-handoff ──
	// @lore AU31 §3.1 extension: `endRunForHandoff`'s own header names an
	// in-tx-with-the-caller invariant ("must be called with the caller's tx
	// handle, so the run is terminal at the same commit as the task claim" —
	// `end-run-for-handoff.ts`). Crossing the seam cannot preserve that —
	// same relinquishment class architecture.md §3.1 already accepts for
	// `knowledge.ts:934`/`threads.ts:1463` (a committed handoff followed by a
	// failed run-end leaves a task claimed with a technically-still-active
	// run; no safety-net sweep exists today for that state either per the
	// function's own header, so the window is no wider than today's
	// no-safety-net reality). Relinquished, not silently narrowed; no outbox
	// (founder ruling, architecture.md §13 item 3).
	router.post(
		"/runs/end-for-handoff",
		requireBoundary({ kind: "public-data" }),
		validateBody(z.object({ sessionId: z.string().min(1), endedAt: z.string().min(1) })),
		async (c) => {
			const body = c.req.valid("json");
			await endRunForHandoff(db, body.sessionId, body.endedAt);
			return c.json({ ok: true });
		},
	);

	// ── runConfig.read — GET /agent-orchestration/run-config/:agentId ────────
	router.get("/run-config/:agentId", requireBoundary({ kind: "public-data" }), async (c) => {
		const config = await readAgentRunConfig(db, c.req.param("agentId"));
		return c.json({ config });
	});

	// ── runConfig.readBatch — POST /agent-orchestration/run-config/batch ─────
	// (POST, not GET+query-list: an agent roster can exceed a safe query-string length.)
	router.post(
		"/run-config/batch",
		requireBoundary({ kind: "public-data" }),
		validateBody(z.object({ agentIds: z.array(z.string().min(1)) })),
		async (c) => {
			const { agentIds } = c.req.valid("json");
			const configs =
				agentIds.length > 0
					? await readAgentRunConfigs(db, agentIds)
					: new Map<string, typeof DEFAULT_AGENT_RUN_CONFIG>();
			return c.json({ configs: Object.fromEntries(configs) });
		},
	);

	// ── runConfig.write — PATCH /agent-orchestration/run-config/:agentId ─────
	router.patch(
		"/run-config/:agentId",
		requireBoundary({ kind: "public-data" }),
		validateBody(
			z.object({
				systemPrompt: z.string().nullable().optional(),
				harnessType: z.string().nullable().optional(),
				modelTierPreference: z.string().nullable().optional(),
				modelId: z.string().nullable().optional(),
				modelProvider: z.string().nullable().optional(),
				maxConcurrentSessions: z.number().optional(),
			}) satisfies z.ZodType<AgentOrchestrationRunConfigPatch>,
		),
		async (c) => {
			const patch = c.req.valid("json");
			await writeAgentRunConfig(db, c.req.param("agentId"), patch);
			return c.json({ ok: true });
		},
	);

	// ── filesystems.getTeamId — GET /agent-orchestration/filesystems/:id/team ──
	// The team-consistency gate's pre-write read — see the port's own doc.
	router.get("/filesystems/:id/team", requireBoundary({ kind: "public-data" }), async (c) => {
		const filesystemId = c.req.param("id");
		const fs = await getFilesystem(db, filesystemId);
		return c.json({ teamId: fs?.teamId ?? null });
	});

	// ── filesystems.persistInjection — POST /agent-orchestration/filesystems/:id/injections/persist ──
	// §2.6: the existence check + insert core's `POST /api/filesystems/:id/injections`
	// used to do via a direct `@hyperidle/filesystems` import. The team-consistency
	// gate (users + team_members) stays core-side; only the persist crosses the seam.
	router.post(
		"/filesystems/:id/injections/persist",
		requireBoundary({ kind: "public-data" }),
		validateBody(z.object({ agentUserId: z.string().min(1) })),
		async (c) => {
			const filesystemId = c.req.param("id");
			const { agentUserId } = c.req.valid("json");
			const fs = await getFilesystem(db, filesystemId);
			if (fs == null) return c.json({ ok: false, code: "NOT_FOUND" }, 200);
			const now = new Date().toISOString();
			try {
				await saveFilesystemInjection(db, { agentUserId, filesystemId, createdAt: now });
			} catch (err) {
				const constraintMsg = (e: unknown): string => {
					if (!(e instanceof Error)) return String(e);
					const own = e.message.toLowerCase();
					if (
						e.message.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
						own.includes("duplicate key") ||
						own.includes("unique constraint")
					)
						return e.message;
					return e.cause !== undefined ? constraintMsg(e.cause) : e.message;
				};
				const msg = constraintMsg(err);
				if (
					msg.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
					msg.toLowerCase().includes("duplicate key") ||
					msg.toLowerCase().includes("unique constraint")
				) {
					return c.json({ ok: false, code: "CONFLICT" }, 200);
				}
				throw err;
			}
			return c.json({
				ok: true,
				injection: { agentUserId, filesystemId, createdAt: now },
			});
		},
	);

	return router;
}
