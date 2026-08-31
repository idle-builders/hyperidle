import {
	MAX_FORCE_RETURNS,
	mcpNamespacedToolName,
	shouldForceReturn,
} from "@hyperidle/harness-protocol";
/**
 * @lore AU26 B1a: the local `` re-implementation this file used
 * to declare (with its own `@lore` saying it existed only to avoid importing
 * core-api's copy) is DELETED. A1 moved the AF11 declaration into
 * `@hyperidle/http-middleware`, a package `harness-registry` already depends on, so
 * the reason is gone and the duplicate goes with it.
 */
import { Hono } from "hono";
import type { ActionGateRegistry } from "../action-gate-registry.js";
import type { EnforcementRegistry } from "../enforcement-registry.js";

interface McpSessionRegistry {
	lookup(token: string): { readonly sessionId: string } | undefined;
	handleRequest(token: string, request: Request): Promise<Response>;
}

/**
 * @lore AU11 AC-2: relocated from `routes/mcp-route.ts` to agent-owned
 * `services/`. The plan's route-cleanup section initially characterized this
 * file as an allowed "descriptor read" (like harnesses.ts/connections.ts) —
 * but its actual body directly executes MCP bridge requests
 * (`bridgeRegistry.handleRequest`) and hook-adjudication state mutation
 * (`enforcementRegistry.incrementForce`), not a read-only capability list.
 * Since this file's entire purpose IS harness/MCP execution surface, the
 * correct AC-2 fix is relocation (same pattern as `worker-ws.ts`), not a
 * descriptor-read carve-out. Pure file move — logic byte-identical; only
 * the one `server-factory.ts` import site was repointed.
 */

/**
 * Create the Hono sub-router for MCP bridge requests.
 *
 * Routes (all mounted on /api):
 *   ALL  /mcp/:token              — MCP JSON-RPC bridge (existing)
 *   POST /mcp/:token/return-status — plain-HTTP hook adjudication endpoint
 *
 * The /return-status route is the real adjudicator for file-provisioned hooks
 * (settings-claude and settings-codex channels). The hook scripts POST to this
 * endpoint using the session bridge token as Bearer auth. The endpoint resolves
 * token → sessionId (via bridgeRegistry.lookup) → enforcement registry entry →
 * { returned, exempt, forceCount, budgetLeft, forceMessage }.
 *
 * Protocol (matches buildReturnCheckScript / buildCodexReturnCheckScript):
 *   Request:  POST /api/mcp/:token/return-status  Body: {} (ignored)
 *             Authorization: Bearer <token>
 *   Response: 200  Body empty          → hook allows stop (exit 0 / decision:approve)
 *             200  Body = forceMessage → hook blocks stop (exit 2+stderr / decision:block)
 *             401                      → token not found (no active session)
 *
 * @lore The hook scripts in provision-return-hook.ts curl
 * `${mcpUrl}/return-status` where mcpUrl = `${base}/api/mcp/${token}`.
 * The old ALL /mcp/:token route (exact-match) 404'd on the extra /return-status
 * segment. This POST route adds the explicit sub-path so the hook reaches the
 * REAL adjudicator (enforcementRegistry) instead of getting an empty 404 body
 * that the hook mistakenly treated as "allow stop".
 *
 * @lore X2 D1: Both routes MUST be mounted BEFORE the auth middleware so MCP
 * clients and hook scripts can authenticate via the session token in the URL
 * path, not via X-API-Key.
 */
export function createMcpRouter(
	bridgeRegistry: McpSessionRegistry,
	enforcementRegistry?: EnforcementRegistry,
	gateRegistry?: ActionGateRegistry,
): Hono {
	const router = new Hono();

	// ── Return-status adjudication endpoint for file-provisioned hooks ──
	//
	// Must be registered BEFORE the catch-all ALL /mcp/:token route so Hono
	// matches the more-specific path first.
	//
	// @lore enforcementRegistry is optional so existing callers that
	// don't pass it (e.g. tests that only need the MCP bridge) still compile and
	// run. When absent, the endpoint returns 501 Not Implemented rather than 500,
	// so the hook script sees a non-empty response and falls back to allow-stop
	// (drain-gate floor backstops). Production wiring (server-factory.ts) MUST
	// pass the registry.
	router.post("/mcp/:token/return-status", (c) => {
		const token = c.req.param("token");

		// Validate Bearer token in Authorization header (optional belt-and-suspenders
		// check — the token is already in the URL path, but belt-and-suspenders auth
		// matches what the hook script sends).
		const authHeader = c.req.header("Authorization") ?? "";
		if (authHeader !== `Bearer ${token}`) {
			return c.text("Unauthorized", 401);
		}

		// Resolve token → sessionId via bridge registry.
		const bridge = bridgeRegistry.lookup(token);
		if (!bridge) {
			// Header equality alone does not prove that the presented credential was
			// issued. Ended sessions and invented tokens are both unauthorized.
			return c.text("Unauthorized", 401);
		}

		if (!enforcementRegistry) {
			// Registry not wired — should not happen in production.
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn("[return-status] enforcement resource not configured");
			return c.text("Not Implemented", 501);
		}

		const { sessionId } = bridge;
		const entry = enforcementRegistry.get(sessionId);

		if (!entry) {
			// Session not in registry (internal/extraction drain or already ended).
			// Allow the stop.
			return c.text("", 200);
		}

		// Read pre-increment state.
		const preForceCount = entry.forceCount;
		// AU27 Increment 3 (Decision 3): narrow to the session's specific
		// required subset when the registered entry has one.
		// AU27 Increment 8 (BLOCKER fix): this route adjudicates BOTH the
		// settings-claude and settings-codex hook channels — both present
		// tools to the model namespaced `mcp__hyperidle__<bare>` — so a
		// required-subset message names the literal tool the agent can
		// actually call, instead of a bare name it must resolve itself.
		const forceMessage = entry.exempt
			? null
			: shouldForceReturn(
					entry.gate,
					preForceCount,
					entry.requiredReturnActions,
					mcpNamespacedToolName,
				);

		if (forceMessage !== null) {
			// Increment AFTER reading (mirrors returnStatusTool.handler semantics).
			enforcementRegistry.incrementForce(sessionId);
			// Return the forceMessage as the response body. The hook script:
			//   - claude: sees non-empty body → writes to stderr + exits 2 → blocks stop
			//   - codex:  sees non-empty body → prints {"decision":"block","reason":body} → blocks stop
			return c.text(forceMessage, 200);
		}

		// Budget exhausted or return already seen — allow the stop.
		const budgetLeft = Math.max(0, MAX_FORCE_RETURNS - preForceCount);
		// Return empty body (with optional debug header that does not affect hook behavior).
		return new Response("", {
			status: 200,
			headers: {
				"X-Return-Budget-Left": String(budgetLeft),
				"X-Return-Seen": String(entry.gate.returned),
			},
		});
	});

	// ── Action gate adjudication endpoint ────────────────────────────────────
	//
	// Called by the per-harness gate-check hook script (piped from hook stdin).
	// Resolves token → sessionId → gate registry → rule match.
	// ?harness=claude|codex|cursor|opencode selects the response format.
	//
	// Single-use clearances are checked FIRST (keyed to the exact tool name).
	// Rule matching is substring: the pattern must appear in
	//   `<tool_name> <JSON.stringify(tool_input)>`.
	//
	// On deny: sets a pending block in the gate registry so the subsequent
	// submit_review call can record it as a gate review.
	//
	// @lore BA2: MUST be registered BEFORE the catch-all /mcp/:token route.
	// @lore BA2 terse-deny: the deny message names ONLY the rule — no imperative.
	// The instruction to call submit_review lives in the seed prompt (finding
	// from harness-research: Sonnet refused instruction in hook message as
	// "characteristic of a prompt injection").
	router.post("/mcp/:token/action-check", async (c) => {
		const token = c.req.param("token");
		const harness = c.req.query("harness") ?? "generic";

		// Validate Bearer token.
		const authHeader = c.req.header("Authorization") ?? "";
		if (authHeader !== `Bearer ${token}`) {
			return c.text("Unauthorized", 401);
		}

		const bridge = bridgeRegistry.lookup(token);
		if (!bridge) {
			return c.text("Unauthorized", 401);
		}

		if (!gateRegistry) {
			// Gate not wired — fail open (no rules to enforce).
			return c.json(buildGateAllow(harness));
		}

		const { sessionId } = bridge;
		const entry = gateRegistry.get(sessionId);
		if (!entry || entry.rules.length === 0) {
			// Session has no rules — allow.
			return c.json(buildGateAllow(harness));
		}

		// Parse the hook event to extract the tool name and input.
		let hookBody: Record<string, unknown>;
		try {
			hookBody = await c.req.json<Record<string, unknown>>();
		} catch {
			// Unparseable body — fail open (can't determine what to check).
			return c.json(buildGateAllow(harness));
		}

		// Extract tool name from the hook event JSON (all supported harnesses
		// use "tool_name" as the field name).
		const toolName = typeof hookBody.tool_name === "string" ? hookBody.tool_name : "";
		const toolInput = hookBody.tool_input ?? hookBody.input ?? {};
		const toolText = `${toolName} ${JSON.stringify(toolInput)}`;

		// Check single-use clearances FIRST — consume and allow if found.
		// @lore BA2 single-use-keyed-to-action: clearance is per tool name.
		if (gateRegistry.checkAndConsumeClearance(sessionId, toolName)) {
			return c.json(buildGateAllow(harness));
		}

		// Check rules — pattern is a case-insensitive substring of tool+input.
		const matchedRule = entry.rules.find((rule) =>
			toolText.toLowerCase().includes(rule.pattern.toLowerCase()),
		);

		if (!matchedRule) {
			return c.json(buildGateAllow(harness));
		}

		// Rule matched — deny and record the pending block.
		gateRegistry.setPendingBlock(sessionId, {
			ruleId: matchedRule.id,
			rulePattern: matchedRule.pattern,
			blockedTool: toolName,
		});

		// Terse fact: names the rule, no imperative.
		const denyReason = `Action blocked by rule: ${matchedRule.description || matchedRule.pattern}`;
		return c.json(buildGateDeny(harness, denyReason));
	});

	// ── MCP JSON-RPC bridge (existing — catch-all) ────────────────────────────
	router.all("/mcp/:token", async (c) => {
		const token = c.req.param("token");
		const response = await bridgeRegistry.handleRequest(token, c.req.raw);
		return response;
	});

	return router;
}

export type { McpSessionRegistry };

// ── Gate response builders ────────────────────────────────────────────────────

/**
 * Build the harness-specific "allow" response for /action-check.
 *
 * @lore BA2 hook-format: each harness reads a different JSON shape from the
 * hook's stdout. The server returns the exact shape so the script is just
 * `cat | curl ... | cat` with no client-side JSON manipulation.
 */
function buildGateAllow(harness: string): unknown {
	switch (harness) {
		case "claude":
			return {
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "allow",
				},
			};
		case "codex":
			return { decision: "approve" };
		case "cursor":
			return { permission: "allow" };
		default:
			// opencode plugin / generic callers check decision field.
			return { decision: "allow" };
	}
}

/**
 * Build the harness-specific "deny" response for /action-check.
 *
 * @lore BA2 cursor-user_message: cursor-agent discards the `agent_message`
 * field (research finding). Must use `user_message` for the model to receive
 * the reason. Verified against installed binary.
 */
function buildGateDeny(harness: string, reason: string): unknown {
	switch (harness) {
		case "claude":
			return {
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: reason,
				},
			};
		case "codex":
			return { decision: "block", reason };
		case "cursor":
			return { permission: "deny", user_message: reason };
		default:
			// opencode plugin / generic callers.
			return { decision: "deny", reason };
	}
}
