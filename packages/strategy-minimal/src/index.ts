/**
 * AK2 — Strategy Minimal package stub (RED phase type declaration).
 *
 * This file provides the exported shape only. Implementation is the green phase
 * (build task #3). All exported values throw until implemented.
 *
 * @lore AK2 §3: The minimal Strategy is a REAL, documented reference package —
 * not a test fixture. It ships as @hyperidle/strategy-minimal and is the template
 * a contributor copies to implement the Strategy Port. It is selected at boot by
 * calling setActiveStrategy(minimalStrategy) in server-factory.ts.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";

/**
 * The minimal reference Strategy. All three Strategy responsibilities are inert:
 * - assembleContext: writes empty scaffold dirs + manifest, returns { itemCount:0 }
 * - beginLearningIngestion: returns a no-op handle
 * - No background knowledge work (no bootstrap, no routines, no agents)
 *
 * This is the template a contributor copies. Not a recommended end-user experience.
 */
export const minimalStrategy: Strategy<HyperIdleDb> = {
	async assembleContext(
		_req: ContextAssemblyRequest<HyperIdleDb>,
	): Promise<ContextAssemblyOutcome> {
		throw new Error("minimalStrategy not yet implemented (AK2 green phase #3)");
	},
	beginLearningIngestion(_req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		throw new Error("minimalStrategy not yet implemented (AK2 green phase #3)");
	},
};
