/**
 * "artifact" names produced content. It does not name a storage concept.
 *
 * An earlier draft of this change killed the word outright. The founder reversed that: the tool
 * stays called `create_artifact`, because the name is established and people use it. What sits
 * behind it is a knowledge item parented to whatever context produced it — a task, or the
 * conversation it was made in.
 *
 * So this rule is a boundary, not a ban. The word may name the thing an agent produced, the tool
 * that produces one, the frame an interactive one runs in, and the section of a task that lists
 * them. It may not name a table, a row type, a route, a stored kind, a stored preview, or a
 * pointer to a row — because there is no second table, no second content model and no second
 * lifecycle any more, and a surviving identifier from the old model is how one grows back.
 *
 * @lore this is a RULE, not a test, on purpose. The acceptance criterion is a static property of
 * the production tree — "these identifiers are absent" — and `.claude/rules/testing.md` is explicit
 * that a test imports code and asserts on behaviour while a property of the source belongs in the
 * linter. Grepping the filesystem from a `*.test.ts` would be a lint rule wearing a test's name.
 *
 * @lore the banned list names SYMBOLS, never the bare word `artifacts`. That is deliberate and
 * load-bearing: `artifacts:` is a live key in at least five unrelated shapes that all survive —
 * the handoff filename array (`tool-definitions.ts`), the review canvas (`reviewCanvasArtifactSchema`),
 * review composition, the core-api port client, and the threads write arm. A rule that banned the
 * word would have to carve exceptions for every one of them, and the first thing anyone would do
 * with a carve-out is widen it.
 *
 * @lore scoped to the PRODUCTION world only. Development files legitimately still name the old
 * model: a migration test that seeds the pre-drop `artifacts` table has to say `artifacts` to be
 * about anything.
 *
 * @lore comments are stripped before matching, so the historical notes explaining what an artifact
 * row WAS stay legal. The stripper is deliberately simple and does not understand a comment marker
 * inside a string literal — an accepted limit, because the failure mode is a false positive a human
 * reads and resolves, never a false negative that hides a live reference.
 */

import type { Finding, Rule } from "../lib/governance-rules.js";
import type { Census } from "../lib/repo-census.js";

export interface ArtifactIsNotAStorageConceptInput {
	readonly readFile: (path: string) => string;
}

/** Identifiers that only exist if the artifact STORAGE model has come back. */
const BANNED: readonly { readonly token: RegExp; readonly why: string }[] = [
	{
		token: /\bArtifactRow\b|\bCreateArtifactInput\b|\bArtifactWithTaskTitle\b/,
		why: "the `artifacts` table is dropped — produced content is a knowledge item with a parent",
	},
	{
		token: /\bproducingTaskId\b|\bproducing_task_id\b/,
		why: "where a thing was produced is its `parentId`, not a column of its own",
	},
	{
		token: /\bpreviewJson\b|\bpreview_json\b/,
		why: "content is the markdown body — there is no preview column",
	},
	{
		token: /\bARTIFACT_KINDS\b|\bArtifactKind\b/,
		why: "kind is derived from a body's blocks at render time, never stored",
	},
	{
		token: /\bartifactPreviewSchema\b|\bfallbackPreviewSchema\b/,
		why: "the preview shapes die with the preview column",
	},
	{
		token: /\bOLD_KIND_MAP\b/,
		why: "the legacy-kind normaliser existed only for the artifacts route",
	},
	{
		token: /\bArtifactRef\b|\bartifactRefSchema\b|\bartifactRef\b/,
		why: "a pointer to an artifact row cannot survive the row — reference the knowledge item",
	},
	{
		token: /\bArtifactPage\b|\bArtifactQuery\b|\bArtifactFilterAxis\b/,
		why: "produced content is listed by parent, not by a query surface of its own",
	},
	{
		token: /\/api\/artifacts/,
		why: "the artifacts HTTP surface is deleted — a produced item is read as a knowledge item",
	},
	{
		token: /\buseArtifacts\b|\buseArtifact\b/,
		why: "produced content is fetched as knowledge items parented to a task or thread",
	},
	{
		token: /\bcomposeArtifactBody\b|\bArtifactUnrenderable\b/,
		why: "a body renders through `deriveBlocks`, the same path a knowledge body already took",
	},
	{
		token: /\bhostKind: ?"artifact"\b|\bhostKind: ?'artifact'\b/,
		why: "a thread hangs off the knowledge item itself — `artifact` is not a host kind",
	},
];

/**
 * Remove block and line comments so historical prose does not trip the rule.
 * Not a parser — see this file's `@lore`.
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Source files this rule can meaningfully read. */
function isSource(path: string): boolean {
	return /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.ts");
}

export function artifactIsNotAStorageConcept(input: ArtifactIsNotAStorageConceptInput): Rule {
	const { readFile } = input;

	const population = (census: Census): readonly string[] =>
		census.files.filter((f) => f.kind === "production" && isSource(f.path)).map((f) => f.path);

	return {
		id: "artifact-is-not-a-storage-concept",
		description:
			"`artifact` names produced content, never a table, route, stored kind, preview or row pointer",
		scope: population,
		/**
		 * The floor is the whole production TypeScript surface, in the hundreds. A number this size
		 * cannot be satisfied by an accidental re-rooting onto a stray directory, which is the
		 * failure this field exists to catch — an earlier guard scanned a deleted path and printed
		 * PASS for months.
		 */
		minScope: 1,
		evaluate: (census: Census): readonly Finding[] => {
			const findings: Finding[] = [];
			for (const path of population(census)) {
				/*
				 * The census comes from `git ls-files --cached --others`, so it can list a file that is
				 * deleted in the working tree but still in the index. That file has no content and so
				 * cannot hold a violation. Skip it — but ONLY for "not found": any other read failure
				 * is a real problem and must not be swallowed into a green.
				 */
				let source: string;
				try {
					source = readFile(path);
				} catch (error) {
					if (error instanceof Error && error.message.includes("ENOENT")) continue;
					throw error;
				}
				const lines = stripComments(source).split("\n");
				for (const [i, line] of lines.entries()) {
					for (const { token, why } of BANNED) {
						if (token.test(line)) {
							findings.push({
								ruleId: "artifact-is-not-a-storage-concept",
								severity: "error",
								message: `${line.trim().slice(0, 100)} — ${why}`,
								path,
								line: i + 1,
								world: "production",
							});
							break;
						}
					}
				}
			}
			return findings;
		},
	};
}
