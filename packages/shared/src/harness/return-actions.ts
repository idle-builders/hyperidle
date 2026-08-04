/**
 * AL6: The closed, enumerable set of "return to HyperIdle" actions. A turn that
 * ends without invoking one is `not-returned` (see return-gate.ts). This set is
 * CLOSED: membership is a fixed list of tool names, never "any tool". Adding a
 * member is a deliberate edit here. (AC2: HyperIdle enumerates valid turn endings
 * by reading RETURN_ACTION_NAMES.)
 *
 * @lore AL6: Lives in @hyperidle/shared so the tool layer, every adapter, and
 * the enforcement observer import one definition — no per-package copy that can
 * drift. The "closed, not open-ended" guarantee is enforced at the type level
 * (ReturnActionName is a finite union from an `as const` readonly tuple) and at
 * runtime via the closure test in return-actions.closure.test.ts (imports
 * RETURN_ACTION_NAMES + ALL_TOOL_DEFINITIONS and asserts every member maps to a
 * real registered tool — drift caught at CI time).
 *
 * v1 ships the name-only trio: submit_review / handoff_to / send_message.
 * update_task_status is deferred (concept §2.1 path B) — adding it later is a
 * one-tool edit, not a model change. The `_args` param in isReturnAction is
 * pre-wired for path A (argument-gated member) without widening the set.
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
export const RETURN_ACTION_NAMES = [
	"submit_review",
	"handoff_to",
	"send_message",
	"reply",
] as const;

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
 * `send_message`. The builtin harness calls bare names directly (no namespace).
 * This helper normalises all forms to the bare name so callers can do a single
 * set lookup.
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
 * AL6: Per-tool return predicate. True when `toolName` is a member of the
 * closed accepted-return set AND its per-tool argument predicate holds.
 *
 * v1: all three members are unconditionally terminal (`_args` unused).
 * Path A hook: when an argument-gated member (e.g. update_task_status→done)
 * is added, extend this function with a per-name predicate — do NOT widen
 * the set to "any tool with the right args".
 *
 * @lore AR2: MCP-namespaced tool names (`mcp__hyperidle__send_message` etc.)
 * are normalised to their bare form before the set lookup so CLI+MCP sessions
 * are verdicted correctly. The builtin harness is unaffected (bare names pass
 * through `stripMcpNamespace` unchanged).
 */
export function isReturnAction(toolName: string, _args?: Record<string, unknown>): boolean {
	return RETURN_ACTION_SET.has(stripMcpNamespace(toolName));
}

/**
 * AU27 Increment 3 (Decision 3) — return predicate that additionally binds
 * to a specific REQUIRED subset of the closed return set, not just "any
 * member". Membership alone both under-binds a session with a specific
 * required action (a `task_run` agent could satisfy the gate with
 * `reply("done")` instead of `submit_review`) and over-permits one (the
 * assistant has `send_message`/`handoff_to`/`submit_review` in its ordinary
 * registry too — plain membership would let it end without answering).
 *
 * `required` absent or empty ⇒ falls back to plain membership (the
 * unchanged, pre-Increment-3 behavior — every return action satisfies).
 */
export function isRequiredReturnAction(
	toolName: string,
	required: readonly string[] | undefined,
	args?: Record<string, unknown>,
): boolean {
	if (!isReturnAction(toolName, args)) return false;
	if (!required || required.length === 0) return true;
	return required.includes(stripMcpNamespace(toolName));
}

/**
 * AL6: Exemption predicate for internal-extraction drains (concept §1.5).
 *
 * A session run is an internal-extraction drain — exempt from return
 * enforcement — when its SessionConfig.tools is empty. With no tools the
 * run structurally CANNOT invoke a return action; enforcing one is
 * impossible, not merely skipped.
 *
 * The other two legs of the §1.5 predicate (deterministic structured-output
 * contract; not acting on the user's behalf) are call-site contracts that the
 * empty-tools leg already implies for any platform-internal drain.
 *
 * @lore AL6: accepts `{ tools: readonly string[] }` (a structural subset of
 * SessionConfig) so it can be called without importing the full SessionConfig
 * type — keeping this helper usable in tests that construct minimal config
 * objects without satisfying the entire interface.
 */
export function isInternalExtractionDrain(config: { tools: readonly string[] }): boolean {
	return config.tools.length === 0;
}

/**
 * AL6 v2: The canonical forcing message re-injected when an agent attempts to
 * stop without returning. Single source of truth — used by the SDK Stop hook
 * callback, the builtin loop re-inject, and any future forcing path.
 *
 * @lore AL6 v2: This string is what the agent sees when forced to return.
 * All three return tools are named so the agent can choose the appropriate one.
 * The message is intentionally direct and action-oriented.
 */
export const AL6_FORCE_RETURN_MESSAGE =
	"You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: " +
	"submit_review (submit work for review), handoff_to (hand the task to another agent or a human), or " +
	"send_message (send your result to a thread). Choose the one that fits and call it now.";

/** Human-readable hint for each return action, used to build a tailored forcing message. */
const RETURN_ACTION_HINTS: Record<ReturnActionName, string> = {
	submit_review: "submit work for review",
	handoff_to: "hand the task to another agent or a human",
	send_message: "send your result to a thread",
	reply: "answer the person or agent who triggered this session",
};

/**
 * A function from a canonical bare return-action name to the LITERAL tool
 * name the current harness will accept — see `literalToolNamerForAdapterType`.
 */
export type LiteralToolNamer = (name: ReturnActionName) => string;

/** Default namer: the bare name unchanged (builtin, and the pre-Increment-8 default). */
const identityToolName: LiteralToolNamer = (name) => name;

/**
 * AU27 Increment 8 (BLOCKER fix) — `mcp__<server>__<bare>` is the MCP-client
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
 * AU27 Increment 8 (BLOCKER fix) — `hyperidle_<bare>` is opencode's own
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
export type HarnessAdapterType = "builtin" | "claude-code" | "codex" | "opencode" | "cursor-agent";

/**
 * AU27 Increment 8 (BLOCKER fix) — resolve the right `LiteralToolNamer` for a
 * given harness adapter type, so any call site that names a return-action
 * tool in agent-facing text can say a name the agent can actually invoke.
 * `builtin` calls tools directly (no MCP, no namespace) and an unrecognized/
 * absent type falls back to the bare name — the pre-Increment-8 default.
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
 * AU27 Increment 3 (Decision 3) — the forcing message, tailored to a
 * SPECIFIC required subset of the return set when one applies (e.g. the
 * assistant must be told to call `reply`, not the trio `AL6_FORCE_RETURN_MESSAGE`
 * names). `required` absent or empty returns the byte-identical
 * `AL6_FORCE_RETURN_MESSAGE` (the pre-Increment-3 default, full-set message)
 * — no behavior change for every session that has no specific requirement.
 *
 * `literalToolName` (AU27 Increment 8) — optional, defaults to the bare name
 * — lets a caller substitute the harness-literal tool name (e.g.
 * `mcp__hyperidle__reply` / `hyperidle_reply`) for the name that appears in
 * the message, instead of the canonical bare name.
 */
export function buildForceReturnMessage(
	required?: readonly string[],
	literalToolName: LiteralToolNamer = identityToolName,
): string {
	if (!required || required.length === 0) return AL6_FORCE_RETURN_MESSAGE;
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
 * AL6 v2: Maximum number of force-continue re-injections per turn before
 * falling through to Tier-2 reject. N=2 matches the builtin's bounded-retry
 * discipline (one nudge, one recovery).
 *
 * @lore AL6 v2: After this budget is spent the forcing hook allows the stop
 * and the provisioning drain applies the not_returned outcome. The session
 * never loops forever and never hard-crashes losing mid-turn side-effects.
 */
export const AL6_MAX_FORCE_RETURNS = 2;

/**
 * AL6 v2: Pure helper — determines whether to inject the forcing message.
 *
 * Returns `AL6_FORCE_RETURN_MESSAGE` when:
 *   - No return action was seen this turn (gate.returned === false), AND
 *   - The force budget has not been spent (forceCount < AL6_MAX_FORCE_RETURNS).
 *
 * Returns `null` when:
 *   - A return was already seen (gate.returned === true) — no force needed, OR
 *   - Budget spent (forceCount >= AL6_MAX_FORCE_RETURNS) — fall through to Tier-2 reject.
 *
 * Pure: does NOT mutate the gate or forceCount. The caller increments forceCount
 * and re-prompts. This function is safe to call multiple times with the same inputs.
 */
export function shouldForceReturn(
	gate: { readonly returned: boolean },
	forceCount: number,
	/**
	 * AU27 Increment 3 (Decision 3) — the session's specific required return
	 * subset, when it has one (e.g. `["reply"]` for a session whose output
	 * belongs in a calling thread). Absent ⇒ the pre-Increment-3 default
	 * (byte-identical `AL6_FORCE_RETURN_MESSAGE`, membership-only).
	 */
	required?: readonly string[],
	/**
	 * AU27 Increment 8 (BLOCKER fix) — the harness-literal namer to use when
	 * building a required-subset message (see `buildForceReturnMessage`).
	 * Omitted ⇒ bare names (unchanged pre-Increment-8 behavior).
	 */
	literalToolName?: LiteralToolNamer,
): string | null {
	if (gate.returned) return null; // return was seen — allow stop
	if (forceCount >= AL6_MAX_FORCE_RETURNS) return null; // budget spent — Tier-2 reject
	return buildForceReturnMessage(required, literalToolName);
}
