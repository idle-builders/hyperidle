/**
 * AU28 step 1 — the governance rule framework.
 *
 * A rule is a declarative predicate over a `Census`. It receives the census; it never discovers
 * files. `tools/governance/src/rules/**` is additionally banned by ESLint from importing `node:fs`,
 * `node:child_process` and any glob package, so "no rule does its own file discovery" is a
 * mechanical property rather than a convention.
 *
 * @lore AU28: `minScope` is the single most important field here. `au6-agent-boundary-guard` and
 * `au9-direct-handoff-guard` both scanned `packages/server/src`, a directory deleted two tracks
 * earlier, and both printed PASS over zero files for months while sitting in the lint chain. That one
 * failure mode is what killed the entire inherited guard set. A rule that scans NOTHING cannot prove
 * it is still alive, so the runner throws — it does not warn — when a rule's population is empty.
 */

import type { Census } from "./repo-census.js";

export type Severity = "error";

export interface Finding {
	readonly ruleId: string;
	readonly severity: Severity;
	readonly message: string;
	/** Repo-relative path the finding is about, when there is one. */
	readonly path?: string;
	/** 1-based line, when there is one. */
	readonly line?: number;
	/**
	 * Which world the offending FILE belongs to.
	 *
	 * Reported separately because the two are different kinds of debt: a production violation is a
	 * defect in what ships, a development one is a test reaching around something. Mixing them in one
	 * total lets either half move unnoticed behind the other — which was the point when development
	 * stood at 2,022 and is still the point now that Ruling 13a has collapsed it to double digits and
	 * production is the larger half.
	 */
	readonly world?: "production" | "development";
	/** The rule group this finding belongs to, for the per-group summary. */
	readonly group?: string;
}

export interface Rule {
	readonly id: string;
	readonly description: string;
	/**
	 * The files (or edges, rendered as strings) this rule is *about*. Not the violations — the
	 * population. A rule whose population is empty is dead, whatever its verdict says.
	 */
	readonly scope: (census: Census) => readonly string[];
	/**
	 * Minimum population size. At or below it minus one, `runRules` throws. Must be >= 1.
	 *
	 * @lore BB1: every rule declares exactly 1. It used to carry a hand-measured magnitude — 1000
	 * here, 700 there — and those numbers were the same migration-era ratchet as the deleted
	 * `minFiles` floors: deleting a file legitimately, as ten dead e2e specs were, turned the build
	 * red with a message asking for a different number. That trains reflexive number-bumping, which
	 * is the rot a floor is supposed to prevent. What actually catches the `au6` defect is the ZERO
	 * case — `au6` scanned a deleted directory and passed over no files at all — and 1 catches it
	 * without a magnitude anyone has to keep true.
	 */
	readonly minScope: number;
	readonly evaluate: (census: Census) => readonly Finding[];
}

/** Thrown when a rule's live population falls below its declared floor. Never caught by the runner. */
export class DeadRuleError extends Error {
	constructor(
		readonly ruleId: string,
		readonly liveScope: number,
		readonly minScope: number,
	) {
		super(
			`governance rule "${ruleId}" matched ${liveScope} file(s) but declares a floor of ${minScope}. ` +
				`A rule that scans nothing is a build error, not a pass — re-root it or delete it.`,
		);
		this.name = "DeadRuleError";
	}
}

export interface RunResult {
	readonly findings: readonly Finding[];
	/** Live population size per rule id, for reporting. */
	readonly scopeSizes: ReadonlyMap<string, number>;
}

/**
 * Run every rule against the census.
 *
 * Throws `DeadRuleError` for the first rule whose population is below its floor — before evaluating
 * it, so a dead rule can never contribute a (vacuously clean) verdict.
 */
export function runRules(rules: readonly Rule[], census: Census): RunResult {
	if (rules.length === 0) {
		throw new Error("governance-lint: no rules registered. An empty rule set is a build error.");
	}
	const findings: Finding[] = [];
	const scopeSizes = new Map<string, number>();
	const seen = new Set<string>();
	for (const rule of rules) {
		if (seen.has(rule.id)) throw new Error(`governance-lint: duplicate rule id "${rule.id}".`);
		seen.add(rule.id);
		if (rule.minScope < 1) {
			throw new Error(
				`governance-lint: rule "${rule.id}" declares minScope ${rule.minScope}; it must be >= 1.`,
			);
		}
		const size = rule.scope(census).length;
		scopeSizes.set(rule.id, size);
		if (size < rule.minScope) throw new DeadRuleError(rule.id, size, rule.minScope);
		findings.push(...rule.evaluate(census));
	}
	return { findings, scopeSizes };
}

export const hasErrors = (findings: readonly Finding[]): boolean =>
	findings.some((f) => f.severity === "error");

export function formatFinding(finding: Finding): string {
	const where =
		finding.path === undefined
			? ""
			: `${finding.path}${finding.line === undefined ? "" : `:${finding.line}`}: `;
	return `  ${finding.severity.toUpperCase()}  [${finding.ruleId}] ${where}${finding.message}`;
}
