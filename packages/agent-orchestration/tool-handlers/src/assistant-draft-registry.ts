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
 */

import {
	err,
	ok,
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	toClaudeToolSpec,
	toRegistered,
} from "@hyperidle/shared";
import z from "zod";
import { createCreateBetTool } from "./create-bet.js";
import { createEditBetTool } from "./edit-bet.js";
import type { ToolHandlersPorts } from "./ports.js";

export async function resolveDraftTeamId<TDb>(
	db: TDb,
	userId: string,
	ports: ToolHandlersPorts<TDb>,
): Promise<string | undefined> {
	const userRow = await ports.users.getUserById(db, userId);
	if (!userRow?.teamId) {
		return undefined;
	}
	// @lore AK4: `userRow.teamId` is actually `team_members.id` (U1 schema
	// lore) — resolve the second hop to `teams.id` via `getTeamMembersById`.
	const memberRow = await ports.org.getTeamMembersById(db, userRow.teamId);
	return memberRow?.teamId;
}

export async function resolveCurrentDraftBetId<TDb>(
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

				if (bet?.status === "draft") {
					return betId;
				}
			}
		}
	}

	return undefined;
}

export interface AssistantDraftRegistryParams {
	readonly resolvedTeamId: string | undefined;
	readonly currentDraftBetId: string | undefined;
}

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

export function buildAssistantDraftRegistry<TDb>(
	ctx: ToolContext<TDb>,
	params: AssistantDraftRegistryParams,
	ports: ToolHandlersPorts<TDb>,
): ToolRegistry<TDb> {
	const { resolvedTeamId, currentDraftBetId } = params;
	const createBetTool = createCreateBetTool(ports);
	const editBetTool = createEditBetTool(ports);

	const createBetWrapped: RegisteredTool<TDb> = toRegistered({
		name: createBetTool.name,
		description: createBetTool.description,
		inputSchema: createBetDraftInputSchema,
		handler: async (args, toolCtx) => {
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

	const editBetWrapped: RegisteredTool<TDb> = toRegistered({
		name: editBetTool.name,
		description: editBetTool.description,
		inputSchema: editBetDraftInputSchema,
		handler: async (args, toolCtx) => {
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

	const definitions: readonly RegisteredTool<TDb>[] = [createBetWrapped, editBetWrapped];
	const byName = new Map(definitions.map((d) => [d.name, d]));

	async function invoke(name: string, rawArgs: unknown) {
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
