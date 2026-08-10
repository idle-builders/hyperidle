/**
 * AU28 — no compiled artifact may sit beside its own source.
 *
 * @lore AU28: this rule exists because the hazard is SILENT and it bit twice in one day. Tests in
 * `framework/db` import `tools/governance/src/lib/*.js`, which drags those files into a composite build that
 * emits `.js` / `.d.ts` next to the `.ts`. Node, tsx and vitest then all resolve the stale compiled
 * copy in preference to the source — so the governance guard ran OLD LOGIC while the source on disk
 * said something else, and the only symptom was a test failing for a reason that made no sense.
 * (`tsc` hides the underlying TS6059 as reference noise, so nothing else reports it.)
 *
 * The artifacts are gitignored, so this is not about the commit. It is about the working tree: a
 * developer with a stale `.js` is running different code from the one they are editing.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

const COMPILED = /\.(?:js|d\.ts|js\.map|d\.ts\.map)$/;

/** Strip a compiled suffix to the source stem it would have come from. */
const sourceStemOf = (path: string): string | null => {
	for (const suffix of [".d.ts.map", ".js.map", ".d.ts", ".js"]) {
		if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
	}
	return null;
};

export function noStaleBuildArtifacts(presentFiles: readonly string[]): Rule {
	return {
		id: "no-stale-build-artifacts",
		description: "no compiled .js/.d.ts sits beside the .ts it was built from",
		// The population is every TypeScript source that COULD be shadowed.
		scope: (census: Census) =>
			census.files.filter((f) => f.path.endsWith(".ts")).map((f) => f.path),
		minScope: 500,
		evaluate: (census: Census): readonly Finding[] => {
			const sources = new Set(census.files.map((f) => f.path));
			const findings: Finding[] = [];
			for (const path of presentFiles) {
				if (!COMPILED.test(path)) continue;
				const stem = sourceStemOf(path);
				if (stem === null) continue;
				if (!(sources.has(`${stem}.ts`) || sources.has(`${stem}.tsx`))) continue;
				findings.push({
					ruleId: "no-stale-build-artifacts",
					severity: "error",
					message:
						`${path} is a compiled copy of ${stem}.ts sitting beside it. Node, tsx and vitest all resolve ` +
						"the compiled copy first, so the code that runs is not the code on disk. Delete it.",
					path,
				});
			}
			return findings;
		},
	};
}
