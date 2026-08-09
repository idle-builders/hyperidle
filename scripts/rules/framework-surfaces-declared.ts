/**
 * Every framework package has a decided audience, and every decided audience has a package.
 *
 * The audience of a framework package is its `surfaces` entry in `governance/architecture.json`.
 * Until this rule, nothing checked that the entry exists: the crossing detector maps a framework
 * package to its `framework/<name>` label and the surface clause refuses an undeclared one — but a
 * package **nobody imports yet** emits no crossing at all, so it had no audience and lint passed.
 * Adding a package is exactly when the question gets asked and exactly when nothing was asking it.
 *
 * @lore AU34: shipped as its own registered rule rather than as another check inside
 * `registries-honest`. That matters for one mechanical reason: `coverageGaps` keys on REGISTERED RULE
 * IDS, so a registered id with no positive attack case is a build error, while a check folded into a
 * rule that already has a positive case forces nothing. The rule id is what makes the break-test
 * unavoidable.
 *
 * @lore AU34: the floor is the FRAMEWORK subset, not the package set. `registries-honest` floors 34
 * package directories; a check about framework packages carried on that floor would read clean
 * forever if the framework half ever matched zero — the `au6` shape one level down. Scoping the rule
 * to `framework/<name>` labels makes `minScope` floor exactly the population the rule is about, so a
 * scan that finds nothing is `DeadRuleError`, not a pass.
 */

import type { Architecture } from "../lib/governance-model.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

const PREFIX = "framework/";

/** Every `framework/<name>` label `architecture.json` declares an audience for. */
const declaredLabels = (architecture: Architecture): string[] =>
	Object.keys(architecture.surfaces).filter((label) => label.startsWith(PREFIX));

export function frameworkSurfacesDeclared(architecture: Architecture): Rule {
	return {
		id: "framework-surfaces-declared",
		description: "every framework package resolves to a declared surface, and every declared framework surface to a package",
		/**
		 * Both directions' populations, rendered as the same `framework/<name>` string so a package and
		 * the entry that decides its audience count once. Four today.
		 */
		scope: (census: Census): readonly string[] => {
			const population = new Set(declaredLabels(architecture));
			for (const pkg of census.packages) {
				if (pkg.role === "framework") population.add(`${PREFIX}${pkg.name}`);
			}
			return [...population];
		},
		minScope: 4,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];

			// 1. A package with no decided audience does not ship.
			for (const pkg of census.packages) {
				if (pkg.role !== "framework") continue;
				const label = `${PREFIX}${pkg.name}`;
				if (label in architecture.surfaces) continue;
				findings.push({
					ruleId: "framework-surfaces-declared",
					severity: "error",
					message:
						`${pkg.name} is a framework package with no decided audience. Declare "${label}" in ` +
						"governance/architecture.json `surfaces` with its reach and the reason it holds — until then " +
						"nothing may name it, and nobody has said who should be able to.",
					path: `${pkg.dir}/package.json`,
					world: "production",
				});
			}

			// 2. And an audience outlives nothing. Without this, retiring a framework package while
			//    leaving its entry behind lints clean and the registry describes a package that is gone.
			const live = new Set(census.packages.filter((p) => p.role === "framework").map((p) => p.name));
			for (const label of declaredLabels(architecture)) {
				if (live.has(label.slice(PREFIX.length))) continue;
				findings.push({
					ruleId: "framework-surfaces-declared",
					severity: "error",
					message:
						`"${label}" is declared as a surface and no framework package of that name exists. Remove the ` +
						"entry — an audience for a package that is gone is a decision about nothing.",
					path: "governance/architecture.json",
					world: "production",
				});
			}

			return findings;
		},
	};
}
