/**
 * BB1 — work is one recursive task, and the bet vocabulary does not come back.
 *
 * Bets and tasks were merged into a single task with a nullable `parent_task_id`. The `bets` table,
 * its routes, its state machine, its page and its agent tools are deleted, and a set of fields went
 * with them: `appetite` (already rejected at the API boundary before this), `at_risk` (never written
 * to `true` anywhere in production), `hypothesis`, `revision_log` (tasks already carried
 * `audit_trail`), the four-value bet status, the bet outcome vocabulary, and the stored
 * `teams.active_bets` tally.
 *
 * @lore BB1: this is a RULE, not a test, on purpose. The acceptance criterion is a static property of
 * the production tree — "this vocabulary is absent" — and `.claude/rules/testing.md` is explicit that
 * a test imports code and asserts on behaviour, while a property of the source belongs in the linter.
 * Grepping the filesystem from a `*.test.ts` would be a lint rule wearing a test's name.
 *
 * @lore BB1: scoped to the PRODUCTION world only. Development files legitimately still say "bet":
 * `migration-0068-brownfield.integration.test.ts` seeds the pre-0068 `bets` table on purpose, because
 * that is the migration it tests. Banning the word everywhere would force that test to lie about what
 * it migrates.
 *
 * @lore BB1: comments are stripped before matching, so the historical `@lore` notes that explain what
 * a bet WAS stay legal. That is the point — the record of why the merge happened is worth keeping,
 * and it is prose, not a live reference. The stripper is deliberately simple (it does not understand
 * strings containing comment markers); per the repo's standing position, lint is guidance and chasing
 * exotic spellings is not worth the complexity.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

export interface OneWorkPrimitiveInput {
	readonly readFile: (path: string) => string;
}

/** Identifiers that only exist if the bet primitive has come back. */
const BANNED: readonly { readonly token: RegExp; readonly why: string }[] = [
	{ token: /\bbets\b/, why: "the `bets` table is dropped — work is one recursive task" },
	{ token: /\bbetId\b/, why: "`betId` is replaced by `parentTaskId` (nullable — null means root)" },
	{ token: /\bbet_id\b/, why: "`bet_id` is replaced by `parent_task_id`" },
	{ token: /\bappetite\b/, why: "`appetite` was dead before BB1 and is deleted" },
	{ token: /\batRisk\b|\bat_risk\b/, why: "`at_risk` was never written to true in production" },
	{ token: /\bhypothesis\b/, why: "`hypothesis` is cut — a task's goal is its `doneCondition`" },
	{
		token: /\brevisionLog\b|\brevision_log\b/,
		why: "`revision_log` is cut — `audit_trail` is the one audit mechanism",
	},
	{
		token: /\bactiveBets\b|\bactive_bets\b/,
		why: "the stored WIP tally is gone — capacity is counted live from tasks in `in_progress`",
	},
	{ token: /\bBetStatus\b|\bBET_STATUSES\b/, why: "the bet status vocabulary folded into TASK_STATES" },
	{
		token: /\btransitionBet\b|\bcascadeBetKill\b/,
		why: "the bet state machine is deleted; `transitionTask` and `cascadeTaskKill` replace it",
	},
	{
		token: /\bcreateBet\b|\bupdateBetById\b|\bgetBetById\b/,
		why: "the bet service surface is deleted — tasks are the one work primitive",
	},
	{ token: /\bretroForBet\b/, why: "the human bet retro is cut; the retro is a plugin skill" },
	{ token: /\/api\/bets/, why: "the bets HTTP surface is deleted — use /api/tasks" },
	{ token: /\/work\/bet/, why: "the bet route is deleted — one task route at any depth" },
];

/**
 * Remove block and line comments so historical prose does not trip the rule.
 * Not a parser: it does not know that a comment marker can appear inside a string literal. That is
 * an accepted limit — the failure mode is a false POSITIVE on an odd line, which a human reads and
 * resolves, never a false negative that hides a live reference.
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Source files this rule can meaningfully read. */
function isSource(path: string): boolean {
	return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts");
}

export function oneWorkPrimitive(input: OneWorkPrimitiveInput): Rule {
	const { readFile } = input;

	const population = (census: Census): readonly string[] =>
		census.files.filter((f) => f.kind === "production" && isSource(f.path)).map((f) => f.path);

	return {
		id: "one-work-primitive",
		description:
			"the bet vocabulary stays deleted from production code — work is one recursive task",
		scope: population,
		/**
		 * @lore BB1: the floor is the whole production TypeScript surface, which is in the hundreds.
		 * A number this size cannot be satisfied by an accidental re-rooting onto a stray directory,
		 * which is the failure this field exists to catch (`au6`/`au9` scanned a deleted path and
		 * printed PASS for months).
		 */
		minScope: 300,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			for (const path of population(census)) {
				/*
				 * The census comes from `git ls-files --cached --others`, so it lists a file that is
				 * deleted in the working tree but still in the index. That file has no content and
				 * therefore cannot hold a violation. Skip it — but ONLY for "not found": any other
				 * read failure is a real problem and must not be swallowed into a green.
				 */
				let source: string;
				try {
					source = readFile(path);
				} catch (error) {
					if (error instanceof Error && error.message.includes("ENOENT")) continue;
					throw error;
				}
				const lines = stripComments(source).split("\n");
				for (const [i, line] of lines.entries()) {
					for (const { token, why } of BANNED) {
						if (token.test(line)) {
							findings.push({
								ruleId: "one-work-primitive",
								severity: "error",
								message: `${line.trim().slice(0, 100)} — ${why}`,
								path,
								line: i + 1,
								world: "production",
							});
							break;
						}
					}
				}
			}
			return findings;
		},
	};
}
