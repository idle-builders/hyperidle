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
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	ScaffoldRequest,
	Strategy,
} from "@hyperidle/shared";
import { assembleContext } from "./context-assembly.js";
import { startWatcher } from "./file-watcher.js";

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
	 * AK6: RED PHASE STUB — the Fabric's scaffoldAgents is not yet implemented.
	 * The green phase builder implements composeRoster + scaffoldAgents in
	 * packages/fabric/src/roster.ts and wires it here.
	 *
	 * This stub allows the port contract to be enforced by TypeScript
	 * while keeping the red-phase tests failing at the behavior level.
	 */
	async scaffoldAgents(_req: ScaffoldRequest<HyperIdleDb>): Promise<readonly AgentScaffoldSpec[]> {
		throw new Error("fabricStrategy.scaffoldAgents not implemented — AK6 green phase required");
	},
};
