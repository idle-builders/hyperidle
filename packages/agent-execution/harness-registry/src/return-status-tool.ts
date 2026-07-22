/**
 * AL6 v4-final — hyperidle_return_status bridge tool.
 *
 * A ToolDefinition injected into the per-session registry via
 * buildToolRegistry's extraTools option. It reads ctx.sessionId → enforcement
 * registry → { returned, exempt, forceCount, budgetLeft, forceMessage }.
 *
 * Key semantics:
 *   - returned=true OR exempt=true OR budgetLeft=0 → forceMessage: null (allow end)
 *   - returned=false AND !exempt AND budgetLeft>0 → forceMessage = AL6_FORCE_RETURN_MESSAGE
 *   - calling the tool with forceMessage!==null increments forceCount in registry
 *
 * The tool is NOT in ALL_TOOL_DEFINITIONS (it is not a universal skill tool).
 * It is injected per-session via buildToolRegistry(ctx, { extraTools: [returnStatusTool.forRegistry(registry)] }).
 *
 * @lore AL6 v4-final: The tool's handler signature extends ToolDefinition with a
 * third `registry` argument so unit tests can call it with an isolated registry
 * (not the process-level singleton). The `forRegistry(registry)` factory returns
 * a RegisteredTool that closes over the provided registry — the production path
 * passes the per-session enforcementRegistry from session-provisioning.ts.
 */

import {
	AL6_MAX_FORCE_RETURNS,
	type EnforcementRegistry,
	ok,
	type RegisteredTool,
	shouldForceReturn,
	type ToolContext,
	type ToolResult,
} from "@hyperidle/shared";
import z from "zod";

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
async function handle(
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
		return ok(noEntry);
	}

	// Read pre-increment state: "how many times have you been forced before THIS call".
	const preForceCount = entry.forceCount;
	const forceMessage = entry.exempt ? null : shouldForceReturn(entry.gate, preForceCount);

	// If forceMessage is non-null, this is an active force — increment AFTER reading.
	if (forceMessage !== null) {
		registry.incrementForce(ctx.sessionId);
	}

	// forceCount in response = number of prior forces (before this call).
	// budgetLeft = remaining budget at the time this call was made.
	const budgetLeft = Math.max(0, AL6_MAX_FORCE_RETURNS - preForceCount);

	const result: ReturnStatusResult = {
		returned: entry.gate.returned,
		exempt: entry.exempt,
		forceCount: preForceCount,
		budgetLeft,
		forceMessage,
	};

	return ok(result);
}

/**
 * returnStatusTool: the bridge tool object.
 *
 * - `.handler(args, ctx, registry)` — callable directly in tests (3-arg form).
 * - `.forRegistry(registry)` — returns a RegisteredTool for use in extraTools.
 * - `.name`, `.description`, `.inputSchema` — standard ToolDefinition fields.
 */
export const returnStatusTool = {
	name: "hyperidle_return_status" as const,
	description:
		"Check whether HyperIdle requires you to return your work before stopping. " +
		"If forceMessage is non-null, call exactly one of: submit_review, handoff_to, or send_message. " +
		"If forceMessage is null, you may stop normally.",
	inputSchema,

	/** Direct 3-arg handler for unit tests. */
	handler: handle,

	/**
	 * Produce a RegisteredTool bound to a specific enforcement registry.
	 * Pass the result as an element of extraTools in buildToolRegistry.
	 */
	forRegistry(registry: EnforcementRegistry): RegisteredTool {
		return {
			name: "hyperidle_return_status",
			description: this.description,
			inputSchema,
			handler: (args, ctx) => handle(args as Record<string, never>, ctx, registry),
		};
	},
} as const;
