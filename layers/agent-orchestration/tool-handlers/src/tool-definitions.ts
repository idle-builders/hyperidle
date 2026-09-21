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
// handoff_to — DELETED . Handoff is now `edit_task({ ownerAgentId })`;
// role targeting, human escalation and the escalation thread went with
// `handoff-protocol.ts` (architecture.md §8 B4).
// ─────────────────────────────────────────────────────────────────────────────

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
 */
export function buildToolDefinitions(
	ports: ToolHandlersPorts,
	opts?: { readonly role?: string },
): readonly RegisteredTool<HyperIdleDb>[] {
	const all: readonly RegisteredTool<HyperIdleDb>[] = [
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
