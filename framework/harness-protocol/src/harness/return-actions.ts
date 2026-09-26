/**
 * The closed, enumerable set of "return to HyperIdle" actions. A turn that
 * ends without invoking one is `not-returned` (see return-gate.ts). This set is
 * CLOSED: membership is a fixed list of tool names, never "any tool". Adding a
 * member is a deliberate edit here. (HyperIdle enumerates valid turn endings
 * by reading RETURN_ACTION_NAMES.)
 *
 * @lore Lives in @hyperidle/harness-protocol so the tool layer, every adapter, and
 * the enforcement observer import one definition — no per-package copy that can
 * drift. The "closed, not open-ended" guarantee is enforced at the type level
 * (ReturnActionName is a finite union from an `as const` readonly tuple) and at
 * runtime via the closure test in return-actions.closure.test.ts (imports
 * RETURN_ACTION_NAMES + ALL_TOOL_DEFINITIONS and asserts every member maps to a
 * real registered tool — drift caught at CI time).
 *
 * @lore The set is `edit_task` / `send_message`. `update_task_status` is
 * deferred — adding it later is a one-tool edit, not a model change. The
 * `_args` param in isReturnAction is pre-wired for path A (argument-gated
 * member) without widening the set.
 *
 * @lore the architecture doc §8 B4, narrowed at review (B4): `handoff_to`
 * (the standalone tool) is deleted — handoff is now an `edit_task` call that
 * sets `ownerAgentId`. `edit_task` replaces `handoff_to` in this set as path
 * A's first real argument-gated member, but membership on `args` alone is
 * too wide: a routine `edit_task` call that creates a subtask (no `id`, sets
 * `ownerAgentId` for the NEW subtask) or edits some OTHER task the session
 * happens to touch must not satisfy the gate just because the args shape
 * matches. `isReturnAction("edit_task", args, taskId)` is terminal only when
 * BOTH: the edit is the session's OWN task (`args.id === taskId`) AND the
 * edit moves the task away from the calling agent — the owner changes to
 * someone else, or the state moves to `review`/`done`. An ordinary field
 * edit (title, notes, state to anything else) on the session's own task
 * still does not satisfy the gate, and neither does any edit to a
 * different task.
 */

/**
 * The return-action names as a frozen readonly tuple.
 *
 * @lore AU27 Increment 3 (Decision 3): `reply` (the generic session-scoped
 * reply tool, Increment 2) joins the set — a session whose output belongs in
 * a calling thread (the assistant, and any other kind with one) satisfies
 * the gate by calling it. Membership alone is not enough to bind an agent to
 * the RIGHT action, though — see `shouldForceReturn`'s `required` param and
 * `harness-registry`'s `createGate(requiredReturnActions?)`.
 */
export const RETURN_ACTION_NAMES = ["edit_task", "send_message"] as const;

/** Finite union of all valid return-action tool names. */
export type ReturnActionName = (typeof RETURN_ACTION_NAMES)[number];

/** @internal Fast O(1) membership lookup. */
const RETURN_ACTION_SET: ReadonlySet<string> = new Set(RETURN_ACTION_NAMES);

/**
 * Strip a leading MCP namespace prefix from a tool name.
 *
 * CLI harnesses route HyperIdle tools through the MCP bridge, where they arrive
 * namespaced by client dialect. Claude/Codex use `mcp__<server>__<bare-name>`
 * (e.g. `mcp__hyperidle__send_message`). OpenCode exposes tools as
 * `<server>_<bare-name>` (e.g. `hyperidle_send_message`). The bare name is
 * `send_message`. This helper normalises all forms to the bare name so callers
 * can do a single set lookup.
 *
 * Pattern: `mcp__<server>__<name>` → `<name>`. Any string not matching the
 * pattern is returned unchanged (idempotent for bare names and unknown forms).
 *
 * @lore AR2: Fixed here — AR1 surfaced the bug end-to-end (session verdicted
 * `not_returned` even when the agent genuinely called `send_message` via MCP).
 * AR1 could not fix it (test-honesty scope only; must not change production
 * behavior to make a test pass). AR2 (provisionSession-seam WP) owns the fix.
 */
function stripMcpNamespace(toolName: string): string {
	// `mcp__<server>__<bare>` — two leading double-underscore-delimited segments.
	const match = /^mcp__.+?__(.+)$/.exec(toolName);
	if (match?.[1]) return match[1];
	const opencodeMatch = /^hyperidle_(.+)$/.exec(toolName);
	return opencodeMatch?.[1] ?? toolName;
}

/**
 * Per-tool return predicate. True when `toolName` is a member of the
 * closed accepted-return set AND its per-tool argument predicate holds.
 *
 * `submit_review` / `send_message` / `reply` are unconditionally terminal
 * (the pre-existing v1 behaviour). `edit_task` is path A's first real
 * argument-gated member — see the `@lore` on `RETURN_ACTION_NAMES`: terminal
 * only when the edit targets the session's OWN task (`args.id === taskId`)
 * AND moves it away from the calling agent (an owner change, or the state
 * moving to `review`/`done`). `taskId` absent ⇒ never terminal for
 * `edit_task` — there is no session task to compare against, so a bare
 * membership check would be exactly the over-wide predicate this narrowed.
 * Do NOT widen this to "any tool with the right args" — the set stays the
 * four named members.
 *
 * @lore AR2: MCP-namespaced tool names (`mcp__hyperidle__send_message` etc.)
 * are normalised to their bare form before the set lookup so CLI+MCP sessions
 * are verdicted correctly. A bare name passes through `stripMcpNamespace`
 * unchanged, so a harness that does not namespace is handled by the same path.
 */
export function isReturnAction(
	toolName: string,
	args?: Record<string, unknown>,
	taskId?: string,
): boolean {
	const bare = stripMcpNamespace(toolName);
	if (!RETURN_ACTION_SET.has(bare)) return false;
	if (bare === "edit_task") {
		if (!taskId || args?.id !== taskId) return false;
		const ownerChanged = typeof args?.ownerAgentId === "string" && args.ownerAgentId !== "";
		const stateMovedAway = args?.state === "review" || args?.state === "done";
		return ownerChanged || stateMovedAway;
	}
	return true;
}

/**
 * Return predicate that additionally binds
 * to a specific REQUIRED subset of the closed return set, not just "any
 * member". Membership alone both under-binds a session with a specific
 * required action (a `task_run` agent could satisfy the gate with
 * `reply("done")` instead of `submit_review`) and over-permits one (the
 * assistant has `send_message`/`handoff_to`/`submit_review` in its ordinary
 * registry too — plain membership would let it end without answering).
 *
 * `required` absent or empty ⇒ falls back to plain membership (the
 * unchanged, pre-Increment-3 behavior — every return action satisfies).
 *
 * @lore `return_status` (the self-check bridge tool every session gets —
 * `harness-registry`'s `return-status-tool.ts`) is deliberately NOT a member
 * of the base closed set (`RETURN_ACTION_SET`): an unfiltered session (no
 * `required`, e.g. a task_run) must still return real work — calling a
 * status check alone would let it stop without doing anything. It satisfies
 * the gate ONLY when a session's own `required` subset names it explicitly —
 * a subscription wake, which has no work-output action to call at all (no
 * task, no calling thread), reports its status and that IS its return.
 * Checked ahead of the base `isReturnAction` gate (which would reject it)
 * rather than added there, so this stays required-only, never a fallback.
 */
export function isRequiredReturnAction(
	toolName: string,
	required: readonly string[] | undefined,
	args?: Record<string, unknown>,
	taskId?: string,
): boolean {
	const bare = stripMcpNamespace(toolName);
	if (required?.includes("return_status") && bare === "return_status") return true;
	if (!isReturnAction(toolName, args, taskId)) return false;
	if (!required || required.length === 0) return true;
	return required.includes(bare);
}

/**
 * The canonical forcing message re-injected when an agent attempts to
 * stop without returning. Single source of truth — used by the Stop hook
 * callback and any future forcing path.
 *
 * @lore This string is what the agent sees when forced to return, when
 * the session has no specific `requiredReturnActions` (the pre-Increment-3
 * default). It names the three return tools that are valid for every
 * session regardless of kind — `reply` is deliberately excluded here
 * because it is only satisfiable by a session with a calling thread;
 * a session that needs `reply` specifically gets the required-subset
 * message from `buildForceReturnMessage`/`shouldForceReturn` instead.
 * The message is intentionally direct and action-oriented.
 */
export const FORCE_RETURN_MESSAGE =
	"You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: " +
	"edit_task (hand the task to another agent by setting its owner), or " +
	"send_message (send your result to a thread). Choose the one that fits and call it now.";

/** Human-readable hint for each return action, used to build a tailored forcing message. */
const RETURN_ACTION_HINTS: Record<ReturnActionName, string> = {
	edit_task: "hand the task to another agent by setting its owner",
	send_message: "send your result to a thread",
};

/**
 * A function from a canonical bare tool name to the LITERAL tool name the
 * current harness will accept — see `literalToolNamerForAdapterType`.
 *
 * @lore Widened from `(name: ReturnActionName) => string` to `(name: string)
 * => string`: `return_status` (the self-check bridge tool, never a member of
 * `ReturnActionName` — see `isRequiredReturnAction`'s `@lore`) still needs its
 * literal, harness-namespaced form for a subscription session's prompt
 * orientation. The mapping itself was always name-agnostic (a namespace
 * prefix, nothing more); only the type was narrower than the function.
 */
export type LiteralToolNamer = (name: string) => string;

/** Default namer: the bare name unchanged (the pre-Increment-8 default). */
const identityToolName: LiteralToolNamer = (name) => name;

/**
 * `mcp__<server>__<bare>` is the MCP-client
 * namespacing convention Claude Code, codex, and cursor-agent all present to
 * the model for a tool registered on our "hyperidle" MCP server (mirrors the
 * `mcp__` leg `stripMcpNamespace` already parses back to bare form for the
 * GATE). Naming the tool this way UP FRONT — in the orientation instruction
 * and in the forcing message — lets the model call it directly instead of
 * resolving a bare mention via an internal tool-search step first (the extra
 * round trip `vitest.integration.config.ts`'s `harness-timeout-ceiling` lore
 * describes and budgets timeout for).
 */
export const mcpNamespacedToolName: LiteralToolNamer = (name) => `mcp__hyperidle__${name}`;

/**
 * `hyperidle_<bare>` is opencode's own
 * MCP-client namespacing convention (the `hyperidle_` leg `stripMcpNamespace`
 * already parses back to bare form for the GATE). Unlike Claude/codex,
 * opencode's tested model does not resolve a bare mention to this namespaced
 * form — it fails outright ("Model tried to call unavailable tool 'reply'").
 */
export const opencodeToolName: LiteralToolNamer = (name) => `hyperidle_${name}`;

/**
 * The harness adapter "type" identifiers `AdapterPool` registration meta uses
 * (`adapter-pool.ts`) — the vocabulary `selectedAdapter.meta.type` carries.
 */
export type HarnessAdapterType = "claude-code" | "codex" | "opencode" | "cursor-agent";

/**
 * Resolve the right `LiteralToolNamer` for a
 * given harness adapter type, so any call site that names a return-action
 * tool in agent-facing text can say a name the agent can actually invoke.
 * An unrecognized or absent type falls back to the bare name — the
 * pre-Increment-8 default.
 */
export function literalToolNamerForAdapterType(
	adapterType: HarnessAdapterType | string | undefined,
): LiteralToolNamer {
	switch (adapterType) {
		case "opencode":
			return opencodeToolName;
		case "claude-code":
		case "codex":
		case "cursor-agent":
			return mcpNamespacedToolName;
		default:
			return identityToolName;
	}
}

/**
 * The forcing message, tailored to a
 * SPECIFIC required subset of the return set when one applies (e.g. the
 * assistant must be told to call `reply`, not the trio `FORCE_RETURN_MESSAGE`
 * names). `required` absent or empty returns the byte-identical
 * `FORCE_RETURN_MESSAGE` (the pre-Increment-3 default, full-set message)
 * — no behavior change for every session that has no specific requirement.
 *
 * `literalToolName` — optional, defaults to the bare name
 * — lets a caller substitute the harness-literal tool name (e.g.
 * `mcp__hyperidle__reply` / `hyperidle_reply`) for the name that appears in
 * the message, instead of the canonical bare name.
 */
export function buildForceReturnMessage(
	required?: readonly string[],
	literalToolName: LiteralToolNamer = identityToolName,
): string {
	if (!required || required.length === 0) return FORCE_RETURN_MESSAGE;
	const described = required.map((name) => {
		const key = name as ReturnActionName;
		const label = literalToolName(key);
		const hint = RETURN_ACTION_HINTS[key];
		return hint ? `${label} (${hint})` : label;
	});
	if (described.length === 1) {
		return `You have not yet returned your work to HyperIdle. Before this turn can end you must call ${described[0]}. Call it now.`;
	}
	const last = described[described.length - 1];
	const joined = `${described.slice(0, -1).join(", ")}, or ${last}`;
	return `You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: ${joined}. Choose the one that fits and call it now.`;
}

/**
 * Maximum number of force-continue re-injections per turn before falling
 * through to Tier-2 reject. N=2 is a bounded-retry discipline: one nudge, one
 * recovery.
 *
 * @lore After this budget is spent the forcing hook allows the stop and the
 * provisioning drain applies the not_returned outcome. The session never
 * loops forever and never hard-crashes losing mid-turn side-effects.
 */
export const MAX_FORCE_RETURNS = 2;

/**
 * Pure helper — determines whether to inject the forcing message.
 *
 * Returns `FORCE_RETURN_MESSAGE` when:
 *   - No return action was seen this turn (gate.returned === false), AND
 *   - The force budget has not been spent (forceCount < MAX_FORCE_RETURNS).
 *
 * Returns `null` when:
 *   - A return was already seen (gate.returned === true) — no force needed, OR
 *   - Budget spent (forceCount >= MAX_FORCE_RETURNS) — fall through to Tier-2 reject.
 *
 * Pure: does NOT mutate the gate or forceCount. The caller increments forceCount
 * and re-prompts. This function is safe to call multiple times with the same inputs.
 */
export function shouldForceReturn(
	gate: { readonly returned: boolean },
	forceCount: number,
	/**
	 * The session's specific required return
	 * subset, when it has one (e.g. `["reply"]` for a session whose output
	 * belongs in a calling thread). Absent ⇒ the pre-Increment-3 default
	 * (byte-identical `FORCE_RETURN_MESSAGE`, membership-only).
	 */
	required?: readonly string[],
	/**
	 * The harness-literal namer to use when
	 * building a required-subset message (see `buildForceReturnMessage`).
	 * Omitted ⇒ bare names (unchanged pre-Increment-8 behavior).
	 */
	literalToolName?: LiteralToolNamer,
): string | null {
	if (gate.returned) return null; // return was seen — allow stop
	if (forceCount >= MAX_FORCE_RETURNS) return null; // budget spent — Tier-2 reject
	return buildForceReturnMessage(required, literalToolName);
}
