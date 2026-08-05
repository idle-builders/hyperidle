/**
 * `registerPolicy` — single boot-registration entry point for all of
 * `policy`'s event-driven behavior (trust routing + lifecycle cascade).
 *
 * @lore AU20 Am1: replaces the two separate `registerPolicyEngine` +
 * `registerLifecyclePropagation` calls at the composition root with one
 * call. The retry drain continues to run on the same 30-second heartbeat
 * interval inside `registerLifecyclePropagation` — no behavior change,
 * only the call-site count changes (2 → 1). Returns a single disposer that
 * tears down both subscriptions and the interval.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { registerLifecyclePropagation } from "./lifecycle-propagation.js";
import { registerPolicyEngine } from "./policy-engine.js";
import type { PolicyDeps } from "./ports.js";

export function registerPolicy(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: PolicyDeps,
	options?: { nowFn?: () => Date },
): () => void {
	const unsubEngine = registerPolicyEngine(db, eventBus, deps, options);
	const unsubLifecycle = registerLifecyclePropagation(db, eventBus, deps);
	return () => {
		unsubEngine();
		unsubLifecycle();
	};
}
