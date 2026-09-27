/**
 * design/no-repo-introspection-in-test
 *
 * A test proves a rule the code decides — not "does the repo look a certain
 * way" (testing.md § Never a test: "Reading source, the filesystem, or config
 * — that's a lint rule or a build check, not a test"). This bans
 * `readFileSync`/`readdirSync`/`existsSync`/`statSync` reading a path
 * relative to THIS repo checkout — a literal repo-config name, a literal
 * path into a shipping root, or (however deep inside `resolve()`/`join()`)
 * a path built from `import.meta.dirname`/`__dirname`/`process.cwd()` — and
 * `execSync`/`execFileSync`/`spawnSync` invoking a source-scanning command
 * (`grep`, `find`, `tsc`, `eslint`, `biome`).
 *
 * Deliberately narrow the other way: a path built from a sandbox/tmp
 * variable (`fs.existsSync(path.join(tmpDir, "server.log"))`, the shape
 * every real filesystem-behavior test uses) never resolves relative to this
 * checkout and is invisible to this rule on purpose — testing a production
 * feature that touches disk is not "reading source as a test", and a rule
 * that could not tell the two apart would need a blanket exemption list
 * this repo's rules refuse to carry.
 */

import type { Rule } from "eslint";
import { createConstIdentifierResolver, createRule, type IdentifierResolver } from "../util.js";

const FS_READ_FNS = new Set(["readFileSync", "readdirSync", "existsSync", "statSync"]);
const EXEC_FNS = new Set(["execSync", "execFileSync", "spawnSync"]);

const REPO_CONFIG_NAMES = [
	"package.json",
	"tsconfig",
	"biome.json",
	".eslintrc",
	"eslint.config",
	".prettierrc",
	"Dockerfile",
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
const PATH_BUILDER_FNS = new Set(["resolve", "join", "normalize"]);

type AnyNode = { type: string; [k: string]: unknown };

function isRepoIntrospectionLiteral(text: string): boolean {
	if (REPO_CONFIG_NAMES.some((name) => text.includes(name))) return true;
	return REPO_ROOTS.some((root) => text.startsWith(root));
}

/**
 * Walks an argument expression — through `resolve()`/`join()`/`normalize()`
 * calls only — looking for a reference to this checkout's own location:
 * `import.meta.dirname`, `__dirname`, or `process.cwd()`. This is an anchor
 * search only (never a bare literal match) — a literal segment nested inside
 * a `join()`/`resolve()` call says nothing on its own (`path.join(sandboxPath,
 * ".claude/skills")` builds a path under a sandbox this test manufactured,
 * not this repo's `.claude/`, even though the literal spells the same root).
 * Never descends into an arbitrary Identifier or a call that isn't a
 * path-joining helper — a sandbox variable (`tmpDir`, `sandboxPath`) or
 * `os.tmpdir()` stays invisible, on purpose.
 */
function referencesRepoCheckoutAnchor(
	node: unknown,
	resolveIdentifier: IdentifierResolver,
	seen: Set<unknown> = new Set(),
): boolean {
	if (!node || typeof node !== "object") return false;
	const n = node as AnyNode;
	switch (n.type) {
		case "MemberExpression": {
			const object = n.object as AnyNode | undefined;
			if (object?.type === "MetaProperty") return true; // import.meta.dirname
			return referencesRepoCheckoutAnchor(object, resolveIdentifier, seen);
		}
		case "Identifier": {
			if (n.name === "__dirname") return true;
			// Follow a same-file `const NAME = resolve(...)` binding one hop —
			// the exact shape `const repoRoot = resolve(import.meta.dirname, "..");`
			// followed later by `readFileSync(resolve(repoRoot, "file"))` needs.
			if (seen.has(node)) return false;
			seen.add(node);
			const resolved = resolveIdentifier(node);
			return resolved ? referencesRepoCheckoutAnchor(resolved, resolveIdentifier, seen) : false;
		}
		case "CallExpression": {
			const callee = n.callee as AnyNode | undefined;
			// process.cwd()
			if (
				callee?.type === "MemberExpression" &&
				(callee.object as { name?: string } | undefined)?.name === "process" &&
				(callee.property as { name?: string } | undefined)?.name === "cwd"
			) {
				return true;
			}
			const name: string | undefined =
				callee?.type === "Identifier"
					? (callee.name as string | undefined)
					: callee?.type === "MemberExpression"
						? (callee.property as { name?: string } | undefined)?.name
						: undefined;
			if (!(name && PATH_BUILDER_FNS.has(name))) return false;
			const args = n.arguments as unknown[];
			return args.some((a) => referencesRepoCheckoutAnchor(a, resolveIdentifier, seen));
		}
		default:
			return false;
	}
}

/**
 * True when the argument is EITHER a direct string literal naming a repo
 * config file / shipping root (the simple case — `readFileSync("package.json")`),
 * OR a `resolve()`/`join()`/`normalize()` chain anchored on this checkout's
 * own location.
 */
function referencesRepoCheckout(node: unknown, resolveIdentifier: IdentifierResolver): boolean {
	if (!node || typeof node !== "object") return false;
	const n = node as AnyNode;
	if (n.type === "Literal" && typeof n.value === "string") {
		return isRepoIntrospectionLiteral(n.value);
	}
	return referencesRepoCheckoutAnchor(n, resolveIdentifier);
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
				"'{{name}}(...)' reads this repo's own checkout (source/config) as a test. That is a lint rule or a build check (testing.md § Never a test), not a test.",
			exec: "'{{name}}' shells out to a source-scanning command as a test. That is a lint rule or a build check (testing.md § Never a test), not a test.",
		},
	},
	create(context) {
		const resolveIdentifier = createConstIdentifierResolver(context);
		return {
			CallExpression(node) {
				const name = calleeName(node);
				if (!name) return;
				if (FS_READ_FNS.has(name)) {
					const arg = node.arguments[0];
					if (arg && referencesRepoCheckout(arg, resolveIdentifier)) {
						context.report({ node, messageId: "fsRead", data: { name } });
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
