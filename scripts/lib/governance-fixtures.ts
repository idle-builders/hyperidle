/**
 * AU28 — the governance guard's `--fixtures` self-test.
 *
 * A synthetic repository, held entirely in memory, that asserts BOTH that every classification clause
 * resolves correctly AND that every known evasion of the crossing rule is caught.
 *
 * @lore AU28: retired-guards.md §5 names this as the one technique that would have caught `au6` and
 * `au9` going no-op, because it proves the detector still works independently of whether the live tree
 * happens to be clean. A guard that only ever runs against a clean repo cannot distinguish "nothing is
 * wrong" from "I stopped looking". The same `FIXTURE_CASES` array is consumed twice: by `--fixtures`
 * in the lint chain, and by real vitest assertions in
 * `packages/db/src/__tests__/au28-governance-lint.test.ts`.
 */

import { type Census, type FileKind, buildCensus, classifyFile } from "./repo-census.js";
import { DeadRuleError, type Rule, runRules } from "./governance-rules.js";
import { noProductionImportsDevelopment } from "../rules/no-production-imports-development.js";
import { patternLive } from "../rules/pattern-live.js";
import { classificationTotal } from "../rules/classification-total.js";

// ---------------------------------------------------------------------------
// The synthetic tree
// ---------------------------------------------------------------------------

const APP_MANIFEST = JSON.stringify({
	name: "@fix/app",
	exports: {
		".": "./src/index.ts",
		"./helpers": "./src/__testing__/helpers.ts",
	},
});

const BENCH_MANIFEST = JSON.stringify({
	name: "@fix/eval",
	exports: { "./smoke": "./src/smoke/index.ts" },
});

const PLAIN_MANIFEST = JSON.stringify({ name: "@fix/plain" });

/**
 * Every entry is `path -> source`. Production files named `evasion-*` each encode one syntactic form
 * a naive detector would miss; `clean-*` files encode forms that must NOT be reported.
 */
export const FIXTURE_TREE: Readonly<Record<string, string>> = {
	// --- manifests -----------------------------------------------------------
	"packages/app/package.json": APP_MANIFEST,
	"packages/eval/package.json": BENCH_MANIFEST,
	"packages/plain/package.json": PLAIN_MANIFEST,

	// --- development targets -------------------------------------------------
	"packages/app/src/__testing__/helpers.ts": "export const helper = 1;\n",
	"packages/app/src/__testing__/index.ts": "export * from './helpers.js';\n",
	"packages/app/src/Widget.stories.tsx": "export const Story = () => null;\n",
	// Name-declared development files sitting BESIDE production code, not inside `__tests__/`. Under a
	// dunder-only rule these would classify production and their imports would read as crossings.
	"packages/app/src/Widget.test.ts": 'import { helper } from "./__testing__/helpers.js";\nexport const t = helper;\n',
	"packages/app/src/Widget.spec.ts": 'import { helper } from "./__testing__/helpers.js";\nexport const s = helper;\n',
	"packages/app/vitest.config.ts": "export default {};\n",
	"packages/app/playwright.config.ts": "export default {};\n",
	"packages/app/playwright.ah1.config.ts": "export default {};\n",
	"packages/eval/src/smoke/index.ts": "export const smoke = 1;\n",
	"tools/outside.ts": "export const outside = 1;\n",

	// --- production files, one evasion each ----------------------------------
	"packages/app/src/index.ts": "export const app = 1;\n",
	"packages/app/src/evasion-plain.ts": 'import { helper } from "./__testing__/helpers.js";\nexport const a = helper;\n',
	"packages/app/src/evasion-reexport.ts": 'export { helper } from "./__testing__/helpers.js";\n',
	"packages/app/src/evasion-type-only.ts":
		'import type { helper } from "./__testing__/helpers.js";\nexport type T = typeof helper;\n',
	"packages/app/src/evasion-dynamic.ts":
		'export async function load() {\n  return await import("./__testing__/helpers.js");\n}\n',
	"packages/app/src/evasion-namespace.ts": 'import * as ns from "./__testing__/helpers.js";\nexport const b = ns;\n',
	"packages/app/src/evasion-multiline.ts":
		'import {\n  helper,\n} from\n  "./__testing__/helpers.js";\nexport const c = helper;\n',
	"packages/app/src/evasion-extensionless.ts": 'import { helper } from "./__testing__/helpers";\nexport const d = helper;\n',
	"packages/app/src/evasion-directory-index.ts": 'import { helper } from "./__testing__";\nexport const e = helper;\n',
	"packages/app/src/evasion-subpath-export.ts": 'import { helper } from "@fix/app/helpers";\nexport const f = helper;\n',
	"packages/app/src/evasion-cross-package.ts": 'import { smoke } from "@fix/eval/smoke";\nexport const g = smoke;\n',
	"packages/app/src/evasion-story.ts": 'import { Story } from "./Widget.stories.js";\nexport const h = Story;\n',
	"packages/app/src/evasion-outside-packages.ts":
		'import { outside } from "../../../tools/outside.js";\nexport const i = outside;\n',

	// --- production files that must stay clean --------------------------------
	"packages/app/src/clean-external.ts": 'import { useState } from "react";\nexport const j = useState;\n',
	"packages/app/src/clean-sibling.ts": 'import { app } from "./index.js";\nexport const k = app;\n',
	"packages/app/src/clean-string-literal.ts":
		'export const path = "./__testing__/helpers.js";\n// import { helper } from "./__testing__/helpers.js";\n',
	"packages/app/src/clean-unresolvable.ts": 'import { x } from "./does-not-exist.js";\nexport const l = x;\n',

	// --- development files may import anything --------------------------------
	"packages/app/src/__tests__/uses-dev.ts":
		'import { helper } from "../__testing__/helpers.js";\nimport { smoke } from "@fix/eval/smoke";\nexport const m = [helper, smoke];\n',
	"packages/eval/src/uses-production.ts": 'import { app } from "@fix/app";\nexport const n = app;\n',
};

/** The crossings the fixture tree is designed to contain — `from` path only, one per evasion file. */
const EXPECTED_CROSSINGS: readonly string[] = [
	"packages/app/src/evasion-cross-package.ts",
	"packages/app/src/evasion-directory-index.ts",
	"packages/app/src/evasion-dynamic.ts",
	"packages/app/src/evasion-extensionless.ts",
	"packages/app/src/evasion-multiline.ts",
	"packages/app/src/evasion-namespace.ts",
	"packages/app/src/evasion-outside-packages.ts",
	"packages/app/src/evasion-plain.ts",
	"packages/app/src/evasion-reexport.ts",
	"packages/app/src/evasion-story.ts",
	"packages/app/src/evasion-subpath-export.ts",
	"packages/app/src/evasion-type-only.ts",
];

export function buildFixtureCensus(): Census {
	const files = Object.keys(FIXTURE_TREE).sort();
	return buildCensus({
		files,
		readFile: (p) => {
			const source = FIXTURE_TREE[p];
			if (source === undefined) throw new Error(`fixture tree has no file ${p}`);
			return source;
		},
	});
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface FixtureCase {
	readonly id: string;
	readonly detail: string;
	/** Returns `null` on pass, or a human-readable failure reason. */
	readonly run: () => string | null;
}

const expectClassification = (path: string, kind: FileKind, patternId: string): FixtureCase => ({
	id: `classify:${path}`,
	detail: `${path} is ${kind} via ${patternId}`,
	run: () => {
		const record = classifyFile(path);
		if (record.kind !== kind) return `expected kind ${kind}, got ${record.kind}`;
		if (record.patternId !== patternId) return `expected pattern ${patternId}, got ${record.patternId}`;
		return null;
	},
});

const CLASSIFICATION_CASES: readonly FixtureCase[] = [
	expectClassification("packages/app/src/__testing__/helpers.ts", "development", "dunder-segment"),
	expectClassification("packages/app/src/__generated__/x.ts", "development", "dunder-segment"),
	expectClassification("packages/app/src/Widget.stories.tsx", "development", "stories-suffix"),
	expectClassification("packages/app/src/Widget.test.ts", "development", "test-suffix"),
	expectClassification("packages/app/src/Widget.test.tsx", "development", "test-suffix"),
	expectClassification("packages/app/src/Widget.spec.ts", "development", "spec-suffix"),
	expectClassification("packages/app/src/Widget.spec.tsx", "development", "spec-suffix"),
	expectClassification("packages/eval/src/smoke/index.ts", "development", "development-package:eval"),
	expectClassification("packages/eslint-plugin-authz/src/x.ts", "development", "development-package:eslint-plugin-authz"),
	expectClassification("packages/eslint-plugin-design/src/x.ts", "development", "development-package:eslint-plugin-design"),
	expectClassification("tools/outside.ts", "development", "outside-packages"),
	expectClassification("vitest.integration.config.ts", "development", "outside-packages"),
	expectClassification("packages/app/vitest.config.ts", "development", "test-runner-config:vitest.config.ts"),
	expectClassification("packages/app/playwright.config.ts", "development", "test-runner-config:playwright.config.ts"),
	expectClassification(
		"packages/app/playwright.ah1.config.ts",
		"development",
		"test-runner-config:playwright.*.config.ts",
	),
	expectClassification("packages/app/src/index.ts", "production", "default-production"),
	expectClassification("packages/app/package.json", "production", "default-production"),
	expectClassification("packages/app/vite.config.ts", "production", "default-production"),
	// Precedence: a path matching two clauses resolves to the earlier one, and the order is
	// declared, not incidental. Each of these would classify differently under a different order.
	//
	// The name-declared FILE mechanism beats the name-declared FOLDER mechanism. This is the pairing
	// the reorder exists for: almost every `.test.ts` also sits under `__tests__/`, so with the folder
	// clause first `test-suffix` would match nothing and `pattern-live` would kill the build.
	{
		id: "classify:precedence:test-suffix-beats-dunder",
		detail: "packages/app/src/__tests__/x.test.ts resolves to test-suffix, not dunder-segment",
		run: () => {
			const record = classifyFile("packages/app/src/__tests__/x.test.ts");
			return record.patternId === "test-suffix" ? null : `got ${record.patternId}`;
		},
	},
	{
		id: "classify:precedence:spec-suffix-beats-dunder",
		detail: "packages/app/__e2e__/flow.spec.ts resolves to spec-suffix, not dunder-segment",
		run: () => {
			const record = classifyFile("packages/app/__e2e__/flow.spec.ts");
			return record.patternId === "spec-suffix" ? null : `got ${record.patternId}`;
		},
	},
	{
		id: "classify:precedence:stories-suffix-beats-dunder",
		detail: "packages/app/src/__tests__/Foo.stories.tsx resolves to stories-suffix, not dunder-segment",
		run: () => {
			const record = classifyFile("packages/app/src/__tests__/Foo.stories.tsx");
			return record.patternId === "stories-suffix" ? null : `got ${record.patternId}`;
		},
	},
	// ...and the folder mechanism still stands on its own for a file whose name declares nothing.
	{
		id: "classify:precedence:unsuffixed-helper-in-dunder-folder-stays-dunder",
		detail: "packages/app/src/__tests__/_helpers.ts resolves to dunder-segment — the folder clause is not vestigial",
		run: () => {
			const record = classifyFile("packages/app/src/__tests__/_helpers.ts");
			return record.patternId === "dunder-segment" ? null : `got ${record.patternId}`;
		},
	},
	// A name-declared development file beside production code needs no folder at all.
	{
		id: "classify:precedence:stories-beside-production-component",
		detail: "packages/app/src/components/Card.stories.tsx resolves to stories-suffix with no dunder folder in sight",
		run: () => {
			const record = classifyFile("packages/app/src/components/Card.stories.tsx");
			if (record.patternId !== "stories-suffix") return `got ${record.patternId}`;
			// The component it sits beside stays production — the suffix classifies the file, not the folder.
			const sibling = classifyFile("packages/app/src/components/Card.tsx");
			return sibling.kind === "production" ? null : `sibling component classified ${sibling.kind}`;
		},
	},
	{
		id: "classify:precedence:dunder-beats-development-package",
		detail: "packages/eval/src/__tests__/x.ts resolves to dunder-segment, not development-package:eval",
		run: () => {
			const record = classifyFile("packages/eval/src/__tests__/x.ts");
			return record.patternId === "dunder-segment" ? null : `got ${record.patternId}`;
		},
	},
	{
		id: "classify:precedence:stories-beats-development-package",
		detail: "packages/eval/src/Foo.stories.tsx resolves to stories-suffix, not development-package:eval",
		run: () => {
			const record = classifyFile("packages/eval/src/Foo.stories.tsx");
			return record.patternId === "stories-suffix" ? null : `got ${record.patternId}`;
		},
	},
	{
		id: "classify:precedence:development-package-beats-test-runner-config",
		detail: "packages/eval/vitest.config.ts resolves to development-package:eval, not test-runner-config",
		run: () => {
			const record = classifyFile("packages/eval/vitest.config.ts");
			return record.patternId === "development-package:eval" ? null : `got ${record.patternId}`;
		},
	},
];

const detectionCase = (from: string): FixtureCase => ({
	id: `detect:${from}`,
	detail: `the crossing out of ${from} is caught`,
	run: () => {
		const census = buildFixtureCensus();
		const hit = noProductionImportsDevelopment.evaluate(census).some((f) => f.path === from);
		return hit ? null : `no finding reported for ${from} — this evasion is invisible to the detector`;
	},
});

const DETECTION_CASES: readonly FixtureCase[] = EXPECTED_CROSSINGS.map(detectionCase);

const NEGATIVE_CASES: readonly FixtureCase[] = [
	{
		id: "detect:no-false-positives",
		detail: "only the twelve seeded evasions are reported — nothing else",
		run: () => {
			const census = buildFixtureCensus();
			const reported = [...new Set(noProductionImportsDevelopment.evaluate(census).map((f) => f.path))].sort();
			const unexpected = reported.filter((p) => p !== undefined && !EXPECTED_CROSSINGS.includes(p));
			return unexpected.length === 0 ? null : `unexpected findings: ${unexpected.join(", ")}`;
		},
	},
	{
		id: "detect:development-may-import-development",
		detail: "a development file importing development code is legal",
		run: () => {
			const census = buildFixtureCensus();
			const bad = noProductionImportsDevelopment
				.evaluate(census)
				.filter((f) => f.path === "packages/app/src/__tests__/uses-dev.ts");
			return bad.length === 0 ? null : "flagged a development->development edge";
		},
	},
	{
		id: "detect:name-declared-dev-file-beside-production-may-import-development",
		detail: "a `.test.ts`/`.spec.ts` sitting beside production code imports development code legally",
		run: () => {
			const census = buildFixtureCensus();
			const reported = noProductionImportsDevelopment
				.evaluate(census)
				.filter((f) => f.path === "packages/app/src/Widget.test.ts" || f.path === "packages/app/src/Widget.spec.ts");
			return reported.length === 0 ? null : `flagged ${reported.map((f) => f.path).join(", ")}`;
		},
	},
	{
		id: "detect:development-may-import-production",
		detail: "a development file importing production code is legal",
		run: () => {
			const census = buildFixtureCensus();
			const bad = noProductionImportsDevelopment
				.evaluate(census)
				.filter((f) => f.path === "packages/eval/src/uses-production.ts");
			return bad.length === 0 ? null : "flagged a development->production edge";
		},
	},
];

const STRUCTURAL_CASES: readonly FixtureCase[] = [
	{
		id: "census:every-file-classifies",
		detail: "production + development equals the injected file count, with no residue",
		run: () => {
			const census = buildFixtureCensus();
			const findings = classificationTotal.evaluate(census);
			return findings.length === 0 ? null : findings.map((f) => f.message).join("; ");
		},
	},
	{
		id: "census:resolves-only-into-the-file-set",
		detail: "an unresolvable specifier produces no edge rather than a phantom one",
		run: () => {
			const census = buildFixtureCensus();
			const phantom = census.edges.filter((e) => !census.byPath.has(e.to));
			return phantom.length === 0 ? null : `edges resolved outside the file set: ${phantom.length}`;
		},
	},
	{
		id: "runner:dead-rule-throws",
		detail: "a rule whose live scope is below its floor throws DeadRuleError instead of passing",
		run: () => {
			const census = buildFixtureCensus();
			const dead: Rule = {
				id: "fixture-dead-rule",
				description: "scans a directory that does not exist — the au6/au9 failure mode",
				minScope: 1,
				scope: () => [],
				evaluate: () => [],
			};
			try {
				runRules([dead], census);
			} catch (error) {
				if (error instanceof DeadRuleError && error.ruleId === "fixture-dead-rule") return null;
				return `threw the wrong error: ${String(error)}`;
			}
			return "a rule matching zero files was allowed to pass — this is the defect that killed au6 and au9";
		},
	},
	{
		id: "runner:dead-rule-is-not-evaluated",
		detail: "a dead rule throws before its verdict can be collected",
		run: () => {
			const census = buildFixtureCensus();
			let evaluated = false;
			const dead: Rule = {
				id: "fixture-dead-rule-2",
				description: "dead",
				minScope: 5,
				scope: () => ["only-one"],
				evaluate: () => {
					evaluated = true;
					return [];
				},
			};
			try {
				runRules([dead], census);
			} catch {
				return evaluated ? "the dead rule was evaluated before the floor was checked" : null;
			}
			return "no throw";
		},
	},
	{
		id: "runner:empty-rule-set-throws",
		detail: "registering no rules at all is a build error",
		run: () => {
			const census = buildFixtureCensus();
			try {
				runRules([], census);
			} catch {
				return null;
			}
			return "an empty rule set was allowed to pass";
		},
	},
	{
		id: "runner:pattern-floor-breach-is-reported",
		detail: "pattern-live reports a pattern that has stopped matching",
		run: () => {
			// The fixture tree has no `packages/eslint-plugin-authz/**`, so that pattern's floor is breached.
			const census = buildFixtureCensus();
			const findings = patternLive.evaluate(census);
			const hit = findings.some((f) => f.message.includes("development-package:eslint-plugin-authz"));
			return hit ? null : "a pattern matching zero files was not reported";
		},
	},
];

export const FIXTURE_CASES: readonly FixtureCase[] = [
	...CLASSIFICATION_CASES,
	...DETECTION_CASES,
	...NEGATIVE_CASES,
	...STRUCTURAL_CASES,
];

export interface FixtureResult {
	readonly id: string;
	readonly detail: string;
	readonly failure: string | null;
}

export function runFixtureSelfTest(): FixtureResult[] {
	return FIXTURE_CASES.map((c) => {
		let failure: string | null;
		try {
			failure = c.run();
		} catch (error) {
			failure = `threw: ${String(error)}`;
		}
		return { id: c.id, detail: c.detail, failure };
	});
}
