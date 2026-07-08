/**
 * AK2 — Fabric Strategy adapter.
 *
 * A thin adapter that implements the Strategy Port by delegating to the existing
 * Fabric functions (assembleContext, startWatcher). This is a PURE DELEGATION —
 * byte-identical sandbox output, same writeback — so behaviour is provably
 * unchanged when the Fabric is the selected Strategy (AC3).
 *
 * The adapter is the composition target: `server-factory.ts` imports fabricStrategy
 * and calls `setActiveStrategy(fabricStrategy)` at boot. This is the ONLY place
 * in Kernel code allowed to know the Fabric is a concrete Strategy (the composition
 * root allowlist in the ESLint guard, AC4).
 *
 * @lore AK2 §4: The Fabric already HAS the implementations. AK2 only adds this
 * thin adapter object — it does NOT rewrite assembleContext or startWatcher.
 * assembleContext and startWatcher remain exported from @hyperidle/fabric for
 * existing Fabric-internal and test consumers.
 *
 * @lore AK2 §1: productId mapping — the Strategy Port uses `teamId` (AK1 rename)
 * but the Fabric's ContextAssemblyConfig still uses `productId` (Fabric-internal
 * field name). The adapter bridges: `req.teamId → productId` in the config. This
 * is the ONLY translation; all other fields are 1:1.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	IngestionHandle,
	IngestionRequest,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
	Strategy,
} from "@hyperidle/shared";
import { assembleContext } from "./context-assembly.js";
import { startWatcher } from "./file-watcher.js";
import { composeRoster } from "./roster.js";
import { selectAgentFabric } from "./services/agent-selection.js";

/**
 * The Fabric Strategy — implements the Strategy Port by delegating to the
 * production Fabric context assembly and file-watching ingestion. Behaviour is
 * byte-identical to the pre-AK2 hard-wired Fabric calls in session-provisioning.ts
 * and session-lifecycle.ts (AC3: no regression when Fabric is selected).
 */
export const fabricStrategy: Strategy<HyperIdleDb> = {
	/**
	 * Assemble context by delegating to the Fabric's assembleContext function.
	 * The returned ContextAssemblyOutcome narrows the Fabric's ContextAssemblyResult
	 * (drops `manifest` — verified safe, no Kernel caller reads it off the result).
	 *
	 * @lore AK2 §4: productId mapping — `req.teamId` → `productId` in config.
	 * The Fabric's ContextAssemblyConfig.productId is the U1-renamed `teamId`;
	 * the Strategy Port uses `teamId` in the request. Bridge here, not in shared.
	 */
	async assembleContext(req: ContextAssemblyRequest<HyperIdleDb>): Promise<ContextAssemblyOutcome> {
		const result = await assembleContext(req.db, {
			sandboxPath: req.sandboxPath,
			sessionId: req.sessionId,
			taskId: req.taskId,
			agentId: req.agentId,
			agentRole: req.agentRole,
			productId: req.teamId,
		});
		// @lore AK2 §1: narrowing — drop `manifest` from ContextAssemblyResult.
		// Both production call sites discarded the return value; the Kernel never
		// reads manifest off the result. See ContextAssemblyOutcome @lore.
		return { itemCount: result.itemCount, durationMs: result.durationMs };
	},

	/**
	 * Begin learning ingestion by delegating to the Fabric's startWatcher.
	 * Returns an IngestionHandle whose dispose() calls watcher.stop() — the same
	 * flush + writeback path the pre-AK2 teardown called directly.
	 */
	beginLearningIngestion(req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		const watcher = startWatcher({
			db: req.db,
			sandboxPath: req.sandboxPath,
			sessionId: req.sessionId,
			manifestPath: req.manifestPath,
		});
		return {
			dispose(): void {
				watcher.stop();
			},
		};
	},

	/**
	 * AK6: Decide which agents a creation trigger produces under the Fabric Strategy.
	 *
	 * Delegates to `composeRoster` which reads `factorySettings.system_template:<role>`
	 * to source persona content — the persona is Strategy-owned (not a Kernel const).
	 *
	 * Preserves today's pre-AK6 behavior byte-for-byte (AC4 golden):
	 *  - team_scaffold: defaultRoster(functions) → per role, template lookup
	 *  - agent_added: one spec, template lookup, caller name passthrough
	 *  - user_assistant: assistant spec, Fabric-owned persona, ast- idHint
	 */
	async scaffoldAgents(req: ScaffoldRequest<HyperIdleDb>): Promise<readonly AgentScaffoldSpec[]> {
		return composeRoster(req.db, req);
	},

	/**
	 * AK7: The Fabric Strategy decides which agent owns a unit of work.
	 * Delegates to selectAgentFabric for the three-surface implementation:
	 *   - bet_decomposer: role-match PM on Kernel-enumerated candidates
	 *   - bet_task: role-match short-circuit; else round-robin spread via spreadIndex
	 *   - routine_delegate: findDelegate's exact userSkills query (concept §3a carve-out)
	 */
	async selectAgent(req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> {
		return selectAgentFabric(req);
	},

	/**
	 * AK8: Fabric decomposition decision.
	 *
	 * Knowledge-matched decomposer selection: role-match PM on Kernel-enumerated
	 * candidates (same oracle as bet_decomposer). tasks:[] → Kernel PM turn runs
	 * with knowledge-assembled context (assembleContext already gives the Fabric
	 * its knowledge edge at turn time).
	 *
	 * Fabric v1: returns tasks:[] — richer knowledge-derived breakdown is an eval
	 * concern (out of scope for AK8). The `tasks` field is the seam for a future
	 * Fabric version to return a knowledge-derived breakdown with zero Kernel change
	 * (proving AC4's "no Kernel code change" structurally).
	 *
	 * @lore AK8: "knowledge-matched" in v1 = (a) Fabric picks the decomposer via
	 * role-match and (b) assembleContext enriches the PM turn at turn time.
	 * A richer knowledge-derived task list is explicitly deferred — it requires
	 * a live LLM eval to judge quality, which is out of scope for AK8.
	 */
	async decomposeBet(req: DecomposeBetRequest<HyperIdleDb>): Promise<DecompositionPlan> {
		// Knowledge-matched decomposer: role-match PM on candidates, same oracle as bet_decomposer.
		const pm = req.candidates.find((c) => c.role === "product_manager") ?? req.candidates[0];
		// tasks:[] → Kernel runs PM turn (assembleContext already feeds the knowledge edge).
		return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
	},

	/**
	 * AR4b: Fabric formation — persona + draft tool surface for the assistant turn.
	 *
	 * Fabric v1: returns persona:null (no formation knowledge yet — the Fabric's
	 * strategy for the assistant persona is a future concern that requires real
	 * eval data). assistantDraftSurface:"standard" = canonical 2-tool surface.
	 *
	 * @lore AR4b: The Fabric can enrich the assistant persona in the future by
	 * reading factorySettings or team context here — the seam is in place.
	 * For now, null matches the Minimal Strategy and preserves existing behavior.
	 */
	async formAssistant(_req: AssistantFormationRequest<HyperIdleDb>): Promise<AssistantFormation> {
		return { persona: null, assistantDraftSurface: "standard" };
	},
};
