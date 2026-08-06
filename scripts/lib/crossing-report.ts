/**
 * AU28 — naming a crossing, and the baseline that decides whether it fails the build.
 *
 * @lore AU28: the dial and the ratchet are ONE mechanism, not two. Every rule is error by default;
 * `governance/baseline.json` is the list of known violations, and only what is on that list warns.
 * The alternative — a per-rule `enforcement: "warn" | "error"` field — lets a rule sit at warn with
 * nothing recording what it is waiting for, and the repo's own history says any exemption apparatus
 * gets re-populated. A baseline entry cannot be silent: it names every file it forgives, and it fails
 * the build when it grows OR shrinks.
 *
 * @lore AU28: the baseline records DEBT, never a plan. It does not name the work that will clear a
 * group — that mapping lives with the work packages, and a group is cleared by whoever gets there
 * first. Keeping it out means the enforced contract never goes stale when planning changes, and the
 * generator never has to be edited to register a rename.
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
	/** File → number of violating crossings in it. Keyed by FILE, never by line. */
	readonly sites: Readonly<Record<string, number>>;
}

export interface Baseline {
	readonly governanceBaseline: true;
	readonly note: string;
	readonly groups: Readonly<Record<string, BaselineGroup>>;
}

export type RatchetVerdict =
	/** Not a known violation. New debt. */
	| { readonly kind: "new"; readonly reason: string }
	/** A known violation, unchanged. Warn and move on. */
	| { readonly kind: "known" }
	/** Known violations have gone away. The baseline must shrink to match. */
	| { readonly kind: "stale"; readonly reason: string };

export interface LiveGroup {
	readonly key: string;
	readonly sites: ReadonlyMap<string, number>;
}

/**
 * The baseline may only ever shrink. Returns one refusal per group or site that would grow it.
 *
 * @lore AU28: the CHECK was already ratcheted in both directions — a group with no baseline entry
 * makes every one of its violations new debt, and a site below its recorded count fails until the
 * shrink is committed. The GENERATOR was the laundering path: it rebuilt the file from whatever was
 * live, so a developer who introduced a violation could run it, commit the enlarged file, and go
 * green over a rule that had been clean. This closes that without any new mechanism — clearing a
 * group's last site removes the entry, and from that commit the rule is at error. Promotion is not a
 * step anyone has to remember; it is what fixing the violation DOES.
 *
 * `adopted` is the one legitimate growth: a NEW RULE landing over existing violations. The caller
 * takes it from an explicit `--adopt "<group key>"` argument, so it is visible in the shell, in the
 * diff and in review — never a silent side effect of running the generator.
 */
export function refuseGrowth(live: readonly LiveGroup[], previous: Baseline, adopted: readonly string[]): string[] {
	const refusals: string[] = [];
	for (const group of live) {
		const known = previous.groups[group.key];
		if (known === undefined) {
			if (adopted.includes(group.key)) continue;
			const total = [...group.sites.values()].reduce((n, c) => n + c, 0);
			refusals.push(
				`${group.key} — ${total} violation(s) in a group the baseline does not have. This rule is at ` +
					`error today. Fix the violation, or if a new rule is landing over existing debt, re-run ` +
					`with --adopt ${JSON.stringify(group.key)}.`,
			);
			continue;
		}
		for (const [file, count] of group.sites) {
			const allowed = known.sites[file] ?? 0;
			if (count > allowed) {
				refusals.push(`${group.key} — ${file}: ${count} violation(s), baseline allows ${allowed}. The baseline may only shrink.`);
			}
		}
	}
	return refusals;
}

/**
 * Compare the live violations against the committed baseline.
 *
 * Fails in BOTH directions on purpose. Growing is new debt. Shrinking without committing the shrink
 * is what turns a ratchet into a rubber stamp.
 *
 * @lore AU28 — WHAT THE BIDIRECTIONAL CHECK ACTUALLY GUARANTEES, both halves. It defeats the swap
 * ACROSS `(group, file)` pairs: fix a violation in `a.ts`, introduce one in `b.ts` or in another
 * group, and the total never moves but `a.ts` reports `stale` while `b.ts` reports `newDebt`. It
 * does NOT defeat a swap WITHIN one `(group, file)` pair — the key is `(group, file, count)` and
 * carries no table, and `targetLabel` collapses every unowned table to `db:table (unowned)`, so
 * renaming one unowned table to another unowned table inside a baselined file clears three
 * violations and creates three, with no `stale` and no `newDebt`. That is a KNOWN LIMIT, recorded
 * rather than fixed: narrowing the key to include the table would re-key all 38 baseline groups
 * wholesale, and the case is closer to gaming than to a style difference — nobody writes it by
 * accident. An earlier version of this comment claimed the check defeated the swap outright. It did
 * not, and a false claim in the file that makes it is worse than the gap.
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
