/**
 * AU21 §9 Increment 12 (Decision H3), Wave D — RED.
 *
 * Sibling to `context-assembly-anti-regrowth.test.ts` (Wave C), same
 * mechanism: `run-orchestration::work` is currently carried in
 * `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP` set
 * (see that guard's own doc comment — `run-orchestration::work` is one of the
 * 9 still-open pairs Increment 9's third pass left honestly unresolved).
 * `inspect()` SUPPRESSES deferred pairs, so calling `inspect()` directly would
 * report "green" for the wrong reason (deferred, not closed). This test
 * bypasses that suppression and calls the RAW detection mechanism
 * (`detectHiddenCompositionEdges`, the same one `inspect()` itself delegates
 * to) against the LIVE repo tree, proving the underlying hidden
 * composition-bundle edge is actually gone — not merely deferred.
 *
 * Unlike Wave C's `::knowledge`/`::org` (context-assembly-only reads),
 * `run-orchestration-composition.ts`'s `workAccessor` (~line 95) is verified
 * from source to have EXACTLY 7 real call sites, ALL inside
 * `provisioner.ts`, ALL inside the 3 functions this wave migrates to
 * event-subscriber reactions (`revertTaskToAccepted`'s `getTaskById`/
 * `updateTaskById`; `accumulateSessionTokensOnBet`'s `getTaskById`/
 * `getBetById`/`updateBetById`; the launch-time `getTaskById`/`transitionTask`
 * guard) — unlike `::routine`/`::settings`/`::users`, which each have at
 * least one OTHER real, non-migrated production use this wave does not
 * touch (Wave C's own `context-assembly-anti-regrowth.test.ts` doc comment).
 * `workAccessor` is therefore the one port this wave closes ENTIRELY (reads
 * AND writes), matching architecture.md's Increment 12 closing line:
 * "After this run-orchestration holds zero -> core-api edge, read or write"
 * — true for THIS pair specifically, once `workAccessor` + its `work: ...`
 * binding are deleted wholesale from `run-orchestration-composition.ts` and
 * `SessionLifecycleWorkAccessor` + the `work` field are deleted from
 * `provisioner.ts`'s own `SessionLifecyclePorts`.
 *
 * Currently RED: `workAccessor` (composing `@hyperidle/work`'s `get`/
 * `update`/`transitionTask`) is still live in `run-orchestration-composition.ts`
 * today — the raw detector finds the edge.
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

describe("run-orchestration -> work session-lifecycle read/write (Increment 12 Wave D, RED)", () => {
	test("the raw composition-bundle detector finds ZERO run-orchestration -> work edges on the live tree", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const workEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "work",
		);

		expect(workEdge, JSON.stringify(workEdge)).toBeUndefined();
	});
});
