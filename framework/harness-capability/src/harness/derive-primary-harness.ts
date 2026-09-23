/**
 * AV1 — Derive a run-config harness/model pick from a HarnessCapabilityDescriptor.
 *
 * @lore BC5 T7: maps the chosen descriptor to `edit_user`'s `runConfig` shape —
 * SetupFlow.tsx wires it straight into the assistant/team-agent `edit_user`
 * calls (the team-creation seam this once fed is deleted; the shape survives
 * because `runConfig` needs exactly the same three fields).
 * Filters models on .selectable === true to exclude inherited/non-choosable models.
 * A model the user named explicitly (bring-your-own-key) wins over both.
 *
 * @lore AV1: Only called on a choosable (installed/ready) descriptor — greyed rows
 * never produce a pick. The .selectable filter is essential: CLI harnesses
 * list non-selectable models that must not become the primary.
 */

import type { HarnessCapabilityDescriptor } from "./harness-capability-descriptor.js";

/** The three `edit_user({ runConfig })` fields a harness pick fills. */
export interface PrimaryHarnessPick {
	readonly harnessType: string;
	readonly modelId?: string;
	readonly modelProvider?: string;
}

/**
 * Derive a run-config harness/model pick from a choosable
 * HarnessCapabilityDescriptor. Never call on a greyed (missing/unavailable)
 * descriptor.
 */
export function derivePrimaryHarness(
	descriptor: HarnessCapabilityDescriptor,
	/**
	 * A model the user named themselves — the bring-your-own-key path, where the
	 * harness reports no catalogue of its own and the key is useless without one.
	 * Wins over the descriptor's first selectable model.
	 */
	chosen?: { readonly modelId: string; readonly modelProvider: string },
): PrimaryHarnessPick {
	if (chosen) {
		return {
			harnessType: descriptor.type,
			modelId: chosen.modelId,
			modelProvider: chosen.modelProvider,
		};
	}
	const firstSelectable = descriptor.models.find((m) => m.selectable === true);
	const modelProvider = firstSelectable?.provider ?? descriptor.modelProviders[0];
	return {
		harnessType: descriptor.type,
		// Absent when the harness lists nothing selectable — it then runs its own
		// default, which is the truthful answer. Naming a model nobody chose was
		// how a hardcoded Anthropic id ended up on agents running on other harnesses.
		...(firstSelectable ? { modelId: firstSelectable.id } : {}),
		...(modelProvider ? { modelProvider } : {}),
	};
}
