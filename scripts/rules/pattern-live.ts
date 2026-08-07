/**
 * AU28 rule — no classification pattern may go dead.
 *
 * @lore AU28: this is the direct fix for the defect that killed the inherited guard set. `au6` and
 * `au9` both scanned a deleted directory and printed PASS. Here every pattern declares the minimum
 * number of files it must match, PER PATTERN rather than per clause — so a single wholly-development
 * package being renamed, or one playwright lane config being removed, fails loudly instead of hiding
 * inside a clause that still matches hundreds of files elsewhere.
 *
 * @lore AU28: the floors are only meaningful under the clause precedence declared in
 * `CLASSIFICATION_PATTERNS`. Reordering that array silently invalidates every number here.
 */

import { CLASSIFICATION_PATTERNS } from "../lib/repo-census.js";
import type { Finding, Rule } from "../lib/governance-rules.js";

export const patternLive: Rule = {
	id: "pattern-live",
	description: "every classification pattern still matches at least its declared floor of files",
	minScope: 1000,
	scope: (census) => census.files.map((f) => f.path),
	evaluate: (census) => {
		const findings: Finding[] = [];
		for (const pattern of CLASSIFICATION_PATTERNS) {
			const count = census.patternCounts.get(pattern.id) ?? 0;
			if (count < pattern.minFiles) {
				findings.push({
					ruleId: "pattern-live",
					severity: "error",
					message:
						`pattern "${pattern.id}" (${pattern.description}) matched ${count} file(s), ` +
						`below its declared floor of ${pattern.minFiles}. Either the tree moved and the pattern ` +
						`must be re-rooted, or the pattern is obsolete and must be deleted. A pattern that matches ` +
						`nothing is a build error, not a pass.`,
				});
			}
		}
		return findings;
	},
};
