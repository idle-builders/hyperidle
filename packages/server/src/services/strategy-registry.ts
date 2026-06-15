/**
 * AK2 — Strategy Registry stub (RED phase type declaration).
 *
 * This file provides the type signatures only. Implementation is the green phase
 * (build task #2). All functions throw until implemented.
 *
 * @lore AK2 §2: The registry stores exactly one active Strategy per process.
 * Fail-loud: getActiveStrategy() throws if unset — a misboot is a bug, not a
 * silent no-op. A silent fallback would mask a wiring regression where the Fabric
 * should be active.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { Strategy } from "@hyperidle/shared";

type KernelStrategy = Strategy<HyperIdleDb>;

/** Register the active Strategy. Called once at boot (e.g. in server-factory.ts). */
export function setActiveStrategy(_s: KernelStrategy): void {
	throw new Error("strategy-registry not yet implemented (AK2 green phase #2)");
}

/** Get the active Strategy. Throws if no Strategy has been registered. */
export function getActiveStrategy(): KernelStrategy {
	throw new Error("No active Strategy registered — call setActiveStrategy at boot");
}

/** Reset the registry. For test teardown only. */
export function clearActiveStrategy(): void {
	throw new Error("strategy-registry not yet implemented (AK2 green phase #2)");
}
