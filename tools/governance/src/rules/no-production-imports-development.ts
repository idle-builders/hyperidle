/**
 * AU28 rule — THE crossing rule (founder Ruling 8.1).
 *
 *   A production file may never import a development file. One direction, no exceptions.
 *
 * @lore AU28: there is no allowlist, no `--skip`, no suppression comment and no severity override,
 * deliberately. Retired-guard signal 9: every exemption apparatus in this repo got re-populated;
 * what held was deleting the mechanism, not emptying it. If a genuine crossing appears whose fix is a
 * product change, the answer is to make the product change or to stop and ask — not to widen the rule.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";

export const noProductionImportsDevelopment: Rule = {
	id: "no-production-imports-development",
	description: "a production file may never import a development file",
	// Floor is on the population (production files), not the violations. A crossing rule that
	// happens to see zero production files would otherwise report a perfect score.
	minScope: 1,
	scope: (census) => census.files.filter((f) => f.kind === "production").map((f) => f.path),
	evaluate: (census) => {
		const findings: Finding[] = [];
		for (const edge of census.edges) {
			const from = census.byPath.get(edge.from);
			const to = census.byPath.get(edge.to);
			if (from === undefined || to === undefined) continue;
			if (from.kind !== "production" || to.kind !== "development") continue;
			findings.push({
				ruleId: "no-production-imports-development",
				severity: "error",
				path: edge.from,
				line: edge.line,
				message:
					`production file imports development file "${edge.to}" (specifier "${edge.specifier}"). ` +
					`Target is development by clause "${to.clause}" (pattern "${to.patternId}"); ` +
					`importer is production by clause "${from.clause}".`,
			});
		}
		return findings;
	},
};
