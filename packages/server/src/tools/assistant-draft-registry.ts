/**
 * AK4 — buildAssistantDraftRegistry + supporting helpers.
 *
 * The authority boundary for the assistant's conversational tool-use loop.
 * Returns a ToolRegistry with EXACTLY [create_bet, edit_bet]:
 *   - create_bet: teamId is HARD-INJECTED from resolvedTeamId (model cannot redirect the team).
 *   - edit_bet: betId is FORCED to currentDraftBetId (model cannot target another bet).
 *
 * This registry is injected via setSessionToolRegistry before startSession.
 * SessionConfig.tools stays [] (dead field — the adapter ignores it).
 *
 * @lore AK4 CRITICAL-2: buildToolRegistry(ctx, {role:'assistant'}) would inject
 * the FULL assistant role surface (create_team, add_agent, create_routine, submit_review,
 * handoff_to, send_message, ...) because session.toolDefs = ALL injected registry tools,
 * NOT the dead SessionConfig.tools filter. A dedicated 2-tool registry builder is the
 * authority boundary, verified statically by AC3b.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { teamMembers, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import * as work from "../work-service.js";
import { createBetTool } from "./create-bet.js";
import { editBetTool } from "./edit-bet.js";
import {
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	toClaudeToolSpec,
	toRegistered,
} from "./tool-registry.js";
import { err, ok } from "./tool-result.js";

// ---------------------------------------------------------------------------
// resolveDraftTeamId — two-hop team resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the founder's team id for draft bet creation.
 *
 * Two-hop: users.teamId (references team_members.id) → teamMembers.teamId (references teams.id).
 * Returns the teams.id that create_bet requires, or undefined when no team is found.
 *
 * @lore AK4: users.teamId references team_members.id (U1 schema lore), NOT teams.id.
 * create_bet requires teams.id. Resolving the two hops here prevents a phantom teamId
 * from being accepted (the wrapper only uses the DB-resolved value, never the model's value).
 */
export async function resolveDraftTeamId(
	db: HyperIdleDb,
	userId: string,
): Promise<string | undefined> {
	const [userRow] = await db
		.select({ teamId: users.teamId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!userRow?.teamId) {
		return undefined;
	}

	// users.teamId is team_members.id — resolve to teams.id (the FK create_bet needs)
	const [memberRow] = await db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(eq(teamMembers.id, userRow.teamId))
		.limit(1);

	return memberRow?.teamId ?? undefined;
}

// ---------------------------------------------------------------------------
// resolveCurrentDraftBetId — transcript-sourced draft binding
// ---------------------------------------------------------------------------

/**
 * Resolve the current living draft betId from the thread transcript.
 *
 * Scans the prior assistant plain messages' payload.toolCalls for the newest
 * create_bet or edit_bet ok entry, then validates the bet is still status='draft'.
 *
 * Returns undefined if: no prior tool call found, or the bet is committed/killed/deleted.
 *
 * @lore AK4 §C: bets have no threadId or createdBy column — binding MUST come from
 * the thread transcript. The newest ok create_bet/edit_bet result carries the betId.
 * The liveness check prevents re-targeting a committed bet.
 */
export async function resolveCurrentDraftBetId(
	db: HyperIdleDb,
	transcriptRows: ReadonlyArray<{ senderId: string; payload: string }>,
	astAgentId: string,
): Promise<string | undefined> {
	// Find assistant messages with toolCalls (reverse scan for newest)
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

		// Find newest create_bet or edit_bet ok entry in this message's toolCalls
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

				// Liveness check: validate bet is still status='draft'
				const bet = await work.getBetById(db, betId);

				if (bet?.status === "draft") {
					return betId;
				}
				// Committed/killed/deleted — continue scanning (don't rebind)
			}
		}
	}

	return undefined;
}

// ---------------------------------------------------------------------------
// AssistantDraftRegistryParams
// ---------------------------------------------------------------------------

export interface AssistantDraftRegistryParams {
	/** Resolved teams.id from resolveDraftTeamId. Hard-injected into create_bet. */
	readonly resolvedTeamId: string | undefined;
	/** Bound draft betId from transcript. Hard-forced into edit_bet. */
	readonly currentDraftBetId: string | undefined;
}

// ---------------------------------------------------------------------------
// buildAssistantDraftRegistry
// ---------------------------------------------------------------------------

/**
 * Relaxed schema for the create_bet wrapper — teamId is optional because
 * the server always hard-injects resolvedTeamId, so the model cannot supply
 * (or redirect) the teamId. The wrapper validates these fields then passes
 * the full args + injected teamId to the real createBetTool handler.
 *
 * @lore AK4: teamId MUST be omitted from the LLM's input schema to prevent
 * the model from hallucinating/injecting a teamId (security hard-constraint).
 * The Claude tool spec exposed to the model will not list teamId as a field.
 */
const createBetDraftInputSchema = z.object({
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
	// teamId intentionally ABSENT — server hard-injects it
});

/**
 * Relaxed schema for the edit_bet wrapper — betId is optional because
 * the server always forces it to currentDraftBetId.
 */
const editBetDraftInputSchema = z.object({
	description: z.string().min(1).max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
	// betId intentionally ABSENT — server forces it to currentDraftBetId
});

/**
 * Build a 2-tool registry for the conversational assistant draft-bet turn.
 *
 * The registry contains EXACTLY [create_bet, edit_bet]:
 *   - create_bet wrapper: ignores any model-supplied teamId; uses resolvedTeamId.
 *     If resolvedTeamId is undefined → returns error (honest no-draft reply).
 *   - edit_bet wrapper: ignores any model-supplied betId; uses currentDraftBetId.
 *     If currentDraftBetId is undefined → returns error (no draft to edit yet).
 *
 * AC3b: registry.definitions.map(d=>d.name).sort() === ["create_bet","edit_bet"].
 *
 * @lore AK4: The model CANNOT redirect the team (create_bet) or target another bet
 * (edit_bet). Both are server-forced. The registry is injected via
 * BuiltinHarnessAdapter.setSessionToolRegistry before startSession; SessionConfig.tools
 * is left [] (dead field — the adapter ignores it and uses session.toolDefs instead).
 */
export function buildAssistantDraftRegistry(
	ctx: ToolContext,
	params: AssistantDraftRegistryParams,
): ToolRegistry {
	const { resolvedTeamId, currentDraftBetId } = params;

	// ── create_bet wrapper — hard-injects resolvedTeamId ─────────────────────
	const createBetWrapped: RegisteredTool = toRegistered({
		name: createBetTool.name,
		description: createBetTool.description,
		// Use the relaxed schema (no teamId) — server injects it
		inputSchema: createBetDraftInputSchema,
		handler: async (args, toolCtx) => {
			// Hard-inject: ignore any model-supplied teamId
			if (!resolvedTeamId) {
				return err("NO_TEAM", "No team found for this user — cannot create a draft bet.");
			}
			const argsRecord = args as z.infer<typeof createBetDraftInputSchema>;
			const fullArgs = {
				...argsRecord,
				teamId: resolvedTeamId,
			};
			const result = await createBetTool.handler(fullArgs, toolCtx);
			if (result.status === "ok") {
				return ok(result.value);
			}
			return err("TOOL_ERROR", result.message);
		},
	});

	// ── edit_bet wrapper — forces betId to currentDraftBetId ─────────────────
	const editBetWrapped: RegisteredTool = toRegistered({
		name: editBetTool.name,
		description: editBetTool.description,
		// Use the relaxed schema (no betId) — server forces it
		inputSchema: editBetDraftInputSchema,
		handler: async (args, toolCtx) => {
			// Force betId: ignore any model-supplied betId
			if (!currentDraftBetId) {
				return err("NO_DRAFT", "No draft to edit yet — describe the bet and I'll draft it first.");
			}
			const argsRecord = args as z.infer<typeof editBetDraftInputSchema>;
			const fullArgs = {
				...argsRecord,
				betId: currentDraftBetId,
			};
			const result = await editBetTool.handler(fullArgs, toolCtx);
			if (result.status === "ok") {
				return ok(result.value);
			}
			return err("TOOL_ERROR", result.message);
		},
	});

	const definitions: readonly RegisteredTool[] = [createBetWrapped, editBetWrapped];
	const byName = new Map(definitions.map((d) => [d.name, d]));

	async function invoke(
		name: string,
		rawArgs: unknown,
	): Promise<import("./tool-result.js").ToolResult> {
		const def = byName.get(name);
		if (!def) {
			return err("NOT_FOUND", `Tool not in draft registry: ${name}`);
		}
		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}
		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
