/**
 * AU21 §9 Increment 12 (Decision H3), Wave C (RED) — architecture.md's
 * Increment 12 test (a)'s structural half: "anti-regrowth guard's
 * composition-bundle detector, now green on run-orchestration for context
 * assembly specifically."
 *
 * `run-orchestration::knowledge` and `run-orchestration::org` are currently
 * carried in `scripts/composition-edge-anti-regrowth-guard.ts`'s
 * `DEFERRED_FOLLOWUP` set — `inspect()` SUPPRESSES them, so calling `inspect()`
 * directly would report "green" today for the wrong reason (deferred, not
 * closed). This test bypasses that suppression and calls the RAW detection
 * mechanism (`detectHiddenCompositionEdges`, the same one `inspect()` itself
 * delegates to) against the LIVE repo tree, proving the underlying hidden
 * composition-bundle edge is actually gone — not merely deferred.
 *
 * `run-orchestration-composition.ts`'s `contextPorts` bundle (~line 65) is the
 * ONLY real composition-root wiring that composes `@hyperidle/knowledge`'s
 * `list`/`rankAndBudget` or `@hyperidle/org`'s `getTeam` with a
 * `run-orchestration`-defined "Deps"-shaped type — verified from source (see
 * this wave's builder report): neither provider has any OTHER real call site
 * from `run-orchestration`. `contextPorts` is deleted wholesale this wave
 * (Wave C scope — `context.ts` becomes pure format/write, consuming the baked
 * `contextBundle` instead), so these two pairs are the clean, unambiguous
 * closures Wave C can prove. (`run-orchestration::routine`/`::settings`/
 * `::users`/`::work` each have at least one OTHER real, non-context-assembly
 * production use this wave does not touch — see the builder's CONFUSION
 * report; asserting those closed here would be a false claim.)
 *
 * Currently RED: `contextPorts` (and its `knowledge`/`org` members) is still
 * live in `run-orchestration-composition.ts` today — the raw detector finds
 * both edges.
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

describe("run-orchestration -> knowledge/org context-assembly reads (Increment 12 Wave C, RED)", () => {
	test("the raw composition-bundle detector finds ZERO run-orchestration -> knowledge/org edges on the live tree", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const knowledgeEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "knowledge",
		);
		const orgEdge = hidden.find((e) => e.consumer === "run-orchestration" && e.provider === "org");

		expect(knowledgeEdge, JSON.stringify(knowledgeEdge)).toBeUndefined();
		expect(orgEdge, JSON.stringify(orgEdge)).toBeUndefined();
	});
});
