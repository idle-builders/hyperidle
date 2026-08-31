/**
 * AU32 — the bookkeeping does not come back (D11).
 *
 * This rule is the mechanical half of the guard against rebuilding a per-file allowance, a count, or
 * an adoption flag, under any name. It is designed against an honest engineer or agent reaching for
 * the old shape out of habit, never against someone deliberately disguising one: a governance rule
 * here is guidance for a mistake, not a security boundary, and this project already spent five
 * critique rounds relearning that lesson once.
 *
 * @lore AU31: `governance/rule-severity.json` — a rule key → `warn`/`error` declaration that staged a
 * bulk migration across several merges — is gone, and the governance record set is now closed with no
 * exception for its own filename either. A new architectural rule lands at `error`, its violations
 * fixed in the same pull request, so there is no longer a legitimate reason for that file to exist.
 *
 * @lore AU32: what this catches and what it cannot, stated so nobody trusts it further than it goes.
 * It catches a new record file at the top of `tools/governance/` and an undeclared flag on a
 * governance CLI. It does NOT catch an allowance written into `architecture.json` or
 * `decided-rules.json` under an innocuous key — those files are inside the closed set and their
 * contents are not otherwise shape-checked here — and it does NOT catch a clause in
 * `governance-model.ts` carved out for one package or table name, because `decide()` receives a
 * `Crossing` with no file path at all, so a path-based carve-out cannot even be written without a
 * compile-visible signature change; a name-keyed clause is undetectable here because it mirrors the
 * legitimate `scope: "named"` rows already in `decided-rules.json`. That gap is closed by review,
 * deliberately, not by more code.
 *
 * @lore AU31: the closed set used to be the whole `governance/` directory — every file under it was a
 * record, because the engine lived elsewhere in `scripts/`. Moving the engine's code alongside the
 * data into `tools/governance/` means the directory now also holds `src/**`, which is real source and
 * grows by design. Scoping the closed set to `tools/governance/`'s DIRECT children (not everything
 * `startsWith` it) is what keeps that distinction: a new file dropped at the package root is still
 * caught, a new rule or lib module under `src/` is not mistaken for a record.
 *
 * @lore AU31: `package.json` and `tsconfig.json` joined the root the same day, because `tools/*` is a
 * real `npm` workspace glob — nothing under it resolves, typechecks, or gets discovered by
 * `typecheck-gate.ts` without them. They are declared here rather than left to trip the check, for the
 * same reason a `governance` engineer would ask for them by name in review: every `tools/*` sibling
 * carries the same two files, so their presence answers nothing about whether a per-file allowance
 * came back. What the closed set still refuses is a SIXTH, UNDECLARED file at this root — the shape a
 * returning allowance or a new bookkeeping record would take.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

const GOVERNANCE_DIR = "tools/governance/";

/** The only files `tools/governance/` may hold at its own root — never recursed into `src/`, which is
 * the engine's real source and grows by design. An allowlist of what may exist, not a denylist of
 * names — that is what catches a returning record whatever it is called. No exceptions, not even for
 * a filename that used to be legitimate. Five governance records plus the two files every `tools/*`
 * workspace package carries. */
const CLOSED_SET: ReadonlySet<string> = new Set([
	"tools/governance/README.md",
	"tools/governance/architecture.json",
	"tools/governance/decided-rules.json",
	"tools/governance/table-owners.json",
	"tools/governance/misplaced-files.json",
	"tools/governance/package.json",
	"tools/governance/tsconfig.json",
]);

/** True for a file directly inside `GOVERNANCE_DIR` — `tools/governance/x.json`, not
 * `tools/governance/src/x.ts`. The engine's own source is deliberately outside the closed set. */
const isDirectChildOfGovernanceDir = (path: string): boolean =>
	path.startsWith(GOVERNANCE_DIR) && !path.slice(GOVERNANCE_DIR.length).includes("/");

/** The governance CLIs a `package.json` script invokes. `governance-context.ts` is a shared loader,
 * not a CLI, and is not in this list. */
const CLI_ENTRY_POINTS: readonly string[] = [
	"tools/governance/src/governance-lint.ts",
	"tools/governance/src/governance-new-cells.ts",
];

const DECLARED_FLAGS: ReadonlySet<string> = new Set(["--fixtures", "--attacks", "--errors-only"]);

/** Every string literal a CLI compares directly against `process.argv`, either spelling. */
function argvComparisons(source: string): string[] {
	const flags: string[] = [];
	const patterns = [
		/process\.argv\.includes\(\s*["']([^"']+)["']\s*\)/g,
		/process\.argv\[[^\]]*\]\s*===\s*["']([^"']+)["']/g,
		/["']([^"']+)["']\s*===\s*process\.argv\[[^\]]*\]/g,
	];
	for (const pattern of patterns) {
		for (const found of source.matchAll(pattern)) {
			const flag = found[1];
			if (flag !== undefined) flags.push(flag);
		}
	}
	return flags;
}

export interface NoPerFileAllowancesInput {
	readonly readFile: (path: string) => string;
}

export function noPerFileAllowances(input: NoPerFileAllowancesInput): Rule {
	const { readFile } = input;

	const population = (census: Census): string[] => [
		...census.files.filter((f) => isDirectChildOfGovernanceDir(f.path)).map((f) => f.path),
		...CLI_ENTRY_POINTS.filter((p) => census.byPath.has(p)),
	];

	return {
		id: "no-per-file-allowances",
		description:
			"tools/governance/ stays a closed set at its root, and the governance CLIs accept no undeclared flag",
		scope: population,
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const error = (message: string, path?: string): void => {
				findings.push({ ruleId: "no-per-file-allowances", severity: "error", message, path });
			};

			// 1. tools/governance/'s own root is a closed set.
			for (const file of census.files) {
				if (isDirectChildOfGovernanceDir(file.path) && !CLOSED_SET.has(file.path)) {
					error(
						`"${file.path}" is a new file at the root of tools/governance/, which is a closed set. This ` +
							"is the shape a per-file allowance or a new bookkeeping record would take — rename, " +
							"remove it, or add it to the declared set deliberately.",
						file.path,
					);
				}
			}

			// 2. The governance CLIs accept no undeclared flag.
			const cliSources = CLI_ENTRY_POINTS.filter((p) => census.byPath.has(p)).map((p) =>
				readFile(p),
			);
			const seenFlags = new Set(cliSources.flatMap((source) => argvComparisons(source)));
			if (seenFlags.size === 0) {
				error(
					"the argv-comparison scan over the governance CLIs found nothing. A scan matching zero " +
						"comparisons reads as passing forever — fix the scan before trusting it again.",
				);
			}
			for (const flag of seenFlags) {
				if (!DECLARED_FLAGS.has(flag)) {
					error(
						`a governance CLI compares argv against "${flag}", which is not one of the declared flags ` +
							`(${[...DECLARED_FLAGS].join(", ")}). An undeclared flag is where a silent escape hatch ` +
							"would come back, whatever it is called.",
					);
				}
			}

			return findings;
		},
	};
}
