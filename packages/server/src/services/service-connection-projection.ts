/**
 * AN1 — ServiceConnectionProjection: project inherited connections from harness descriptors.
 *
 * Flattens `descriptors[].inheritedTools` into `ServiceConnectionView[]` with
 * authSource:"inherited", removable:false. Deduplicates by service name (first wins).
 *
 * @lore AN1: Inherited connections are NEVER DB rows (concept hard-rule 4 /
 * Phase-0 decision 1). This is a pure in-memory projection from the cached
 * harness descriptor — no DB access, no child-process spawn.
 *
 * @lore AN1: `unknown` health → displayed as "working" per architecture §7.
 * The inherited group is auto-detected and expected to work; needs-attention is
 * shown only when the probe returned it explicitly.
 */

import type { HarnessCapabilityDescriptor, ServiceConnectionView } from "@hyperidle/shared";

/**
 * Project inherited connections from the given harness descriptors.
 *
 * Each `InheritedToolDescriptor` in each descriptor's `inheritedTools` array
 * becomes one `ServiceConnectionView` with:
 *   - authSource: "inherited"
 *   - removable: false
 *   - id: "inherited:<harness>:<name>"
 *   - via: "<harness> · <name>"
 *   - health: "unknown" → "working" (evidence-first display)
 *
 * Deduplication: if the same service name appears in multiple harnesses,
 * the first entry wins (descriptor enumeration order is stable from
 * `listCapabilityDescriptors()`).
 */
export function projectInheritedConnections(
	descriptors: readonly HarnessCapabilityDescriptor[],
): ServiceConnectionView[] {
	const seen = new Set<string>(); // dedup by service name
	const result: ServiceConnectionView[] = [];

	for (const descriptor of descriptors) {
		for (const tool of descriptor.inheritedTools ?? []) {
			// First-wins dedup across harnesses (architecture §7)
			if (seen.has(tool.name)) continue;
			seen.add(tool.name);

			result.push({
				id: `inherited:${tool.harness}:${tool.name}`,
				service: tool.name,
				via: `${tool.harness} · ${tool.name}`,
				authSource: "inherited",
				// "unknown" health → "working" for display (inherited = auto-detected, expected-healthy)
				health: tool.health === "needs-attention" ? "needs-attention" : "working",
				removable: false,
			});
		}
	}

	return result;
}
