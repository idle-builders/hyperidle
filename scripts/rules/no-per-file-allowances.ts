/**
 * AU32 — the bookkeeping does not come back (D11; Ruling E).
 *
 * Ruling E's model is one severity per architectural rule, declared in `governance/rule-severity.json`
 * and nothing else. This rule is the mechanical half of the guard against rebuilding what was just
 * deleted — a per-file allowance, a count, an adoption flag, under any name. It is designed against an
 * honest engineer or agent reaching for the old shape out of habit, never against someone deliberately
 * disguising one: a governance rule here is guidance for a mistake, not a security boundary, and this
 * project already spent five critique rounds relearning that lesson once.
 *
 * @lore AU32: what this catches and what it cannot, stated so nobody trusts it further than it goes.
 * It catches a new record file under `governance/`, a nested shape growing back under a rule key in
 * `rule-severity.json`, a path-shaped key (this file's whole model has no file paths in it), and an
 * undeclared flag on a governance CLI. It does NOT catch an allowance written into `architecture.json`
 * or `decided-rules.json` under an innocuous key — those files are inside the closed set and only
 * `rule-severity.json`'s shape is checked — and it does NOT catch a clause in `governance-model.ts`
 * carved out for one package or table name, because `decide()` receives a `Crossing` with no file path
 * at all, so a path-based carve-out cannot even be written without a compile-visible signature change;
 * a name-keyed clause is undetectable here because it mirrors the legitimate `scope: "named"` rows
 * already in `decided-rules.json`. That gap is closed by review, deliberately, not by more code.
 */

import type { DetectorFloor } from "../lib/crossings.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

const GOVERNANCE_DIR = "governance/";
const SEVERITY_FILE = "governance/rule-severity.json";

/** The only files `governance/` may hold. An allowlist of what may exist, not a denylist of names —
 * that is what catches a returning record whatever it is called. */
const CLOSED_SET: ReadonlySet<string> = new Set([
	"governance/README.md",
	"governance/architecture.json",
	"governance/decided-rules.json",
	"governance/table-owners.json",
	"governance/rule-severity.json",
	"governance/misplaced-files.json",
]);

/** The governance CLIs a `package.json` script invokes. `governance-context.ts` is a shared loader,
 * not a CLI, and is not in this list. */
const CLI_ENTRY_POINTS: readonly string[] = [
	"scripts/governance-lint.ts",
	"scripts/governance-floors.ts",
	"scripts/governance-new-cells.ts",
];

const DECLARED_FLAGS: ReadonlySet<string> = new Set(["--fixtures", "--attacks", "--errors-only"]);

const WORLDS = ["production", "development"] as const;

/** A rule key must parse as `<source> → <target> [<kind>] <world>`. Written as a positive parse,
 * never a "contains a slash" test — a target like `framework/db` legitimately contains one. */
function parsesAsRuleKey(key: string, kinds: ReadonlySet<string>): boolean {
	for (const world of WORLDS) {
		const worldSuffix = ` ${world}`;
		if (!key.endsWith(worldSuffix)) continue;
		const withoutWorld = key.slice(0, -worldSuffix.length);
		const arrow = " → ";
		const arrowIndex = withoutWorld.indexOf(arrow);
		if (arrowIndex <= 0) continue;
		const source = withoutWorld.slice(0, arrowIndex).trim();
		const rest = withoutWorld.slice(arrowIndex + arrow.length);
		const match = /^(.+) \[([^[\]]+)\]$/.exec(rest);
		if (match === null) continue;
		const [, target, kind] = match;
		if (source.length === 0 || (target ?? "").trim().length === 0) continue;
		if (kind === undefined || !kinds.has(kind)) continue;
		return true;
	}
	return false;
}

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
	/** The nine live `Kind`s, read off the model's own detector floors rather than re-spelled here. */
	readonly floors: readonly DetectorFloor[];
	readonly readFile: (path: string) => string;
}

export function noPerFileAllowances(input: NoPerFileAllowancesInput): Rule {
	const { floors, readFile } = input;
	const kinds = new Set(floors.map((f) => f.kind));

	const population = (census: Census): string[] => [
		...census.files.filter((f) => f.path.startsWith(GOVERNANCE_DIR)).map((f) => f.path),
		...CLI_ENTRY_POINTS.filter((p) => census.byPath.has(p)),
	];

	return {
		id: "no-per-file-allowances",
		description: "governance/ stays a closed set of record files, rule-severity.json stays a flat error|warn map keyed by rule, and the governance CLIs accept no undeclared flag",
		scope: population,
		minScope: 8,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const error = (message: string, path?: string): void => {
				findings.push({ ruleId: "no-per-file-allowances", severity: "error", message, path });
			};

			// 1. governance/ is a closed set.
			for (const file of census.files) {
				if (file.path.startsWith(GOVERNANCE_DIR) && !CLOSED_SET.has(file.path)) {
					error(
						`"${file.path}" is a new file under governance/, which is a closed set of six record files. ` +
							"This is the shape a per-file allowance or a new bookkeeping record would take — rename, " +
							"remove it, or add it to the declared set deliberately.",
						file.path,
					);
				}
			}

			// 2 & 3. rule-severity.json's shape.
			if (census.byPath.has(SEVERITY_FILE)) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(readFile(SEVERITY_FILE));
				} catch {
					error(`${SEVERITY_FILE} is not valid JSON.`, SEVERITY_FILE);
					parsed = undefined;
				}
				if (typeof parsed === "object" && parsed !== null && "severity" in parsed) {
					const severity = (parsed as { severity: unknown }).severity;
					if (typeof severity === "object" && severity !== null && !Array.isArray(severity)) {
						for (const [key, value] of Object.entries(severity as Record<string, unknown>)) {
							if (value !== "error" && value !== "warn") {
								error(
									`${SEVERITY_FILE}: "${key}" carries ${JSON.stringify(value)}, not the string "error" or ` +
										`"warn". This is exactly the shape a per-file allowance would grow back in — a nested ` +
										"object, an array, or a count under a rule key.",
									SEVERITY_FILE,
								);
								continue;
							}
							if (!parsesAsRuleKey(key, kinds)) {
								error(
									`${SEVERITY_FILE}: "${key}" does not parse as "<source> → <target> [<kind>] <world>". ` +
										"A key that is not a rule key reads like a path-keyed allowance.",
									SEVERITY_FILE,
								);
							}
						}
					}
				}
			}

			// 4. The governance CLIs accept no undeclared flag.
			const cliSources = CLI_ENTRY_POINTS.filter((p) => census.byPath.has(p)).map((p) => readFile(p));
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
