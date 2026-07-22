/**
 * tool-definitions — AU20 Stage 2 destructive rewrite (finalised in Stage 3).
 *
 * ALL 22 tool implementations live here as private functions. The public
 * surface is exactly two exported functions:
 *   - buildToolDefinitions(ports, opts?)
 *   - buildAssistantDraftRegistry(ctx, params, ports)
 *
 * All per-tool factory files (`createXxxTool`) are DELETED — including
 * `log-task.ts` and `create-artifact.ts` which were kept in Stage 2 because
 * completeness-contract tests imported them directly. Stage 3 migrated those
 * tests to drive `buildToolDefinitions`, completing the collapse.
 *
 * @lore AU20 Stage 2: `parseCron`/`nextCronMatch` removed from the dispatch
 * port — they are pure utilities now in `@hyperidle/shared`; `create_routine`
 * imports them directly, no dispatch back-edge needed.
 */

import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	ARTIFACT_KINDS,
	ARTIFACT_VIEW_SHAPES,
	type ArtifactCreatedEvent,
	type AssistantToolShape,
	artifactPreviewSchema,
	err,
	type ItemCreatedEvent,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_STATUSES,
	type KnowledgeLayer,
	type KnowledgeStatus,
	nextCronMatch,
	ok,
	parseCron,
	type RegisteredTool,
	type ReviewPayload,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	type ScopeKind,
	type TaskStateChangedEvent,
	type ToolContext,
	type ToolDefinition,
	type ToolRegistry,
	toClaudeToolSpec,
	toolsForRole,
	toRegistered,
	type UserRole,
	wrapForRegistry,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

// ─────────────────────────────────────────────────────────────────────────────
// read_inbox
// ─────────────────────────────────────────────────────────────────────────────

const readInboxInputSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
});

type ReadInboxInput = z.infer<typeof readInboxInputSchema>;

function makeReadInboxTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<ReadInboxInput, TDb> & { readonly reversibility: "reversible" } {
	return {
		name: "read_inbox",
		description: "Read messages from the current agent's inbox, ordered newest first.",
		inputSchema: readInboxInputSchema,
		reversibility: "reversible",
		handler: async (args, ctx) => {
			const parsed = readInboxInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const limit = parsed.data.limit ?? 50;
			const rows = await ports.conversation.listInboxBySenderExclusion(
				ctx.db,
				ctx.agentId,
				limit * 4,
			);
			const filtered = rows
				.filter((row) => {
					try {
						const parts = JSON.parse(row.participants) as string[];
						return parts.includes(ctx.agentId);
					} catch {
						return false;
					}
				})
				.slice(0, limit)
				.map((row) => row.message);
			return ok({ messages: filtered });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// send_message
// ─────────────────────────────────────────────────────────────────────────────

const sendMessageInputSchema = z.object({
	to: z.string().min(1),
	subject: z.string().optional(),
	body: z.string().min(1),
});

type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

function makeSendMessageTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<SendMessageInput, TDb> {
	return {
		name: "send_message",
		description:
			"Send a direct message to another agent. Reuses an existing direct thread when one exists between the two agents, otherwise creates a new one.",
		inputSchema: sendMessageInputSchema,
		handler: async (args, ctx) => {
			const parsed = sendMessageInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { to, subject, body } = parsed.data;
			const recipient = await ports.users.getUserById(ctx.db, to);
			if (!recipient) return err("NOT_FOUND", `Recipient agent not found: ${to}`);
			const now = new Date().toISOString();
			const threadId = await ports.conversation.findOrCreateDirectThread(
				ctx.db,
				ctx.agentId,
				to,
				now,
			);
			const messageId = crypto.randomUUID();
			const text = subject ? `${subject}\n\n${body}` : body;
			await ports.conversation.insertMessage(ctx.db, {
				id: messageId,
				senderId: ctx.agentId,
				threadId,
				type: "plain",
				payload: JSON.stringify({ text }),
				clientKey: messageId,
				createdAt: now,
			});
			return ok({ messageId, threadId });
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
	ports: ToolHandlersPorts<TDb>,
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
			const allMatches = await ports.knowledge.search(ctx.db, query, { limit: limit * 5 });
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

function makeWriteMemoryTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<WriteMemoryInput, TDb> {
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
				const agent = await ports.users.getUserById(ctx.db, ctx.agentId);
				const role = agent?.role ?? "";
				if (!FACILITATOR_ROLES.has(role)) {
					return err("FORBIDDEN", `insufficient role for ${layer}`);
				}
			}

			const teamId =
				ctx.teamId ??
				(await ports.work.getTaskById(ctx.db, ctx.taskId).then((row) => row?.teamId ?? null));
			const defaultScopeKind: ScopeKind = teamId ? "product" : "factory";
			const scopeKind = requestedScopeKind ?? defaultScopeKind;
			const scopeId =
				scopeKind === "user"
					? (requestedScopeId ?? ctx.agentId)
					: (requestedScopeId ?? (scopeKind === defaultScopeKind ? teamId : null));

			const created = await ports.knowledge.create(ctx.db, {
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
			});

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

function makeHandoffToTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<HandoffToInput, TDb> {
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
				const target = await ports.users.getUserById(ctx.db, input.toAgent);
				if (!target) return err("NOT_FOUND", `Target agent not found: ${input.toAgent}`);
			}

			const metadata = {
				context_id: input.contextId,
				status: input.status,
				reason: input.reason,
				artifacts: input.artifacts ?? [],
				remaining_work: input.remainingWork ?? [],
				...(input.error !== undefined ? { error: input.error } : {}),
			};

			const sessionContext = {
				sessionId: ctx.sessionId,
				agentId: ctx.agentId,
				taskId: ctx.taskId,
				sandboxPath: ctx.sandboxPath,
				ingestion: ctx.ingestion,
				traceId: randomUUID(),
			};

			const params = {
				sessionContext,
				metadata,
				...(input.toAgent ? { toAgent: input.toAgent } : {}),
				...(input.toRole ? { toRole: input.toRole } : {}),
				...(input.toHuman ? { toHuman: input.toHuman } : {}),
			};

			const result = await ports.policy.handoff(ctx.db, ctx.eventBus, params);

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

const ITEM_KINDS = [
	"review",
	"skill_change",
	"knowledge",
	"work",
	"chat",
	"escalation",
	"cost_cap_breach",
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
	costEstimate: z.number().int().optional(),
});

type CreateItemInput = z.infer<typeof createItemInputSchema>;

function isReviewItem(input: CreateItemInput): boolean {
	return input.kind === "review" || input.kind === "escalation" || input.verb === "review";
}

function mergeParticipants(existing: readonly string[], humanIds: readonly string[]): string[] {
	return [...new Set([...existing, ...humanIds])].sort();
}

function makeCreateItemTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateItemInput, TDb> {
	return {
		name: "create_item",
		description:
			"Create a human-facing item (review, escalation, knowledge proposal, etc.) and route it to the appropriate view based on risk tier and kind. Auto-creates a thread if none is provided.",
		inputSchema: createItemInputSchema,
		handler: async (args, ctx) => {
			const parsed = createItemInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;
			const now = new Date().toISOString();

			let threadId = input.threadId;
			if (threadId) {
				const existing = await ports.conversation.getThreadById(ctx.db, threadId);
				if (!existing) return err("NOT_FOUND", `Thread not found: ${threadId}`);
			} else {
				threadId = randomUUID();
				await ports.conversation.insertThread(ctx.db, {
					id: threadId,
					hostKind: "task",
					hostId: ctx.taskId,
					initiatorId: ctx.agentId,
					participants: JSON.stringify([ctx.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});
			}

			if (isReviewItem(input)) {
				const agentRow = await ports.users.getUserById(ctx.db, ctx.agentId);
				const humanIds = await ports.org.resolveReviewRecipientsForItem(ctx.db, {
					userId: ctx.agentId,
					agentRole: agentRow?.role ?? undefined,
					teamId: ctx.teamId,
				});
				if (humanIds.length > 0) {
					const threadRow = await ports.conversation.getThreadById(ctx.db, threadId);
					const currentParticipants: string[] = threadRow
						? (JSON.parse(threadRow.participants) as string[])
						: [ctx.agentId];
					const merged = mergeParticipants(currentParticipants, humanIds);
					await ports.conversation.updateThread(ctx.db, threadId, {
						participants: JSON.stringify(merged),
					});
				}
			}

			const itemId = randomUUID();
			await ports.work.createItem(ctx.db, {
				id: itemId,
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
				createdAt: now,
			});

			const view = ports.work.routeItem({
				riskTier: input.riskTier ?? null,
				kind: input.kind ?? null,
				verb: input.verb ?? null,
			});

			const event = {
				type: "item_created" as const,
				streamId: randomUUID(),
				itemId,
				conversationId: threadId,
				kind: input.kind ?? "unknown",
				timestamp: Date.now(),
			};
			ctx.eventBus.emit(event as ItemCreatedEvent);

			return ok({ itemId, view, threadId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// write_session_notes
// @lore AU19 Increment 4: `sessions` is `UNOWNED_SHARED_TABLES` — direct
// `@hyperidle/db` access is legal here; typed concretely as HyperIdleDb.
// ─────────────────────────────────────────────────────────────────────────────

const writeSessionNotesInputSchema = z.object({
	notes: z.string().min(1),
	append: z.boolean().optional(),
});

type WriteSessionNotesInput = z.infer<typeof writeSessionNotesInputSchema>;

function makeWriteSessionNotesTool(): ToolDefinition<WriteSessionNotesInput, HyperIdleDb> & {
	readonly reversibility: "reversible";
} {
	return {
		name: "write_session_notes",
		description:
			"Persist session reflections to work/session-notes.md in the agent's workspace. Set append=true to concatenate onto existing notes; default overwrites.",
		inputSchema: writeSessionNotesInputSchema,
		reversibility: "reversible",
		handler: async (args, ctx) => {
			const parsed = writeSessionNotesInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const { notes, append } = parsed.data;

			const workDir = path.join(ctx.sandboxPath, "work");
			fs.mkdirSync(workDir, { recursive: true });
			const filePath = path.join(workDir, "session-notes.md");

			let bodyOnDisk = notes;
			if (append && fs.existsSync(filePath)) {
				const existing = fs.readFileSync(filePath, "utf-8");
				bodyOnDisk = `${existing}\n\n${notes}`;
			}
			fs.writeFileSync(filePath, bodyOnDisk, "utf-8");

			await ctx.db
				.update(sessions)
				.set({ notes: bodyOnDisk })
				.where(eq(sessions.id, ctx.sessionId));

			const bytesWritten = Buffer.byteLength(bodyOnDisk, "utf-8");
			return ok({ sessionId: ctx.sessionId, bytesWritten });
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

function makeCreateTaskTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateTaskInput, TDb> {
	return {
		name: "create_task",
		description:
			"Create a new task under the current bet. Derives betId and teamId from the session context. The new task starts in 'proposed' state.",
		inputSchema: createTaskInputSchema,
		handler: async (args, ctx) => {
			const parsed = createTaskInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			let parent: { betId: string; teamId: string };
			if (ctx.taskId) {
				const parentTask = await ports.work.getTaskById(ctx.db, ctx.taskId);
				if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
				parent = { betId: parentTask.betId, teamId: parentTask.teamId };
			} else if (ctx.requestContext?.sourceKind === "decomposition") {
				const { betId, teamId } = ctx.requestContext.sourceCorrelation as {
					readonly betId: string;
					readonly teamId: string;
				};
				const bet = await ports.work.getBetById(ctx.db, betId);
				if (!bet) return err("NOT_FOUND", `Bet not found: ${betId}`);
				parent = { betId, teamId };
			} else {
				return err("NOT_FOUND", "Parent task not found");
			}

			const taskId = randomUUID();
			const now = new Date().toISOString();
			await ports.work.createTask(ctx.db, {
				id: taskId,
				betId: parent.betId,
				teamId: parent.teamId,
				ownerAgentId: ctx.agentId,
				title: input.title,
				description: input.description ?? null,
				doneCondition: input.doneCondition ?? null,
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			});

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
	ports: ToolHandlersPorts<TDb>,
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

			const parentTask = await ports.work.getTaskById(ctx.db, ctx.taskId);
			if (!parentTask) return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
			const betId = parentTask.betId;

			const now = new Date().toISOString();
			const existingThread = await ports.conversation.getFirstThreadByHost(ctx.db, "bet", betId);

			let threadId: string;
			if (existingThread) {
				threadId = existingThread.id;
				const parts = JSON.parse(existingThread.participants) as string[];
				if (!parts.includes(ctx.agentId)) {
					parts.push(ctx.agentId);
					await ports.conversation.updateThread(ctx.db, threadId, {
						participants: JSON.stringify(parts),
						lastActiveAt: now,
					});
				}
			} else {
				threadId = randomUUID();
				await ports.conversation.insertThread(ctx.db, {
					id: threadId,
					hostKind: "bet",
					hostId: betId,
					initiatorId: ctx.agentId,
					participants: JSON.stringify([ctx.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});
			}

			const messageId = randomUUID();

			if (input.artifactRef) {
				const payload: ReviewPayload = {
					title: input.title,
					reasoning: input.reasoning,
					artifactRef: input.artifactRef,
				};
				await ports.conversation.insertMessage(ctx.db, {
					id: messageId,
					senderId: ctx.agentId,
					threadId,
					type: "review",
					payload: JSON.stringify(payload),
					clientKey: messageId,
					createdAt: now,
				});
			} else {
				const text = `Review requested: ${input.title}\n\n${input.reasoning.join("\n")}`;
				await ports.conversation.insertMessage(ctx.db, {
					id: messageId,
					senderId: ctx.agentId,
					threadId,
					type: "plain",
					payload: JSON.stringify({ text }),
					clientKey: messageId,
					createdAt: now,
				});
			}

			await ports.conversation.updateThread(ctx.db, threadId, { lastActiveAt: now });

			return ok({ messageId, threadId, betId });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// route_item
// ─────────────────────────────────────────────────────────────────────────────

const RISK_TIERS_ROUTE = ["low", "medium", "high"] as const;

const routeItemInputSchema = z.object({
	itemId: z.string().min(1),
	riskTier: z.enum(RISK_TIERS_ROUTE).optional(),
	kind: z.string().optional(),
	verb: z.string().optional(),
});

type RouteItemInput = z.infer<typeof routeItemInputSchema>;

function makeRouteItemTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<RouteItemInput, TDb> {
	return {
		name: "route_item",
		description:
			"Route an existing item to its correct view (conversations | work | knowledge) based on risk tier and kind. Accepts optional overrides for riskTier, kind, or verb; returns the resolved view.",
		inputSchema: routeItemInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const row = await ports.work.getItemById(ctx.db, args.itemId);
			if (!row) return err("NOT_FOUND", `Item not found: ${args.itemId}`);

			const effectiveRiskTier = args.riskTier ?? row.riskTier ?? null;
			const effectiveKind = args.kind ?? row.kind ?? null;
			const effectiveVerb = args.verb ?? row.verb ?? null;

			const view = ports.work.routeItem({
				riskTier: effectiveRiskTier,
				kind: effectiveKind,
				verb: effectiveVerb,
			});

			const updates: Partial<{ riskTier: string; kind: string; verb: string }> = {};
			if (args.riskTier !== undefined) updates.riskTier = args.riskTier;
			if (args.kind !== undefined) updates.kind = args.kind;
			if (args.verb !== undefined) updates.verb = args.verb;
			if (Object.keys(updates).length > 0) {
				await ports.work.updateItemById(ctx.db, args.itemId, updates);
			}

			return ok({
				itemId: args.itemId,
				view,
				riskTier: effectiveRiskTier,
				kind: effectiveKind,
				verb: effectiveVerb,
			});
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
	ports: ToolHandlersPorts<TDb>,
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
				const existing = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, id);
				if (!existing) return err("NOT_FOUND", `Knowledge item not found: ${id}`);
				const result = await ports.knowledge.recomputeAttentionScoreForItem(
					ctx.db,
					ctx.eventBus,
					id,
				);
				return ok({ target, id, score: result.current, mode });
			}

			if (args.score === undefined) {
				return err("INVALID_INPUT", "'score' is required when mode='override'");
			}
			const score = args.score;

			if (target === "knowledge_item") {
				const row = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, id);
				if (!row) return err("NOT_FOUND", `Knowledge item not found: ${id}`);
				await ports.knowledge.upsertKnowledgeAppProjectionAttentionScore(ctx.db, id, String(score));
				return ok({ target, id, score, mode });
			}

			const row = await ports.work.getItemById(ctx.db, id);
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
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<PromoteKnowledgeInput, TDb> {
	return {
		name: "promote_knowledge",
		description:
			"Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item.",
		inputSchema: promoteKnowledgeInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const { knowledgeItemId, toStatus, reason } = args;

			const row = await ports.knowledge.findKnowledgeItemStatusById(ctx.db, knowledgeItemId);
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
			const result = await ports.knowledge.promoteKnowledgeItem(ctx.db, {
				knowledgeItemId,
				fromStatus,
				toStatus,
				reason,
				editor,
			});

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
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateConflictReviewInput, TDb> {
	return {
		name: "create_conflict_review",
		description:
			"Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue.",
		inputSchema: createConflictReviewInputSchema,
		roles: ["assistant", "facilitator", "product_manager"],
		handler: async (args, ctx) => {
			const item = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, args.knowledgeItemId);
			if (!item) return err("NOT_FOUND", `Knowledge item not found: ${args.knowledgeItemId}`);

			if (args.versionBase > item.version) {
				return err(
					"INVALID_INPUT",
					`versionBase ahead of current (${args.versionBase} > ${item.version})`,
				);
			}

			const proposedBy = `agent:${ctx.agentId}`;
			const existing = await ports.knowledge.findOpenConflictByItemAndProposer(
				ctx.db,
				args.knowledgeItemId,
				proposedBy,
			);
			if (existing) {
				return err(
					"DUPLICATE",
					`open conflict already exists from this agent on this item: ${existing.id}`,
				);
			}

			const conflictId = randomUUID();
			const now = new Date().toISOString();
			await ports.knowledge.createKnowledgeConflict(ctx.db, {
				id: conflictId,
				itemId: args.knowledgeItemId,
				versionBase: args.versionBase,
				versionCurrent: item.version,
				proposedBody: args.proposedBody,
				proposedMeta: args.proposedMeta ?? null,
				proposedBy,
				createdAt: now,
			});

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

function makeCreateTeamTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateTeamInput, TDb> {
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
			const teamMembersId = `team-${randomUUID()}`;

			// @lore AU20 Am7: atomic createTeam (teams + teamMembers companion in one call).
			await ports.org.createTeam(ctx.db, {
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
			});

			const specs = await ports.agentSelection.resolveScaffoldSpecs({
				db: ctx.db,
				trigger: "team_scaffold",
				teamId,
				teamMembersId,
				teamName: input.name,
				functions: input.functions,
				role: null,
				name: null,
				ownerUserId: null,
				ownerUserName: null,
			});

			const { agentIds, leadAgentId } = await ports.org.persistScaffoldedAgents(
				ctx.db,
				teamMembersId,
				specs,
			);

			const createdAgents = await ports.users.listUsersByTeam(ctx.db, teamMembersId);
			const roster = createdAgents.map((a) => ({
				role: a.role ?? "",
				name: a.name,
				agentId: a.id,
			}));

			const lead = leadAgentId ?? agentIds[0] ?? null;
			if (lead !== null) {
				// @lore AU20 Am7: updateTeam(teamId, {leadAgentId}) replaces setTeamMembersLeadAgent.
				await ports.org.updateTeam(ctx.db, teamId, { leadAgentId: lead });
			}

			{
				const ownerByRole: Partial<Record<string, string>> = {};
				for (const { role, agentId } of roster) {
					if (role && !ownerByRole[role]) {
						ownerByRole[role] = agentId;
					}
				}
				await ports.dispatch.provisionTeamRoutines(ctx.db, {
					teamId,
					ownerByRole,
					leadAgentId: lead ?? agentIds[0] ?? "",
				});
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

function makeAddAgentTool<TDb>(ports: ToolHandlersPorts<TDb>): ToolDefinition<AddAgentInput, TDb> {
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

			const team = await ports.org.getTeamById(ctx.db, input.teamId);
			if (!team) return err("NOT_FOUND", `Team not found: ${input.teamId}`);

			const memberGroup = await ports.org.getTeamMembersByTeamId(ctx.db, input.teamId);
			if (!memberGroup)
				return err("NOT_FOUND", `Team membership group not found for team ${input.teamId}`);

			const specs = await ports.agentSelection.resolveScaffoldSpecs({
				db: ctx.db,
				trigger: "agent_added",
				teamId: input.teamId,
				teamMembersId: memberGroup.id,
				teamName: team.name,
				functions: null,
				role: input.role,
				name: input.name,
				ownerUserId: null,
				ownerUserName: null,
			});

			const finalSpecs =
				input.systemPrompt !== undefined
					? specs.map((s) => ({ ...s, systemPrompt: input.systemPrompt ?? null }))
					: specs;

			const { agentIds } = await ports.org.persistScaffoldedAgents(
				ctx.db,
				memberGroup.id,
				finalSpecs,
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
// create_bet  (also used internally by buildAssistantDraftRegistry)
// ─────────────────────────────────────────────────────────────────────────────

const createBetInputSchema = z.object({
	teamId: z.string().min(1),
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type CreateBetInput = z.infer<typeof createBetInputSchema>;

function makeCreateBetTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): AssistantToolShape<CreateBetInput, TDb> {
	return {
		name: "create_bet",
		description:
			"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
		inputSchema: createBetInputSchema,
		handler: async (args, ctx) => {
			const parsed = createBetInputSchema.safeParse(args);
			if (!parsed.success) return { status: "error", message: parsed.error.message };
			const input = parsed.data;

			const team = await ports.org.getTeamById(ctx.db, input.teamId);
			if (!team) return { status: "error", message: `Team not found: ${input.teamId}` };

			const betId = randomUUID();
			const now = new Date().toISOString();
			await ports.work.createBet(ctx.db, {
				id: betId,
				teamId: input.teamId,
				description: input.description,
				doneCondition: input.doneCondition ?? null,
				hypothesis: input.hypothesis ?? null,
				status: "draft",
				createdAt: now,
			});

			return { status: "ok", value: { betId, status: "draft" as const, teamId: input.teamId } };
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// edit_bet  (also used internally by buildAssistantDraftRegistry)
// ─────────────────────────────────────────────────────────────────────────────

const editBetInputSchema = z.object({
	betId: z.string().min(1),
	description: z.string().min(1).max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type EditBetInput = z.infer<typeof editBetInputSchema>;

function makeEditBetTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): AssistantToolShape<EditBetInput, TDb> {
	return {
		name: "edit_bet",
		description:
			"Edit a bet's description, done condition, or hypothesis. HIGH RISK: requires human approval.",
		inputSchema: editBetInputSchema,
		handler: async (args, ctx) => {
			const parsed = editBetInputSchema.safeParse(args);
			if (!parsed.success) return { status: "error", message: parsed.error.message };
			const input = parsed.data;

			const existing = await ports.work.getBetById(ctx.db, input.betId);
			if (!existing) return { status: "error", message: `Bet not found: ${input.betId}` };
			if (existing.status !== "draft")
				return { status: "error", message: "Can only edit a draft bet." };

			const updates: Partial<{
				description: string;
				doneCondition: string | null;
				hypothesis: string | null;
			}> = {};
			if (input.description !== undefined) updates.description = input.description;
			if (input.doneCondition !== undefined) updates.doneCondition = input.doneCondition;
			if (input.hypothesis !== undefined) updates.hypothesis = input.hypothesis;

			if (Object.keys(updates).length === 0) {
				return { status: "error", message: "No fields to update." };
			}

			await ports.work.updateBetById(ctx.db, input.betId, updates);
			return { status: "ok", value: { betId: input.betId } };
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// create_routine
// @lore AU20 Stage 2: parseCron/nextCronMatch imported from @hyperidle/shared
// (relocated from dispatch port) — no longer a dispatch back-edge.
// ─────────────────────────────────────────────────────────────────────────────

const createRoutineInputSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	teamId: z.string().min(1),
	ownerAgentId: z.string().min(1),
	triggerType: z.literal("calendar"),
	triggerConfig: z.string().min(1),
	costCapPerRunMinor: z.number().int().min(0).optional(),
});

type CreateRoutineInput = z.infer<typeof createRoutineInputSchema>;

function makeCreateRoutineTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateRoutineInput, TDb> {
	return {
		name: "create_routine",
		description:
			"Create a new routine (recurring automated task) for a team agent. Requires a calendar trigger with a cron expression.",
		inputSchema: createRoutineInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = createRoutineInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const team = await ports.org.getTeamById(ctx.db, input.teamId);
			if (!team) return err("NOT_FOUND", `Team not found: ${input.teamId}`);

			const agent = await ports.users.getUserById(ctx.db, input.ownerAgentId);
			if (!agent) return err("NOT_FOUND", `Agent not found: ${input.ownerAgentId}`);

			let triggerConfigParsed: { cron?: string };
			try {
				triggerConfigParsed = JSON.parse(input.triggerConfig) as { cron?: string };
			} catch {
				return err("INVALID_INPUT", "triggerConfig must be valid JSON");
			}

			if (!triggerConfigParsed.cron) {
				return err("INVALID_INPUT", "triggerConfig must include a cron field");
			}

			let parsedCron: unknown;
			try {
				parsedCron = parseCron(triggerConfigParsed.cron);
			} catch {
				return err("INVALID_INPUT", `Invalid cron expression: ${triggerConfigParsed.cron}`);
			}

			const routineId = randomUUID();
			const now = new Date().toISOString();
			const nextRunAt = nextCronMatch(parsedCron, new Date()).toISOString();

			await ports.routine.insertRoutine(ctx.db, {
				id: routineId,
				name: input.name,
				description: input.description ?? null,
				teamId: input.teamId,
				ownerAgentId: input.ownerAgentId,
				triggerType: input.triggerType,
				triggerConfig: input.triggerConfig,
				state: "active",
				active: true,
				costCapPerRunMinor: input.costCapPerRunMinor ?? null,
				nextRunAt,
				createdAt: now,
			});

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
		description: z.string().max(2000).optional(),
		state: z.enum(["active", "paused"]).optional(),
		triggerConfig: z.string().optional(),
		costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
		costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
	}),
});

type UpdateRoutineInput = z.infer<typeof updateRoutineInputSchema>;

function makeUpdateRoutineTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<UpdateRoutineInput, TDb> {
	return {
		name: "update_routine",
		description:
			"Update an existing routine's configuration — name, description, schedule, state, or cost caps.",
		inputSchema: updateRoutineInputSchema,
		roles: ["assistant"],
		handler: async (args, ctx) => {
			const parsed = updateRoutineInputSchema.safeParse(args);
			if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
			const input = parsed.data;

			const existing = await ports.routine.getRoutineById(ctx.db, input.routineId);
			if (!existing || existing.deletedAt) {
				return err("NOT_FOUND", `Routine not found: ${input.routineId}`);
			}

			const updates: Record<string, unknown> = {};
			const u = input.updates;
			if (u.name !== undefined) updates.name = u.name;
			if (u.description !== undefined) updates.description = u.description;
			if (u.triggerConfig !== undefined) updates.triggerConfig = u.triggerConfig;
			if (u.state !== undefined) {
				updates.state = u.state;
				updates.active = u.state === "active";
			}
			if ("costCapPerRunMinor" in u) updates.costCapPerRunMinor = u.costCapPerRunMinor ?? null;
			if ("costCapMonthlyMinor" in u) updates.costCapMonthlyMinor = u.costCapMonthlyMinor ?? null;

			if (Object.keys(updates).length > 0) {
				await ports.routine.updateRoutineById(ctx.db, input.routineId, updates);
			}

			const updated = await ports.routine.getRoutineById(ctx.db, input.routineId);
			return ok({
				routineId: input.routineId,
				name: updated?.name ?? existing.name,
				state: updated?.state ?? existing.state,
			});
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// commit_file
// ─────────────────────────────────────────────────────────────────────────────

const commitFileInputSchema = z.object({
	path: z.string().min(1),
	content: z.string(),
});

type CommitFileInput = z.infer<typeof commitFileInputSchema>;

function makeCommitFileTool<TDb>(): ToolDefinition<CommitFileInput, TDb> & {
	readonly reversibility: "irreversible";
} {
	return {
		name: "commit_file",
		description:
			"Write content to a file in the session sandbox. Overwrites the file if it already exists. Irreversible — routed to human review before execution.",
		inputSchema: commitFileInputSchema,
		reversibility: "irreversible",
		// biome-ignore lint/suspicious/useAwait: all fs ops are synchronous; no async deps needed
		handler: async (args, ctx) => {
			const { path: filePath, content } = args;
			const resolved = path.resolve(
				path.isAbsolute(filePath) ? filePath : path.join(ctx.sandboxPath, filePath),
			);
			const sandboxResolved = path.resolve(ctx.sandboxPath);
			if (!resolved.startsWith(sandboxResolved + path.sep) && resolved !== sandboxResolved) {
				return err(
					"OUTSIDE_SANDBOX",
					`commit_file: resolved path ${resolved} falls outside sandbox ${sandboxResolved}. ` +
						"Use a relative path or a path inside the sandbox directory.",
				);
			}
			const dir = path.dirname(resolved);
			try {
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(resolved, content, "utf-8");
			} catch (e) {
				return err("WRITE_FAILED", `commit_file: could not write to ${resolved}: ${String(e)}`);
			}
			return ok({ written: resolved, bytes: Buffer.byteLength(content, "utf-8") });
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

function makeLogTaskTool<TDb>(ports: ToolHandlersPorts<TDb>): ToolDefinition<LogTaskInput, TDb> {
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
			const result = await ports.work.appendTaskNote(ctx.db, ctx.taskId, entry);
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
	ports: ToolHandlersPorts<TDb>,
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

			const taskRow = await ports.work.getTaskById(ctx.db, ctx.taskId);
			if (!taskRow) {
				return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
			}

			const artifactId = randomUUID();
			const now = new Date().toISOString();

			await ports.work.createArtifact(ctx.db, {
				id: artifactId,
				producingTaskId: ctx.taskId,
				kind: input.kind,
				label: input.label ?? null,
				previewJson: input.preview !== null ? JSON.stringify(input.preview) : null,
				createdAt: now,
			});

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
 * @lore Four facilitator-only tools (`route_item`, `score_attention`,
 * `promote_knowledge`, `create_conflict_review`) narrow to facilitator roles —
 * passing them to builders would break G1 AC6's authorization intent.
 */
export function buildToolDefinitions(
	ports: ToolHandlersPorts<HyperIdleDb>,
	opts?: { readonly role?: UserRole },
): readonly RegisteredTool<HyperIdleDb>[] {
	const all: readonly RegisteredTool<HyperIdleDb>[] = [
		toRegistered(makeReadInboxTool(ports)),
		toRegistered(makeSendMessageTool(ports)),
		toRegistered(makeLogTaskTool(ports)),
		toRegistered(makeQueryPracticeTool(ports)),
		toRegistered(makeWriteMemoryTool(ports)),
		toRegistered(makeHandoffToTool(ports)),
		toRegistered(makeCreateItemTool(ports)),
		toRegistered(makeWriteSessionNotesTool()),
		toRegistered(makeCreateTaskTool(ports)),
		toRegistered(makeSubmitReviewTool(ports)),
		toRegistered(makeCreateArtifactTool(ports)),
		toRegistered(makeRouteItemTool(ports)),
		toRegistered(makeScoreAttentionTool(ports)),
		toRegistered(makePromoteKnowledgeTool(ports)),
		toRegistered(makeCreateConflictReviewTool(ports)),
		toRegistered(makeCreateTeamTool(ports)),
		toRegistered(makeAddAgentTool(ports)),
		wrapForRegistry(makeCreateBetTool(ports), ["assistant"]),
		wrapForRegistry(makeEditBetTool(ports), ["assistant"]),
		toRegistered(makeCreateRoutineTool(ports)),
		toRegistered(makeUpdateRoutineTool(ports)),
		toRegistered(makeCommitFileTool<HyperIdleDb>()),
	];
	if (opts?.role !== undefined) {
		return toolsForRole(all, opts.role);
	}
	return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildAssistantDraftRegistry — private helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDraftTeamId<TDb>(
	db: TDb,
	userId: string,
	ports: ToolHandlersPorts<TDb>,
): Promise<string | undefined> {
	const userRow = await ports.users.getUserById(db, userId);
	if (!userRow?.teamId) return undefined;
	// @lore AK4: `userRow.teamId` is actually `team_members.id` (U1 schema
	// lore) — resolve the second hop to `teams.id` via `getTeamMembersById`.
	const memberRow = await ports.org.getTeamMembersById(db, userRow.teamId);
	return memberRow?.teamId;
}

async function resolveCurrentDraftBetId<TDb>(
	db: TDb,
	transcriptRows: ReadonlyArray<{ senderId: string; payload: string }>,
	astAgentId: string,
	ports: ToolHandlersPorts<TDb>,
): Promise<string | undefined> {
	const reversed = [...transcriptRows].reverse();
	for (const row of reversed) {
		if (row.senderId !== astAgentId) continue;
		let parsed: { toolCalls?: Array<{ name: string; status: string; output: string }> };
		try {
			parsed = JSON.parse(row.payload) as typeof parsed;
		} catch {
			continue;
		}
		if (!Array.isArray(parsed.toolCalls)) continue;
		for (const tc of [...parsed.toolCalls].reverse()) {
			if ((tc.name === "create_bet" || tc.name === "edit_bet") && tc.status === "ok") {
				let outputParsed: { betId?: string };
				try {
					outputParsed = JSON.parse(tc.output) as typeof outputParsed;
				} catch {
					continue;
				}
				const betId = outputParsed.betId;
				if (!betId) continue;
				const bet = await ports.work.getBetById(db, betId);
				if (bet?.status === "draft") return betId;
			}
		}
	}
	return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildAssistantDraftRegistry — public export #2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AK4 — the authority boundary for the assistant's conversational tool-use
 * loop. Returns a ToolRegistry with EXACTLY [create_bet, edit_bet]:
 *   - create_bet: teamId is HARD-INJECTED from resolvedTeamId (model cannot redirect the team).
 *   - edit_bet: betId is FORCED to currentDraftBetId (model cannot target another bet).
 *
 * @lore AU20 Am10: `AssistantDraftRegistryParams` de-exported and inlined as
 * the param object type. `resolveDraftTeamId`/`resolveCurrentDraftBetId` are
 * now private helpers. `buildAssistantDraftRegistry` is now `async` (runs the
 * two cheap DB lookups before building the registry).
 */
export async function buildAssistantDraftRegistry<TDb>(
	ctx: ToolContext<TDb>,
	params: {
		readonly userId: string;
		readonly transcriptRows: ReadonlyArray<{ readonly senderId: string; readonly payload: string }>;
		readonly assistantAgentId: string;
	},
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolRegistry<TDb>> {
	const resolvedTeamId = await resolveDraftTeamId(ctx.db, params.userId, ports);
	const currentDraftBetId = await resolveCurrentDraftBetId(
		ctx.db,
		params.transcriptRows,
		params.assistantAgentId,
		ports,
	);
	const createBetTool = makeCreateBetTool(ports);
	const editBetTool = makeEditBetTool(ports);

	const createBetDraftInputSchema = z.object({
		description: z.string().min(1).max(65_536),
		doneCondition: z.string().max(65_536).optional(),
		hypothesis: z.string().max(65_536).optional(),
	});

	const editBetDraftInputSchema = z.object({
		description: z.string().min(1).max(65_536).optional(),
		doneCondition: z.string().max(65_536).optional(),
		hypothesis: z.string().max(65_536).optional(),
	});

	const createBetWrapped: RegisteredTool<TDb> = toRegistered({
		name: createBetTool.name,
		description: createBetTool.description,
		inputSchema: createBetDraftInputSchema,
		handler: async (args, toolCtx) => {
			if (!resolvedTeamId) {
				return err("NO_TEAM", "No team found for this user — cannot create a draft bet.");
			}
			const argsRecord = args as z.infer<typeof createBetDraftInputSchema>;
			const fullArgs = { ...argsRecord, teamId: resolvedTeamId };
			const result = await createBetTool.handler(fullArgs, toolCtx);
			if (result.status === "ok") return ok(result.value);
			return err("TOOL_ERROR", result.message);
		},
	});

	const editBetWrapped: RegisteredTool<TDb> = toRegistered({
		name: editBetTool.name,
		description: editBetTool.description,
		inputSchema: editBetDraftInputSchema,
		handler: async (args, toolCtx) => {
			if (!currentDraftBetId) {
				return err("NO_DRAFT", "No draft to edit yet — describe the bet and I'll draft it first.");
			}
			const argsRecord = args as z.infer<typeof editBetDraftInputSchema>;
			const fullArgs = { ...argsRecord, betId: currentDraftBetId };
			const result = await editBetTool.handler(fullArgs, toolCtx);
			if (result.status === "ok") return ok(result.value);
			return err("TOOL_ERROR", result.message);
		},
	});

	const definitions: readonly RegisteredTool<TDb>[] = [createBetWrapped, editBetWrapped];
	const byName = new Map(definitions.map((d) => [d.name, d]));

	// biome-ignore lint/suspicious/useAwait: returns def.handler's Promise directly; no intermediate await needed
	async function invoke(name: string, rawArgs: unknown) {
		const def = byName.get(name);
		if (!def) return err("NOT_FOUND", `Tool not in draft registry: ${name}`);
		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
