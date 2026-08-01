/**
 * AU21 §9 Increment 12 (Decision H3), Wave E fix — review-corrected safety
 * regression. Wave E's original commit deleted `SessionLifecyclePorts["users"]`
 * entirely and claimed `run-orchestration::users` fully CLOSED alongside
 * `::settings`/`::routine`. Review substantiated that claim was wrong: the
 * baked-only design (Phase 1 re-checking only `params.agentConfig`, itself
 * ALWAYS runnable at emit time by construction — every resolver validates
 * via `requireRunnableAgent` before baking) can never detect a real
 * emit→deactivate→drain race, and no downstream mechanism naturally rejects
 * a deactivated agent either (see `provisioner.ts`'s top-of-file Wave E
 * `@lore` "CORRECTION" for the full trace). This test proves TWO things
 * about the fix, both load-bearing:
 *
 * 1. The edge is back — `run-orchestration::users` is a real, live,
 *    machine-detectable composition-bundle edge again (not a phantom the
 *    guard's `DEFERRED_FOLLOWUP` suppression merely hides). Uses the same
 *    "bypass `inspect()`'s suppression, call the raw detector directly"
 *    pattern as `run-orchestration-settings-routine-anti-regrowth.test.ts`.
 * 2. The edge is DELIBERATELY NARROW — exactly one real core-api function
 *    referenced at the composition root (`findUser`, via
 *    `agentRunnabilityReader`'s `checkAgentRunnable` wiring in
 *    `run-orchestration-composition.ts`), not the old broad `getUserById`/
 *    `getFirstUserByKind` surface (the detector reports the SOURCE-side
 *    function name actually used, same convention as this file's
 *    `ALLOWLIST`/`DEFERRED_FOLLOWUP` doc comments, e.g. `cost::users`'s
 *    `findUser`/`incrementUserCost`/etc.). A future accidental widening
 *    (e.g. a new caller reading `agent.name`/`agent.email` through this same
 *    port) would show up here as an unexpected extra method name, not
 *    silently ride along under the same allowed pair.
 */

import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
	DEFERRED_FOLLOWUP,
	inspect,
} from "../../../../scripts/composition-edge-anti-regrowth-guard.js";
import {
	detectHiddenCompositionEdges,
	discoverServices,
	loadOwnedTables,
} from "../../../../scripts/generate-dependency-graph.js";

function repoRoot(): string {
	// __dirname at runtime = packages/core-api/src/__tests__
	return path.resolve(__dirname, "..", "..", "..", "..");
}

describe("run-orchestration -> users agent-runnability live re-check (Increment 12 Wave E fix)", () => {
	test("the raw composition-bundle detector finds run-orchestration -> users, narrowed to exactly findUser", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const usersEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "users",
		);

		expect(
			usersEdge,
			"expected run-orchestration -> users to exist (safety re-check)",
		).toBeDefined();
		// The detector reports the real core-api SOURCE function referenced at
		// the composition root, not the consumer-side port method name — see
		// `agentRunnabilityReader` in `run-orchestration-composition.ts`.
		expect(usersEdge?.methods).toEqual(["findUser"]);
	});

	test("run-orchestration::users is honestly tracked in DEFERRED_FOLLOWUP, not silently allowlisted", () => {
		expect(DEFERRED_FOLLOWUP.has("run-orchestration::users")).toBe(true);
	});

	test("inspect() still reports zero findings for this pair — suppressed as a known, tracked gap, not because it's closed", () => {
		const root = repoRoot();
		const findings = inspect(root);
		const usersFinding = findings.find(
			(f) => f.consumer === "run-orchestration" && f.provider === "users",
		);
		expect(usersFinding).toBeUndefined();
	});
});
