/**
 * AU28 — naming a crossing: the label a finding is reported under, and the key its rule is grouped and
 * severity-declared under.
 *
 * @lore AU32 (Ruling E): this module used to also hold a committed record of known violations and the
 * check that compared it to reality. That mechanism is gone; `groupKey`'s output is now looked up in
 * `governance/rule-severity.json` (a flat map, no paths, no counts) instead of a per-file allowance
 * record. What survives here is naming, which every consumer of a finding still needs regardless of
 * how severity is decided.
 */

import type { Actor, Crossing, Target } from "./governance-model.js";

/**
 * How a target is named in a finding and in the severity key.
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

/** The stable key a violation is grouped and severity-declared under. */
export const groupKey = (crossing: Crossing, world: string): string =>
	`${sourceLabel(crossing.source)} → ${targetLabel(crossing.target, crossing.source)} [${crossing.kind}] ${world}`;
