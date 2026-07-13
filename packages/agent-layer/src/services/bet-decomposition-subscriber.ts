/**
 * AK3: Kernel-side bet decomposition subscriber.
 *
 * Subscribes to `bet_state_changed` events and fires decomposition when
 * toState === 'active'. Uses a CAS guard (NULL → 'running') to deduplicate
 * re-fires and concurrent emissions (idempotency C2/AC7).
 *
 * Must NOT live in fabric (decomposition is Kernel) — registered at boot in
 * server-factory.ts alongside existing registrations.
 *
 * @lore AK3: The CAS guard (isNull(bets.decompositionStatus) WHERE id=betId)
 * is the ONLY dedup mechanism. A second `bet_state_changed(active)` event whose
 * CAS sets 0 rows returns immediately — no second decomposition runs.
 * This mirrors the task-dispatcher's `hasActiveSession` idempotency idiom.
 */

import type { BetDecompositionDeps } from "./bet-decomposition.js";
import { runBetDecomposition } from "./bet-decomposition.js";

/**
 * Register the bet decomposition subscriber on the event bus.
 *
 * Listens for `bet_state_changed(toState=active)` and fires decomposition.
 * Idempotency is handled inside `runBetDecomposition` via a CAS guard
 * (NULL → 'running'). Duplicate events or concurrent fires both call
 * `runBetDecomposition`, but only the one that wins the CAS proceeds.
 *
 * Returns a dispose function to unsubscribe (for server shutdown).
 *
 * @lore AK3: The CAS guard (NULL→'running') lives in runBetDecomposition,
 * not the subscriber. This lets the service be called directly (e.g. in tests
 * or a future retry path) with the same idempotency guarantee.
 */
export function registerBetDecomposition(deps: BetDecompositionDeps): () => void {
	const { eventBus } = deps;

	const dispose = eventBus.on("bet_state_changed", (event) => {
		// Only act on commit (draft → active).
		if (event.toState !== "active") return;

		// Fire-and-forget. runBetDecomposition never throws; it always writes
		// a terminal decompositionStatus before returning.
		void runBetDecomposition(deps, event.betId);
	});

	return dispose;
}
