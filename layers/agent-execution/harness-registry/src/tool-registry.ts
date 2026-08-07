/**
 * The dispatch: given a pre-assembled list of tool definitions (built by
 * `@hyperidle/tool-handlers`, DI-wired to domain-Service ports) + a
 * per-invocation `ToolContext`, build a `ToolRegistry` that role-filters,
 * validates args against each tool's zod schema, and calls the matched
 * handler — the "handler" is already the fully domain-wired function
 * `tool-handlers` supplied; this dispatch never inspects `ctx.db` itself,
 * it only forwards it opaquely into the injected `ProposedCallWorkflowPort`
 * (AL7 trust-first workflow router).
 *
 * @lore AU19 Increment 4 (§7.5 C1): this is `packages/server/src/tools/
 * tool-registry.ts`'s `buildToolRegistry`/`invoke`, split at the DB boundary.
 * The control flow (classify reversibility → capture-if-irreversible →
 * CAS-consume-if-approved → call handler → record outcome) is unchanged —
 * every DB touch (`captureProposedCall`/`consumeTailoredGrant`/
 * `recordOutcome`, previously raw `@hyperidle/db` queries against
 * `proposedCalls`/`tailoredGrants`/`operationOutcomes`) now goes through the
 * injected `ProposedCallWorkflowPort<TDb>` (`@hyperidle/shared`), concretely
 * wired by the composition root to `@hyperidle/review`'s owned exports
 * (`review` owns those three tables — Table ACL, Mechanism A). Zero domain
 * Service or `@hyperidle/db` import here (Mechanism B, enforced literally
 * for agent-execution).
 */

import {
	type BuildToolRegistryOptions,
	type ClaudeToolSpec,
	classifyReversibility,
	err,
	identityHash,
	type ProposedCallWorkflowPort,
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	type ToolResult,
	toClaudeToolSpec,
	toolsForRole,
} from "@hyperidle/shared";

/**
 * Build a fresh registry bound to the given context, filtered to the agent's
 * role.
 *
 * When `options.sessionWorkflow` is provided, `invoke` becomes the
 * **workflow router**: classify reversibility → route irreversible to
 * review (capture + record) or permit the approved op (CAS-consume grant →
 * run handler → record Outcome). This is HyperIdle's participation point in
 * the agent's brokered call.
 *
 * @lore I2 review W3: when the requested tool exists in the global tool
 * catalogue but is filtered out for this role, `invoke()` returns
 * `FORBIDDEN` (not `NOT_FOUND`). NOT_FOUND is reserved for genuinely
 * unknown tool names so an operator debugging "missing tool" failures
 * can distinguish a typo (NOT_FOUND) from a role-boundary breach
 * (FORBIDDEN). The harness still applies its own per-session allowlist
 * (`session-provisioning.ts`); this is the inner gate.
 *
 * @lore AL7 Task 5: the workflow router. One change, all harnesses, because
 * every brokered/MCP-routed call passes through this closure. The router is
 * collaboration plumbing, not a security floor (ETHOS §4).
 */
export function buildToolRegistry<TDb = unknown>(
	allToolDefinitions: readonly RegisteredTool<TDb>[],
	ctx: ToolContext<TDb>,
	options: BuildToolRegistryOptions<TDb>,
	workflow?: ProposedCallWorkflowPort<TDb>,
): ToolRegistry<TDb> {
	const roleFiltered = options.useOnlyExtraTools
		? []
		: toolsForRole(allToolDefinitions, options.role);
	const definitions: readonly RegisteredTool<TDb>[] = options.extraTools?.length
		? [...roleFiltered, ...options.extraTools]
		: roleFiltered;

	const byName = new Map(definitions.map((d) => [d.name, d]));
	const allByName = new Map(allToolDefinitions.map((d) => [d.name, d]));

	const wf = options.sessionWorkflow;

	function requireWorkflowPort(): ProposedCallWorkflowPort<TDb> {
		if (!workflow) {
			throw new Error(
				"buildToolRegistry: options.sessionWorkflow is set but no ProposedCallWorkflowPort was injected",
			);
		}
		return workflow;
	}

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			// For unregistered tools: if the name appears in allByName, it's a role boundary
			// breach; otherwise it's truly unknown. The workflow router still fires for
			// unregistered tools that are irreversible (fail-closed treats unknowns as
			// irreversible and routes them to review rather than revealing the NOT_FOUND).
			if (wf) {
				const port = requireWorkflowPort();
				const hash = identityHash(name, (rawArgs as Record<string, unknown> | null) ?? {});
				const captured = await port.captureProposedCall(ctx.db, {
					originSessionId: ctx.sessionId,
					taskId: ctx.taskId,
					agentId: ctx.agentId,
					toolId: name,
					args: (rawArgs as Record<string, unknown> | null) ?? {},
					hash,
					reviewMessageId: wf.reviewMessageId,
					subjectThreadId: wf.subjectThreadId,
					artifactId: wf.artifactId,
				});
				if (captured.firstCapture) {
					ctx.onAbortSession?.(ctx.sessionId);
				}
				return err("AWAITING_REVIEW", `Call to ${name} routed to human review.`);
			}
			if (allByName.has(name)) {
				return err("FORBIDDEN", `Tool not available to this role: ${name}`);
			}
			return err("NOT_FOUND", `Unknown tool: ${name}`);
		}

		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}

		// ── Workflow router ────────────────────────────────────────────────────
		if (wf) {
			const port = requireWorkflowPort();
			const reversibility = classifyReversibility(name, def);
			const isIrreversible = wf.routeToReview.includes(reversibility);

			// Session 2 (grant-bearing): check if this is the approved op
			if (wf.sessionRole === "grant-bearing" && wf.approvedCall?.toolId === name) {
				const isArgPinned = wf.approvedCall.argPinned;
				const argsMatch =
					!isArgPinned ||
					identityHash(name, parsed.data as Record<string, unknown>) ===
						wf.approvedCall.identityHash;

				if (argsMatch) {
					const claimed = await port.consumeTailoredGrant(ctx.db, {
						taskId: ctx.taskId,
						agentId: ctx.agentId,
						toolId: name,
					});

					if (claimed) {
						// Grant consumed: run the agent's own handler
						try {
							const result = await def.handler(parsed.data, ctx);
							await port.recordOutcome(ctx.db, claimed.proposedCallId, result);
							return result;
						} catch (e) {
							const failResult = err(
								"EXECUTION_FAILED",
								`Approved call ${name} threw: ${String(e)}`,
							);
							await port.recordOutcome(ctx.db, claimed.proposedCallId, failResult);
							return failResult;
						}
					}
					// Grant already consumed → fall through to route-to-review
					// (no double-execute; surfaced as a fresh decision)
				}
				// Arg-pinned mismatch → fall through to route-to-review
			}

			// Route irreversible (or unknown) calls to review
			if (isIrreversible) {
				const hash = identityHash(name, parsed.data as Record<string, unknown>);
				const captured = await port.captureProposedCall(ctx.db, {
					originSessionId: ctx.sessionId,
					taskId: ctx.taskId,
					agentId: ctx.agentId,
					toolId: name,
					args: parsed.data as Record<string, unknown>,
					hash,
					reviewMessageId: wf.reviewMessageId,
					subjectThreadId: wf.subjectThreadId,
					artifactId: wf.artifactId,
				});
				if (captured.firstCapture) {
					// Session 1 ends after first capture (sessions aren't pausable)
					ctx.onAbortSession?.(ctx.sessionId);
				}
				return err("AWAITING_REVIEW", `Call to ${name} routed to human review.`);
			}
		}
		// ── End workflow router ────────────────────────────────────────────────

		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: (): readonly ClaudeToolSpec[] => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
