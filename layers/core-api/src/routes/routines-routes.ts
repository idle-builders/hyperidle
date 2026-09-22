import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type ActionResult,
	API_ERROR_CODES,
	type DocumentRow,
	type DocumentView,
	type EditDocumentInput,
	ROUTINE_STATES,
	type RoutineDetail,
	type RoutineInfo,
	type RoutineRunOutcome,
	type RoutineRunSummary,
	type SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import { EVENT_TYPES, type EventBus } from "@hyperidle/event-bus";
import { getTeam } from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { humanizeSchedule, parseTransitionTo } from "@hyperidle/routine";
import { findUser } from "@hyperidle/users";
import { Hono } from "hono";
import z from "zod";
import type { ActionContext } from "../actions/action.js";
import { fireRoutine } from "../services/routine-scheduler-bindings.js";

/**
 * `search_documents`/`edit_document`'s own bound `run` — the injected
 * runners this route reaches the document module through (architecture.md
 * §8.2, §8.3). No local `SearchDocumentsRunFn`/`EditDocumentRunFn` type
 * exists yet on `../actions/action.js` (only `SendMessageRunFn`/
 * `AdjustThreadRunFn` do) — defined here rather than adding to that shared
 * file, which this block does not own.
 */
type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<DocumentRow[]>>;
type EditDocumentRunFn = (
	ctx: ActionContext,
	input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;

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
 * A routine's instruction lives in a document parented to it, in the
 * `prompt` slot, so it can be read and edited like any other document.
 * `prompt` stays the field a caller writes; the read/write of the document
 * itself goes through the three document actions (architecture.md §8.3) —
 * `search_documents`/`edit_document`'s own bound `run`, injected the same
 * way `sendMessage`/`adjustThread` are (§8.2) — never a direct import of the
 * document module's repository.
 */

/** The document parented to `routineId` in the `prompt` slot, if any.
 * No `status` filter — an archived prompt still comes back (today's
 * behaviour, pinned by a test): a routine that has been paused or whose
 * prompt was archived by hand must keep firing with the instruction it had,
 * not silently go blank. */
async function findRoutinePromptDoc(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	routineId: string,
): Promise<DocumentRow | null> {
	const result = await searchDocuments(ctx, {
		parent: { kind: "routine", id: routineId },
		slot: "prompt",
	});
	return result.ok ? (result.data[0] ?? null) : null;
}

/** `findRoutinePromptDoc`'s body, or `null` if the routine has no prompt document. */
async function readRoutinePrompt(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	routineId: string,
): Promise<string | null> {
	const doc = await findRoutinePromptDoc(ctx, searchDocuments, routineId);
	return doc?.body ?? null;
}

/** `readRoutinePrompt` for a whole page of routines, in one batched call —
 * mirrors the title ladder's own batching (architecture.md §8.3): a list
 * endpoint must agree with its own detail endpoint on shape without one
 * document call per row. No `status` filter, same as the single read. */
async function readRoutinePromptBodies(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	routineIds: readonly string[],
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (routineIds.length === 0) return map;
	const result = await searchDocuments(ctx, {
		parent: { kind: "routine", ids: [...routineIds] },
		slot: "prompt",
	});
	if (result.ok) {
		for (const doc of result.data) {
			if (doc.parentId) map.set(doc.parentId, doc.body);
		}
	}
	return map;
}

/**
 * Create the document a new routine's prompt lives in, parented to that
 * routine. Returns its id.
 *
 * @lore BA9g: the scope was hardcoded `factory` — org-wide — so a routine owned
 * by one team's agent published its instruction to everybody. A prompt is
 * a document; it takes the scope of whoever the routine belongs to. An agent with
 * a team scopes to that team; a factory-wide agent stays factory.
 */
async function createRoutinePromptDocument(
	ctx: ActionContext,
	editDocument: EditDocumentRunFn,
	input: {
		readonly routineId: string;
		readonly routineName: string;
		readonly prompt: string;
		readonly ownerTeamId: string | null;
	},
): Promise<string> {
	const result = await editDocument(ctx, {
		title: `${input.routineName || "Routine"} — prompt`,
		body: input.prompt,
		format: "markdown",
		status: "active",
		as: "document",
		slot: "prompt",
		scopeKind: input.ownerTeamId ? "team" : "factory",
		scopeId: input.ownerTeamId,
		parent: { kind: "routine", id: input.routineId },
	});
	if (!result.ok) {
		throw new Error(
			`routine prompt document create failed: ${result.problems.map((p) => p.code).join(", ")}`,
		);
	}
	return result.data.document.id;
}

/** Archive every document parented to `routineId`, as `actor` — the routine
 * is gone, and there is no view left for an orphaned document to appear in.
 * Not just the `prompt` slot: any document a plugin or a person attached to
 * this routine goes with it (architecture.md §8.3). N edits, N change rows,
 * each with the acting person as the actor. */
async function archiveRoutineDocuments(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRunFn,
	editDocument: EditDocumentRunFn,
	routineId: string,
): Promise<void> {
	const result = await searchDocuments(ctx, { parent: { kind: "routine", id: routineId } });
	if (!result.ok) return;
	for (const doc of result.data) {
		const archived = await editDocument(ctx, { id: doc.id, status: "archived" });
		if (!archived.ok) {
			throw new Error(
				`routine document archive failed: ${archived.problems.map((p) => p.code).join(", ")}`,
			);
		}
	}
}

export function createRoutineRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	/** `search_documents`'s own bound `run`, threaded from `app.ts`'s composed
	 * actions list (architecture.md §8.2) — never a direct document import. */
	searchDocuments: SearchDocumentsRunFn,
	/** `edit_document`'s own bound `run`, same threading. */
	editDocument: EditDocumentRunFn,
): Hono<HyperIdleEnv> {
	// Typed with the app env so handlers can read the actor the auth middleware
	// resolved — a prompt document records who wrote it, like any document edit.
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
				// Silent-disable footgun: only task_state_changed carries fromState/toState —
				// a transition constraint on any other event type can never be satisfied
				// and the routine silently never fires.
				const TRANSITION_EVENTS = new Set(["task_state_changed"]);
				if (!TRANSITION_EVENTS.has(body.eventType ?? "")) {
					return c.json(
						{
							error:
								"eventTransitionTo requires an event type that carries a state transition — only task_state_changed qualifies",
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

		// The routine must exist before its prompt document can name it as a
		// parent — order flips from the old FK shape. Side benefit: an invalid
		// cron below now fails BEFORE any document is created, so it can never
		// orphan one (the old order created the document first).
		try {
			await routineService.insertRoutine(db, {
				id: routineId,
				name: body.name,
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

		// `internal: true` — this route is the system that is allowed to
		// attach a document to a routine (`parent.kind:"routine"`,
		// `edit_document`'s `forbidden_parent_kind` invariant); the routine id
		// a prompt document parents to always comes from this route's own URL
		// param or its own just-inserted row, never from raw client input.
		const ctx: ActionContext = { actor: c.get("userId"), db, eventBus, now, internal: true };
		if (body.prompt) {
			await createRoutinePromptDocument(ctx, editDocument, {
				routineId,
				routineName: body.name,
				prompt: body.prompt,
				ownerTeamId: (await findUser(db, { id: body.ownerAgentId }))?.teamId ?? null,
			});
		}

		const created = await routineService.getRoutine(db, routineId);
		// The row no longer carries the prompt text — resolve it from the document,
		// same as GET and PATCH, so all three responses agree on shape.
		return c.json(
			created
				? { ...created, prompt: await readRoutinePrompt(ctx, searchDocuments, routineId) }
				: created,
			201,
		);
	});

	// GET / — List all non-deleted routines (AA2: filter soft-deleted)
	router.get("/", async (c) => {
		const allRoutines = await routineService.listRoutines(db);
		// The row no longer carries the prompt text — resolve it from each
		// routine's document, same as GET/POST/PATCH, so all four responses
		// agree on shape. One batched read, not one per routine.
		// `internal: true` — see the single-line `ctxFor` sites above; this
		// route is the system caller allowed to name a `routine` parent.
		const ctx: ActionContext = {
			actor: c.get("userId"),
			db,
			eventBus,
			now: new Date().toISOString(),
			internal: true,
		};
		const prompts = await readRoutinePromptBodies(
			ctx,
			searchDocuments,
			allRoutines.map((routine) => routine.id),
		);
		return c.json(
			allRoutines.map((routine) => ({ ...routine, prompt: prompts.get(routine.id) ?? null })),
		);
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

		// @lore BA9g/knowledge-attachment-slot: the routine's instruction is a
		// document parented to it, and deleting the routine used to leave it
		// behind — an orphan in the document view titled "<name> — prompt",
		// belonging to a routine that no longer exists and that nothing could
		// reach again. Archiving every document parented to this routine (not
		// just the prompt slot) is what the plan calls "deleting a parent
		// deletes its documents" — there is no UI for an orphan, so archiving is
		// the only safe default.
		//
		// Archived, not hard-deleted: `changes` holds a RESTRICT FK on
		// `documents.id`, and the audit trail outlives its subject.
		// `internal: true` — this route is the system that is allowed to
		// attach a document to a routine (`parent.kind:"routine"`,
		// `edit_document`'s `forbidden_parent_kind` invariant); the routine id
		// a prompt document parents to always comes from this route's own URL
		// param or its own just-inserted row, never from raw client input.
		const ctx: ActionContext = { actor: c.get("userId"), db, eventBus, now, internal: true };
		await archiveRoutineDocuments(ctx, searchDocuments, editDocument, routineId);

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

		// `internal: true` — see the single-line `ctxFor` sites above; this
		// route is the system caller allowed to name a `routine` parent.
		const ctx: ActionContext = {
			actor: c.get("userId"),
			db,
			eventBus,
			now: new Date().toISOString(),
			internal: true,
		};
		const routineInfo: RoutineInfo = {
			id: routine.id,
			name: routine.name,
			prompt: await readRoutinePrompt(ctx, searchDocuments, routine.id),
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
		// `internal: true` — see the single-line `ctxFor` sites above; this
		// route is the system caller allowed to name a `routine` parent.
		const ctx: ActionContext = {
			actor: c.get("userId"),
			db,
			eventBus,
			now: new Date().toISOString(),
			internal: true,
		};
		if (body.prompt !== undefined) {
			// Write through to the document. A routine that never had a prompt gets
			// one now; one that did keeps its document so edit history survives.
			const existingDoc = await findRoutinePromptDoc(ctx, searchDocuments, routineId);
			if (existingDoc) {
				const edited = await editDocument(ctx, {
					id: existingDoc.id,
					body: body.prompt ?? "",
					version: existingDoc.version,
				});
				if (!edited.ok) {
					throw new Error(
						`routine prompt document edit failed: ${edited.problems.map((p) => p.code).join(", ")}`,
					);
				}
			} else if (body.prompt) {
				await createRoutinePromptDocument(ctx, editDocument, {
					routineId,
					routineName: body.name ?? existing.name,
					prompt: body.prompt,
					ownerTeamId: (await findUser(db, { id: existing.ownerAgentId }))?.teamId ?? null,
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
				? { ...updated, prompt: await readRoutinePrompt(ctx, searchDocuments, updated.id) }
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

		const result = await fireRoutine(db, eventBus, agentOrchestration, searchDocuments, routine, {
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
