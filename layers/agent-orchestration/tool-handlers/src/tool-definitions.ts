/**
 * tool-definitions — AU20 Stage 2 destructive rewrite (finalised in Stage 3).
 *
 * ALL tool implementations live here as private functions. The public
 * surface is exactly one exported function:
 *   - buildToolDefinitions(ports, opts?)
 *
 * All per-tool factory files (`createXxxTool`) are DELETED — including
 * `log-task.ts` and `create-artifact.ts` which were kept in Stage 2 because
 * completeness-contract tests imported them directly. Stage 3 migrated those
 * tests to drive `buildToolDefinitions`, completing the collapse.
 *
 * @lore AU20 Stage 2: `parseCron`/`nextCronMatch` removed from the dispatch
 * port — they were pure utilities now in `@hyperidle/cron`; `create_routine`
 * imported them directly, no dispatch back-edge needed.
 *
 * @lore AU44 B3: `@hyperidle/cron` dissolved into `@hyperidle/routine`.
 * `create_routine` no longer calls parseCron/nextCronMatch — nextRunAt
 * computation is owner-side in insertRoutine. The port method now returns
 * the computed nextRunAt.
 */

import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
	REVIEW_CANVAS_KINDS,
	type ReviewPayload,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	type ScopeKind,
	SeamRequestError,
	TASK_STATES,
} from "@hyperidle/domain-model";
import { EVENT_TYPES, type TaskStateChangedEvent } from "@hyperidle/event-bus";
import { err, ok, type RegisteredTool } from "@hyperidle/harness-protocol";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";
import { type ToolDefinition, toRegistered } from "./tool-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// send_message
// ─────────────────────────────────────────────────────────────────────────────

const sendMessageInputSchema = z.object({
	to: z.string().min(1),
	subject: z.string().optional(),
	body: z.string().min(1),
});

type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

function makeSendMessageTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<SendMessageInput, TDb> {
	return {
		name: "send_message",
		description:
			"Send a direct message to another agent. Reuses an existing direct thread when one exists between the two agents, otherwise creates a new one.",
		inputSchema: sendMessageInputSchema,
		handler: async (args, ctx) => {
			const parsed = sendMessageInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { to, subject, body } = parsed.data;
			const recipient = await ports.coreApi.getUserById(to, ctx.agentId);
			if (!recipient) return err("NOT_FOUND", `Recipient agent not found: ${to}`);
			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
			// `POST /threads/direct` + `POST /threads/:id/messages` routes a human
			// caller's client would use — instead of the raw `ports.conversation`
			// DI calls (deleted). The message route generates the message's id
			// server-side; `created.id` replaces the client-generated
			// `crypto.randomUUID()` the raw DI path used.
			const { id: threadId } = await ports.coreApi.findOrCreateDirectThread(to, ctx.agentId);
			const text = subject ? `${subject}\n\n${body}` : body;
			const created = await ports.coreApi.insertMessage(
				{
					threadId,
					type: "plain",
					payload: { text },
					clientKey: crypto.randomUUID(),
				},
				ctx.agentId,
			);
			return ok({ messageId: created.id, threadId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// reply (AU27 Increment 2, Decision 1)
// ─────────────────────────────────────────────────────────────────────────────

const replyInputSchema = z.object({ text: z.string().min(1).max(65_536) });

type ReplyInput = z.infer<typeof replyInputSchema>;

/**
 * AU27 Increment 2 (Decision 1) — the generic session-scoped `reply` tool.
 * Posts a plain message into the session's calling thread through the SAME
 * `CoreApiPort` seam `send_message` already routes through
 * (`ports.coreApi.insertMessage`, backed by `POST /threads/:id/messages`) —
 * never an orchestration-side special write. Available to every agent kind
 * (no `roles` filter) — this is how the assistant answers, but any agent
 * kind with a calling thread (task_run/session_start/
 * knowledge_action) can use it too.
 *
 * Deliberately narrower than `send_message`: NO thread argument. `reply`
 * always posts to `ctx.threadId` when one exists (the session's own calling
 * thread, baked at emit — Increment 1) — this is what makes the tool mean
 * "answer whoever triggered you" and removes a whole class of loop (an agent
 * replying into an arbitrary thread it does not own).
 *
 * @lore AU27 — `reply` always lands somewhere. A session with no baked
 * calling thread (routine_run, and any future kind that emits without a
 * thread host) falls back to a direct thread with the sole human user — the
 * SAME `findOrCreateDirectThread` machinery `send_message` already uses,
 * over the SAME `CoreApiPort` seam, never an orchestration-side write. Only
 * a system with literally no human user row (never true in a real seeded
 * team) leaves `reply` with nowhere to post.
 */
function makeReplyTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<ReplyInput, TDb> {
	return {
		name: "reply",
		description:
			"Post a message into the conversation this session was started for. This is how you answer " +
			"the person or agent who triggered you. Takes no thread argument — it always posts to your " +
			"own calling thread (or, when the session has none, to a direct thread with the team's " +
			"human).",
		inputSchema: replyInputSchema,
		handler: async (args, ctx) => {
			const parsed = replyInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);

			let threadId = ctx.threadId;
			if (!threadId) {
				const human = await ports.coreApi.findSoleHumanUser(ctx.agentId);
				if (!human) {
					return err(
						"NO_REPLY_RECIPIENT",
						"This session has no calling thread, and no human user exists to fall back to.",
					);
				}
				({ id: threadId } = await ports.coreApi.findOrCreateDirectThread(human.id, ctx.agentId));
			}

			const created = await ports.coreApi.insertMessage(
				{
					threadId,
					type: "plain",
					payload: { text: parsed.data.text },
					clientKey: crypto.randomUUID(),
				},
				ctx.agentId,
			);
			return ok({ messageId: created.id, threadId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// write_memory
//
// @lore nested-knowledge-items: `query_practice` is DELETED — its only filter
// was `layer === 'L3'`, and layer is gone. `write_memory` drops `layer`,
// `kind`, `topic` with the vocabularies they carried; a knowledge item's
// place in the tree (not shipped here — this tool has no nesting UI) says
// what it is about, and `scope` says only who sees it. The layer-keyed
// authorisation gate (`NON_FACILITATOR_MAX_LAYER`, `FACILITATOR_ROLES`) is
// DELETED WITH NOTHING REPLACING IT — founder ruling 2026-09-02: no
// authorisation checks; risk-based review can be earned later from a real
// learning. Any agent may write anywhere its scope reaches.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_FORMATS = ["markdown", "toon"] as const;

const writeMemoryInputSchema = z.object({
	title: z.string().min(1),
	body: z.string().min(1),
	format: z.enum(KNOWLEDGE_FORMATS).optional(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
	scopeKind: z.enum(SCOPE_KINDS).optional(),
	scopeId: z.string().optional(),
});

type WriteMemoryInput = z.infer<typeof writeMemoryInputSchema>;

function makeWriteMemoryTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<WriteMemoryInput, TDb> {
	return {
		name: "write_memory",
		description:
			"Write a new knowledge item into the knowledge tree, attributed to the current agent. Returns the new item ID and version.",
		inputSchema: writeMemoryInputSchema,
		handler: async (args, ctx) => {
			const parsed = writeMemoryInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { title, body, format, status } = parsed.data;
			const requestedScopeKind = parsed.data.scopeKind;
			const requestedScopeId = parsed.data.scopeId?.trim();

			if (requestedScopeKind && SCOPES_REQUIRING_ID.has(requestedScopeKind) && !requestedScopeId) {
				return err("INVALID_INPUT", `scopeId is required for scopeKind '${requestedScopeKind}'`);
			}

			const teamId =
				ctx.teamId ??
				(await ports.coreApi
					.getTaskById(ctx.taskId, ctx.agentId)
					.then((row) => row?.teamId ?? null));
			const defaultScopeKind: ScopeKind = teamId ? "team" : "factory";
			const scopeKind = requestedScopeKind ?? defaultScopeKind;
			const scopeId =
				scopeKind === "user"
					? (requestedScopeId ?? ctx.agentId)
					: (requestedScopeId ?? (scopeKind === defaultScopeKind ? teamId : null));

			const created = await ports.coreApi.create(
				{
					title,
					body,
					format: format ?? "markdown",
					status: status ?? "proposed",
					scopeKind,
					scopeId,
					updatedBy: `agent:${ctx.agentId}`,
				},
				ctx.agentId,
			);

			return ok({ knowledgeItemId: created.id, version: created.version });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// handoff_to
// ─────────────────────────────────────────────────────────────────────────────

const HANDOFF_STATUSES = ["completed", "failed", "blocked", "in_progress"] as const;

const handoffToInputSchema = z.object({
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	contextId: z.string().min(1),
	status: z.enum(HANDOFF_STATUSES),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
	error: z.string().optional(),
});

type HandoffToInput = z.infer<typeof handoffToInputSchema>;

function makeHandoffToTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<HandoffToInput, TDb> {
	return {
		name: "handoff_to",
		description:
			"Hand off the current task to another agent (by ID), to any teammate matching a role, or to a human reviewer. Ends the current session and transfers ownership.",
		inputSchema: handoffToInputSchema,
		handler: async (args, ctx) => {
			const parsed = handoffToInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			if (!(input.toAgent || input.toRole || input.toHuman)) {
				return err("INVALID_INPUT", "One of toAgent, toRole, or toHuman must be specified");
			}

			if (input.toAgent) {
				const target = await ports.coreApi.getUserById(input.toAgent, ctx.agentId);
				if (!target) return err("NOT_FOUND", `Target agent not found: ${input.toAgent}`);
			}

			// AU21 §9 Increment 2 (org/routine/handoff wave): routes through the
			// CoreApiPort seam — the SAME `POST /tasks/:id/handoff` route a human
			// caller's client would use — instead of the raw `ports.policy.handoff`
			// DI call (deleted). The route resolves its own `SessionContext`
			// server-side from the DB session row keyed by `sessionId`, so this
			// handler no longer needs to build one locally (no `sandboxPath`/
			// `ingestion`/`traceId` to thread through the wire).
			const result = await ports.coreApi.handoffTask(
				ctx.taskId,
				{
					sessionId: ctx.sessionId,
					...(input.toAgent ? { toAgent: input.toAgent } : {}),
					...(input.toRole ? { toRole: input.toRole } : {}),
					...(input.toHuman ? { toHuman: input.toHuman } : {}),
					reason: input.reason,
					artifacts: input.artifacts ?? [],
					remainingWork: input.remainingWork ?? [],
					contextId: input.contextId,
					status: input.status,
					...(input.error !== undefined ? { error: input.error } : {}),
				},
				ctx.agentId,
			);

			return ok({
				status: result.status,
				...(result.targetAgentId ? { targetAgentId: result.targetAgentId } : {}),
				...(result.escalationItemId ? { escalationItemId: result.escalationItemId } : {}),
			});
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_item
// ─────────────────────────────────────────────────────────────────────────────

const RISK_TIERS_ITEM = ["low", "medium", "high"] as const;

// @lore AU21 Increment 14a: "cost_cap_breach" is deleted from ITEM_KINDS —
// the cost-cap breach review-item creation that produced it is gone along
// with the rest of the cost feature, no replacement.
// @lore BB1: "post-bet-retro" removed — BA9d deleted the builtin routine
// mechanism (fireBuiltinRoutine etc.) and the bet entity is gone.
const ITEM_KINDS = [
	"review",
	"skill_change",
	"knowledge",
	"work",
	"chat",
	"escalation",
	"autonomy_change",
	"ordering",
] as const;

const ITEM_VERBS = ["propose", "review", "approve", "reject", "escalate", "bet"] as const;

const createItemInputSchema = z.object({
	title: z.string().min(1),
	body: z.string().optional(),
	kind: z.enum(ITEM_KINDS).optional(),
	verb: z.enum(ITEM_VERBS).optional(),
	riskTier: z.enum(RISK_TIERS_ITEM).optional(),
	attentionScore: z.number().int().optional(),
	blocking: z.boolean().optional(),
	threadId: z.string().optional(),
	proposedAction: z.string().optional(),
	options: z.string().optional(),
	reasoning: z.string().optional(),
});

type CreateItemInput = z.infer<typeof createItemInputSchema>;

function isReviewItem(input: CreateItemInput): boolean {
	return input.kind === "review" || input.kind === "escalation" || input.verb === "review";
}

function mergeParticipants(existing: readonly string[], humanIds: readonly string[]): string[] {
	return [...new Set([...existing, ...humanIds])].sort();
}

function makeCreateItemTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateItemInput, TDb> {
	return {
		name: "create_item",
		description:
			"Create a human-facing item (review, escalation, knowledge proposal, etc.) and route it to the appropriate view based on risk tier and kind. Auto-creates a thread if none is provided.",
		inputSchema: createItemInputSchema,
		handler: async (args, ctx) => {
			const parsed = createItemInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			let threadId = input.threadId;
			if (threadId) {
				const existing = await ports.coreApi.getThreadById(threadId, ctx.agentId);
				if (!existing) return err("NOT_FOUND", `Thread not found: ${threadId}`);
			} else {
				// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
				// new `POST /threads/scaffold` route a human caller's client would use
				// — instead of the raw `ports.conversation.insertThread` DI call
				// (deleted). The route generates the thread's id server-side;
				// `created.id` replaces the client-generated `randomUUID()`.
				const created = await ports.coreApi.insertThread(
					{ hostKind: "task", hostId: ctx.taskId, participants: [ctx.agentId] },
					ctx.agentId,
				);
				threadId = created.id;
			}

			if (isReviewItem(input)) {
				const agentRow = await ports.coreApi.getUserById(ctx.agentId, ctx.agentId);
				const humanIds = await ports.coreApi.resolveReviewRecipientsForItem(
					{
						userId: ctx.agentId,
						agentRole: agentRow?.role ?? undefined,
						teamId: ctx.teamId,
					},
					ctx.agentId,
				);
				if (humanIds.length > 0) {
					const threadRow = await ports.coreApi.getThreadById(threadId, ctx.agentId);
					const currentParticipants: readonly string[] = threadRow
						? threadRow.participants
						: [ctx.agentId];
					const merged = mergeParticipants(currentParticipants, humanIds);
					await ports.coreApi.updateThread(threadId, { participants: merged }, ctx.agentId);
				}
			}

			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the
			// SAME `POST /conversations/items` route a human caller uses — instead
			// of the raw `ports.work.createItem` DI call (deleted). The route
			// generates the item's id server-side; `created.id` replaces the
			// client-generated `randomUUID()` the raw DI path used.
			const created = await ports.coreApi.createItem(
				{
					sourceAgentId: ctx.agentId,
					verb: input.verb ?? null,
					kind: input.kind ?? null,
					title: input.title,
					body: input.body ?? null,
					proposedAction: input.proposedAction ?? null,
					options: input.options ?? null,
					riskTier: input.riskTier ?? null,
					blocking: input.blocking ?? false,
					reasoning: input.reasoning ?? null,
					threadId,
				},
				ctx.agentId,
			);
			const itemId = created.id;

			// AU21 §9 Increment 2: the local `item_created` emission that used to
			// live here is DELETED — `POST /conversations/items` (the route
			// `ports.coreApi.createItem` above just called) already emits
			// `item_created` on the same `eventBus` (`routes/conversations.ts`).
			// Emitting it again here would double-fire the event for every
			// `create_item` tool call.

			// @lore AU21 §6 Decision L3: the `view` field (`ports.work.routeItem`'s
			// output) is DELETED from this result, not merely unset — traced to be
			// consumed by nothing (no persisted column, no display reader, no
			// downstream tool). `routeItem`/`route_item`/`item-router.ts` are
			// deleted outright.
			return ok({ itemId, threadId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_task
// ─────────────────────────────────────────────────────────────────────────────

const createTaskInputSchema = z.object({
	title: z.string().min(1).max(512),
	description: z.string().max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	/** Explicit parent — any depth. Omit to nest under the session's own task. */
	parentTaskId: z.string().min(1).optional(),
	/**
	 * Task ids this task waits on. While any is unfinished the new task
	 * starts in `hold` instead of `proposed`.
	 */
	dependencies: z.array(z.string()).optional(),
	/** When true, finishing this task sends it to `review` rather than `done`. */
	needsReview: z.boolean().optional(),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

function makeCreateTaskTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateTaskInput, TDb> {
	return {
		name: "create_task",
		description:
			"Create a new subtask. Supply parentTaskId to nest under any task at any depth; omit it to nest under the session's current task. The new task starts in 'proposed' state.",
		inputSchema: createTaskInputSchema,
		handler: async (args, ctx) => {
			const parsed = createTaskInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			// @lore AU21 §9 Increment 10a (Decision I): the `sourceKind ===
			// "decomposition"` fallback branch this used to have (resolving the
			// parent bet from a bet-decomposition PM turn's session context) is
			// REMOVED — the built-in bet_decomposition mechanism no longer exists,
			// so no session's `requestContext.sourceKind` can ever be
			// `"decomposition"` (the value is gone from `AgentSessionSourceKind`
			// itself, not merely unreachable).
			// @lore BB1: parentTaskId is now explicit (any depth); falls back to
			// ctx.taskId (the session's own task) when the caller omits it.
			const parentId = input.parentTaskId ?? ctx.taskId;
			if (!parentId) return err("NOT_FOUND", "Parent task not found");

			const parentTask = await ports.coreApi.getTaskById(parentId, ctx.agentId);
			if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${parentId}`);

			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
			// `POST /tasks` route a human caller uses — instead of the raw
			// `ports.work.createTask` DI call (deleted). The route generates the
			// task's id server-side; `created.id` replaces the client-generated
			// `randomUUID()` the raw DI path used.
			const created = await ports.coreApi.createTask(
				{
					parentTaskId: parentId,
					teamId: parentTask.teamId,
					title: input.title,
					description: input.description ?? null,
					doneCondition: input.doneCondition ?? null,
					ownerAgentId: ctx.agentId,
					...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
					...(input.needsReview !== undefined ? { needsReview: input.needsReview } : {}),
				},
				ctx.agentId,
			);
			const taskId = created.id;

			const event = {
				type: "task_state_changed" as const,
				streamId: taskId,
				taskId,
				fromState: "proposed",
				toState: "proposed",
				timestamp: Date.now(),
			};
			ctx.eventBus.emit(event as TaskStateChangedEvent);

			return ok({ taskId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// edit_task
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @lore BB1: this must stay field-for-field with the human `PATCH /api/tasks/:id`
 * body — the whole point of the package is one door with the same reach for
 * both. Two asymmetries were found in review and closed here: `state` was an
 * unconstrained string (the tool advertised a domain it does not have; the route
 * rejected bad values with a 400, so the schema was simply lying), and
 * `parentTaskId` could not be null, so an agent could nest a task but never
 * promote one back to a root the way a human can.
 */
const editTaskInputSchema = z.object({
	taskId: z.string().min(1),
	title: z.string().min(1).max(512).optional(),
	description: z.string().max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	ownerAgentId: z.string().min(1).optional(),
	/** `null` promotes the task to a root — the same reach the human door has. */
	parentTaskId: z.string().min(1).nullable().optional(),
	/** Task ids this task waits on. `null` clears the list. */
	dependencies: z.array(z.string()).nullable().optional(),
	state: z.enum(TASK_STATES).optional(),
	/** Moves the task within its sibling list; siblings are renumbered 0..n-1. */
	position: z.number().int().nonnegative().optional(),
	/** Flip whether finishing this task routes to `review` (true) or `done` (false). */
	needsReview: z.boolean().optional(),
});

type EditTaskInput = z.infer<typeof editTaskInputSchema>;

function makeEditTaskTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<EditTaskInput, TDb> {
	return {
		name: "edit_task",
		description:
			"Edit a task's fields. Supply any subset of title, description, doneCondition, ownerAgentId, parentTaskId, position, or state; omitted fields are unchanged. State transitions route through the task state machine. Setting position moves the task within its sibling list and renumbers siblings to a clean sequence.",
		inputSchema: editTaskInputSchema,
		handler: async (args, ctx) => {
			const parsed = editTaskInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const updates: {
				title?: string;
				description?: string | null;
				doneCondition?: string | null;
				ownerAgentId?: string | null;
				parentTaskId?: string | null;
				dependencies?: readonly string[] | null;
				state?: string;
				position?: number;
				needsReview?: boolean;
			} = {};
			if (input.title !== undefined) updates.title = input.title;
			if (input.description !== undefined) updates.description = input.description;
			if (input.doneCondition !== undefined) updates.doneCondition = input.doneCondition;
			if (input.ownerAgentId !== undefined) updates.ownerAgentId = input.ownerAgentId;
			if (input.parentTaskId !== undefined) updates.parentTaskId = input.parentTaskId;
			if (input.dependencies !== undefined) updates.dependencies = input.dependencies;
			if (input.state !== undefined) updates.state = input.state;
			if (input.position !== undefined) updates.position = input.position;
			if (input.needsReview !== undefined) updates.needsReview = input.needsReview;

			if (Object.keys(updates).length === 0) {
				return err("INVALID_INPUT", "No fields to update.");
			}

			// A rejection from the write door (e.g. a dependency cycle) must
			// reach the caller as a structured failure, not an uncaught throw —
			// `SeamRequestError.code` carries the route's machine-readable code
			// (e.g. "TASK_CYCLE") straight through.
			try {
				await ports.coreApi.updateTaskById(input.taskId, updates, ctx.agentId);
			} catch (e) {
				if (e instanceof SeamRequestError && e.code) {
					return err(e.code, e.message);
				}
				throw e;
			}
			return ok({ taskId: input.taskId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// submit_review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canvas-envelope channel: an agent attaches canvas payloads directly,
 * with no stored artifact or `create_artifact` producer required. `kind`
 * validates against the nine `REVIEW_CANVAS_KINDS`; `payload` stays opaque
 * (a malformed payload is discovered at render, by the honest per-canvas
 * fallback, not rejected here).
 */
const reviewCanvasArtifactSchema = z.object({
	id: z.string().min(1),
	tool: z.string().min(1),
	app: z.string().min(1),
	sourceHref: z.string().min(1),
	title: z.string().min(1),
	kind: z.enum(REVIEW_CANVAS_KINDS),
	payload: z.record(z.string(), z.unknown()),
});

const submitReviewInputSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).min(1).max(16),
	artifacts: z.array(reviewCanvasArtifactSchema).optional(),
	/**
	 * ID of a knowledge item produced by this task, to attach as evidence.
	 * Must exist and be parented to the calling task (parentKind="task",
	 * parentId=ctx.taskId). Replaces the deleted `artifactRef`.
	 */
	producedItemId: z.string().min(1).optional(),
});

type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

/**
 * Founder ruling 7 — a review lands in the thread the task already has, or a
 * new one attached to the task, never the bet's: a task will exist without a
 * bet, so resolving via `parentTask.rootTaskId` is not just the wrong host, it can
 * be an empty one. Extracted from the handler to keep it readable as a
 * single flow.
 */
async function resolveReviewThreadId(
	ports: ToolHandlersPorts,
	taskId: string,
	teamId: string,
	agentId: string,
	now: string,
): Promise<string> {
	const existingThread = await ports.coreApi.getFirstThreadByHost("task", taskId, agentId);
	if (existingThread) {
		if (!existingThread.participants.includes(agentId)) {
			await ports.coreApi.updateThread(
				existingThread.id,
				{ participants: [...existingThread.participants, agentId], lastActiveAt: now },
				agentId,
			);
		}
		return existingThread.id;
	}

	// @lore founder ruling — this backend is shared across an organisation's
	// teams, so a newly created review thread must be seeded with the team
	// that owns the task, never with "whichever human happens to be first in
	// the users table" (`findSoleHumanUser`'s old fallback here). That picked
	// one arbitrary person regardless of team, which put the review in one
	// human's inbox and left it absent from the right team's — the exact
	// class of unreachability this tool exists to close. Reuse
	// `resolveReviewRecipientsForItem` (already `create_item`'s seam for the
	// same decision): team humans, falling back to all humans only when the
	// team itself has none. `agentRole` is accepted for backward-compat by
	// the backing route but no longer drives the result, so it is not worth
	// an extra `getUserById` call here — pass `undefined`.
	const humanIds = await ports.coreApi.resolveReviewRecipientsForItem(
		{ userId: agentId, agentRole: undefined, teamId },
		agentId,
	);
	const participants = humanIds.length > 0 ? [...humanIds, agentId] : [agentId];
	const created = await ports.coreApi.insertThread(
		{ hostKind: "task", hostId: taskId, participants },
		agentId,
	);
	return created.id;
}

function makeSubmitReviewTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<SubmitReviewInput, TDb> {
	return {
		name: "submit_review",
		description:
			"Submit a review for the current task's work. Posts a review-type message to the task's own thread — the task's existing thread if it has one, otherwise a new thread attached to the task (never the bet's thread — a task can exist without a bet). Attach evidence either as `artifacts` — inline canvas payloads (kind is one of: outcome_summary, field_change_set, action_operation, rendered_in_context, metrics_moved, visual_diff, code_diff, batch, browser_preview; payload shape is validated at render time, not here) — or as `producedItemId`, the id of a knowledge item this task already produced via create_artifact. Evidence is optional: a review with only a title and reasoning is still a review, and is what an agent files when it wants agreement before acting rather than sign-off on something already built.",
		inputSchema: submitReviewInputSchema,
		handler: async (args, ctx) => {
			const parsed = submitReviewInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const parentTask = await ports.coreApi.getTaskById(ctx.taskId, ctx.agentId);
			if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);

			// Invariant: a review may not claim proof it does not have.
			// The named produced item must exist and be parented to the calling
			// task — the direct analogue of the old `artifactRef` check.
			if (input.producedItemId !== undefined) {
				const parent = await ports.coreApi.findKnowledgeItemParentById(
					input.producedItemId,
					ctx.agentId,
				);
				if (parent === undefined) {
					return err("NOT_FOUND", `producedItemId '${input.producedItemId}' not found`);
				}
				if (parent.parentKind !== "task" || parent.parentId !== ctx.taskId) {
					return err(
						"FORBIDDEN",
						`producedItemId '${input.producedItemId}' is not owned by task '${ctx.taskId}'`,
					);
				}
			}

			const now = new Date().toISOString();
			const threadId = await resolveReviewThreadId(
				ports,
				ctx.taskId,
				parentTask.teamId,
				ctx.agentId,
				now,
			);

			// @lore BA2: evidence is optional but the message TYPE is not. This
			// used to write a plain message when an agent supplied neither a
			// produced item nor artifacts, which silently broke the whole loop: only
			// a `review` message renders the card that carries the verdict
			// buttons, so a plain "Review requested: ..." can never be approved or
			// declined, and the session that filed it is never resumed. The link
			// row below was still written, pointing at a message no verdict can
			// ever reach. An agent asking for agreement BEFORE it acts has nothing
			// to attach yet, which is exactly the common case — so that fallback
			// broke the ordinary path and left the rare one working.
			const payload: ReviewPayload = {
				title: input.title,
				reasoning: input.reasoning,
				...(input.producedItemId !== undefined ? { producedItemId: input.producedItemId } : {}),
				...(input.artifacts ? { artifacts: input.artifacts } : {}),
			};
			// The route generates the message's id server-side; `created.id`
			// replaces the client-generated `randomUUID()` the raw DI path used.
			const created = await ports.coreApi.insertMessage(
				{ threadId, type: "review", payload: { ...payload }, clientKey: crypto.randomUUID() },
				ctx.agentId,
			);
			const messageId = created.id;

			// Which session filed this review. A verdict reads this row to know
			// which session to bring back with the answer.
			await ports.gate.linkReviewToSession(ctx.sessionId, messageId);

			await ports.coreApi.updateThread(threadId, { lastActiveAt: now }, ctx.agentId);

			// BB1: walk the parentTaskId chain to find the root task.
			let rootTaskId = ctx.taskId;
			let cursor: { parentTaskId: string | null } = parentTask;
			while (cursor.parentTaskId !== null) {
				const ancestor = await ports.coreApi.getTaskById(cursor.parentTaskId, ctx.agentId);
				if (!ancestor) break;
				rootTaskId = cursor.parentTaskId;
				cursor = ancestor;
			}

			return ok({ messageId, threadId, rootTaskId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// promote_knowledge
// ─────────────────────────────────────────────────────────────────────────────

function normalizeKnowledgeStatus(value: string): KnowledgeStatus | null {
	return (KNOWLEDGE_STATUSES as readonly string[]).includes(value)
		? (value as KnowledgeStatus)
		: null;
}

const ALLOWED_TRANSITIONS: Record<KnowledgeStatus, readonly KnowledgeStatus[]> = {
	proposed: ["active", "archived"],
	active: ["stale", "archived"],
	stale: ["active", "archived"],
	archived: [],
};

const promoteKnowledgeInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
	toStatus: z.enum(KNOWLEDGE_STATUSES),
	reason: z.string().max(65_536).optional(),
});

type PromoteKnowledgeInput = z.infer<typeof promoteKnowledgeInputSchema>;

function makePromoteKnowledgeTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<PromoteKnowledgeInput, TDb> {
	return {
		name: "promote_knowledge",
		description:
			"Transition a knowledge item's lifecycle status (proposed → active → stale → archived). Blocks promotion to 'active' if any open conflict exists on the item.",
		inputSchema: promoteKnowledgeInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const { knowledgeItemId, toStatus, reason } = args;

			const row = await ports.coreApi.findKnowledgeItemStatusById(knowledgeItemId, ctx.agentId);
			if (!row) return err("NOT_FOUND", `Knowledge item not found: ${knowledgeItemId}`);

			const normalizedFromStatus = normalizeKnowledgeStatus(row.status);
			if (!normalizedFromStatus) {
				return err("INVALID_STATE", `unknown current status: ${row.status}`);
			}

			const allowed = ALLOWED_TRANSITIONS[normalizedFromStatus] ?? [];
			if (!allowed.includes(toStatus)) {
				return err("INVALID_TRANSITION", `cannot transition ${normalizedFromStatus} → ${toStatus}`);
			}

			const editor = `agent:${ctx.agentId}`;
			// The CAS conditional-UPDATE downstream matches on the row's current
			// value, so it must be given the literal `row.status`.
			const result = await ports.coreApi.promoteKnowledgeItem(
				{
					knowledgeItemId,
					fromStatus: row.status,
					toStatus,
					reason,
					editor,
				},
				ctx.agentId,
			);

			if (!result.ok) return err(result.code, result.message);

			return ok({ knowledgeItemId, fromStatus: result.fromStatus, toStatus });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_conflict_review
// ─────────────────────────────────────────────────────────────────────────────

const createConflictReviewInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
	proposedBody: z.string().min(1).max(65_536),
	proposedMeta: z.string().max(65_536).optional(),
	versionBase: z.number().int().nonnegative(),
});

type CreateConflictReviewInput = z.infer<typeof createConflictReviewInputSchema>;

function makeCreateConflictReviewTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<CreateConflictReviewInput, TDb> {
	return {
		name: "create_conflict_review",
		description:
			"Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue.",
		inputSchema: createConflictReviewInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const item = await ports.coreApi.findKnowledgeItemVersionById(
				args.knowledgeItemId,
				ctx.agentId,
			);
			if (!item) return err("NOT_FOUND", `Knowledge item not found: ${args.knowledgeItemId}`);

			if (args.versionBase > item.version) {
				return err(
					"INVALID_INPUT",
					`versionBase ahead of current (${args.versionBase} > ${item.version})`,
				);
			}

			const proposedBy = `agent:${ctx.agentId}`;
			const existing = await ports.coreApi.findOpenConflictByItemAndProposer(
				args.knowledgeItemId,
				proposedBy,
				ctx.agentId,
			);
			if (existing) {
				return err(
					"DUPLICATE",
					`open conflict already exists from this agent on this item: ${existing.id}`,
				);
			}

			const conflictId = randomUUID();
			const now = new Date().toISOString();
			await ports.coreApi.createKnowledgeConflict(
				{
					id: conflictId,
					itemId: args.knowledgeItemId,
					versionBase: args.versionBase,
					versionCurrent: item.version,
					proposedBody: args.proposedBody,
					proposedMeta: args.proposedMeta ?? null,
					proposedBy,
					createdAt: now,
				},
				ctx.agentId,
			);

			return ok({ conflictId, itemId: args.knowledgeItemId, status: "open" as const });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// merge_knowledge
// @lore BA9d D9: restored from AU44 scope breach. Merges sourceId into target,
// appending source body behind a separator, then archives the source.
// ─────────────────────────────────────────────────────────────────────────────

const mergeKnowledgeInputSchema = z.object({
	targetId: z.string().min(1).describe("ID of the knowledge item to merge INTO"),
	sourceId: z.string().min(1).describe("ID of the knowledge item to merge FROM (will be archived)"),
});

type MergeKnowledgeInput = z.infer<typeof mergeKnowledgeInputSchema>;

function makeMergeKnowledgeTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<MergeKnowledgeInput, TDb> {
	return {
		name: "merge_knowledge",
		description:
			"Merge two knowledge items: appends the source item's body to the target item (separated by ---), then archives the source. Use when two related pieces of knowledge should live as one.",
		inputSchema: mergeKnowledgeInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const updatedBy = `agent:${ctx.agentId}`;
			const result = await ports.coreApi.mergeKnowledgeItem(
				args.targetId,
				args.sourceId,
				updatedBy,
				ctx.agentId,
			);
			return ok({ mergedId: result.id, sourceArchived: args.sourceId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// split_knowledge
// @lore BA9d D9: restored from AU44 scope breach. Splits one item into two or
// more new items, archiving the original.
// ─────────────────────────────────────────────────────────────────────────────

const splitKnowledgeItemSchema = z.object({
	title: z.string().min(1),
	body: z.string().min(1),
});

const splitKnowledgeInputSchema = z.object({
	itemId: z.string().min(1).describe("ID of the knowledge item to split (will be archived)"),
	newItems: z
		.array(splitKnowledgeItemSchema)
		.min(2)
		.describe("Two or more new items to create from this one"),
});

type SplitKnowledgeInput = z.infer<typeof splitKnowledgeInputSchema>;

function makeSplitKnowledgeTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<SplitKnowledgeInput, TDb> {
	return {
		name: "split_knowledge",
		description:
			"Split a knowledge item into two or more focused items. The original is archived; each new item starts proposed. Use when a knowledge item covers multiple distinct concerns that should be managed independently.",
		inputSchema: splitKnowledgeInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const updatedBy = `agent:${ctx.agentId}`;
			const created = await ports.coreApi.splitKnowledgeItem(
				args.itemId,
				args.newItems,
				updatedBy,
				ctx.agentId,
			);
			return ok({ originalArchived: args.itemId, createdIds: created.map((c) => c.id) });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_team
// ─────────────────────────────────────────────────────────────────────────────

const createTeamInputSchema = z.object({
	name: z.string().min(1).max(200),
	repoPath: z.string().max(500).optional(),
});

type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

function makeCreateTeamTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateTeamInput, TDb> {
	return {
		name: "create_team",
		description:
			"Create a new team. The team starts with a single agent that has no identity — give it one, or install a plugin that brings a shaped team.",
		inputSchema: createTeamInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = createTeamInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;
			const now = new Date().toISOString();

			const teamId = `team-${randomUUID()}`;
			// @lore AU44 B1: after the fold, teamMembers.id = teams.id — one entity, one id.
			// Using a separate UUID here caused a FK violation: persistScaffoldedAgents sets
			// users.teamId = teamMembersId, but only teams.id = teamId exists in `teams`.
			const teamMembersId = teamId;

			// @lore AU20 Am7 / AU44 B1: createTeam inserts one `teams` row (team_members dissolved).
			await ports.coreApi.createTeam(
				{
					id: teamId,
					name: input.name,
					phase: "build",
					factoryDbPath: input.repoPath ?? null,
					createdAt: now,
					teamMembersId,
					capacity: 5,
					// @lore BB1: activeBets removed — WIP limit is capacity counted live.
					formedAt: now,
				},
				ctx.agentId,
			);

			// @lore AU44 AU20-fd: scaffold request passes through the seam unchanged;
			// core-api resolves specs internally via `resolveAgentScaffoldSpecs`.
			const { agentIds, leadAgentId } = await ports.coreApi.scaffoldFromRequest(
				teamMembersId,
				"team_scaffold",
				input.name,
				null,
				null,
				null,
				null,
				undefined,
				ctx.agentId,
			);

			const createdAgents = await ports.coreApi.listUsersByTeam(teamMembersId, ctx.agentId);
			const roster = createdAgents.map((a) => ({
				role: a.role ?? "",
				name: a.name,
				agentId: a.id,
			}));

			const lead = leadAgentId ?? agentIds[0] ?? null;
			if (lead !== null) {
				// @lore AU20 Am7: updateTeam(teamId, {leadAgentId}) replaces setTeamMembersLeadAgent.
				await ports.coreApi.updateTeam(teamId, { leadAgentId: lead }, ctx.agentId);
			}

			ctx.eventBus.emit({
				type: "team_created",
				streamId: teamId,
				teamId,
				teamMembersId,
				agentIds,
				at: now,
			});

			return ok({ teamId, teamMembersId, agentIds, roster });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// add_agent
// ─────────────────────────────────────────────────────────────────────────────

const addAgentInputSchema = z.object({
	teamId: z.string().min(1),
	role: z.string().min(1).max(100),
	name: z.string().min(1).max(200),
	systemPrompt: z.string().max(50_000).optional(),
});

type AddAgentInput = z.infer<typeof addAgentInputSchema>;

function makeAddAgentTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<AddAgentInput, TDb> {
	return {
		name: "add_agent",
		description:
			"Add a new AI agent to an existing team with the specified role. App defaults determine the persona. If systemPrompt is provided, it overrides the default.",
		inputSchema: addAgentInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = addAgentInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const team = await ports.coreApi.getTeamById(input.teamId, ctx.agentId);
			if (!team) return err("NOT_FOUND", `Team not found: ${input.teamId}`);

			const memberGroup = await ports.coreApi.getTeamMembersByTeamId(input.teamId, ctx.agentId);
			if (!memberGroup)
				return err("NOT_FOUND", `Team membership group not found for team ${input.teamId}`);

			// @lore AU44 AU20-fd: scaffold request passes through the seam unchanged;
			// core-api resolves specs internally. systemPromptOverride passes through
			// when the caller supplied a custom prompt.
			const { agentIds } = await ports.coreApi.scaffoldFromRequest(
				memberGroup.id,
				"agent_added",
				team.name,
				input.role,
				input.name,
				null,
				null,
				input.systemPrompt,
				ctx.agentId,
			);
			const agentId = agentIds[0];
			if (!agentId) {
				return err("INTERNAL_ERROR", "App defaults returned no specs for agent_added trigger");
			}

			ctx.eventBus.emit({
				type: "agent_added",
				streamId: input.teamId,
				teamId: input.teamId,
				teamMembersId: memberGroup.id,
				agentId,
				role: input.role,
				at: new Date().toISOString(),
			});

			return ok({ agentId, name: input.name, role: input.role, teamId: input.teamId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_routine
// @lore AU44 B3: cron computation moved owner-side into insertRoutine
// (routine service). The tool no longer imports @hyperidle/cron — cron
// validation happens at the service boundary; an invalid expression returns
// INVALID_INPUT via the port.
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_TYPE_VALUES = EVENT_TYPES as readonly [string, ...string[]];

const createRoutineInputSchema = z.object({
	name: z.string().min(1).max(200),
	/** BA1 D1: renamed from `description` — 12 000 chars, the retiring trigger entity's own limit. */
	prompt: z.string().max(12_000).optional(),
	ownerAgentId: z.string().min(1),
	triggerType: z.enum(["calendar", "event"]),
	/** Required for `triggerType:"calendar"` only. */
	triggerConfig: z.string().min(1).optional(),
	/** BA1 D8: required (and validated against `EVENT_TYPES`) for `triggerType:"event"` only. */
	eventType: z.enum(EVENT_TYPE_VALUES).optional(),
});

type CreateRoutineInput = z.infer<typeof createRoutineInputSchema>;

function makeCreateRoutineTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<CreateRoutineInput, TDb> {
	return {
		name: "create_routine",
		description:
			"Create a new routine (recurring automated task) for any agent. Fires on a calendar schedule (a cron expression) or on an event (one of the platform's event types) — pick triggerType accordingly.",
		inputSchema: createRoutineInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = createRoutineInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const agent = await ports.coreApi.getUserById(input.ownerAgentId, ctx.agentId);
			if (!agent) return err("NOT_FOUND", `Agent not found: ${input.ownerAgentId}`);

			let triggerConfig: string | undefined;
			let eventType: string | undefined;
			let cronForErrorMessage: string | undefined;

			if (input.triggerType === "calendar") {
				if (!input.triggerConfig) {
					return err("INVALID_INPUT", "triggerConfig must include a cron field");
				}
				// Validate triggerConfig JSON structure — cron expression validation
				// is owner-side in insertRoutine (throws INVALID_INPUT on bad cron).
				let triggerConfigParsed: { cron?: string };
				try {
					triggerConfigParsed = JSON.parse(input.triggerConfig) as { cron?: string };
				} catch {
					return err("INVALID_INPUT", "triggerConfig must be valid JSON");
				}
				if (!triggerConfigParsed.cron) {
					return err("INVALID_INPUT", "triggerConfig must include a cron field");
				}
				triggerConfig = input.triggerConfig;
				cronForErrorMessage = triggerConfigParsed.cron;
			} else {
				// BA1 D8: `triggerType:"event"` requires `eventType`, already
				// validated against `EVENT_TYPES` by the schema.
				if (!input.eventType) {
					return err("INVALID_INPUT", 'eventType is required for triggerType:"event"');
				}
				eventType = input.eventType;
			}

			const routineId = randomUUID();

			// BA1 D5/NB2: the route's create schema is `.strict()` — only send
			// the fields it declares. `state`/`active`/`createdAt` are computed
			// by the route itself and were never read from the body even before
			// `.strict()`; sending them used to be silently dropped, now it 400s.
			let nextRunAt: string | null = null;
			try {
				nextRunAt = await ports.coreApi.insertRoutine(
					{
						id: routineId,
						name: input.name,
						prompt: input.prompt ?? null,
						ownerAgentId: input.ownerAgentId,
						triggerType: input.triggerType,
						...(triggerConfig !== undefined ? { triggerConfig } : {}),
						...(eventType !== undefined ? { eventType } : {}),
					},
					ctx.agentId,
				);
			} catch (e) {
				// Only mislabel the failure as a cron error when the thrown message is
				// actually from parseCron — DB or network errors must propagate so the
				// agent sees a 500, not a misleading "Invalid cron expression".
				if (e instanceof Error && /invalid cron/i.test(e.message)) {
					return err("INVALID_INPUT", `Invalid cron expression: ${cronForErrorMessage}`);
				}
				throw e;
			}

			return ok({ routineId, name: input.name, nextRunAt });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// update_routine
// ─────────────────────────────────────────────────────────────────────────────

const updateRoutineInputSchema = z.object({
	routineId: z.string().min(1),
	updates: z.object({
		name: z.string().min(1).max(200).optional(),
		/** BA1 D1: renamed from `description`. */
		prompt: z.string().max(12_000).optional(),
		state: z.enum(["active", "paused"]).optional(),
		triggerConfig: z.string().optional(),
	}),
});

type UpdateRoutineInput = z.infer<typeof updateRoutineInputSchema>;

function makeUpdateRoutineTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<UpdateRoutineInput, TDb> {
	return {
		name: "update_routine",
		description:
			"Update an existing routine's configuration — name, description, schedule, or state.",
		inputSchema: updateRoutineInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = updateRoutineInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const existing = await ports.coreApi.getRoutineById(input.routineId, ctx.agentId);
			if (!existing || existing.deletedAt) {
				return err("NOT_FOUND", `Routine not found: ${input.routineId}`);
			}

			const updates: Record<string, unknown> = {};
			const u = input.updates;
			if (u.name !== undefined) updates.name = u.name;
			if (u.prompt !== undefined) updates.prompt = u.prompt;
			if (u.triggerConfig !== undefined) updates.triggerConfig = u.triggerConfig;
			if (u.state !== undefined) {
				updates.state = u.state;
				updates.active = u.state === "active";
			}

			if (Object.keys(updates).length > 0) {
				await ports.coreApi.updateRoutineById(input.routineId, updates, ctx.agentId);
			}

			const updated = await ports.coreApi.getRoutineById(input.routineId, ctx.agentId);
			return ok({
				routineId: input.routineId,
				name: updated?.name ?? existing.name,
				state: updated?.state ?? existing.state,
			});
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// log_task
// ─────────────────────────────────────────────────────────────────────────────

const logTaskInputSchema = z.object({
	note: z.string().min(1).max(65_536),
});

type LogTaskInput = z.infer<typeof logTaskInputSchema>;

function makeLogTaskTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<LogTaskInput, TDb> {
	return {
		name: "log_task",
		description:
			"Append a prose note to the current task's notes column. Useful for recording mid-session discoveries, decisions, or status updates. Does not touch the audit trail.",
		inputSchema: logTaskInputSchema,
		handler: async (args, ctx) => {
			const parsed = logTaskInputSchema.safeParse(args);
			if (!parsed.success) {
				return err("INVALID_INPUT", parsed.error.message);
			}
			const { note } = parsed.data;

			const now = new Date().toISOString();
			const entry = `[${now} ${ctx.agentId}] ${note}`;

			// Atomic append — single UPDATE with SQL CASE, no pre-read, no lost-update race.
			// `undefined` means the task row was not found (WHERE matched no rows).
			const result = await ports.coreApi.appendTaskNote(ctx.taskId, entry, ctx.agentId);
			if (!result) {
				return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
			}

			return ok({ taskId: ctx.taskId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_artifact
// ─────────────────────────────────────────────────────────────────────────────

const createArtifactInputSchema = z.object({
	title: z.string().min(1).describe("Short, descriptive title for the produced item."),
	body: z
		.string()
		.min(1)
		.describe(
			"The content in markdown. " +
				"Interactive HTML (dashboards, charts, rich visualizations) goes in a fenced ```html block — " +
				"do NOT put raw HTML directly in the markdown body, it mis-derives.",
		),
});

type CreateKnowledgeItemInput = z.infer<typeof createArtifactInputSchema>;

function makeCreateArtifactTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<CreateKnowledgeItemInput, TDb> {
	return {
		name: "create_artifact",
		description:
			"Produce a knowledge item attached to the current task or conversation. " +
			"The parent is resolved from context — never passed as input.\n\n" +
			"Write the content as markdown in `body`. " +
			"For interactive HTML (a dashboard, chart or visualization the reader should SEE running), " +
			"the body must be ONE fenced ```html block and nothing else — no title line, no explanation " +
			"before or after it. That is what makes it render live. Add any prose and it becomes a code " +
			"listing of your HTML instead. Never put raw HTML straight into the markdown body.\n\n" +
			"Returns the id of the created knowledge item.",
		inputSchema: createArtifactInputSchema,
		handler: async (args, ctx) => {
			const parsed = createArtifactInputSchema.safeParse(args);
			if (!parsed.success) {
				return err("INVALID_INPUT", parsed.error.message);
			}
			const { title, body } = parsed.data;

			// @lore artifacts-become-knowledge: parent is the current task when the
			// agent is running in a task session (ctx.taskId non-empty), or the
			// calling thread when in an assistant/conversation session. Neither
			// means the produced item has nowhere to live — return an error.
			let parentKind: "task" | "thread";
			let parentId: string;
			if (ctx.taskId) {
				parentKind = "task";
				parentId = ctx.taskId;
			} else if (ctx.threadId) {
				parentKind = "thread";
				parentId = ctx.threadId;
			} else {
				return err(
					"NO_PARENT",
					"create_artifact requires an active task or a calling thread — neither is available in this context",
				);
			}

			// Scope resolution: same logic as write_memory — ctx.teamId first,
			// then task row, then fall back to factory scope.
			//
			// @lore rebase-onto-#547 / nested-knowledge-items: `SCOPE_KINDS` no
			// longer has `product` (§2) — a team-scoped produced item is `team`
			// now, scope_id unchanged, same mapping `write_memory`'s own
			// `defaultScopeKind` uses. `status: "draft"` doesn't exist either
			// (§2's collapse); `proposed` is the ladder's starting point.
			const teamId: string | null =
				ctx.teamId ??
				(ctx.taskId
					? await ports.coreApi
							.getTaskById(ctx.taskId, ctx.agentId)
							.then((row) => row?.teamId ?? null)
					: null);
			const scopeKind: ScopeKind = teamId ? "team" : "factory";
			const scopeId: string | null = teamId;

			const created = await ports.coreApi.create(
				{
					scopeKind,
					scopeId,
					title,
					body,
					format: "markdown",
					status: "proposed",
					updatedBy: `agent:${ctx.agentId}`,
					parentKind,
					parentId,
				},
				ctx.agentId,
			);

			return ok({ knowledgeItemId: created.id });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildToolDefinitions — public export #1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build all (or role-scoped) tool definitions, DI-wired to the injected ports.
 *
 * @lore AU20 Am10: collapses the former `buildAllToolDefinitions` +
 * `toolsForRoleFromPorts` into one entry. Role is a filter parameter
 * (omit → all tools); this is the `list(filter)` north-star pattern —
 * one method, zero per-role proliferation.
 *
 * @lore tool-handlers ALWAYS operates with the real `HyperIdleDb` — it is the
 * db-keeping side of the §7.5 C1 split (only `tool-provider`, agent-execution,
 * needs the generic `TDb = unknown` erasure). This function is concretely typed
 * rather than generic; each individual private maker stays generic (for
 * testability), with `TDb` inferred as `HyperIdleDb` here.
 *
 * @lore Three facilitator-only tools (`score_attention`, `promote_knowledge`,
 * `create_conflict_review`) narrow to facilitator roles — passing them to
 * builders would break G1 AC6's authorization intent. (`route_item` was a
 * fourth member of this set; deleted outright as vestigial — AU21 §6
 * Decision L3 — not merely re-narrowed.)
 */
export function buildToolDefinitions(
	ports: ToolHandlersPorts,
	opts?: { readonly role?: string },
): readonly RegisteredTool<HyperIdleDb>[] {
	const all: readonly RegisteredTool<HyperIdleDb>[] = [
		toRegistered(makeSendMessageTool(ports)),
		toRegistered(makeReplyTool(ports)),
		toRegistered(makeLogTaskTool(ports)),
		toRegistered(makeWriteMemoryTool(ports)),
		toRegistered(makeHandoffToTool(ports)),
		toRegistered(makeCreateItemTool(ports)),
		toRegistered(makeCreateTaskTool(ports)),
		toRegistered(makeEditTaskTool(ports)),
		toRegistered(makeSubmitReviewTool(ports)),
		toRegistered(makeCreateArtifactTool(ports)),
		toRegistered(makePromoteKnowledgeTool(ports)),
		toRegistered(makeCreateConflictReviewTool(ports)),
		toRegistered(makeMergeKnowledgeTool(ports)),
		toRegistered(makeSplitKnowledgeTool(ports)),
		toRegistered(makeCreateTeamTool(ports)),
		toRegistered(makeAddAgentTool(ports)),
		toRegistered(makeCreateRoutineTool(ports)),
		toRegistered(makeUpdateRoutineTool(ports)),
	];
	if (opts?.role !== undefined) {
		const role = opts.role;
		return all.filter((d) => d.roles === undefined || d.roles.includes(role));
	}
	return all;
}
