/**
 * AK2 — Strategy Registry.
 *
 * Stores exactly one active Strategy per process. The Kernel reads this at
 * every session-boundary call site (admitSession P6/P7, createSession).
 *
 * @lore AK2 §2: Fail-loud is intentional — a missing registration is a boot
 * bug, not a recoverable state. A silent fallback would mask a wiring
 * regression where the Fabric should be active instead. Boot always registers
 * exactly one Strategy (server-factory.ts composition root).
 *
 * Follows the same idiom as registry leaf modules: a lean module-scope variable with explicit
 * set/get/clear. clearActiveStrategy is test teardown only.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { Strategy } from "@hyperidle/shared";

// The registry is db-bound at the Kernel boundary: TDb = HyperIdleDb.
// @hyperidle/shared stays db-agnostic (see strategy-port.ts @lore for why
// TDb is a type parameter and not a direct HyperIdleDb import in shared).
type KernelStrategy = Strategy<HyperIdleDb>;

let active: KernelStrategy | null = null;

/**
 * Register the active Strategy. Called once at boot (e.g. in server-factory.ts).
 * May be called again to swap Strategies — the last registration wins.
 */
export function setActiveStrategy(s: KernelStrategy): void {
	active = s;
}

/**
 * Get the active Strategy.
 *
 * Throws if no Strategy has been registered — a misboot is a bug, not a
 * recoverable state. Every session-boundary call site should encounter a
 * registered Strategy or fail fast so the misconfiguration is immediately
 * visible (not silently degraded).
 */
export function getActiveStrategy(): KernelStrategy {
	if (!active) {
		throw new Error("No active Strategy registered — call setActiveStrategy at boot");
	}
	return active;
}

/**
 * Get the active Strategy without throwing if none is registered.
 *
 * For test fixtures ONLY — production code must use getActiveStrategy().
 * Allows the fixture to check if a test's beforeEach already set a strategy
 * before the fixture setup runs.
 */
export function getActiveStrategyOrNull(): KernelStrategy | null {
	return active;
}

/**
 * Reset the registry to unregistered state.
 *
 * For test teardown ONLY. Never call this in production code — a process
 * with no active Strategy will throw on the next session attempt.
 */
export function clearActiveStrategy(): void {
	active = null;
}
