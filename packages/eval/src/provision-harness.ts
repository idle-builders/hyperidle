/**
 * X7: Eval provision harness — wires up ProvisionSessionDeps without booting a server.
 *
 * @lore X7: We call provisionSession() directly instead of booting the Hono
 * server. The server route handler also calls provisionSession() — so eval
 * exercises identical behavior at zero cost: no port binding, no auth
 * middleware, no WebSocket setup.
 *
 * @lore X7: teamId → productId mapping. ProvisionSessionParams.productId
 * receives the teamId value (confirmed in sessions-routes.ts: productId: task.teamId).
 * The field name is kept for backward compat (see @lore U1 in session-provisioning.ts).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { AdapterPool } from "@hyperidle/server/harness/adapter-pool";
import { BuiltinHarnessAdapter } from "@hyperidle/server/harness/builtin-harness-adapter";
import { CliHarnessAdapter } from "@hyperidle/server/harness/cli-harness-adapter";
import { callLlm } from "@hyperidle/server/harness/llm-client";
import { LocalSandboxAdapter } from "@hyperidle/server/harness/local-sandbox-adapter";
import { provisionSession } from "@hyperidle/server/services/session-provisioning";
import type {
	EventBus,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	ResolvedModel,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import type { TriggerResult } from "./types.js";

/** @internal The eval-builtin adapter name. */
const EVAL_BUILTIN_NAME = "eval-builtin";
/** @internal The eval-external adapter name. */
const EVAL_EXTERNAL_NAME = "eval-external";

// ── External-shaped real-model adapter (AL6 v3 T10) ──────────────────────────
//
// A minimal adapter with hasNativeReturnHook:false, canReEngage:true.
// It reads AGENTS.md from the sandbox at startSession and uses it as the
// system prompt for a single real LLM call. No in-turn hook — only the
// provisioning re-prompt loop (Layer B) can force a return.
//
// Design: when the loop rewrites AGENTS.md (via rewriteSandboxForcing) and
// re-spawns, this adapter reads the updated file on the new startSession
// and the real model now sees AL6_FORCE_RETURN_MESSAGE in its system prompt.
//
// @lore AL6 v3: This is an eval fixture, NOT a production adapter. It exists
// to prove that the provisioning re-prompt loop works on a non-builtin adapter.
// Its sole job: one real LLM call per run, seeded from the sandbox file.

interface ExternalShapedSession {
	readonly sessionId: string;
	readonly systemPrompt: string;
	readonly resolvedModel: ResolvedModel;
}

function makeExternalShapedAdapter(resolvedModel: ResolvedModel): HarnessAdapter {
	const sessions = new Map<string, ExternalShapedSession>();

	const adapter: HarnessAdapter = {
		async startSession(config: SessionConfig): Promise<SessionHandle> {
			// Read the sandbox AGENTS.md — this is the ONLY context channel.
			// When the provisioner rewrites it (rewriteSandboxForcing), the next
			// startSession call reads the updated file with AL6_FORCE_RETURN_MESSAGE.
			let systemPrompt = "";
			try {
				const agentsMdPath = path.join(config.sandboxPath, "AGENTS.md");
				systemPrompt = fs.readFileSync(agentsMdPath, "utf-8");
			} catch {
				// File may not exist yet; fallback to assembledPrompt.
				systemPrompt = config.assembledPrompt;
			}

			sessions.set(config.sessionId, {
				sessionId: config.sessionId,
				systemPrompt,
				resolvedModel,
			});

			return { sessionId: config.sessionId };
		},

		async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			const session = sessions.get(handle.sessionId);
			if (!session) {
				yield {
					type: "error",
					message: "ExternalShapedAdapter: session not found",
					code: "SESSION_NOT_FOUND",
				};
				return;
			}

			// Make a real LLM call with the sandbox-file system prompt.
			// This is the ONLY call per run — no tool execution loop.
			// Tool calls in the response are yielded as tool_call events.
			let response: Awaited<ReturnType<typeof callLlm>>;
			try {
				response = await callLlm({
					model: session.resolvedModel,
					system: session.systemPrompt,
					messages: [
						{
							role: "user",
							content: "Complete your assigned task.",
						},
					],
					// No tools passed — the agent must use text-based tool calls
					// (which the builtin adapter would parse). For the forcing eval,
					// we care about the toolName events parsed from response content.
					// But since Anthropic/OpenRouter supports native tool use, pass
					// the submit_review tool definition so the model can use it natively.
					tools: [
						{
							name: "submit_review",
							description:
								"Submit your work for review. Call this when you have completed your task.",
							inputSchema: {
								type: "object",
								properties: {
									message: {
										type: "string",
										description: "Summary of work completed",
									},
									verdict: {
										type: "string",
										enum: ["approved", "needs_changes", "pending"],
										description: "Your assessment",
									},
								},
								required: ["message"],
							},
						},
						{
							name: "write_memory",
							description: "Write a key-value pair to agent memory.",
							inputSchema: {
								type: "object",
								properties: {
									key: { type: "string" },
									value: { type: "string" },
								},
								required: ["key", "value"],
							},
						},
					],
					maxTokens: 1024,
				});
			} catch (err) {
				yield {
					type: "error",
					message: `ExternalShapedAdapter: LLM call failed: ${String(err)}`,
					code: "LLM_CALL_FAILED",
				};
				return;
			}

			// Yield cost update from response usage.
			// Rough estimate: assume workhorse tier pricing (~$0.000001/token).
			const totalTokens = response.usage.inputTokens + response.usage.outputTokens;
			const estimatedCostUsd = totalTokens * 0.000001;
			if (estimatedCostUsd > 0) {
				yield {
					type: "cost_update",
					totalCost: estimatedCostUsd,
					deltaCost: estimatedCostUsd,
					currency: "USD",
				};
			}

			// Yield token_usage event.
			yield {
				type: "token_usage",
				inputTokens: response.usage.inputTokens,
				outputTokens: response.usage.outputTokens,
			};

			// Yield tool_call events from the response's tool_use blocks.
			// These are what the ReturnGate observes to detect submit_review.
			for (const block of response.content) {
				if (block.type === "tool_use") {
					yield {
						type: "tool_call",
						toolName: block.name,
						args: block.input,
					};
				}
			}

			// Yield completion with any text content.
			const text = (
				response.content as Array<{ type: string; text?: string; name?: string; input?: unknown }>
			)
				.filter((b) => b.type === "text")
				.map((b) => b.text ?? "")
				.join("");
			yield { type: "completion", text };

			sessions.delete(handle.sessionId);
		},

		async stopSession(handle: SessionHandle): Promise<SessionResult> {
			sessions.delete(handle.sessionId);
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				mcpSupport: false,
				// @lore AL6 v3: External-shaped: no in-turn hook (Layer-B only).
				// canReEngage:true — the provisioner's re-prompt loop rewrites AGENTS.md
				// and re-calls startSession; the new run reads the updated file.
				returnEnforcement: "none",
			};
		},
	};

	return adapter;
}

export interface EvalProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly resolvedModel: ResolvedModel;
	readonly resolvedFastModel?: ResolvedModel;
	readonly sandboxBasePath: string;
}

/**
 * Run provisionSession for an eval scenario.
 *
 * Assembles AdapterPool (with BuiltinHarnessAdapter or external adapter),
 * LocalSandboxAdapter, and calls provisionSession directly.
 * MCP bridge is omitted (optional in ProvisionSessionDeps).
 *
 * Returns the ProvisionSessionResult mapped to TriggerResult with wall-clock
 * duration.
 *
 * @lore X7: maxIterations is set to 20 for eval to limit cost per scenario.
 * The default of 50 would be too expensive for automated eval runs.
 *
 * @lore X7: "stopped" SessionOutcome is mapped to "crashed" because eval
 * sessions cannot be manually stopped. This narrowing satisfies the
 * TriggerResult.outcome type ("completed" | "crashed").
 *
 * @lore AL6 v3 T10: harnessKind:"external" registers the ExternalShapedAdapter
 * (hasNativeReturnHook:false, canReEngage:true). Adapter selection:
 * 1. If the `claude` CLI binary is available: use CliHarnessAdapter (real subprocess).
 * 2. Else: use ExternalShapedAdapter (direct LLM call, reads AGENTS.md from sandbox).
 * Both prove the Layer-B re-prompt loop — neither uses Layer-A in-turn forcing.
 */
export async function runEvalSession(
	deps: EvalProvisionDeps,
	params: {
		readonly taskId: string;
		readonly agentId: string;
		/** The teamId value — mapped to productId in ProvisionSessionParams. */
		readonly teamId: string;
		/**
		 * AL6 v3 T10: Select the harness kind.
		 * "builtin" (default): uses BuiltinHarnessAdapter (Layer-A, in-turn hook).
		 * "external": uses external-shaped adapter (Layer-B, re-prompt loop only).
		 */
		readonly harnessKind?: "builtin" | "external";
	},
): Promise<TriggerResult> {
	const workspace = new LocalSandboxAdapter();
	const pool = new AdapterPool();

	const harnessKind = params.harnessKind ?? "builtin";

	if (harnessKind === "external") {
		// AL6 v3 T10: external path.
		// Prefer real claude CLI if available AND the model is Anthropic (the CLI
		// only authenticates via ANTHROPIC_API_KEY, not OpenRouter).
		// Fall back to ExternalShapedAdapter (direct LLM call, no subprocess).
		//
		// @lore AL6 v3 T10: The carrier IS the sandbox file — both choices read
		// AGENTS.md/CLAUDE.md from cwd:sandboxPath. The CLI reads it on spawn;
		// ExternalShapedAdapter reads it in startSession(). Neither has a Layer-A hook.
		//
		// @lore AL6 v3: claude CLI requires ANTHROPIC_API_KEY. When the resolved model
		// is openrouter (or openai-compatible), the CLI would fail auth even if the
		// binary exists. Guard: only use CLI when provider="anthropic".
		const claudeAvailable =
			deps.resolvedModel.provider === "anthropic" &&
			(await CliHarnessAdapter.checkAvailability("claude"));

		if (claudeAvailable) {
			// Real claude CLI in ndjson/stream-json mode.
			// @lore AL6 v3: claude CLI args follow the AF10 cost-test pattern (ndjson mode).
			// The CLI reads AGENTS.md from the working directory (cwd = sandboxPath).
			const cliAdapter = new CliHarnessAdapter({
				binary: "claude",
				args: ["-p", "--output-format", "stream-json", "--verbose"],
				envMap: {
					ANTHROPIC_API_KEY: "{{apiKey}}",
				},
				eventFormat: "ndjson",
				envAllowlist: ["PATH", "HOME", "LANG", "ANTHROPIC_API_KEY"],
				costField: "total_cost_usd",
			});
			pool.register(EVAL_EXTERNAL_NAME, cliAdapter, {
				name: "Eval External CLI (claude)",
				kind: "local",
				type: "builtin", // type="builtin" so pool selection works without harnessType filter
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			});
		} else {
			// No CLI binary — use direct LLM call adapter.
			const externalAdapter = makeExternalShapedAdapter(deps.resolvedModel);
			pool.register(EVAL_EXTERNAL_NAME, externalAdapter, {
				name: "Eval External Real-Model Adapter",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 1,
			});
		}
	} else {
		// Default: Register a BuiltinHarnessAdapter with maxIterations: 20 to limit eval cost.
		const builtinAdapter = new BuiltinHarnessAdapter({ maxIterations: 20 });
		pool.register(EVAL_BUILTIN_NAME, builtinAdapter, {
			name: "Eval Built-in Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 1,
		});
	}

	const startMs = Date.now();

	const result = await provisionSession(
		{
			db: deps.db,
			eventBus: deps.eventBus,
			adapterPool: pool,
			workspace,
			// MCP bridge omitted — optional in ProvisionSessionDeps
		},
		{
			taskId: params.taskId,
			agentId: params.agentId,
			// @lore X7 U1: productId receives the teamId value.
			// ProvisionSessionParams.productId is the field name (kept for backward
			// compat) but the value is always a teams.id (which IS the teamId).
			productId: params.teamId,
			sandboxBasePath: deps.sandboxBasePath,
			resolvedModel: deps.resolvedModel,
			resolvedFastModel: deps.resolvedFastModel,
			// No cost cap during eval — cost is tracked but not capped.
			factoryCap: undefined,
		},
	);

	const durationMs = Date.now() - startMs;

	// AL6 v2 (T9 WARNING-B): Map outcomes to TriggerResult.
	// "completed" → "completed", "not_returned" → "not_returned" (first-class).
	// "stopped" → "crashed" (eval sessions cannot be manually stopped).
	// "budget_exhausted" | "crashed" → "crashed".
	const outcome: "completed" | "crashed" | "not_returned" =
		result.outcome === "completed"
			? "completed"
			: result.outcome === "not_returned"
				? "not_returned"
				: "crashed";

	// AL6 v3 (T10): Surface forceReturnCount from ProvisionSessionResult directly.
	// result.forceReturnCount is the unified Layer-A + Layer-B count set by runSession.
	// This works for ALL adapter types (builtin, cli, external) — not just builtin.
	const forceReturnCount = result.forceReturnCount;

	return {
		sessionId: result.sessionId,
		outcome,
		totalCostCents: result.totalCostCents,
		taskId: result.taskId ?? params.taskId,
		durationMs,
		// AL6 v2: Return verdict and force count for eval judges.
		returnVerdict: result.returnVerdict,
		forceReturnCount,
	};
}
