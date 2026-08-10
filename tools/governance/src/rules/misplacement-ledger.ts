/**
 * AU28 — the misplacement ledger: production-path files that are really development.
 *
 * The classification rule is total and mechanical, so it calls a file production whenever no clause
 * says otherwise — even when a human can see the file is a test fixture, a preview page, or a lane
 * seam. Those files cannot always move: the ones here would each turn a production file into an
 * importer of a development file, which the crossing rule forbids outright. Left unrecorded they
 * simply look like production, forever.
 *
 * @lore AU28: a committed record that only shrinks, every row carrying its reason, checked in both
 * directions — the shape earns its keep because whether a production-path file is "really development"
 * is a human judgement with no live source to check it against.
 *
 * @lore AU28: the ledger's warnings deliberately carry NO `world` and NO `group`. `governance-lint`'s
 * summary line counts world-tagged warnings as the crossing debt total, and a ledger row tagged
 * `production` would inflate that goal metric with a different kind of debt, which is the same error
 * as reporting one total for production and development.
 *
 * @lore AU28: there is NO generator, and there cannot be one — whether a production-path file is
 * "really development" is a human judgement with nothing live to derive it from. What is left is the
 * both-directions count check below, plus the fact that growing the ledger is a two-line diff — the
 * entry and `resolvedFiles` — that review is expected to challenge.
 */

import type { MisplacedFiles } from "../lib/governance-registry.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

const LEDGER = "tools/governance/misplaced-files.json";

/** Same bar as the other registries: a reason too short to be a reason is not one. */
const MIN_REASON = 20;

export function misplacementLedger(ledger: MisplacedFiles): Rule {
	const entries = Object.entries(ledger.files);
	const resolved = (census: Census): string[] =>
		entries.filter(([path]) => census.byPath.has(path)).map(([path]) => path);

	return {
		id: "misplacement-ledger",
		description:
			"every recorded misplacement still exists, still needs recording, and the count is committed",
		// The population is the entries that resolve. When the last one is fixed the ledger and this
		// rule are deleted together — a ledger that has emptied is not a rule with nothing to say, it is
		// a rule with nothing left to be about.
		scope: resolved,
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const error = (message: string): void => {
				findings.push({ ruleId: "misplacement-ledger", severity: "error", message, path: LEDGER });
			};

			for (const [path, reason] of entries) {
				const record = census.byPath.get(path);
				if (record === undefined) {
					error(
						`"${path}" is recorded as a misplaced production file but is not a tracked file. It was renamed or ` +
							`deleted — remove the entry and lower resolvedFiles to match.`,
					);
					continue;
				}
				if (record.kind === "development") {
					error(
						`"${path}" is recorded as a production-path file that is really development, but the classifier now ` +
							`calls it development (clause "${record.clause}"). It moved — remove the entry and lower resolvedFiles.`,
					);
					continue;
				}
				if (reason.trim().length < MIN_REASON) {
					error(
						`"${path}" is recorded with no real reason. Every entry says why the file is stuck where it is.`,
					);
					continue;
				}
				// Reported on every run, one line per entry. A ledger nobody sees is a ledger nobody clears.
				findings.push({
					ruleId: "misplacement-ledger",
					severity: "warn",
					message: `production path, really development — ${reason}`,
					path,
				});
			}

			// Checked in both directions: above is new debt parked here, below is a fix whose shrink was
			// never committed — the second is what stops this from becoming a rubber stamp.
			const live = resolved(census).length;
			if (live > ledger.resolvedFiles) {
				error(
					`${live} entr(y/ies) resolve to a tracked file, and ${LEDGER} commits to ${ledger.resolvedFiles}. ` +
						`This ledger may only shrink — fix the file rather than recording it, and if a file genuinely cannot ` +
						`move, raise resolvedFiles in the same commit so the growth is in the diff.`,
				);
			} else if (live < ledger.resolvedFiles) {
				error(
					`${live} entr(y/ies) resolve to a tracked file, and ${LEDGER} still commits to ${ledger.resolvedFiles}. ` +
						`A misplacement was cleared without committing the shrink — lower resolvedFiles to ${live}.`,
				);
			}

			return findings;
		},
	};
}
