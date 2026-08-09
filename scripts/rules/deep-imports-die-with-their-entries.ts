/**
 * AU31 §7 clause 2, R3 — `deep-imports-die-with-their-entries`.
 *
 * An import specifier naming `@hyperidle/<layer>/<subpath>` where `<subpath>` is not a declared
 * `exports` entry is a violation, file and specifier named — satisfying validation scenario 2's error
 * shape even where the TS resolver would ALSO fail (`package.json exports do not define …`).
 *
 * @lore AU31: this rule cannot be built on `census.edges`. `buildCensus`'s own resolution
 * (`repo-census.ts`'s `resolve()`) walks the SAME `exports` map and silently DROPS any specifier that
 * fails to resolve — `if (to === null) continue` — so the very act of shrinking a layer's export map
 * makes a leftover deep import invisible to every edge-based rule, including the generic
 * `crossing-import` rule. This rule re-parses every file's raw specifiers with `collectSpecifiers`
 * (the same extractor `buildCensus` uses internally, exported for exactly this) and checks each one
 * against the target layer's declared subpath KEYS directly — never through `resolve()`.
 */

import { declaredSubpaths, readExportsField } from "../lib/exports-map.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import { collectSpecifiers, type Census, type WorkspacePackage } from "../lib/repo-census.js";

export interface DeepImportsDieWithTheirEntriesInput {
	readonly readFile: (path: string) => string;
}

const PARSEABLE = /\.(?:m|c)?[jt]sx?$/;

export function deepImportsDieWithTheirEntries(input: DeepImportsDieWithTheirEntriesInput): Rule {
	const { readFile } = input;

	const parseableFiles = (census: Census): string[] => census.files.filter((f) => PARSEABLE.test(f.path)).map((f) => f.path);

	return {
		id: "deep-imports-die-with-their-entries",
		description: "an import naming a layer package's deep subpath dies with the entry — only a declared `exports` key resolves",
		scope: parseableFiles,
		minScope: 500,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];

			const layers = new Map<string, WorkspacePackage>();
			for (const pkg of census.packages) if (pkg.role === "layer") layers.set(pkg.scopedName, pkg);
			if (layers.size === 0) {
				findings.push({
					ruleId: "deep-imports-die-with-their-entries",
					severity: "error",
					message: "no layer package was found in the census. A rule that judges nothing reads as passing forever.",
				});
				return findings;
			}

			const subpathsByLayer = new Map<string, ReadonlySet<string>>();
			for (const [name, pkg] of layers) {
				const manifestPath = `${pkg.dir}/package.json`;
				subpathsByLayer.set(name, census.byPath.has(manifestPath) ? declaredSubpaths(readExportsField(readFile(manifestPath))) : new Set());
			}

			for (const record of census.files) {
				if (!PARSEABLE.test(record.path)) continue;
				let source: string;
				try {
					source = readFile(record.path);
				} catch {
					continue;
				}
				for (const raw of collectSpecifiers(record.path, source)) {
					const layer = layers.get(raw.specifier.split("/").slice(0, 2).join("/"));
					if (layer === undefined) continue;
					const rest = raw.specifier === layer.scopedName ? "." : `./${raw.specifier.slice(layer.scopedName.length + 1)}`;
					const declared = subpathsByLayer.get(layer.scopedName) ?? new Set();
					if (!declared.has(rest)) {
						findings.push({
							ruleId: "deep-imports-die-with-their-entries",
							severity: "error",
							message:
								`imports "${raw.specifier}", but ${layer.scopedName}'s package.json declares no "${rest}" ` +
								"exports entry. A layer's face is its declared entry list — a deep path that used to " +
								"resolve dies with the entry that carried it.",
							path: record.path,
							line: raw.line,
							world: census.byPath.get(record.path)?.kind,
						});
					}
				}
			}
			return findings;
		},
	};
}
