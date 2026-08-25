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
	ARTIFACT_KINDS,
	ARTIFACT_VIEW_SHAPES,
	artifactPreviewSchema,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_STATUSES,
	type KnowledgeLayer,
	type KnowledgeStatus,
	type ReviewPayload,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	type ScopeKind,
} from "@hyperidle/domain-model";
import {
	type ArtifactCreatedEvent,
	EVENT_TYPES,
	type TaskStateChangedEvent,
} from "@hyperidle/event-bus";
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
 * kind with a calling thread (task_run/session_start/reengagement/
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
		// @lore AU27 C11 (Decision 1): `reversibility: "reversible"` is required,
		// not decorative. `classifyReversibility` fails CLOSED to "irreversible"
		// when a tool declares no signal — under an AL7 `sessionWorkflow`, an
		// undeclared `reply` would route every reply to human review.
		reversibility: "reversible",
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
// query_practice
// ─────────────────────────────────────────────────────────────────────────────

const queryPracticeInputSchema = z.object({
	query: z.string().min(1),
	layer: z.enum(KNOWLEDGE_LAYERS).optional(),
	limit: z.number().int().positive().max(100).optional(),
});

type QueryPracticeInput = z.infer<typeof queryPracticeInputSchema>;

function makeQueryPracticeTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<QueryPracticeInput, TDb> {
	return {
		name: "query_practice",
		description:
			"Search the knowledge fabric for L3 practices (defaults to layer L3) matching a free-text query. Use to discover prior patterns, decisions, or reflections before starting work.",
		inputSchema: queryPracticeInputSchema,
		handler: async (args, ctx) => {
			const parsed = queryPracticeInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { query, layer = "L3", limit = 20 } = parsed.data;
			const allMatches = await ports.coreApi.search(query, { limit: limit * 5 }, ctx.agentId);
			const items = allMatches.filter((item) => item.layer === layer).slice(0, limit);
			return ok({ items });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// write_memory
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_KINDS = [
	"pattern",
	"anti_pattern",
	"brief",
	"principle",
	"decision",
	"failure",
	"reflection",
	"focus",
] as const;

const KNOWLEDGE_FORMATS = ["markdown", "toon"] as const;

const writeMemoryInputSchema = z.object({
	layer: z.enum(KNOWLEDGE_LAYERS),
	kind: z.enum(KNOWLEDGE_KINDS),
	title: z.string().min(1),
	body: z.string().min(1),
	topic: z.string().optional(),
	format: z.enum(KNOWLEDGE_FORMATS).optional(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
	scopeKind: z.enum(SCOPE_KINDS).optional(),
	scopeId: z.string().optional(),
});

type WriteMemoryInput = z.infer<typeof writeMemoryInputSchema>;

const FACILITATOR_ROLES: ReadonlySet<string> = new Set([
	"assistant",
	"facilitator",
	"product_manager",
]);

const NON_FACILITATOR_MAX_LAYER: ReadonlySet<KnowledgeLayer> = new Set(["L0", "L1", "L2"]);

function makeWriteMemoryTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<WriteMemoryInput, TDb> {
	return {
		name: "write_memory",
		description:
			"Write a new knowledge item (pattern, decision, reflection, etc.) into the knowledge fabric, attributed to the current agent. Returns the new item ID and version.",
		inputSchema: writeMemoryInputSchema,
		handler: async (args, ctx) => {
			const parsed = writeMemoryInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { layer, kind, title, body, topic, format, status } = parsed.data;
			const requestedScopeKind = parsed.data.scopeKind;
			const requestedScopeId = parsed.data.scopeId?.trim();

			if (requestedScopeKind && SCOPES_REQUIRING_ID.has(requestedScopeKind) && !requestedScopeId) {
				return err("INVALID_INPUT", `scopeId is required for scopeKind '${requestedScopeKind}'`);
			}

			if (!NON_FACILITATOR_MAX_LAYER.has(layer)) {
				const agent = await ports.coreApi.getUserById(ctx.agentId, ctx.agentId);
				const role = agent?.role ?? "";
				if (!FACILITATOR_ROLES.has(role)) {
					return err("FORBIDDEN", `insufficient role for ${layer}`);
				}
			}

			const teamId =
				ctx.teamId ??
				(await ports.coreApi
					.getTaskById(ctx.taskId, ctx.agentId)
					.then((row) => row?.teamId ?? null));
			const defaultScopeKind: ScopeKind = teamId ? "product" : "factory";
			const scopeKind = requestedScopeKind ?? defaultScopeKind;
			const scopeId =
				scopeKind === "user"
					? (requestedScopeId ?? ctx.agentId)
					: (requestedScopeId ?? (scopeKind === defaultScopeKind ? teamId : null));

			const created = await ports.coreApi.create(
				{
					layer,
					kind,
					title,
					body,
					topic: topic ?? null,
					format: format ?? "markdown",
					status: status ?? "draft",
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
const ITEM_KINDS = [
	"review",
	"skill_change",
	"knowledge",
	"work",
	"chat",
	"escalation",
	"autonomy_change",
	"ordering",
	"post-bet-retro",
] as const;

const ITEM_VERBS = ["propose", "review", "approve", "reject", "escalate", "bet"] as const;

const createItemInputSchema = z.object({
	title: z.string().min(1),
	body: z.string().optional(),
	kind: z.enum(ITEM_KINDS).optional(),
	verb: z.enum(ITEM_VERBS).optional(),
	layer: z.string().optional(),
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
					layer: input.layer ?? null,
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
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

function makeCreateTaskTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateTaskInput, TDb> {
	return {
		name: "create_task",
		description:
			"Create a new task under the current bet. Derives betId and teamId from the session context. The new task starts in 'proposed' state.",
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
			let parent: { betId: string; teamId: string };
			if (ctx.taskId) {
				const parentTask = await ports.coreApi.getTaskById(ctx.taskId, ctx.agentId);
				if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
				parent = { betId: parentTask.betId, teamId: parentTask.teamId };
			} else {
				return err("NOT_FOUND", "Parent task not found");
			}

			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
			// `POST /tasks` route a human caller uses — instead of the raw
			// `ports.work.createTask` DI call (deleted). The route generates the
			// task's id server-side; `created.id` replaces the client-generated
			// `randomUUID()` the raw DI path used.
			const created = await ports.coreApi.createTask(
				{
					betId: parent.betId,
					title: input.title,
					description: input.description ?? null,
					doneCondition: input.doneCondition ?? null,
					ownerAgentId: ctx.agentId,
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

			return ok({ taskId, betId: parent.betId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// submit_review
// ─────────────────────────────────────────────────────────────────────────────

const artifactRefSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(ARTIFACT_VIEW_SHAPES),
});

const submitReviewInputSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).min(1).max(16),
	artifactRef: artifactRefSchema.optional(),
});

type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

function makeSubmitReviewTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<SubmitReviewInput, TDb> {
	return {
		name: "submit_review",
		description:
			"Submit a review for the current bet's work. Posts a review-type message to the bet's host thread. If no artifactRef is provided, falls back to a plain message with the review summary.",
		inputSchema: submitReviewInputSchema,
		handler: async (args, ctx) => {
			const parsed = submitReviewInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const parentTask = await ports.coreApi.getTaskById(ctx.taskId, ctx.agentId);
			if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
			const betId = parentTask.betId;

			const now = new Date().toISOString();
			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
			// routes a human caller's client would use — instead of the raw
			// `ports.conversation` DI calls (deleted).
			const existingThread = await ports.coreApi.getFirstThreadByHost("bet", betId, ctx.agentId);

			let threadId: string;
			if (existingThread) {
				threadId = existingThread.id;
				if (!existingThread.participants.includes(ctx.agentId)) {
					await ports.coreApi.updateThread(
						threadId,
						{ participants: [...existingThread.participants, ctx.agentId], lastActiveAt: now },
						ctx.agentId,
					);
				}
			} else {
				const created = await ports.coreApi.insertThread(
					{ hostKind: "bet", hostId: betId, participants: [ctx.agentId] },
					ctx.agentId,
				);
				threadId = created.id;
			}

			// The route generates the message's id server-side; `created.id`
			// replaces the client-generated `randomUUID()` the raw DI path used.
			let created: { readonly id: string };
			if (input.artifactRef) {
				const payload: ReviewPayload = {
					title: input.title,
					reasoning: input.reasoning,
					artifactRef: input.artifactRef,
				};
				created = await ports.coreApi.insertMessage(
					{ threadId, type: "review", payload: { ...payload }, clientKey: crypto.randomUUID() },
					ctx.agentId,
				);
			} else {
				const text = `Review requested: ${input.title}\n\n${input.reasoning.join("\n")}`;
				created = await ports.coreApi.insertMessage(
					{ threadId, type: "plain", payload: { text }, clientKey: crypto.randomUUID() },
					ctx.agentId,
				);
			}
			const messageId = created.id;

			await ports.coreApi.updateThread(threadId, { lastActiveAt: now }, ctx.agentId);

			return ok({ messageId, threadId, betId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// score_attention
// ─────────────────────────────────────────────────────────────────────────────

const scoreAttentionInputSchema = z
	.object({
		target: z.enum(["item", "knowledge_item"]),
		id: z.string().min(1),
		score: z.number().min(0).max(1).optional(),
		mode: z.enum(["override", "recompute"]).optional(),
	})
	.superRefine((val, ctx) => {
		const mode = val.mode ?? "override";
		if (mode === "recompute" && val.score !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["score"],
				message: "'score' must be omitted when mode='recompute' (engine computes the score)",
			});
		}
		if (mode !== "recompute" && val.score === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["score"],
				message: "'score' is required when mode='override' (the default)",
			});
		}
	});

type ScoreAttentionInput = z.infer<typeof scoreAttentionInputSchema>;

function makeScoreAttentionTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<ScoreAttentionInput, TDb> {
	return {
		name: "score_attention",
		description:
			"Set an attention score on an item or knowledge_item. Two modes: 'override' (default; uses the provided score directly — G1 behavior) and 'recompute' (runs the G2 attention engine; ignores the provided score; knowledge_item only).",
		inputSchema: scoreAttentionInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const { target, id } = args;
			const mode = args.mode ?? "override";

			if (mode === "recompute") {
				if (target !== "knowledge_item") {
					return err(
						"INVALID_INPUT",
						"recompute mode is only supported for target='knowledge_item'",
					);
				}
				const existing = await ports.coreApi.findKnowledgeItemVersionById(id, ctx.agentId);
				if (!existing) return err("NOT_FOUND", `Knowledge item not found: ${id}`);
				const result = await ports.coreApi.recomputeAttentionScoreForItem(id, ctx.agentId);
				return ok({ target, id, score: result.current, mode });
			}

			if (args.score === undefined) {
				return err("INVALID_INPUT", "'score' is required when mode='override'");
			}
			const score = args.score;

			if (target === "knowledge_item") {
				const row = await ports.coreApi.findKnowledgeItemVersionById(id, ctx.agentId);
				if (!row) return err("NOT_FOUND", `Knowledge item not found: ${id}`);
				await ports.coreApi.upsertKnowledgeAppProjectionAttentionScore(
					id,
					String(score),
					ctx.agentId,
				);
				return ok({ target, id, score, mode });
			}

			const row = await ports.coreApi.getItemById(id, ctx.agentId);
			if (!row) return err("NOT_FOUND", `Item not found: ${id}`);
			// @lore O2: items.attentionScore removed — no-op on items score writes.
			return ok({ target, id, score, mode });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// promote_knowledge
// ─────────────────────────────────────────────────────────────────────────────

type AnyKnowledgeStatus = KnowledgeStatus | KernelKnowledgeStatus;

function isAnyKnowledgeStatus(value: string): value is AnyKnowledgeStatus {
	return (
		(KNOWLEDGE_STATUSES as readonly string[]).includes(value) ||
		(KERNEL_KNOWLEDGE_STATUSES as readonly string[]).includes(value)
	);
}

const ALLOWED_TRANSITIONS: Record<AnyKnowledgeStatus, readonly AnyKnowledgeStatus[]> = {
	draft: ["active", "captured", "archived"],
	captured: ["provisional"],
	provisional: ["validated", "archived", "needs_human"],
	validated: ["active", "archived"],
	active: ["stale", "archived"],
	stale: ["active", "archived"],
	archived: [],
	needs_human: [],
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
			"Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item.",
		inputSchema: promoteKnowledgeInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const { knowledgeItemId, toStatus, reason } = args;

			const row = await ports.coreApi.findKnowledgeItemStatusById(knowledgeItemId, ctx.agentId);
			if (!row) return err("NOT_FOUND", `Knowledge item not found: ${knowledgeItemId}`);

			if (!isAnyKnowledgeStatus(row.status)) {
				return err("INVALID_STATE", `unknown current status: ${row.status}`);
			}
			const fromStatus: AnyKnowledgeStatus = row.status;

			const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
			if (!allowed.includes(toStatus)) {
				return err("INVALID_TRANSITION", `cannot transition ${fromStatus} → ${toStatus}`);
			}

			const editor = `agent:${ctx.agentId}`;
			const result = await ports.coreApi.promoteKnowledgeItem(
				{
					knowledgeItemId,
					fromStatus,
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
// create_team
// ─────────────────────────────────────────────────────────────────────────────

const createTeamInputSchema = z.object({
	name: z.string().min(1).max(200),
	functions: z.array(z.string().min(1)).min(1).max(20),
	repoPath: z.string().max(500).optional(),
});

type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

function makeCreateTeamTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateTeamInput, TDb> {
	return {
		name: "create_team",
		description:
			"Create a new team with the specified functions. Automatically generates an app-default agent roster with appropriate system prompt templates.",
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
					functions: JSON.stringify(input.functions),
					factoryDbPath: input.repoPath ?? null,
					createdAt: now,
					teamMembersId,
					capacity: 5,
					activeBets: 0,
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
				input.functions,
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

			{
				const ownerByRole: Partial<Record<string, string>> = {};
				for (const { role, agentId } of roster) {
					if (role && !ownerByRole[role]) {
						ownerByRole[role] = agentId;
					}
				}
				await ports.coreApi.provisionTeamRoutines(
					{
						teamId,
						ownerByRole,
						leadAgentId: lead ?? agentIds[0] ?? "",
					},
					ctx.agentId,
				);
			}

			ctx.eventBus.emit({
				type: "team_created",
				streamId: teamId,
				teamId,
				teamMembersId,
				functions: input.functions,
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
				null,
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
// create_bet
// ─────────────────────────────────────────────────────────────────────────────

const createBetInputSchema = z.object({
	teamId: z.string().min(1),
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type CreateBetInput = z.infer<typeof createBetInputSchema>;

function makeCreateBetTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<CreateBetInput, TDb> {
	return {
		name: "create_bet",
		description:
			"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
		inputSchema: createBetInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = createBetInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const team = await ports.coreApi.getTeamById(input.teamId, ctx.agentId);
			if (!team) return err("NOT_FOUND", `Team not found: ${input.teamId}`);

			// AU21 §9 Increment 1: routes through the CoreApiPort write seam — the
			// SAME `POST /bets` route + middleware a human caller uses — instead of
			// the raw `ports.work.createBet` DI call (deleted). `ctx.agentId`
			// carries the calling agent's own identity as the route actor (§12).
			const created = await ports.coreApi.createBet(
				{
					teamId: input.teamId,
					description: input.description,
					doneCondition: input.doneCondition ?? null,
					hypothesis: input.hypothesis ?? null,
				},
				ctx.agentId,
			);

			return ok({ betId: created.id, status: "draft" as const, teamId: created.teamId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// edit_bet
// ─────────────────────────────────────────────────────────────────────────────

const editBetInputSchema = z.object({
	betId: z.string().min(1),
	description: z.string().min(1).max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type EditBetInput = z.infer<typeof editBetInputSchema>;

function makeEditBetTool<TDb>(ports: ToolHandlersPorts): ToolDefinition<EditBetInput, TDb> {
	return {
		name: "edit_bet",
		description:
			"Edit a bet's description, done condition, or hypothesis. HIGH RISK: requires human approval.",
		inputSchema: editBetInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = editBetInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const existing = await ports.coreApi.getBetById(input.betId, ctx.agentId);
			if (!existing) return err("NOT_FOUND", `Bet not found: ${input.betId}`);
			if (existing.status !== "draft") return err("INVALID_STATE", "Can only edit a draft bet.");

			const updates: Partial<{
				description: string;
				doneCondition: string | null;
				hypothesis: string | null;
			}> = {};
			if (input.description !== undefined) updates.description = input.description;
			if (input.doneCondition !== undefined) updates.doneCondition = input.doneCondition;
			if (input.hypothesis !== undefined) updates.hypothesis = input.hypothesis;

			if (Object.keys(updates).length === 0) {
				return err("INVALID_INPUT", "No fields to update.");
			}

			await ports.coreApi.updateBetById(input.betId, updates, ctx.agentId);
			return ok({ betId: input.betId });
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
	kind: z
		.enum(ARTIFACT_KINDS)
		.describe(
			"The fundamental content type. Determines the review experience:\n" +
				"- 'text': markdown/prose (contracts, emails, decisions, analyses)\n" +
				"- 'code': source code diffs\n" +
				"- 'image': visual assets (screenshots, designs, diagrams)\n" +
				"- 'data': structured metrics and tables\n" +
				"- 'html': rich rendered content (dashboards, charts, visualizations)\n" +
				"- 'url': references to external resources (deployed services, PRs)",
		),
	label: z
		.string()
		.regex(/^[a-z][a-z0-9_]*$/, "Label must be lowercase_snake_case")
		.max(64)
		.optional()
		.nullable()
		.describe(
			"Optional business-domain tag (e.g., 'contract', 'email', 'dashboard'). Does not affect rendering.",
		),
	preview: artifactPreviewSchema.nullable(),
});

type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;

function makeCreateArtifactTool<TDb>(
	ports: ToolHandlersPorts,
): ToolDefinition<CreateArtifactInput, TDb> {
	return {
		name: "create_artifact",
		description:
			"Record an artifact produced by the current agent session. " +
			"The artifact is linked to the current task via context — the producingTaskId is never taken from input.\n\n" +
			"Kind determines the review experience:\n" +
			"- 'text': markdown/prose (contracts, emails, decisions, analyses)\n" +
			"- 'code': source code diffs\n" +
			"- 'image': visual assets (screenshots, designs, diagrams)\n" +
			"- 'data': structured metrics and tables\n" +
			"- 'html': rich rendered content (dashboards, charts, visualizations)\n" +
			"- 'url': references to external resources (deployed services, PRs)\n\n" +
			"Optional label provides business context (e.g., label='contract' on a text artifact).",
		inputSchema: createArtifactInputSchema,
		handler: async (args, ctx) => {
			const parsed = createArtifactInputSchema.safeParse(args);
			if (!parsed.success) {
				return err("INVALID_INPUT", parsed.error.message);
			}
			const input = parsed.data;

			if (input.preview !== null && input.preview.kind !== input.kind) {
				return err(
					"KIND_MISMATCH",
					`Preview kind '${input.preview.kind}' does not match artifact kind '${input.kind}'`,
				);
			}

			const taskRow = await ports.coreApi.getTaskById(ctx.taskId, ctx.agentId);
			if (!taskRow) {
				return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
			}

			// AU21 §9 Increment 2: routes through the CoreApiPort seam — the SAME
			// `POST /artifacts` route a human caller uses — instead of the raw
			// `ports.work.createArtifact` DI call (deleted). The route generates
			// the artifact's id server-side; `created.id` replaces the
			// client-generated `randomUUID()` the raw DI path used. `preview` is
			// re-spread into a fresh object literal — Mechanism C's opaque
			// `Record<string, unknown>` seam shape (same idiom as
			// `tool-handlers-bindings.ts`'s `searchKnowledgeForTool`).
			const created = await ports.coreApi.createArtifact(
				{
					producingTaskId: ctx.taskId,
					kind: input.kind,
					label: input.label ?? null,
					preview: input.preview !== null ? { ...input.preview } : null,
				},
				ctx.agentId,
			);
			const artifactId = created.id;

			const event: ArtifactCreatedEvent = {
				type: "artifact_created",
				streamId: randomUUID(),
				artifactId,
				taskId: ctx.taskId,
				kind: input.kind,
				timestamp: Date.now(),
			};
			ctx.eventBus.emit(event);

			return ok({ artifactId, kind: input.kind });
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
		toRegistered(makeQueryPracticeTool(ports)),
		toRegistered(makeWriteMemoryTool(ports)),
		toRegistered(makeHandoffToTool(ports)),
		toRegistered(makeCreateItemTool(ports)),
		toRegistered(makeCreateTaskTool(ports)),
		toRegistered(makeSubmitReviewTool(ports)),
		toRegistered(makeCreateArtifactTool(ports)),
		toRegistered(makeScoreAttentionTool(ports)),
		toRegistered(makePromoteKnowledgeTool(ports)),
		toRegistered(makeCreateConflictReviewTool(ports)),
		toRegistered(makeCreateTeamTool(ports)),
		toRegistered(makeAddAgentTool(ports)),
		toRegistered(makeCreateBetTool(ports)),
		toRegistered(makeEditBetTool(ports)),
		toRegistered(makeCreateRoutineTool(ports)),
		toRegistered(makeUpdateRoutineTool(ports)),
	];
	if (opts?.role !== undefined) {
		const role = opts.role;
		return all.filter((d) => d.roles === undefined || d.roles.includes(role));
	}
	return all;
}
