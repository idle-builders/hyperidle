import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { type HyperIdleEnv, validateBody } from "@hyperidle/http-middleware";
import type { PolicySessionContext } from "@hyperidle/policy";
import * as work from "@hyperidle/work";
import { Hono } from "hono";
import z from "zod";
import { buildProductionHandoff } from "../services/policy-bindings.js";

/**
 * Zod schemas for request validation.
 */
/**
 * @lore AU21 §9 Increment 2: `description`/`doneCondition`/`ownerAgentId`
 * accept an explicit `null`, not just absence — `CoreApiPort.work.createTask`
 * (`core-api-port-composition.ts`) forwards `create_task`'s tool input
 * verbatim, which fills unset optional fields with a real `null` (matching
 * this route's own `body.description ?? null` normalization below), and
 * `JSON.stringify` serializes an object's `null` properties (unlike
 * `undefined`, which it drops) — the wire body genuinely carries `null`.
 */
const createTaskSchema = z.object({
	betId: z.string(),
	title: z.string().min(1),
	description: z.string().nullish(),
	doneCondition: z.string().nullish(),
	ownerAgentId: z.string().nullish(),
});

/**
 * AU21 §9 Increment 2 — the `CoreApiPort.work.appendTaskNote` seam method's
 * backing route. Mirrors `work-service.ts`'s atomic SQL-CASE note append
 * (`update(exec,"task",id,{notes:{appendNote:entry}})`) — the same "goes via
 * MCP API back to core, just like the user would" door `log_task` used to
 * reach directly via raw DI.
 */
const appendTaskNoteSchema = z.object({
	entry: z.string().min(1),
});

/**
 * @lore AU21 §9 Increment 2: `contextId`/`status`/`error` are optional
 * caller-supplied overrides — the `CoreApiPort.work.handoffTask` seam
 * method's real caller (`handoff_to`'s tool handler) needs the FULL
 * `HandoffMetadata` fidelity (`@hyperidle/policy`'s wire shape), which this
 * route previously hardcoded (`context_id: session.id`, `status: "completed"`,
 * `error` dropped entirely). Omitting all three preserves the exact original
 * behavior for any caller that doesn't supply them.
 */
const handoffSchema = z.object({
	sessionId: z.string(),
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
	contextId: z.string().optional(),
	status: z.enum(["completed", "failed", "blocked", "in_progress"]).optional(),
	error: z.string().optional(),
});

/**
 * Create Hono routes for task endpoints.
 * Requires db and eventBus injected.
 */
export function createTaskRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();
	const handoff = buildProductionHandoff(agentOrchestration);

	// POST /tasks — create a new task (agent-driven decomposition)
	router.post("/", validateBody(createTaskSchema), async (c) => {
		const body = c.req.valid("json" as never) as z.infer<typeof createTaskSchema>;
		const now = new Date().toISOString();

		// Validate bet exists
		const bet = await work.get(db, "bet", body.betId);
		if (!bet) {
			return c.json({ error: "Bet not found", code: "NOT_FOUND" }, 404);
		}

		const taskId = crypto.randomUUID();
		await work.create(db, "task", {
			id: taskId,
			betId: body.betId,
			teamId: bet.teamId,
			title: body.title,
			description: body.description ?? null,
			doneCondition: body.doneCondition ?? null,
			ownerAgentId: body.ownerAgentId ?? null,
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});

		const created = await work.get(db, "task", taskId);
		return c.json(created, 201);
	});

	// GET /tasks — list, filterable by ids, bet_id, state, owner
	//
	// @lore AU26 review W4: `?ids=a,b,c` reads N tasks in ONE request. The J4
	// move composes agent-run state with task titles in the browser, and without
	// this it had to issue `GET /tasks/:id` per task — the same N+1 `@lore AB1
	// S2` had already removed once, server-side. `work.list`'s `ids` filter
	// existed all along; only the route had no way to ask for it. `ids` wins over
	// the other filters, because that is what `work.list` does with it (it
	// short-circuits to an `inArray` read).
	router.get("/", async (c) => {
		const ids = c.req.query("ids");
		const betId = c.req.query("bet_id");
		const state = c.req.query("state");
		const owner = c.req.query("owner");

		const result = await work.list(db, "task", {
			// `?ids=` present but empty means "no tasks", never "every task".
			...(ids !== undefined ? { ids: ids.split(",").filter((id) => id.length > 0) } : {}),
			...(betId ? { betId } : {}),
			...(state ? { state } : {}),
			...(owner ? { ownerAgentId: owner } : {}),
		});

		return c.json(result);
	});

	// GET /tasks/:id — bare task detail (AU21 §9 Increment 2: `CoreApiPort.work.getTaskById`'s
	// backing route — no bare detail route existed before this; only the
	// enriched `GET /bets/:id` (tasks nested under a bet) served task rows).
	router.get("/:id", async (c) => {
		const taskId = c.req.param("id");
		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json(task);
	});

	// PATCH /tasks/:id/notes — atomic note append (AU21 §9 Increment 2:
	// `CoreApiPort.work.appendTaskNote`'s backing route). Returns 404 (not a
	// thrown error) when the task does not exist — the seam maps that to an
	// `undefined` resolve, matching `work-service.ts`'s no-pre-read contract.
	router.patch("/:id/notes", validateBody(appendTaskNoteSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof appendTaskNoteSchema>;

		const result = await work.update(db, "task", taskId, { notes: { appendNote: body.entry } });
		if (!result) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json(result);
	});

	// @lore AU26 J4: `GET /tasks/:id/sessions` is DELETED. Its entire payload was
	// agent-run data — core-api reading `agent-orchestration`'s `sessions` table
	// to serve a list OF RUNS. Founder ruling: *"orchestration now has an api so
	// that the ui can get the agent run state from the orchestration directly."*
	// `useTaskSessions` now calls
	// `GET /api/agent-orchestration/runs?task_id=…` and does the same mapping
	// client-side, so the task view and the task sheet render identically.

	// POST /tasks/:id/handoff — hand off task to another agent/role/human
	router.post("/:id/handoff", validateBody(handoffSchema), async (c) => {
		const taskId = c.req.param("id");
		const body = c.req.valid("json" as never) as z.infer<typeof handoffSchema>;

		const task = await work.get(db, "task", taskId);
		if (!task) {
			return c.json({ error: "Task not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// @lore AU26 J4: the run row comes down the READ DOOR, not a raw
		// `db.select().from(sessions)` — a core-api Layer route reading the other
		// Layer's data goes through `AgentOrchestrationPort.sessions.getById`
		// (§D-A rule 3), the same way `sessions-routes.ts` already does. No new
		// port surface: this reuses the method that already exists. Only two
		// fields are read below, and both are genuinely core's need — the 404
		// (handing off a non-existent run must fail) and `agentId` (the author of
		// every thread, message and item the handoff creates), which is a
		// property of the run and cannot be derived from anything core owns.
		const session = await agentOrchestration.sessions.getById(body.sessionId);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		// Build the minimal handoff context.
		//
		// @lore AU26 J1: `sandboxPath`, `ingestion` and `traceId` are DELETED.
		// `handoff` takes `PolicySessionContext = {sessionId, agentId, taskId}`
		// (`policy/src/ports.ts:17-21`) and reads exactly those three — the other
		// three were constructed here and never read by anything, and with them
		// goes the `session.sandboxSnapshot` read. The `/tmp/.hyperidle-noop-*`
		// sentinel guarded `endSession`'s `fs.promises.rm`, a code path this route
		// no longer reaches now that H1 moved the run-end write down.
		const sessionContext: PolicySessionContext = {
			sessionId: session.id,
			agentId: session.agentId,
			taskId,
		};

		const result = await handoff(db, eventBus, {
			sessionContext,
			toAgent: body.toAgent,
			toRole: body.toRole,
			toHuman: body.toHuman,
			metadata: {
				context_id: body.contextId ?? session.id,
				status: body.status ?? "completed",
				reason: body.reason,
				artifacts: body.artifacts ?? [],
				remaining_work: body.remainingWork ?? [],
				...(body.error !== undefined ? { error: body.error } : {}),
			},
		});

		return c.json(result);
	});

	return router;
}
