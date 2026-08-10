/**
 * AU28 — the crossing rules.
 *
 * One registered rule per crossing kind, so each keeps its own liveness floor and a dead detector
 * fails loudly instead of contributing a clean verdict.
 *
 * @lore AU31: every crossing is at `error`, unconditionally. A staged severity dial
 * (`governance/rule-severity.json`, a rule key → `warn`/`error` declaration) lived here through the
 * bulk migration that brought the crossing rules up — it let a rule land ahead of a full cleanup, with
 * a run in between to clear the debt. That migration finished; a new rule now lands with its
 * violations already fixed in the same pull request, so the dial had nothing left to do and is gone —
 * see `governance/README.md` for the one-line record of why it existed.
 */

import { groupKey } from "../lib/crossing-keys.js";
import type { DetectedCrossing } from "../lib/crossings.js";
import type { Architecture, Kind } from "../lib/governance-model.js";
import { decide } from "../lib/governance-model.js";
import type { Finding, Rule } from "../lib/governance-rules.js";

export interface CrossingRuleInput {
	readonly architecture: Architecture;
	readonly crossings: readonly DetectedCrossing[];
	/** Minimum crossings each detector must find. Below it the rule throws rather than passing. */
	readonly floors: ReadonlyMap<Kind, number>;
}

/** Every violation found, with the group it belongs to. Shared by the rules and the reporter. */
export function violationsOf(
	architecture: Architecture,
	crossings: readonly DetectedCrossing[],
): { found: DetectedCrossing; key: string; why: string; clause: string }[] {
	const out: { found: DetectedCrossing; key: string; why: string; clause: string }[] = [];
	for (const found of crossings) {
		const decision = decide(architecture, found.crossing, found.world);
		if (decision.verdict === "allowed") continue;
		out.push({ found, key: groupKey(found.crossing, found.world), why: decision.why, clause: decision.clause });
	}
	return out;
}

export function crossingRules(input: CrossingRuleInput): Rule[] {
	const { architecture, crossings, floors } = input;
	const violations = violationsOf(architecture, crossings);

	const kinds = [...floors.keys()];
	return kinds.map((kind): Rule => {
		const mine = crossings.filter((c) => c.crossing.kind === kind);
		const myViolations = violations.filter((v) => v.found.crossing.kind === kind);
		return {
			id: `crossing-${kind.replace(":", "-")}`,
			description: `every ${kind} crossing obeys the architecture model`,
			scope: () => mine.map((c) => `${c.file}:${c.line}`),
			minScope: floors.get(kind) ?? 1,
			evaluate: (): readonly Finding[] =>
				myViolations.map((violation) => ({
					ruleId: `crossing-${kind.replace(":", "-")}`,
					severity: "error",
					message: `${violation.key} — ${violation.found.detail}. ${violation.why}`,
					path: violation.found.file,
					line: violation.found.line,
					world: violation.found.world,
					group: violation.key,
				})),
		};
	});
}
