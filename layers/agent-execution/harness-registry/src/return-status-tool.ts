/**
 * return_status bridge tool — injected per-session via buildToolRegistry extraTools.
 * Reads sessionId → enforcement registry → { returned, exempt, forceCount, budgetLeft, forceMessage }.
 */

import {
	MAX_FORCE_RETURNS,
	ok,
	RETURN_ACTION_NAMES,
	type RegisteredTool,
	shouldForceReturn,
	type ToolContext,
	type ToolResult,
} from "@hyperidle/harness-protocol";
import z from "zod";
import type { EnforcementRegistry } from "./enforcement-registry.js";

/** Input schema: the tool accepts an empty object (no required args). */
const inputSchema: z.ZodType = z.object({});

interface ReturnStatusResult {
	readonly returned: boolean;
	readonly exempt: boolean;
	readonly forceCount: number;
	readonly budgetLeft: number;
	readonly forceMessage: string | null;
}

/**
 * The raw handler. Takes a third `registry` argument so tests can inject
 * an isolated instance rather than the process singleton.
 */
function handle(
	_args: Record<string, never>,
	ctx: ToolContext,
	registry: EnforcementRegistry,
): Promise<ToolResult> {
	const entry = registry.get(ctx.sessionId);

	if (!entry) {
		// Unknown session: allow the stop — no enforcement data available.
		// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
		console.warn(`[return-status-tool] unknown sessionId: ${ctx.sessionId}`);
		const noEntry: ReturnStatusResult = {
			returned: true,
			exempt: true,
			forceCount: 0,
			budgetLeft: 0,
			forceMessage: null,
		};
		return Promise.resolve(ok(noEntry));
	}

	const preForceCount = entry.forceCount;
	const forceMessage = entry.exempt
		? null
		: shouldForceReturn(entry.gate, preForceCount, entry.requiredReturnActions);

	if (forceMessage !== null) {
		registry.incrementForce(ctx.sessionId);
	}

	const budgetLeft = Math.max(0, MAX_FORCE_RETURNS - preForceCount);

	const result: ReturnStatusResult = {
		returned: entry.gate.returned,
		exempt: entry.exempt,
		forceCount: preForceCount,
		budgetLeft,
		forceMessage,
	};

	return Promise.resolve(ok(result));
}

/** returnStatusTool: `.handler(args, ctx, registry)` for tests, `.forRegistry(registry)` for extraTools. */
const returnStatusDefinition = {
	name: "return_status" as const,
	description:
		"Check whether HyperIdle requires you to return your work before stopping. " +
		`If forceMessage is non-null, call exactly one of: ${RETURN_ACTION_NAMES.join(", ")}. ` +
		"If forceMessage is null, you may stop normally.",
	inputSchema,

	handler: handle,
	forRegistry(registry: EnforcementRegistry): RegisteredTool {
		return {
			name: "return_status",
			description: this.description,
			inputSchema,
			handler: (args, ctx) => handle(args as Record<string, never>, ctx, registry),
		};
	},
} as const;

const { name: _functionName, ...returnStatusFields } = returnStatusDefinition;

// @lore: return_status bare name — opencode adds `<server>_` prefix; "hyperidle_" stacks to "hyperidle_hyperidle_return_status" (unreachable); register bare

// biome-ignore lint/style/useNamingConvention: the function's intrinsic .name IS the tool identifier — must stay snake_case to match "return_status".
function return_status(): typeof returnStatusDefinition {
	return returnStatusDefinition;
}

export const returnStatusTool = Object.assign(return_status, returnStatusFields);
