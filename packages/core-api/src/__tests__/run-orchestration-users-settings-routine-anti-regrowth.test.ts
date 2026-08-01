/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — architecture.md's
 * Increment 12 test (a)'s structural half, closing the last 3 of the 9 pairs
 * Increment 9's third-pass forensic-triage wave left in
 * `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP`:
 * `run-orchestration::users`, `run-orchestration::settings`,
 * `run-orchestration::routine`.
 *
 * Sibling to `context-assembly-anti-regrowth.test.ts` (Wave C) and
 * `work-composition-anti-regrowth.test.ts` (Wave D), same mechanism: these
 * three pairs used to be carried in `DEFERRED_FOLLOWUP` — `inspect()`
 * SUPPRESSES deferred pairs, so calling `inspect()` directly would have
 * reported "green" for the wrong reason (deferred, not closed). This test
 * bypasses that suppression and calls the RAW detection mechanism
 * (`detectHiddenCompositionEdges`, the same one `inspect()` itself delegates
 * to) against the LIVE repo tree, proving the underlying hidden
 * composition-bundle edges are actually gone — not merely deferred.
 *
 * `run-orchestration-composition.ts`'s `userReader`/`settingsReader`/
 * `routineAccessor` (the former ONLY real composition-root wiring for these
 * three pairs) are DELETED entirely this wave — `admitSession`'s three
 * former live reads (Phase 1 agent load, Phase 3 `harnessDisabled`, the
 * admission-time routine per-run cost cap) are replaced by baked data every
 * per-kind resolver now supplies on the drained request (`agentConfig`/
 * `harnessDisabled`/`contextBundle.routine.costCapPerRunMinor` — see
 * `provisioner.ts`'s own Wave E top-of-file note). `run-orchestration` now
 * holds ZERO `-> users`/`-> settings`/`-> routine` edge, read or write — this
 * test proves it directly against the live tree, and
 * `DEFERRED_FOLLOWUP` no longer carries these three pairs.
 */

import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
	detectHiddenCompositionEdges,
	discoverServices,
	loadOwnedTables,
} from "../../../../scripts/generate-dependency-graph.js";

function repoRoot(): string {
	// __dirname at runtime = packages/core-api/src/__tests__
	return path.resolve(__dirname, "..", "..", "..", "..");
}

describe("run-orchestration -> users/settings/routine session-admission reads (Increment 12 Wave E)", () => {
	test("the raw composition-bundle detector finds ZERO run-orchestration -> users/settings/routine edges on the live tree", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const usersEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "users",
		);
		const settingsEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "settings",
		);
		const routineEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "routine",
		);

		expect(usersEdge, JSON.stringify(usersEdge)).toBeUndefined();
		expect(settingsEdge, JSON.stringify(settingsEdge)).toBeUndefined();
		expect(routineEdge, JSON.stringify(routineEdge)).toBeUndefined();
	});
});
