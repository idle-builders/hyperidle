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
import {
	type TableOwners,
	validateArchitecture,
	validateTableOwners,
} from "../lib/governance-registry.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

/**
 * Every package the workspace declares must have a role, and every role must claim a package.
 *
 * @param liveTables every table the schema declares. The table registry is validated HERE and
 * nowhere else at lint time.
 *
 * @lore AU28: `validateTableOwners` used to have exactly one caller — a test. `governance-lint.ts`
 * called only `validateArchitecture`, so `tools/governance/README.md`'s promise ("a new table → give it an
 * owner in table-owners.json; the build fails until you do, that is the point") was simply not true.
 * A check that exists and runs nowhere is the `au6` shape one level up: it reads as enforcement to
 * everyone who greps for it. Wiring it in was free — it passes against the live tree unchanged.
 */
export function registriesHonest(
	architecture: Architecture,
	tableOwners: TableOwners,
	liveTables: ReadonlySet<string>,
): Rule {
	return {
		id: "registries-honest",
		description:
			"the governance registries name only packages that exist, and every package has a manifest-declared role",
		scope: (census: Census) => census.packages.map((p) => p.dir),
		// The repo has 34 workspace packages. Well below that means the role rules stopped matching.
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const names = new Set(census.packages.map((p) => p.name));

			try {
				validateArchitecture(architecture, names);
			} catch (error) {
				findings.push({
					ruleId: "registries-honest",
					severity: "error",
					message: error instanceof Error ? error.message : String(error),
					path: "tools/governance/architecture.json",
				});
			}

			try {
				validateTableOwners(tableOwners, liveTables, names);
			} catch (error) {
				findings.push({
					ruleId: "registries-honest",
					severity: "error",
					message: error instanceof Error ? error.message : String(error),
					path: "tools/governance/table-owners.json",
				});
			}

			// A service must live in a layer that exists. A dangling parent means the containment tree
			// the reach and wire clauses stand on has a hole in it.
			for (const pkg of census.packages) {
				if (pkg.role !== "service") continue;
				const parent = census.packages.find((p) => p.role === "layer" && p.name === pkg.layer);
				if (parent === undefined) {
					findings.push({
						ruleId: "registries-honest",
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
