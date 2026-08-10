/**
 * AU31 §7 clause 2, R1 — `layer-exports-resolve-inside-the-layer`.
 *
 * A layer package's own `exports` map IS its public face (§7 clause 1). This rule holds the other
 * half of that claim mechanically: no entry in that map may resolve into a NESTED SERVICE package
 * (`layers/<layer>/<service>/src/…`, its own workspace package) — only into the layer's own `src/`.
 * A layer that "faces" its way around the boundary by exporting a subpath straight through into one
 * of its services would make the shrunk export map (R3) worthless, because the deep path would still
 * resolve, just under a shorter name.
 *
 * `readExportsField`/`resolveExportsMap` read the manifest as a registry, not a filesystem walk — the
 * injected `readFile` is the only I/O, same discipline as every other rule here.
 */

import { readExportsField, resolveExportsMap } from "../lib/exports-map.js";
import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census, WorkspacePackage } from "../lib/repo-census.js";

export interface LayerExportsResolveInsideTheLayerInput {
	readonly locate: (file: string) => WorkspacePackage | undefined;
	readonly readFile: (path: string) => string;
}

export function layerExportsResolveInsideTheLayer(
	input: LayerExportsResolveInsideTheLayerInput,
): Rule {
	const { locate, readFile } = input;

	const layerManifests = (census: Census): string[] =>
		census.packages.filter((p) => p.role === "layer").map((p) => `${p.dir}/package.json`);

	return {
		id: "layer-exports-resolve-inside-the-layer",
		description:
			"a layer manifest's `exports` entry resolves inside the layer's own source, never into a nested service package",
		scope: layerManifests,
		minScope: 4,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			for (const pkg of census.packages) {
				if (pkg.role !== "layer") continue;
				const manifestPath = `${pkg.dir}/package.json`;
				if (!census.byPath.has(manifestPath)) continue;
				const exp = readExportsField(readFile(manifestPath));
				for (const entry of resolveExportsMap(pkg.dir, exp, census.byPath)) {
					const target = locate(entry.target);
					if (target !== undefined && target.role === "service") {
						findings.push({
							ruleId: "layer-exports-resolve-inside-the-layer",
							severity: "error",
							message:
								`${pkg.name}'s exports entry "${entry.specifier}" resolves to ${entry.target}, inside ` +
								`the nested service package ${target.name}. A layer's face reaches its OWN source, ` +
								"never a service's — the service is judged by R2/R3, not laundered out through a " +
								"shortened manifest entry that still resolves into it.",
							path: manifestPath,
						});
					}
				}
			}
			return findings;
		},
	};
}
