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

import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	type ScopeKind,
} from "@hyperidle/domain-model";
import { EVENT_TYPES } from "@hyperidle/event-bus";
import { err, ok, type RegisteredTool } from "@hyperidle/harness-protocol";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";
import { type ToolDefinition, toRegistered } from "./tool-types.js";

// @lore BC3: `send_message` and `reply` are not hand-written `ToolDefinition`
// literals here — `send_message` is an action registered on the composed
// action list (`@hyperidle/domain-model`'s `THREAD_ACTIONS`); `reply`'s
// no-thread fallback (the team-then-any-human ladder) is `send_message`'s
// own server invariant (`no_reply_recipient`,
// `ThreadActionsDeps.users.soleHumanForAgent`).

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
					.openTask(ctx.taskId, ctx.agentId)
					.then((row) => row?.task.teamId ?? null));
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
// handoff_to — DELETED . Handoff is now `edit_task({ ownerAgentId })`;
// role targeting, human escalation and the escalation thread went with
// `handoff-protocol.ts` (architecture.md §8 B4).
// ─────────────────────────────────────────────────────────────────────────────
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
// log_task — DELETED . `edit_task({ appendNote })` replaces it.
// ─────────────────────────────────────────────────────────────────────────────

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
							.openTask(ctx.taskId, ctx.agentId)
							.then((row) => row?.task.teamId ?? null)
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
		toRegistered(makeWriteMemoryTool(ports)),
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
