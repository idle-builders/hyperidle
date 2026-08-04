/**
 * AU28 step 1 — the governance rule framework.
 *
 * A rule is a declarative predicate over a `Census`. It receives the census; it never discovers
 * files. `scripts/rules/**` is additionally banned by ESLint from importing `node:fs`,
 * `node:child_process` and any glob package, so "no rule does its own file discovery" is a
 * mechanical property rather than a convention.
 *
 * @lore AU28: `minScope` is the single most important field here. `au6-agent-boundary-guard` and
 * `au9-direct-handoff-guard` both scanned `packages/server/src`, a directory deleted two tracks
 * earlier, and both printed PASS over zero files for months while sitting in the lint chain. That one
 * failure mode is what killed the entire inherited guard set. A rule that cannot state how many
 * things it is about cannot prove it is still alive, so declaring the floor is mandatory and the
 * runner throws — it does not warn — when live scope falls below it.
 */

import type { Census } from "./repo-census.js";

export type Severity = "error" | "warn";

export interface Finding {
	readonly ruleId: string;
	readonly severity: Severity;
	readonly message: string;
	/** Repo-relative path the finding is about, when there is one. */
	readonly path?: string;
	/** 1-based line, when there is one. */
	readonly line?: number;
}

export interface Rule {
	readonly id: string;
	readonly description: string;
	/**
	 * The files (or edges, rendered as strings) this rule is *about*. Not the violations — the
	 * population. A rule whose population is empty is dead, whatever its verdict says.
	 */
	readonly scope: (census: Census) => readonly string[];
	/** Minimum population size. At or below it minus one, `runRules` throws. Must be >= 1. */
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
			throw new Error(`governance-lint: rule "${rule.id}" declares minScope ${rule.minScope}; it must be >= 1.`);
		}
		const size = rule.scope(census).length;
		scopeSizes.set(rule.id, size);
		if (size < rule.minScope) throw new DeadRuleError(rule.id, size, rule.minScope);
		findings.push(...rule.evaluate(census));
	}
	return { findings, scopeSizes };
}

export const hasErrors = (findings: readonly Finding[]): boolean => findings.some((f) => f.severity === "error");

export function formatFinding(finding: Finding): string {
	const where =
		finding.path === undefined ? "" : `${finding.path}${finding.line === undefined ? "" : `:${finding.line}`}: `;
	return `  ${finding.severity.toUpperCase()}  [${finding.ruleId}] ${where}${finding.message}`;
}
