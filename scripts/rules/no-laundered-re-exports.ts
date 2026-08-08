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
 * narrow-reach `framework/api-contract` symbol (reach `[layer]`) from a service barrel and its
 * audience is void — AU29: the previous illustrative example, `db:util`'s `escapeLikePattern`, no
 * longer exists as a narrow surface — its exports moved to `framework/shared` (reach `everyone`),
 * so `framework/db` carries no narrow-reach surface at all today.
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
 * `framework/shared` launders nothing, any consumer could import it directly, and most of the live
 * cross-package re-exports are exactly that. Without (2) the rule dies of noise on its first day.
 * (3) A WITHIN-package re-export is out of scope: a package's own barrel re-exporting its own module
 * IS the surface's publication.
 *
 * @lore AU28 — a table is republished by VALUE as readily as by `export … from`, and for a long time
 * only the second spelling was seen. `import { bets } from "@hyperidle/db"; export const betsTable =
 * bets;` in the owning service's barrel is the identical act — the consumer imports `betsTable` from
 * the service and calls `insert(betsTable)`, and `buildTableRefs` on the consumer's side resolves it
 * straight back to the table. `export { bets as betsTable } from "@hyperidle/db"` errored; the value
 * form passed with zero findings. Worse, narrowing (3) made the two-file spelling free: put the value
 * alias in `table-exports.ts` and have the barrel say `export { betsTable } from "./table-exports.js"`,
 * and the second hop is a within-package re-export the rule declines to look at. So the value form is
 * caught where the table LEAVES the database package — at the alias itself — which closes both
 * spellings with one check and leaves narrowing (3) intact.
 *
 * @lore AU28 — the residual, stated. A 3-hop chain that stays inside `everyone` surfaces launders
 * nothing, so it is not a hole. What this rule genuinely cannot see is a package re-exporting a
 * symbol it legitimately CONTAINS, which a foreign consumer then reaches — but that is the designed
 * layer-public-face mechanism, not an evasion. Nor does the VALUE check extend to narrow non-table
 * surfaces (`export const authMe = AuthMeResponse`, a `framework/api-contract` re-export by value):
 * that needs a symbol→surface resolver on the publication side, where the table check reuses
 * `buildTableRefs` wholesale. The deeper fix for both
 * is to follow re-export edges to the defining module in the census itself and re-key the consumer's
 * import against the true target; that was deferred deliberately because it re-keys every live
 * crossing's group key and touches the substrate every other rule stands on — a change of that size
 * belongs in its own reviewed work, not folded into this rule's fix.
 */

import ts from "typescript";

import { buildTableRefs } from "../lib/crossing-detectors.js";
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
	/** Injected, like everywhere else in this library — the value half has to re-parse the source. */
	readonly readFile: (path: string) => string;
}

/** The phrase both spellings of a republished table share, so one message covers `export … from` and `export const`. */
const TABLE_NEVER_REPUBLISHED = "A table may never be republished across a package boundary";

/** The group key laundering findings are reported under. Shaped like a crossing key on purpose. */
export const LAUNDERED_RE_EXPORT_GROUP = "package → foreign surface [re-export]";

const reachOf = (architecture: Architecture, surface: string): Audience | undefined => {
	const entry = architecture.surfaces[surface];
	return typeof entry === "object" && entry !== null && "reach" in entry ? entry.reach : undefined;
};

/**
 * Files outside the database package that name it. The population of the VALUE half.
 *
 * Only these are re-parsed: a table cannot be published by a file that never obtains one, and a full
 * re-parse of the tree for a rule is a cost the census design exists to avoid.
 */
const filesNamingTheDatabase = (census: Census, locate: (file: string) => WorkspacePackage | undefined): string[] => {
	const out = new Set<string>();
	for (const edge of census.edges) {
		if (locate(edge.to)?.name !== "db") continue;
		const from = locate(edge.from);
		// The database package publishing its own tables IS the surface, not a republication of it.
		if (from === undefined || from.name === "db") continue;
		if (!/\.tsx?$/.test(edge.from)) continue;
		out.add(edge.from);
	}
	return [...out].sort();
};

export function noLaunderedReExports(input: ReExportRuleInput): Rule {
	const { architecture, db, frameworkSurfaces, locate, readFile } = input;

	/**
	 * The population is EVERY `export … from` that resolves into the census, not the cross-package
	 * subset, PLUS every file outside the database package that names it — the two spellings the rule
	 * judges. The rule is *about* re-exports; keying the floor to the violating subset would kill it
	 * the day someone tidies up the handful of legitimate cross-package ones.
	 *
	 * One number cannot tell which half collapsed, so the half that is not the binding floor reports
	 * its own death as a finding rather than hiding behind the other's size.
	 */
	const population = (census: Census): string[] => [
		...census.edges.filter((e) => e.reexport).map((e) => `${e.from}:${e.line}`),
		...filesNamingTheDatabase(census, locate),
	];

	return {
		id: "no-laundered-re-exports",
		description: "a package may not republish a foreign table, or a surface whose audience is narrower than everyone",
		scope: population,
		minScope: 400,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			const report = (path: string, line: number, world: "production" | "development" | undefined, message: string): void => {
				findings.push({
					ruleId: "no-laundered-re-exports",
					severity: "error",
					message,
					path,
					line,
					...(world === undefined ? {} : { world }),
					group: `${LAUNDERED_RE_EXPORT_GROUP} ${world ?? "production"}`,
				});
			};

			// --- the VALUE spelling: a table bound to an exported name -----------------------------
			const candidates = filesNamingTheDatabase(census, locate);
			if (candidates.length === 0) {
				findings.push({
					ruleId: "no-laundered-re-exports",
					severity: "error",
					message:
						"no file outside the database package names it, so the value half of this rule — `export const x = <table>` " +
						"— is measuring nothing. A half-dead rule reads as clean forever; re-root it or delete it.",
				});
			}
			for (const file of candidates) {
				const from = locate(file);
				if (from === undefined) continue;
				let sf: ts.SourceFile;
				try {
					sf = ts.createSourceFile(file, readFile(file), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
				} catch {
					continue;
				}
				const refs = buildTableRefs(sf, file, { census, locate, tables: db.tables });
				const world = census.byPath.get(file)?.kind;
				const publish = (table: string, as: string, node: ts.Node): void =>
					report(
						file,
						sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
						world,
						`${from.name} publishes the table \`${table}\` as the exported binding \`${as}\`. ${TABLE_NEVER_REPUBLISHED} — ` +
							"`export const x = <table>` hands a consumer the table exactly as `export { table as x } from` does, and the " +
							"table ACL evaporates the same way. Publish a function that does the work, never the table.",
					);
				for (const statement of sf.statements) {
					const exported =
						ts.canHaveModifiers(statement) &&
						ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
					if (ts.isVariableStatement(statement) && exported) {
						for (const declaration of statement.declarationList.declarations) {
							if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
							const table = refs.resolve(declaration.initializer);
							if (table !== null) publish(table, declaration.name.text, declaration);
						}
						continue;
					}
					// `export { t as betsTable }` with no `from` — the local binding, published.
					if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined) {
						const clause = statement.exportClause;
						if (clause === undefined || !ts.isNamedExports(clause)) continue;
						for (const element of clause.elements) {
							const table = refs.resolve(element.propertyName ?? element.name);
							if (table !== null) publish(table, element.name.text, element);
						}
					}
				}
			}

			for (const edge of census.edges) {
				if (!edge.reexport) continue;
				const from = locate(edge.from);
				const to = locate(edge.to);
				// Within one package, a re-export is the surface's own publication.
				if (from === undefined || to === undefined || from.dir === to.dir) continue;

				const world = census.byPath.get(edge.from)?.kind;
				const here = (message: string): void => report(edge.from, edge.line, world, message);

				if (to.name === "db") {
					// `export *` from the database package takes every surface, tables included.
					if (edge.namespace || edge.symbols.length === 0) {
						here(
							`${from.name} re-exports the whole of ${edge.specifier}. A namespace re-export republishes every ` +
								"surface behind it, tables included — name the symbols you actually publish, or do not publish them.",
						);
						continue;
					}
					for (const symbol of edge.symbols) {
						const resolved = db.resolve(edge.to, symbol, false);
						if (resolved.surface === "db:table") {
							here(
								`${from.name} re-exports the table symbol \`${resolved.table ?? symbol}\` from ${edge.specifier}. ` +
									`${TABLE_NEVER_REPUBLISHED} — not even by its owner, because that is precisely how a consumer ` +
									"obtains it transitively and the table ACL evaporates.",
							);
							continue;
						}
						const reach = reachOf(architecture, resolved.surface);
						if (reach !== undefined && reach !== "everyone") {
							here(
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
					here(
						`${from.name} re-exports from ${edge.specifier} (${surface}). That surface is reachable by a named ` +
							"audience, and re-exporting it hands it to everyone who can name this package.",
					);
				}
			}

			return findings;
		},
	};
}
