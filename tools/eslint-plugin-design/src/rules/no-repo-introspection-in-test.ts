/**
 * design/no-repo-introspection-in-test
 *
 * A test proves a rule the code decides — not "does the repo look a certain
 * way" (testing.md § Never a test: "Reading source, the filesystem, or config
 * — that's a lint rule or a build check, not a test"). This bans the shape
 * that pattern actually takes: `readFileSync`/`readdirSync`/`existsSync`/
 * `statSync` called on a literal repo-config name or a literal path into a
 * shipping root, and `execSync`/`execFileSync` invoking a source-scanning
 * command (`grep`, `find`, `tsc`, `eslint`, `biome`).
 *
 * Deliberately narrow: only a STRING-LITERAL argument trips it. A path built
 * from a sandbox/tmp variable (`fs.existsSync(path.join(tmpDir, "server.log"))`,
 * the shape every real filesystem-behavior integration test uses) is a
 * CallExpression/Identifier argument, not a Literal, and is invisible to this
 * rule on purpose — testing a production feature that touches disk is not
 * "reading source as a test", and a rule that could not tell the two apart
 * would need a blanket exemption list this repo's rules refuse to carry.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const FS_READ_FNS = new Set(["readFileSync", "readdirSync", "existsSync", "statSync"]);
const EXEC_FNS = new Set(["execSync", "execFileSync", "spawnSync"]);

const REPO_CONFIG_NAMES = [
	"package.json",
	"tsconfig",
	"biome.json",
	".eslintrc",
	"eslint.config",
	".prettierrc",
];
const REPO_ROOTS = [
	"layers/",
	"framework/",
	"applications/",
	"tools/",
	"docs/",
	".pipeline/",
	".claude/",
];
const SCAN_COMMANDS = /\b(grep|find|tsc|eslint|biome)\b/;

function isRepoIntrospectionPath(text: string): boolean {
	if (REPO_CONFIG_NAMES.some((name) => text.includes(name))) return true;
	return REPO_ROOTS.some((root) => text.startsWith(root));
}

function calleeName(node: { callee: unknown }): string | null {
	const callee = node.callee as { type: string; name?: string; property?: { name?: string } };
	if (callee.type === "Identifier") return callee.name ?? null;
	if (callee.type === "MemberExpression" && callee.property?.name) return callee.property.name;
	return null;
}

function literalStringArg(args: unknown[]): string | null {
	const first = args[0] as { type?: string; value?: unknown } | undefined;
	if (first?.type === "Literal" && typeof first.value === "string") return first.value;
	return null;
}

export const noRepoIntrospectionInTest: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid reading the repo's own source/config, or shelling out to a scan command, as a stand-in for a test.",
		},
		schema: [],
		messages: {
			fsRead:
				"'{{name}}(\"{{arg}}\")' reads the repo's own source/config as a test. That is a lint rule or a build check (testing.md § Never a test), not a test.",
			exec: "'{{name}}' shells out to a source-scanning command as a test. That is a lint rule or a build check (testing.md § Never a test), not a test.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const name = calleeName(node);
				if (!name) return;
				if (FS_READ_FNS.has(name)) {
					const arg = literalStringArg(node.arguments);
					if (arg !== null && isRepoIntrospectionPath(arg)) {
						context.report({ node, messageId: "fsRead", data: { name, arg } });
					}
					return;
				}
				if (EXEC_FNS.has(name)) {
					const arg = literalStringArg(node.arguments);
					if (arg !== null && SCAN_COMMANDS.test(arg)) {
						context.report({ node, messageId: "exec", data: { name } });
					}
				}
			},
		};
	},
});
