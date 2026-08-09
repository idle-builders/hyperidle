/**
 * Compute where each development file under framework/shared/src lands after the split.
 *
 * The placement rule: a development file lands in the package that owns its SUBJECT — the
 * destination supplying the most VALUE (non-type) bindings; ties broken by the destination of the
 * file's first import statement. Every other destination it reaches becomes an `@hyperidle/<dest>`
 * specifier.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const SRC = resolve("framework/shared/src");

// ── the destination map: module path relative to src → package ───────────────
const M: Record<string, string[]> = {
	"domain-model": [
		"types.ts", "knowledge.ts", "team.ts", "routine.ts", "notifications.ts", "connection.ts",
		"credential.ts", "configuration.ts", "hint.ts", "proposed-call.ts", "trigger.ts", "auth.ts",
		"api-types.ts", "errors.ts", "agent-roles.ts", "agent-profile.ts", "agent-behavior-config.ts",
		"agent-run-view.ts", "session-activity.ts", "session-request.ts", "task-transition.ts",
		"thread.ts", "mention.ts", "blocks/types.ts", "types/money.ts", "types/artifact.ts",
		"kinds/registry.ts", "kinds/old-kind-map.ts", "artifact-preview.ts", "model-gateway.ts",
		"events.ts", "agent-run-admission.ts",
	],
	"presentation-format": ["format/bet.ts", "format/time.ts", "initials.ts", "scope-labels.ts"],
	"harness-capability": ["harness/harness-capability-descriptor.ts", "harness/derive-primary-harness.ts"],
	"harness-protocol": [
		"harness/harness-adapter.ts", "harness/harness-events.ts", "harness/harness-event-normalization.ts",
		"harness/return-actions.ts", "harness/enforcement-registry.ts", "harness/worker-protocol.ts",
		"harness/harness-capability-read-model.ts", "harness-port.ts",
	],
	"tool-protocol": ["tool.ts", "builtin-tool-catalog.ts"],
	"work-intent-port": ["agent-work-intent-recorder.ts"],
	"filesystem-contract": ["filesystem.ts"],
	"conversation-parts": ["part.ts"],
	"block-derivation": ["blocks/block-id.ts", "blocks/derive-blocks.ts", "blocks/derive-payloads.ts", "blocks/normalise.ts"],
	"event-bus": ["event-bus.ts"],
	"http-middleware": [
		"http/access-boundary.ts", "http/body-limit.ts", "http/env.ts", "http/explicit-start-projection.ts",
		"http/rate-limit.ts", "http/timing-safe.ts", "http/validate.ts",
	],
	diagnostics: ["logger.ts", "redact.ts", "observability/events.ts", "observability/types.ts", "observability/console-adapter.ts"],
	"host-process": ["git/git-runner.ts", "net/ssrf.ts", "validate-env.ts", "profiles.ts"],
	"factory-defaults": ["system-prompt-templates.ts", "agent-scaffold.ts", "factory-roster.ts"],
	"credential-access": ["crypto/credential-encryption.ts"],
	cron: ["cron.ts"],
	"toon-codec": ["toon-codec.ts"],
	"query-escaping": ["like-escape.ts"],
};

const moduleDestination = new Map<string, string>();
for (const [pkg, modules] of Object.entries(M)) for (const m of modules) moduleDestination.set(m, pkg);
// The one development file other development files import — placed first, since it implements
// HarnessAdapter, so the files that take it can be placed against a known destination.
moduleDestination.set("harness/__testing__/mock-harness-adapter.ts", "harness-protocol");

/** Names that change package independently of their module (requirements §4.4). */
const SYMBOL_RELOCATIONS: Record<string, string> = {
	ReturnEnforcementChannel: "harness-capability",
	CredentialResolver: "credential-access",
	resolveModel: "credential-access",
	resolveProvider: "credential-access",
	resolveModelTier: "credential-access",
	UnsupportedAgentProviderError: "credential-access",
};

/**
 * The two files whose only import is a namespace import of a barrel spanning several destinations.
 * The subject function cannot decide them, so the decision is stated, with the reason.
 */
const OVERRIDES: Record<string, { readonly destination: string; readonly why: string }> = {
	"__tests__/blocks/browser-safe.test.ts": {
		destination: "block-derivation",
		why: "its subject is that deriving blocks pulls in no node: built-in — the parser and the hash are what could, and both are here",
	},
	"__tests__/o1-type-split.test.ts": {
		destination: "domain-model",
		why: "every name it asserts on the barrel is a domain-model name, so  becomes that package's own barrel and every assertion survives verbatim",
	},
};

const BARRELS = new Set(["index.ts", "blocks/index.ts", "crypto/index.ts", "harness/index.ts", "http/index.ts", "observability/index.ts"]);

const parse = (p: string): ts.SourceFile =>
	ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true, p.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Resolve a specifier written in `fromRel` to a module path relative to src, or null. */
const SUBPATH_BARREL: Record<string, string> = {
	"@hyperidle/shared": "index.ts",
	"@hyperidle/shared/crypto": "crypto/index.ts",
	"@hyperidle/shared/http": "http/index.ts",
	"@hyperidle/shared/observability": "observability/index.ts",
	"@hyperidle/shared/git": "git/git-runner.ts",
	"@hyperidle/shared/net": "net/ssrf.ts",
};

function resolveRel(fromRel: string, spec: string): string | null {
	if (SUBPATH_BARREL[spec] !== undefined) return SUBPATH_BARREL[spec];
	if (!spec.startsWith(".")) return null;
	const abs = resolve(dirname(join(SRC, fromRel)), spec.replace(/\.js$/, ".ts"));
	let rel = relative(SRC, abs);
	try {
		if (statSync(abs).isDirectory()) rel = join(rel, "index.ts");
	} catch {
		/* not a directory */
	}
	return rel;
}

// ── barrel symbol → declaring module, resolved transitively ──────────────────
const barrelSymbol = new Map<string, Map<string, string>>();
function indexBarrel(rel: string): Map<string, string> {
	const cached = barrelSymbol.get(rel);
	if (cached !== undefined) return cached;
	const out = new Map<string, string>();
	barrelSymbol.set(rel, out);
	const sf = parse(join(SRC, rel));
	for (const st of sf.statements) {
		if (!ts.isExportDeclaration(st) || st.moduleSpecifier === undefined) continue;
		if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
		const target = resolveRel(rel, st.moduleSpecifier.text);
		if (target === null) continue;
		const nested = BARRELS.has(target) ? indexBarrel(target) : null;
		const clause = st.exportClause;
		if (clause === undefined || !ts.isNamedExports(clause)) continue;
		for (const el of clause.elements) {
			const local = (el.propertyName ?? el.name).text;
			out.set(el.name.text, nested?.get(local) ?? target);
		}
	}
	return out;
}

const destinationOf = (moduleRel: string, symbol: string): string | undefined =>
	SYMBOL_RELOCATIONS[symbol] ?? moduleDestination.get(moduleRel);

// ── walk the development files ───────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|tsx)$/.test(e.name)) out.push(relative(SRC, p));
	}
	return out;
}
const isDevelopment = (rel: string): boolean => rel.split("/").some((seg) => seg.startsWith("__"));
const devFiles = walk(SRC).filter(isDevelopment).sort();

interface Binding {
	readonly name: string;
	readonly typeOnly: boolean;
}

/** Every import statement in a development file, with its bindings. */
function importsOf(rel: string): { spec: string; bindings: Binding[]; namespace: boolean }[] {
	const sf = parse(join(SRC, rel));
	const out: { spec: string; bindings: Binding[]; namespace: boolean }[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const clause = node.importClause;
			const statementTypeOnly = clause?.isTypeOnly === true;
			const bindings: Binding[] = [];
			let namespace = false;
			if (clause?.name !== undefined) bindings.push({ name: "default", typeOnly: statementTypeOnly });
			const nb = clause?.namedBindings;
			if (nb !== undefined && ts.isNamespaceImport(nb)) namespace = true;
			if (nb !== undefined && ts.isNamedImports(nb)) {
				for (const el of nb.elements) {
					bindings.push({ name: (el.propertyName ?? el.name).text, typeOnly: statementTypeOnly || el.isTypeOnly });
				}
			}
			out.push({ spec: node.moduleSpecifier.text, bindings, namespace });
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] !== undefined &&
			ts.isStringLiteral(node.arguments[0])
		) {
			out.push({ spec: (node.arguments[0] as ts.StringLiteral).text, bindings: [], namespace: true });
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

const rows: {
	file: string;
	subject: string;
	value: Record<string, number>;
	all: string[];
	unresolved: string[];
	why?: string;
}[] = [];

for (const file of devFiles) {
	const valueCounts = new Map<string, number>();
	const reached = new Set<string>();
	const unresolved: string[] = [];
	let firstDestination: string | undefined;

	for (const imp of importsOf(file)) {
		const target = resolveRel(file, imp.spec);
		if (target === null) continue; // an external or workspace specifier: not a destination of ours
		const viaBarrel = BARRELS.has(target) ? indexBarrel(target) : null;
		const perDestValue = new Map<string, number>();
		const bind = (dest: string | undefined, name: string, typeOnly: boolean): void => {
			if (dest === undefined) {
				unresolved.push(`${imp.spec} :: ${name}`);
				return;
			}
			reached.add(dest);
			if (!typeOnly) perDestValue.set(dest, (perDestValue.get(dest) ?? 0) + 1);
			firstDestination ??= dest;
		};
		if (imp.bindings.length === 0 || imp.namespace) {
			if (viaBarrel !== null) {
				// A namespace or side-effect import of a dissolving barrel names no symbol, so it is
				// resolved by what the barrel publishes: when every publication lands in one
				// destination the barrel IS that destination; when it spans several it decides nothing.
				const dests = new Set([...viaBarrel.values()].map((m) => moduleDestination.get(m) ?? m));
				for (const d of dests) reached.add(d);
				if (dests.size === 1) bind([...dests][0], "<barrel>", false);
				else unresolved.push(`${imp.spec} :: <namespace of a barrel spanning ${dests.size} destinations>`);
			} else bind(destinationOf(target, ""), "<module>", false);
			continue;
		}
		for (const b of imp.bindings) {
			const declaring = viaBarrel?.get(b.name) ?? target;
			bind(destinationOf(declaring, b.name), b.name, b.typeOnly);
		}
		for (const [dest, n] of perDestValue) valueCounts.set(dest, (valueCounts.get(dest) ?? 0) + n);
	}

	const ranked = [...valueCounts].sort((a, b) => b[1] - a[1]);
	const top = ranked[0];
	const tied = top !== undefined && ranked.filter(([, n]) => n === top[1]).length > 1;
	const override = OVERRIDES[file];
	const computed = top === undefined ? (firstDestination ?? "UNDECIDED") : tied ? (firstDestination ?? top[0]) : top[0];
	const subject = override?.destination ?? computed;
	if (override !== undefined && computed !== "UNDECIDED") {
		throw new Error();
	}
	rows.push({
		file,
		subject,
		value: Object.fromEntries(ranked),
		all: [...reached].sort(),
		unresolved,
		why: OVERRIDES[file]?.why,
	});
}

const byPackage = new Map<string, string[]>();
for (const r of rows) (byPackage.get(r.subject) ?? byPackage.set(r.subject, []).get(r.subject) ?? []).push(r.file);

console.log(JSON.stringify({ count: rows.length, rows }, null, "\t"));
