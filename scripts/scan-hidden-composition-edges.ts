/**
 * Hidden composition-bundle edge detector (AU21).
 *
 * WHY: `generate-dependency-graph.ts` resolves cross-Service edges by scanning
 * each Service's own `src/ports.ts`. That misses a whole class of real runtime
 * edges: a Service exposes a "Deps"-shaped interface DEFINED in its own package
 * but COMPOSED outside it — in core-api's composition root
 * (`packages/core-api/src/services/*.ts` and `src/server-factory.ts`) — where
 * core-api Service functions are wired into that interface. The consuming
 * Service (e.g. `session-requests`, `cost`) then reads/writes core-api domain
 * state at runtime, but no `ports.ts` declares it, so the mechanical graph shows
 * ZERO outbound edges for it. AU21 §3 / Decision D.
 *
 * MECHANISM (generalized, NOT hardcoded to any Service name):
 *   For each composition-root file, find every **type** imported from an
 *   agent-orchestration package (the consumer's dependency bundle), then
 *   attribute an edge from that consumer Service to every **core-api** Service
 *   whose value/namespace imports are wired into the bundle object annotated
 *   with (or returned as) that type. Cross-layer (`agent-orchestration ->
 *   core-api`) attributions are the hidden edges.
 *
 * Emits JSON to stdout: { hiddenEdges: [{ consumer, consumerLayer, provider,
 * providerLayer, methods, viaType, file }] } plus a human summary on stderr.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

type Layer = "core-api" | "agent-orchestration" | "agent-execution";
const LAYER_DIRS: ReadonlyArray<{ layer: Layer; dir: string }> = [
	{ layer: "core-api", dir: "packages/core-api" },
	{ layer: "agent-orchestration", dir: "packages/agent-orchestration" },
	{ layer: "agent-execution", dir: "packages/agent-execution" },
];

// --- map `@hyperidle/<pkg>` import specifier -> { service, layer } -----------
const pkgToService = new Map<string, { name: string; layer: Layer }>();
for (const { layer, dir } of LAYER_DIRS) {
	const abs = join(ROOT, dir);
	if (!existsSync(abs)) continue;
	for (const entry of readdirSync(abs, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === "src" || entry.name === "node_modules") continue;
		const pj = join(abs, entry.name, "package.json");
		if (!existsSync(pj)) continue;
		const name = JSON.parse(readFileSync(pj, "utf-8")).name as string;
		pkgToService.set(name, { name: entry.name, layer });
	}
}

// --- composition-root files to scan -----------------------------------------
const compositionFiles: string[] = [];
const servicesDir = join(ROOT, "packages/core-api/src/services");
if (existsSync(servicesDir)) {
	for (const f of readdirSync(servicesDir)) {
		if (f.endsWith(".ts") && !f.endsWith(".test.ts")) compositionFiles.push(join(servicesDir, f));
	}
}
// NOTE: `server-factory.ts` / `app.ts` are the top-level APPLICATION composition
// root — cross-layer wiring there is the legitimate DI seam (HarnessPort, routes,
// EventBus, the whole assembly), not a hidden Service-to-Service edge. They are
// deliberately excluded; the hidden-edge pathology is a per-Service "Deps" bundle
// built inside `services/*.ts`.

interface Binding {
	readonly local: string;
	readonly imported: string; // the exported name (namespace: "*")
	readonly service: string;
	readonly layer: Layer;
	readonly isType: boolean;
	readonly isNamespace: boolean;
}

interface HiddenEdge {
	consumer: string;
	consumerLayer: Layer;
	provider: string;
	providerLayer: Layer;
	methods: string[];
	viaType: string;
	file: string;
}

const edges: HiddenEdge[] = [];

for (const file of compositionFiles) {
	const text = readFileSync(file, "utf-8");
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const rel = relative(ROOT, file);

	// 1. Collect import bindings from @hyperidle/<service> packages.
	const bindings = new Map<string, Binding>();
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const svc = pkgToService.get(stmt.moduleSpecifier.text);
		if (!svc) continue;
		const clause = stmt.importClause;
		if (!clause) continue;
		const clauseIsType = clause.isTypeOnly;
		const nb = clause.namedBindings;
		if (nb && ts.isNamespaceImport(nb)) {
			bindings.set(nb.name.text, {
				local: nb.name.text,
				imported: "*",
				service: svc.name,
				layer: svc.layer,
				isType: clauseIsType,
				isNamespace: true,
			});
		} else if (nb && ts.isNamedImports(nb)) {
			for (const el of nb.elements) {
				bindings.set(el.name.text, {
					local: el.name.text,
					imported: (el.propertyName ?? el.name).text,
					service: svc.name,
					layer: svc.layer,
					isType: clauseIsType || el.isTypeOnly,
					isNamespace: false,
				});
			}
		}
		if (clause.name) {
			bindings.set(clause.name.text, {
				local: clause.name.text,
				imported: "default",
				service: svc.name,
				layer: svc.layer,
				isType: clauseIsType,
				isNamespace: false,
			});
		}
	}

	// 2. Consumer bundle types = TYPE imports from agent-orchestration/agent-execution packages.
	const consumerTypes = [...bindings.values()].filter(
		(b) => b.isType && (b.layer === "agent-orchestration" || b.layer === "agent-execution"),
	);
	if (consumerTypes.length === 0) continue;

	// 3. Provider bindings = value/namespace imports from a DIFFERENT layer than the consumer.
	//    (We attribute per-consumer; cross-layer only.)
	const valueBindings = [...bindings.values()].filter((b) => !b.isType);

	// 4. For each consumer type, find the node(s) annotated/returning it, and
	//    collect provider usages within that node's subtree. Fall back to
	//    file-scope when the type has no locatable annotation (rare).
	for (const consumer of consumerTypes) {
		const scopes = findTypeAnnotatedScopes(sf, consumer.local);
		const searchRoots: ts.Node[] = scopes.length > 0 ? scopes : [sf];
		// Collect provider method-usage: providerService -> Set<method>
		const used = new Map<string, Set<string>>();
		const record = (svcName: string, method: string) => {
			let s = used.get(svcName);
			if (!s) {
				s = new Set();
				used.set(svcName, s);
			}
			s.add(method);
		};
		for (const rootNode of searchRoots) {
			collectUsages(rootNode, sf, bindings, valueBindings, record);
			// Also follow spreads of module-level const objects (e.g. `{ db, ...ports }`).
			for (const spreadName of collectSpreadIdentifiers(rootNode)) {
				const decl = findConstObject(sf, spreadName);
				if (decl) collectUsages(decl, sf, bindings, valueBindings, record);
			}
		}
		for (const [providerSvc, methods] of used) {
			const provLayer = layerOf(providerSvc);
			if (provLayer === consumer.layer) continue; // same-layer wiring is not a cross-layer edge
			edges.push({
				consumer: consumer.service,
				consumerLayer: consumer.layer,
				provider: providerSvc,
				providerLayer: provLayer ?? ("?" as Layer),
				methods: [...methods].sort(),
				viaType: consumer.local,
				file: rel,
			});
		}
	}
}

function layerOf(service: string): Layer | undefined {
	for (const { name, layer } of pkgToService.values()) if (name === service) return layer;
	return undefined;
}

/** Find function/variable declarations whose declared type or return type text references `typeName`. */
function findTypeAnnotatedScopes(sf: ts.SourceFile, typeName: string): ts.Node[] {
	const out: ts.Node[] = [];
	const re = new RegExp(`\\b${typeName}\\b`);
	const visit = (node: ts.Node) => {
		if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
			if (node.type && re.test(node.type.getText(sf))) out.push(node);
		}
		if (ts.isVariableDeclaration(node) && node.type && re.test(node.type.getText(sf))) {
			out.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

/** Collect provider usages: bare value identifiers, and `namespace.member` accesses. */
function collectUsages(
	root: ts.Node,
	sf: ts.SourceFile,
	bindings: Map<string, Binding>,
	valueBindings: Binding[],
	record: (svc: string, method: string) => void,
): void {
	const valueLocals = new Set(valueBindings.map((b) => b.local));
	const visit = (node: ts.Node) => {
		// namespace.member  ->  provider = namespace's service, method = member
		if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
			const b = bindings.get(node.expression.text);
			if (b?.isNamespace) record(b.service, node.name.text);
		}
		// bare value identifier used as a call/reference
		if (ts.isIdentifier(node) && valueLocals.has(node.text)) {
			// skip the import declaration site itself
			const b = bindings.get(node.text);
			if (b && !b.isNamespace && !isImportSite(node)) {
				record(b.service, b.imported === "default" ? node.text : b.imported);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
}

function isImportSite(node: ts.Node): boolean {
	let p: ts.Node | undefined = node.parent;
	while (p) {
		if (ts.isImportDeclaration(p)) return true;
		p = p.parent;
	}
	return false;
}

/** Identifiers spread with `...x` inside object literals under root. */
function collectSpreadIdentifiers(root: ts.Node): string[] {
	const out: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isSpreadAssignment(node) && ts.isIdentifier(node.expression)) out.push(node.expression.text);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return out;
}

/** Find a module-level `const <name> = { ... }` object literal declaration. */
function findConstObject(sf: ts.SourceFile, name: string): ts.Node | undefined {
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
				return decl.initializer;
			}
		}
	}
	return undefined;
}

// --- dedupe (consumer, provider, viaType) merging methods --------------------
const merged = new Map<string, HiddenEdge>();
for (const e of edges) {
	const key = `${e.consumer}::${e.provider}::${e.viaType}::${e.file}`;
	const ex = merged.get(key);
	if (ex) ex.methods = [...new Set([...ex.methods, ...e.methods])].sort();
	else merged.set(key, { ...e });
}
const result = [...merged.values()].sort(
	(a, b) => a.consumer.localeCompare(b.consumer) || a.provider.localeCompare(b.provider),
);

const crossToCore = result.filter(
	(e) => e.consumerLayer === "agent-orchestration" && e.providerLayer === "core-api",
);

process.stderr.write(
	`Scanned ${compositionFiles.length} composition-root files.\n` +
		`Found ${result.length} hidden cross-layer composition edges; ` +
		`${crossToCore.length} are agent-orchestration -> core-api.\n\n`,
);
for (const e of crossToCore) {
	process.stderr.write(
		`  ${e.consumer} -> ${e.provider}  [via ${e.viaType} @ ${e.file}]\n    methods: ${e.methods.join(", ")}\n`,
	);
}

process.stdout.write(`${JSON.stringify({ hiddenEdges: result, agentOrchToCoreApi: crossToCore }, null, 2)}\n`);
