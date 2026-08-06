/**
 * AU28 — a package may not re-export a surface it does not publish.
 *
 * @lore AU28: the model reasons PER EDGE, with no notion of transitive reach, and two individually
 * legal hops compose into a complete bypass of table ownership:
 *
 *     // hop 1 — the owning service's own barrel: store-owner-only → allowed
 *     export { bets as betsTable } from "@hyperidle/db";
 *     // hop 2 — its layer: reach-your-own-contents → allowed
 *     import { betsTable } from "@hyperidle/work";  …then insert(betsTable)
 *
 * `governance-lint: PASS`, and a layer now writes a table owned by another service. The owning
 * barrel already carried a hand-written comment forbidding exactly this — the codebase knew, and the
 * only enforcement was the comment. The same hop nullifies audiences generally: re-export a
 * `db:util` symbol from a service barrel and its `reach: ["service"]` is void.
 *
 * @lore AU28 — why a STANDALONE rule and not a new crossing kind. A new `Kind` would force an edit to
 * the frozen kind union and to the hardcoded kind list in the decided-verdict test, and it would
 * DOUBLE-COUNT the live cross-package re-exports the `import` detector already reports. So this rule
 * emits findings directly with its own group key and never calls `decide()`. The trade-off is stated
 * rather than hidden: this one verdict does not come from a clause. It is justified because the
 * question — *does re-exporting widen the audience?* — is one the model does not answer, and
 * inventing a clause for it would be a rule change rather than a detector fix.
 *
 * @lore AU28 — the three narrowings, each load-bearing. (1) A TABLE symbol may never cross a package
 * boundary in an `export … from`, not even from its owner: owner-ship is exactly the laundering
 * vector, since the owner re-exporting its own table is what lets its layer obtain it. (2) Everything
 * else is forbidden only when the surface's audience is narrower than `everyone` — re-exporting
 * `framework/shared` launders nothing, any consumer could import it directly, and eight of the
 * fourteen live cross-package re-exports are exactly that. Without (2) the rule dies of noise on its
 * first day. (3) A WITHIN-package re-export is out of scope: a package's own barrel re-exporting its
 * own module IS the surface's publication.
 *
 * @lore AU28 — the residual, stated. A 3-hop chain that stays inside `everyone` surfaces launders
 * nothing, so it is not a hole. What this rule genuinely cannot see is a package re-exporting a
 * symbol it legitimately CONTAINS, which a foreign consumer then reaches — but that is the designed
 * layer-public-face mechanism, not an evasion. The deeper fix is to follow re-export edges to the
 * defining module in the census itself and re-key the consumer's import against the true target;
 * that was deferred deliberately because it re-keys live baselined violations and touches the
 * substrate every other rule stands on.
 */

import type { DbSurfaceIndex } from "../lib/db-surfaces.js";
import type { Architecture, Audience } from "../lib/governance-model.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census, WorkspacePackage } from "../lib/repo-census.js";

export interface ReExportRuleInput {
	readonly architecture: Architecture;
	readonly db: DbSurfaceIndex;
	/** Framework package name → the surface label it is named by. */
	readonly frameworkSurfaces: ReadonlyMap<string, string>;
	readonly locate: (file: string) => WorkspacePackage | undefined;
}

/** The group key laundering findings are reported under. Shaped like a crossing key on purpose. */
export const LAUNDERED_RE_EXPORT_GROUP = "package → foreign surface [re-export]";

const reachOf = (architecture: Architecture, surface: string): Audience | undefined => {
	const entry = architecture.surfaces[surface];
	return typeof entry === "object" && entry !== null && "reach" in entry ? entry.reach : undefined;
};

export function noLaunderedReExports(input: ReExportRuleInput): Rule {
	const { architecture, db, frameworkSurfaces, locate } = input;

	/**
	 * The population is EVERY `export … from` that resolves into the census, not the cross-package
	 * subset. The rule is *about* re-exports; keying the floor to the violating subset would kill it
	 * the day someone tidies up the handful of legitimate cross-package ones.
	 */
	const population = (census: Census): string[] =>
		census.edges.filter((e) => e.reexport).map((e) => `${e.from}:${e.line}`);

	return {
		id: "no-laundered-re-exports",
		description: "a package may not re-export a foreign table, or a surface whose audience is narrower than everyone",
		scope: population,
		minScope: 400,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];

			for (const edge of census.edges) {
				if (!edge.reexport) continue;
				const from = locate(edge.from);
				const to = locate(edge.to);
				// Within one package, a re-export is the surface's own publication.
				if (from === undefined || to === undefined || from.dir === to.dir) continue;

				const world = census.byPath.get(edge.from)?.kind;
				const report = (message: string): void => {
					findings.push({
						ruleId: "no-laundered-re-exports",
						severity: "error",
						message,
						path: edge.from,
						line: edge.line,
						...(world === undefined ? {} : { world }),
						group: `${LAUNDERED_RE_EXPORT_GROUP} ${world ?? "production"}`,
					});
				};

				if (to.name === "db") {
					// `export *` from the database package takes every surface, tables included.
					if (edge.namespace || edge.symbols.length === 0) {
						report(
							`${from.name} re-exports the whole of ${edge.specifier}. A namespace re-export republishes every ` +
								"surface behind it, tables included — name the symbols you actually publish, or do not publish them.",
						);
						continue;
					}
					for (const symbol of edge.symbols) {
						const resolved = db.resolve(edge.to, symbol, false);
						if (resolved.surface === "db:table") {
							report(
								`${from.name} re-exports the table symbol \`${resolved.table ?? symbol}\` from ${edge.specifier}. ` +
									"A table may never cross a package boundary in an `export … from` — not even from its owner, " +
									"because that is precisely how a consumer obtains it transitively and the table ACL evaporates.",
							);
							continue;
						}
						const reach = reachOf(architecture, resolved.surface);
						if (reach !== undefined && reach !== "everyone") {
							report(
								`${from.name} re-exports \`${symbol}\` (${resolved.surface}) from ${edge.specifier}. That surface is ` +
									"reachable by a named audience, and re-exporting it hands it to everyone who can name this package.",
							);
						}
					}
					continue;
				}

				const surface = frameworkSurfaces.get(to.name);
				if (surface === undefined) continue; // a package, not a declared surface — out of scope
				const reach = reachOf(architecture, surface);
				if (reach !== undefined && reach !== "everyone") {
					report(
						`${from.name} re-exports from ${edge.specifier} (${surface}). That surface is reachable by a named ` +
							"audience, and re-exporting it hands it to everyone who can name this package.",
					);
				}
			}

			return findings;
		},
	};
}
