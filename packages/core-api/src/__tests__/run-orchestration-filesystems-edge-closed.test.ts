/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure).
 *
 * Decision F2 (Increment 8) left ONE seam call standing that Decision H3's
 * later, more complete "bake everything at emit time" principle should have
 * superseded but never revisited: `CoreApiPort.filesystems.listFilesystemsByAgent`,
 * wired at `run-orchestration-composition.ts` as `filesystemsReader` onto
 * `SessionLifecyclePorts.filesystems`. That wiring — and the port field itself
 * — is now DELETED: the agent's injected filesystem list is baked at emit
 * time by every per-kind resolver instead
 * (`@hyperidle/filesystems`'s `resolveInjectedFilesystemsForAgent`).
 *
 * @lore CONFUSION (flagged during the RED phase, confirmed here): the raw
 * composition-bundle detector (`detectHiddenCompositionEdges`) never actually
 * flagged `run-orchestration::filesystems` as a hidden edge — the F2 seam call
 * routed through a LOCAL relative import (`./core-api-port-composition.js`),
 * which `collectUsages` never registers as a cross-package "provider"
 * identifier (it only tracks literal `@hyperidle/<pkg>` imports inside a
 * composition-root file). So this pair was never present in `DEFERRED_FOLLOWUP`
 * and was never a tracked/deferred edge to begin with — this test is not "the
 * edge moved from deferred to closed" (there was no deferred entry), it is a
 * closure PIN: this fix's deletion must not accidentally reintroduce a real,
 * DETECTABLE `run-orchestration -> filesystems` edge (a literal
 * `@hyperidle/filesystems` import inside a composition-root file), and the
 * dead port method must stay off `CoreApiPort` entirely. Mirrors
 * `run-orchestration-users-edge-closed.test.ts`'s shape for the users edge.
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

describe("run-orchestration -> filesystems composition edge stays closed", () => {
	test("the raw composition-bundle detector finds NO run-orchestration -> filesystems edge", () => {
		const root = repoRoot();
		const services = discoverServices(root);
		loadOwnedTables(root, services);
		const hidden = detectHiddenCompositionEdges(root, services);

		const filesystemsEdge = hidden.find(
			(e) => e.consumer === "run-orchestration" && e.provider === "filesystems",
		);

		expect(
			filesystemsEdge,
			"expected zero run-orchestration -> filesystems edge — the agent's injected filesystems are baked at emit time, never read back at provisioning time",
		).toBeUndefined();
	});

	test("run-orchestration::filesystems is not carried in DEFERRED_FOLLOWUP — there is nothing to defer", () => {
		expect(DEFERRED_FOLLOWUP.has("run-orchestration::filesystems")).toBe(false);
	});

	test("inspect() reports zero findings for this pair", () => {
		const root = repoRoot();
		const findings = inspect(root);
		const filesystemsFinding = findings.find(
			(f) => f.consumer === "run-orchestration" && f.provider === "filesystems",
		);
		expect(filesystemsFinding).toBeUndefined();
	});
});
