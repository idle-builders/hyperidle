/**
 * AN1 — ServiceConnectionProjection: project inherited connections from reach facts.
 *
 * Flattens `InheritedConnectionFact[]` into `ServiceConnectionView[]` with
 * authSource:"inherited", removable:false. Deduplicates by service name (first wins).
 *
 * @lore AN1: Inherited connections are NEVER DB rows (concept hard-rule 4 /
 * Phase-0 decision 1). This is a pure in-memory projection — no DB access, no
 * child-process spawn.
 *
 * @lore AU36 (D6): the input changed from `descriptors[].inheritedTools` to
 * the connections domain's own `InheritedConnectionFact[]` (flattened in input
 * order — `createInheritedReach` assembles the fixed source order), but the
 * output contract is byte-identical: id `inherited:<source>:<name>`,
 * via "<source> · <name>", health unknown→working / explicit needs-attention
 * kept, first-wins dedup by name.
 *
 * @lore AN1: `unknown` health → displayed as "working" per architecture §7.
 * The inherited group is auto-detected and expected to work; needs-attention is
 * shown only when the probe returned it explicitly.
 */

import type { InheritedConnectionFact, ServiceConnectionView } from "@hyperidle/domain-model";

/**
 * Project inherited connections from the given reach facts.
 *
 * Each fact becomes one `ServiceConnectionView` with:
 *   - authSource: "inherited"
 *   - removable: false
 *   - id: "inherited:<source>:<name>"
 *   - via: "<source> · <name>"
 *   - health: "unknown" → "working" (evidence-first display)
 *
 * Deduplication: if the same service name appears from multiple sources,
 * the first entry wins (input order is stable from `createInheritedReach`).
 */
export function projectInheritedConnections(
	facts: readonly InheritedConnectionFact[],
): ServiceConnectionView[] {
	const seen = new Set<string>(); // dedup by service name
	const result: ServiceConnectionView[] = [];

	for (const fact of facts) {
		// First-wins dedup across sources (architecture §7)
		if (seen.has(fact.name)) continue;
		seen.add(fact.name);

		result.push({
			id: `inherited:${fact.source}:${fact.name}`,
			service: fact.name,
			via: `${fact.source} · ${fact.name}`,
			authSource: "inherited",
			// "unknown" health → "working" for display (inherited = auto-detected, expected-healthy)
			health: fact.health === "needs-attention" ? "needs-attention" : "working",
			removable: false,
		});
	}

	return result;
}
