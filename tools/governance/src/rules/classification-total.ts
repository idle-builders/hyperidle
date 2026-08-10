/**
 * AU28 rule — every file classifies, and the classification is total.
 *
 * @lore AU28: totality is true by construction (`CLASSIFICATION_PATTERNS` ends with an unconditional
 * default), which is precisely why it is asserted rather than trusted. The failure this catches is
 * someone reordering the pattern list so the default is no longer last, or a pattern id going missing
 * from the counts — both silent, both turning the census into a partial view that every downstream
 * rule then reasons over.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import { CLASSIFICATION_PATTERNS } from "../lib/repo-census.js";

export const classificationTotal: Rule = {
	id: "classification-total",
	description: "every censused file carries exactly one kind and one clause; the counts reconcile",
	minScope: 1000,
	scope: (census) => census.files.map((f) => f.path),
	evaluate: (census) => {
		const findings: Finding[] = [];
		const production = census.files.filter((f) => f.kind === "production").length;
		const development = census.files.filter((f) => f.kind === "development").length;

		if (production + development !== census.files.length) {
			findings.push({
				ruleId: "classification-total",
				severity: "error",
				message: `production (${production}) + development (${development}) !== total (${census.files.length}). A file classified as neither is a build error.`,
			});
		}

		if (census.byPath.size !== census.files.length) {
			findings.push({
				ruleId: "classification-total",
				severity: "error",
				message: `byPath holds ${census.byPath.size} entries for ${census.files.length} files — duplicate paths in the census input.`,
			});
		}

		const known = new Set(CLASSIFICATION_PATTERNS.map((p) => p.id));
		for (const record of census.files) {
			if (!known.has(record.patternId)) {
				findings.push({
					ruleId: "classification-total",
					severity: "error",
					path: record.path,
					message: `classified by unknown pattern "${record.patternId}".`,
				});
			}
		}

		for (const pattern of CLASSIFICATION_PATTERNS) {
			if (!census.patternCounts.has(pattern.id)) {
				findings.push({
					ruleId: "classification-total",
					severity: "error",
					message: `pattern "${pattern.id}" is missing from patternCounts — the census is not reporting every pattern.`,
				});
			}
		}

		return findings;
	},
};
