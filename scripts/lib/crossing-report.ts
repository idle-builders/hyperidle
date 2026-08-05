/**
 * AU28 — naming a crossing, and the baseline that decides whether it fails the build.
 *
 * @lore AU28: the dial and the ratchet are ONE mechanism, not two. Every rule is error by default;
 * `governance/baseline.json` is the list of known violations, and only what is on that list warns.
 * The alternative — a per-rule `enforcement: "warn" | "error"` field — lets a rule sit at warn with
 * nothing recording what it is waiting for, and the repo's own history says any exemption apparatus
 * gets re-populated. A baseline entry cannot be silent: it carries its sites and its successor work
 * package, and it fails the build when it grows OR shrinks.
 */

import type { Actor, Crossing, Target } from "./governance-model.js";

/**
 * How a target is named in a finding and in the baseline key.
 *
 * Deliberately the same vocabulary as `governance/decided-rules.json`, so a finding can be read
 * straight against the decision that produced it.
 */
export function targetLabel(target: Target, source: Actor): string {
	switch (target.sort) {
		case "development-file":
			return "development file";
		case "event-bus":
			return "EventBus";
		case "mcp-router":
			return "MCP router";
		case "raw-runtime":
			return "raw runtime";
		case "harness":
			return "harness";
		case "repo-root":
			return "repo root";
		case "surface":
			return target.surface;
		case "http-api":
			return target.layer;
		case "table": {
			if (target.owner === null) return "db:table (unowned)";
			const own = source.sort === "package" && source.name === target.owner;
			return own ? "db:table (own)" : "db:table (other)";
		}
		case "package": {
			const home = source.sort === "package" ? (source.layer ?? (source.role === "layer" ? source.name : undefined)) : undefined;
			const targetHome = target.layer ?? (target.role === "layer" ? target.name : undefined);
			// A source that lives in no layer has no "same" or "other" to speak of — for it, a service
			// is just a service. Qualifying it would invent a relationship that does not exist.
			if (home === undefined) return target.role;
			if (target.role === "service") return targetHome === home ? "service (same layer)" : "service (other layer)";
			if (target.role === "layer") return targetHome === home ? "layer (own)" : "layer (other)";
			return target.role;
		}
	}
}

/** How a source is named. A role, unless the founder ruled on that package by name. */
export function sourceLabel(source: Actor): string {
	switch (source.sort) {
		case "harness":
			return "harness";
		case "repo-root":
			return "repo root";
		case "package":
			return source.role;
	}
}

/** The stable key a violation is grouped and baselined under. */
export const groupKey = (crossing: Crossing, world: string): string =>
	`${sourceLabel(crossing.source)} → ${targetLabel(crossing.target, crossing.source)} [${crossing.kind}] ${world}`;

// ---------------------------------------------------------------------------------------------
// The baseline
// ---------------------------------------------------------------------------------------------

export interface BaselineGroup {
	/** The work package that clears this group. A group with no successor is orphan debt. */
	readonly successor: string;
	/** File → number of violating crossings in it. Keyed by FILE, never by line. */
	readonly sites: Readonly<Record<string, number>>;
}

export interface Baseline {
	readonly au28Baseline: true;
	readonly note: string;
	readonly groups: Readonly<Record<string, BaselineGroup>>;
}

export type RatchetVerdict =
	/** Not a known violation. New debt. */
	| { readonly kind: "new"; readonly reason: string }
	/** A known violation, unchanged. Warn and move on. */
	| { readonly kind: "known"; readonly successor: string }
	/** Known violations have gone away. The baseline must shrink to match. */
	| { readonly kind: "stale"; readonly reason: string };

export interface LiveGroup {
	readonly key: string;
	readonly sites: ReadonlyMap<string, number>;
}

/**
 * Compare the live violations against the committed baseline.
 *
 * Fails in BOTH directions on purpose. Growing is new debt. Shrinking without committing the shrink
 * is what turns a ratchet into a rubber stamp — and failing on both independently is also what
 * defeats the swap, where one violation is fixed and another introduced in the same commit so the
 * total never moves.
 *
 * @lore AU28: keyed by FILE, not by line. Line keys thrash on every edit and train people to
 * regenerate the baseline reflexively, which is the same as not having one.
 */
export function compareBaseline(
	baseline: Baseline,
	live: readonly LiveGroup[],
): { readonly newDebt: string[]; readonly stale: string[] } {
	const newDebt: string[] = [];
	const stale: string[] = [];
	const liveByKey = new Map(live.map((g) => [g.key, g.sites]));

	for (const group of live) {
		const known = baseline.groups[group.key];
		if (known === undefined) {
			for (const [file, count] of group.sites) {
				newDebt.push(`${group.key} — ${file} (${count}); this rule has no baseline entry, so every violation is new`);
			}
			continue;
		}
		for (const [file, count] of group.sites) {
			const allowed = known.sites[file] ?? 0;
			if (count > allowed) {
				newDebt.push(`${group.key} — ${file}: ${count} violation(s), baseline allows ${allowed}`);
			}
		}
	}

	for (const [key, group] of Object.entries(baseline.groups)) {
		const liveSites = liveByKey.get(key);
		for (const [file, allowed] of Object.entries(group.sites)) {
			const count = liveSites?.get(file) ?? 0;
			if (count < allowed) {
				stale.push(`${key} — ${file}: ${count} violation(s) now, baseline still records ${allowed}`);
			}
		}
	}

	return { newDebt, stale };
}
