/**
 * AU26 F2 — `run-orchestration -> filesystems` stays a NON-edge.
 *
 * History: Decision F2 (AU21 §9 Increment 8) wired
 * `CoreApiPort.filesystems.listFilesystemsByAgent` onto
 * `SessionLifecyclePorts.filesystems` at `run-orchestration-composition.ts`.
 * AU21 §9 Increment 12 deleted that seam in favour of an emit-time bake. AU26 F2
 * deletes the bake too: `@hyperidle/filesystems` is an agent-orchestration
 * Service now, and the spawn reads the record live through
 * `ProvisionSessionDeps.injectedFilesystems`, a port the APPLICATION
 * (`remote-server`'s `create-server.ts`) composes — never core-api's
 * composition root.
 *
 * @lore CONFUSION (flagged during the original RED phase, still true): the raw
 * composition-bundle detector (`detectHiddenCompositionEdges`) never actually
 * flagged `run-orchestration::filesystems` as a hidden edge — the F2 seam call
 * routed through a LOCAL relative import (`./core-api-port-composition.js`),
 * which `collectUsages` never registers as a cross-package "provider"
 * identifier (it only tracks literal `@hyperidle/<pkg>` imports inside a
 * composition-root file). So this pair was never present in `DEFERRED_FOLLOWUP`
 * and was never a tracked/deferred edge to begin with — this test is not "the
 * edge moved from deferred to closed" (there was no deferred entry), it is a
 * closure PIN: neither the bake's deletion nor the port that replaced it may
 * reintroduce a real, DETECTABLE `run-orchestration -> filesystems` edge (a
 * literal `@hyperidle/filesystems` import inside core-api's composition root),
 * and the dead port method must stay off `CoreApiPort` entirely. Mirrors
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
			"expected zero run-orchestration -> filesystems edge — the injected-filesystem reader is an in-layer port the Application composes, never a core-api composition-root bundle",
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
