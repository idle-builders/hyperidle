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
import type { LifecyclePropagationDeps, PolicyDeps, PolicyEngineDeps } from "./ports.js";

export function registerPolicy(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: PolicyDeps,
	options?: { nowFn?: () => Date },
): () => void {
	const engineDeps: PolicyEngineDeps = {
		work: deps.work,
		conversation: deps.conversation,
		silence: deps.silence,
		approvalRate: {
			work: deps.work,
			conversation: deps.conversation,
		},
	};
	const lifecycleDeps: LifecyclePropagationDeps = {
		work: deps.work,
		conversation: deps.conversation,
		users: deps.users,
		notifications: deps.notifications,
	};
	const unsubEngine = registerPolicyEngine(db, eventBus, engineDeps, options);
	const unsubLifecycle = registerLifecyclePropagation(db, eventBus, lifecycleDeps);
	return () => {
		unsubEngine();
		unsubLifecycle();
	};
}
