/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — THIRD, founder RE-CORRECTED
 * pass (see architecture.md §12's "RE-CORRECTED (founder, 2026-08-01)" note,
 * and `provisioner.ts`'s own top-of-file Wave E `@lore`).
 *
 * The founder rejected the SECOND pass's premise outright, not just its
 * mechanism: "why does that even play a role for orchestration to know? if
 * an agent is deactivated then core will not send a request... if it
 * doesn't get a request to do something it doesn't do something."
 * Orchestration is a blind executor — it never initiates anything on its
 * own, so there is no scenario where it needs to independently discover or
 * react to an agent's deactivation. The resolution is a pure DELETION: the
 * live `ports.agentRunnability.checkAgentRunnable` re-check
 * (`SessionLifecycleAgentRunnabilityReader`) is removed entirely, with NO
 * replacement of any kind — no new event, no subscriber, no push, no
 * narrower read.
 *
 * This test is the direct successor to (and supersedes the intent of)
 * `run-orchestration-agent-runnability-anti-regrowth.test.ts` (Wave E's
 * SECOND-pass test, which asserted the OPPOSITE — that the edge exists and
 * is honestly tracked in `DEFERRED_FOLLOWUP`). That file is deleted
 * alongside this fix landing; this file asserts the third-pass, final
 * state: the `run-orchestration -> users` edge is GONE — not suppressed,
 * not tracked, not deferred. There is nothing left to defer.
 *
 * Currently RED: `run-orchestration-composition.ts` still wires
 * `agentRunnabilityReader` (calling `@hyperidle/users`'s `findUser`) onto
 * `SessionLifecyclePorts.agentRunnability`, and `DEFERRED_FOLLOWUP` still
 * carries `"run-orchestration::users"` from the (now-rejected) second pass.
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

describe("run-orchestration -> users edge is GENUINELY DELETED, not deferred (Increment 12, third/founder-final pass)", () => {
	test("the raw composition-bundle detector finds NO run-orchestration -> users edge at all", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const usersEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "users",
		);

		expect(
			usersEdge,
			"expected run-orchestration -> users to be fully deleted (no live re-check of any kind), not merely narrowed or suppressed",
		).toBeUndefined();
	});

	test("run-orchestration::users is no longer carried in DEFERRED_FOLLOWUP — there is nothing left to defer", () => {
		expect(DEFERRED_FOLLOWUP.has("run-orchestration::users")).toBe(false);
	});

	test("inspect() reports zero findings for this pair because the edge is gone, not because it's suppressed by an allowlist/deferral entry", () => {
		const root = repoRoot();
		const findings = inspect(root);
		const usersFinding = findings.find(
			(f) => f.consumer === "run-orchestration" && f.provider === "users",
		);
		expect(usersFinding).toBeUndefined();
	});
});
