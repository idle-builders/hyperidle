/**
 * AU28 — the governance registries describe the repo that actually exists.
 *
 * The compact model is only as good as the registries it reads. A registry naming a package that was
 * deleted, or missing one that was added, produces confident verdicts about nothing.
 *
 * @lore AU28: this rule's population is the workspace packages, not files, and its floor is set from
 * the live count. A census built without role rules yields zero packages — the rule then trips its
 * floor and the build fails, rather than reporting a clean result over an empty set. That is the `au6`
 * lesson applied to a registry instead of a directory.
 */

import type { Architecture } from "../lib/governance-model.js";
import { validateArchitecture } from "../lib/governance-registry.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

/** Every package the workspace declares must have a role, and every role must claim a package. */
export function registriesHonest(architecture: Architecture): Rule {
	return {
		id: "au28-registries-honest",
		description: "the governance registries name only packages that exist, and every package has a manifest-declared role",
		scope: (census: Census) => census.packages.map((p) => p.dir),
		// The repo has 34 workspace packages. Well below that means the role rules stopped matching.
		minScope: 25,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const names = new Set(census.packages.map((p) => p.name));

			try {
				validateArchitecture(architecture, names);
			} catch (error) {
				findings.push({
					ruleId: "au28-registries-honest",
					severity: "error",
					message: error instanceof Error ? error.message : String(error),
					path: "governance/architecture.json",
				});
			}

			// A service must live in a layer that exists. A dangling parent means the containment tree
			// the reach and wire clauses stand on has a hole in it.
			for (const pkg of census.packages) {
				if (pkg.role !== "service") continue;
				const parent = census.packages.find((p) => p.role === "layer" && p.name === pkg.layer);
				if (parent === undefined) {
					findings.push({
						ruleId: "au28-registries-honest",
						severity: "error",
						message: `service "${pkg.name}" claims to live in layer "${pkg.layer ?? "?"}", which is not a layer package`,
						path: `${pkg.dir}/package.json`,
					});
				}
			}

			return findings;
		},
	};
}
