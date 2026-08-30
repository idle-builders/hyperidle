import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	API_ERROR_CODES,
	ROUTINE_STATES,
	type RoutineDetail,
	type RoutineInfo,
	type RoutineRunOutcome,
	type RoutineRunSummary,
} from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import { EVENT_TYPES, type EventBus } from "@hyperidle/event-bus";
import {
	create as createKnowledgeItem,
	get as getKnowledgeItem,
	setKnowledgeStatus,
	update as updateKnowledgeItem,
} from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule, parseTransitionTo } from "@hyperidle/routine";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import { fireRoutine } from "../services/routine-scheduler-bindings.js";

/** Inlined from @hyperidle/presentation-format (server copy removed, row 18). */
function deriveInitials(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "?";
	return trimmed.slice(0, 2).toUpperCase();
}

const ROUTINE_STATE_VALUES = ROUTINE_STATES as readonly [string, ...string[]];
/**
 * BA1 D8 — the one list. Every event routine is validated against this SAME
 * compile-time constant, on create, on patch, and via `GET
 * /api/routines/event-types` (`core-ui` cannot reach `@hyperidle/event-bus`
 * directly — `architecture.json` excludes it, per P8).
 */
const EVENT_TYPE_VALUES = EVENT_TYPES as readonly [string, ...string[]];

/**
 * AA2: Schema for POST /api/routines (create routine).
 *
 * @lore AU21 §9 Increment 2: `id` is an optional client-supplied override —
 * the `CoreApiPort.routine.insertRoutine` seam method's real caller
 * (`create_routine`'s tool handler) pre-computes a routine id itself (needed
 * to report `routineId` back in its own response before the seam call
 * returns) and must round-trip the SAME id through the route. The real UI
 * caller (`RoutineCreateDialog.tsx`) never supplies one, so the default
 * server-generated-id behavior is unchanged for that path.
 *
 * @lore BA1 D5/NB2: `teamId` is REMOVED, not made optional — a routine has
 * no team, it belongs to its owner agent. `.strict()` is load-bearing: a
 * plain `z.object` on zod 4 strips unrecognized keys rather than rejecting
 * them, so without it a stale `teamId` would be silently accepted and
 * discarded — the exact inert outcome this decision exists to prevent.
 */
const createRoutineSchema = z
	.object({
		id: z.string().min(1).optional(),
		name: z.string().min(1).max(200),
		/** BA1 D1: renamed from `description` — the 12 000-char limit is the retiring trigger entity's, not the old 2 000. */
		prompt: z.string().max(12_000).nullish(),
		ownerAgentId: z.string().min(1),
		triggerType: z.enum(["calendar", "event"]),
		/** Required (and validated) for `triggerType:"calendar"` only — see the handler. */
		triggerConfig: z.string().min(1).optional(),
		/** BA1 D8: required (and validated against `EVENT_TYPES`) for `triggerType:"event"` only. */
		eventType: z.enum(EVENT_TYPE_VALUES).optional(),
		/**
		 * BA9d D11: optional transition constraint for `triggerType:"event"` routines.
		 * When set, the routine fires only when the event's `transition.to` equals
		 * this value. Null or absent means no constraint — fires on every occurrence.
		 */
		eventTransitionTo: z.string().min(1).nullish(),
	})
	.strict();

const updateRoutineSchema = z
	.object({
		active: z.boolean().optional(),
		triggerConfig: z.string().optional(),
		/** BA1 D8: an event routine cannot be edited into an unmatchable one. */
		eventType: z.enum(EVENT_TYPE_VALUES).optional(),
		autonomyLevel: z.number().int().min(1).max(4).optional(),
		silent: z.boolean().optional(),
		// AA1: new fields
		state: z.enum(ROUTINE_STATE_VALUES as [string, ...string[]]).optional(),
		name: z.string().min(1).optional(),
		/**
		 * BA1 D1 + critique §D optional pickup: `.nullish()`, not
		 * `.optional()` — `RoutineDetailPane` sends `description: description
		 * || null` to clear the prompt, and D1's own decision is that
		 * `prompt` stays nullable. A plain `.optional()` rejects `null` and
		 * 400s on every clear.
		 */
		prompt: z.string().max(12_000).nullish(),
		/**
		 * BA9d D11: transition constraint update for event routines.
		 * Null clears the constraint (fires on every occurrence again).
		 * A non-empty string sets a new constraint value.
		 */
		eventTransitionTo: z.string().min(1).nullish(),
	})
	.strict();

/**
 * Map routine state string to `active` boolean for backward compat.
 * active → true, paused/error → false.
 */
function stateToActive(state: string): boolean {
	return state === "active";
}

/**
 * Create Hono routes for routine endpoints (E6).
 *
 * @lore AU11 AC-2: this factory used to accept an optional `RoutineProvisionDeps`
 * (AdapterPool/SandboxAdapter-typed) parameter documented as gating a
 * "full 11-phase provisioning" path on POST /:id/trigger. It was never
 * consumed (`_provisionDeps` was unread) and no production call site
 * populated it — dead threading left over from a pre-AU9 design. Removed
 * per the AU11 route-cleanup classification; POST /:id/trigger now delegates
 * to the cohesive `fireRoutine` path.
 *
 * @lore AU21 §9 Increment 4: `dispatchOps.fireRoutine` relocated to
 * `routine-scheduler-bindings.ts`'s `fireRoutine` — dispatch itself no
 * longer knows about routines.
 */

/**
 * A routine's instruction lives in a knowledge document, so it can be read and
 * edited like any other knowledge. These keep the routine and its document in
 * step: `prompt` stays the field a caller writes, and this is where that text
 * reaches the document.
 *
 * `knowledge_items` belongs to the knowledge service, so the writes go through
 * its own functions rather than the routine service reaching into the table.
 */
async function readRoutinePrompt(
	db: HyperIdleDb,
	promptKnowledgeId: string | null | undefined,
): Promise<string | null> {
	if (!promptKnowledgeId) return null;
	const doc = await getKnowledgeItem(db, promptKnowledgeId);
	return doc?.body ?? null;
}

/** Create the document a new routine's prompt lives in. Returns its id, or null for no prompt. */
async function createRoutinePromptDocument(
	db: HyperIdleDb,
	input: { readonly routineName: string; readonly prompt: string; readonly updatedBy: string },
): Promise<string> {
	const created = await createKnowledgeItem(db, {
		layer: "L4",
		scopeKind: "factory",
		scopeId: null,
		title: `${input.routineName || "Routine"} — prompt`,
		body: input.prompt,
		format: "markdown",
		status: "active",
		updatedBy: input.updatedBy,
	});
	return created.id;
}

export function createRoutineRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	// Typed with the app env so handlers can read the actor the auth middleware
	// resolved — a prompt document records who wrote it, like any knowledge edit.
	const router = new Hono<HyperIdleEnv>();

	// GET /event-types — BA1 D8: the one list `RoutineCreateDialog` fills its
	// event `Select` from. Reads no row, reveals no tenant data.
	router.get("/event-types", (c) => {
		return c.json({ eventTypes: EVENT_TYPES });
	});

	// POST / — Create routine (AA2 AC-1)
	router.post("/", validateBody(createRoutineSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createRoutineSchema>;

		// Verify ownerAgentId exists
		const agent = await findUser(db, { id: body.ownerAgentId });
		if (!agent) {
			return c.json({ error: "Agent not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		let triggerConfig: string | undefined;
		let eventType: string | undefined;

		if (body.triggerType === "calendar") {
			if (!body.triggerConfig) {
				return c.json(
					{
						error: "Invalid triggerConfig: cron field required",
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}
			// Validate triggerConfig JSON structure (cron expression validation is
			// owner-side in insertRoutine — invalid cron throws, caught below).
			let triggerConfigParsed: { cron?: string };
			try {
				triggerConfigParsed = JSON.parse(body.triggerConfig) as { cron?: string };
			} catch {
				return c.json(
					{
						error: "Invalid triggerConfig: must be valid JSON",
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}
			if (!triggerConfigParsed.cron) {
				return c.json(
					{
						error: "Invalid triggerConfig: cron field required",
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}
			triggerConfig = body.triggerConfig;
		} else {
			// BA1 D8: `triggerType:"event"` requires a top-level `eventType`,
			// already validated against `EVENT_TYPES` by the schema — a miss
			// (unknown name) 400s there. This just requires PRESENCE.
			if (!body.eventType) {
				return c.json(
					{
						error: 'eventType is required for triggerType:"event"',
						code: API_ERROR_CODES.VALIDATION_ERROR,
					},
					400,
				);
			}
			eventType = body.eventType;
			// BA9d D11: serialize transition constraint into trigger_config.
			// Stored as {"transitionTo":"<state>"} in the same column calendar
			// routines use for their cron — no collision, different trigger types.
			if (body.eventTransitionTo) {
				// Silent-disable footgun: only task_state_changed and bet_state_changed
				// carry fromState/toState — a transition constraint on any other event
				// type can never be satisfied and the routine silently never fires.
				const TRANSITION_EVENTS = new Set(["task_state_changed", "bet_state_changed"]);
				if (!TRANSITION_EVENTS.has(body.eventType ?? "")) {
					return c.json(
						{
							error:
								"eventTransitionTo requires an event type that carries a state transition — only task_state_changed and bet_state_changed qualify",
							code: API_ERROR_CODES.VALIDATION_ERROR,
						},
						400,
					);
				}
				triggerConfig = JSON.stringify({ transitionTo: body.eventTransitionTo });
			}
		}

		const routineId = body.id ?? crypto.randomUUID();
		const now = new Date().toISOString();

		const promptKnowledgeId = body.prompt
			? await createRoutinePromptDocument(db, {
					routineName: body.name,
					prompt: body.prompt,
					updatedBy: c.get("userId"),
				})
			: null;

		try {
			await routineService.insertRoutine(db, {
				id: routineId,
				name: body.name,
				promptKnowledgeId,
				ownerAgentId: body.ownerAgentId,
				triggerType: body.triggerType,
				...(triggerConfig !== undefined ? { triggerConfig } : {}),
				...(eventType !== undefined ? { eventType } : {}),
				state: "active",
				active: true,
				createdAt: now,
			});
		} catch {
			return c.json(
				{ error: "Invalid cron expression", code: API_ERROR_CODES.VALIDATION_ERROR },
				400,
			);
		}

		const created = await routineService.getRoutine(db, routineId);
		return c.json(created, 201);
	});

	// GET / — List all non-deleted routines (AA2: filter soft-deleted)
	router.get("/", async (c) => {
		const allRoutines = await routineService.listRoutines(db);
		return c.json(allRoutines);
	});

	// DELETE /:id — Soft delete routine (AA2 AC-2)
	router.delete("/:id", async (c) => {
		const routineId = c.req.param("id");

		const existing = await routineService.getRoutine(db, routineId);
		if (!existing || existing.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const now = new Date().toISOString();
		await routineService.updateRoutine(db, routineId, {
			deletedAt: now,
			state: "paused",
			active: false,
		});

		// @lore BA9g: the routine's instruction is a knowledge document (BA9f), and
		// deleting the routine used to leave it behind — an orphan in the knowledge
		// view titled "<name> — prompt", belonging to a routine that no longer
		// exists and that nothing could reach again.
		//
		// Archived, not hard-deleted: `knowledge_edit_log` and friends hold
		// RESTRICT FKs on `knowledge_items.id`, and the audit trail outlives its
		// subject.
		if (existing.promptKnowledgeId) {
			await setKnowledgeStatus(db, [existing.promptKnowledgeId], "archived");
		}

		return c.json({ deleted: true, deletedAt: now });
	});

	// GET /:id — RoutineDetail with run history (AC-5)
	router.get("/:id", async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutine(db, routineId);
		if (!routine || routine.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Resolve agent name + BA1 D5: scope comes from the owner agent.
		const ownerUser = await findUser(db, { id: routine.ownerAgentId });
		const agentName = ownerUser?.name ?? routine.ownerAgentId;
		const teamId = ownerUser?.teamId ?? null;

		// Resolve team name
		const teamRow = teamId ? await getTeam(db, { id: teamId }) : undefined;
		const teamName = teamRow?.name ?? teamId;

		// Fetch up to 20 runs (newest first). allRuns[0] is the latest run — no
		// separate latestRun query needed.
		const allRuns = await routineService.listRoutineRuns(db, {
			routineId,
			limit: 20,
		});

		const runSummaries: RoutineRunSummary[] = allRuns.map((run) => {
			let durationSeconds: number | null = null;
			if (run.startedAt && run.endedAt) {
				const startMs = new Date(run.startedAt).getTime();
				const endMs = new Date(run.endedAt).getTime();
				if (!(Number.isNaN(startMs) || Number.isNaN(endMs))) {
					durationSeconds = Math.round((endMs - startMs) / 1000);
				}
			}
			return {
				id: run.id,
				startedAt: run.startedAt,
				endedAt: run.endedAt ?? null,
				durationSeconds,
				outcome: run.outcome as RoutineRunOutcome,
				errorMessage: run.errorMessage ?? null,
				// AA2: per-run summary
				summary: run.summary ?? null,
			};
		});

		const routineInfo: RoutineInfo = {
			id: routine.id,
			name: routine.name,
			prompt: await readRoutinePrompt(db, routine.promptKnowledgeId),
			state: (routine.state ?? "active") as RoutineInfo["state"],
			triggerType: routine.triggerType,
			triggerConfig: routine.triggerConfig ?? null,
			eventType: routine.eventType ?? null,
			scheduleLabel: humanizeSchedule(
				routine.triggerType,
				routine.triggerConfig ?? null,
				routine.eventType ?? null,
			),
			ownerAgentId: routine.ownerAgentId,
			agentName,
			agentInitials: deriveInitials(agentName),
			teamId,
			teamName,
			autonomyLevel: routine.autonomyLevel ?? null,
			humanReview: routine.humanReview ?? false,
			lastRunAt: routine.lastRunAt ?? null,
			lastRunOutcome: (allRuns[0]?.outcome ?? null) as RoutineRunOutcome | null,
			nextRunAt: routine.nextRunAt ?? null,
			createdAt: routine.createdAt ?? null,
			lastRunSummary: routine.lastRunSummary ?? null,
			// AV4: silent flag — defaults false for pre-AV4 routines missing the column
			silent: routine.silent ?? false,
			// BA9d D11: parse transition constraint from trigger_config for event routines.
			eventTransitionTo:
				routine.triggerType === "event" ? parseTransitionTo(routine.triggerConfig) : null,
		};

		const detail: RoutineDetail = {
			routine: routineInfo,
			runs: runSummaries,
		};

		return c.json(detail);
	});

	// PATCH /:id — Update routine
	router.patch("/:id", validateBody(updateRoutineSchema), async (c) => {
		const routineId = c.req.param("id");
		// @lore G4 Hono zValidator typing: `c.req.valid("json")` returns
		// `never` when the route builder cannot infer the validator target
		// chain — specifically when the `validateBody` helper wraps
		// `zValidator` and the resulting middleware is passed through
		// Hono's handler positional overloads. The `"json" as never` +
		// `as z.infer<…>` double cast is load-bearing: dropping either
		// half resurrects the TS error. This matches the pattern used
		// across `bets.ts`, `tasks.ts`, `knowledge.ts`, `sessions-routes.ts`,
		// and `agents.ts`; some route files get away without the
		// cast because it does not re-export the route factory. Fixing
		// this properly requires either rewriting `validateBody` to
		// preserve the generic parameter chain or inlining `zValidator`
		// at every call site — out of scope for the G4 fix-pack.
		const body = c.req.valid("json" as never) as z.infer<typeof updateRoutineSchema>;

		const existing = await routineService.getRoutine(db, routineId);
		// AA2: treat soft-deleted routines as not found for PATCH
		if (!existing || existing.deletedAt) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const updates: routineService.RoutinePatch = {};
		if (body.active !== undefined) updates.active = body.active;
		if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig;
		if (body.eventType !== undefined) updates.eventType = body.eventType;
		if (body.autonomyLevel !== undefined) updates.autonomyLevel = body.autonomyLevel;
		if (body.silent !== undefined) updates.silent = body.silent;
		// AA1: extended fields
		if (body.name !== undefined) updates.name = body.name;
		if (body.prompt !== undefined) {
			// Write through to the document. A routine that never had a prompt gets
			// one now; one that did keeps its document so edit history survives.
			if (existing.promptKnowledgeId) {
				const doc = await getKnowledgeItem(db, existing.promptKnowledgeId);
				if (doc) {
					await updateKnowledgeItem(
						db,
						existing.promptKnowledgeId,
						{ body: body.prompt ?? "", updatedBy: c.get("userId") },
						doc.version,
					);
				}
			} else if (body.prompt) {
				updates.promptKnowledgeId = await createRoutinePromptDocument(db, {
					routineName: body.name ?? existing.name,
					prompt: body.prompt,
					updatedBy: c.get("userId"),
				});
			}
		}
		// BA9d D11: update transition constraint — serialized into trigger_config.
		// null clears the constraint; a string value sets a new one.
		if (body.eventTransitionTo !== undefined) {
			updates.triggerConfig =
				body.eventTransitionTo !== null
					? JSON.stringify({ transitionTo: body.eventTransitionTo })
					: null;
		}
		if (body.state !== undefined) {
			updates.state = body.state;
			// Sync active boolean with state for backward compat
			updates.active = stateToActive(body.state);
		}
		if (Object.keys(updates).length > 0) {
			await routineService.updateRoutine(db, routineId, updates);
		}

		const updated = await routineService.getRoutine(db, routineId);
		// The row no longer carries the prompt text — resolve it from the document
		// so the response still describes the routine as a caller expects.
		return c.json(
			updated
				? { ...updated, prompt: await readRoutinePrompt(db, updated.promptKnowledgeId) }
				: updated,
		);
	});

	// POST /:id/trigger — Manually trigger routine
	router.post("/:id/trigger", async (c) => {
		const routineId = c.req.param("id");

		const routine = await routineService.getRoutine(db, routineId);
		if (!routine) {
			return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// G4 AC8: a disabled routine must not fire, even via manual trigger.
		if (routine.active === false) {
			return c.json(
				{ error: "Routine is disabled (active=0)", code: API_ERROR_CODES.FORBIDDEN },
				403,
			);
		}

		const result = await fireRoutine(db, eventBus, agentOrchestration, routine, {
			recordSkippedRun: true,
		});
		const reason = result.reason === "previous run still in progress" ? "coalesced" : result.reason;
		return c.json(
			{
				routineId,
				fired: result.fired,
				...(result.runId ? { runId: result.runId } : {}),
				...(reason ? { reason } : {}),
			},
			200,
		);
	});

	return router;
}
