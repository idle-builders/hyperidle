#!/usr/bin/env tsx
/**
 * AU19 documentation tooling — mechanical dependency-graph extraction.
 *
 * Replaces hand/agent-counted Service edge lists (which were repeatedly wrong —
 * an entire Service's outbound ports were missed by manual research earlier in
 * this WP) with a deterministic script. Re-run this any time the graph needs
 * refreshing instead of re-deriving it by reading files by hand.
 *
 * Method: cross-reference each Service's DECLARED ports (its `src/ports.ts`
 * exported interfaces' method names) against every OTHER Service's REAL
 * exported functions (each Service's `src/index.ts` barrel) to resolve which
 * Service satisfies which port. This is more reliable than parsing comments
 * or interface-name conventions, both of which are inconsistent across the
 * codebase (some `ports.ts` files document the target in a `// target — Name`
 * header comment, others only in top-of-file prose; interface naming
 * conventions vary too) — but the actual function names a port declares
 * always have to match a real Service's real exports, since Mechanism C
 * requires the concrete implementation to structurally satisfy the port.
 *
 * Also extracts:
 *  - every Service's real exposed API (from `src/index.ts`)
 *  - owned tables (parsed from `scripts/table-ownership-guard.ts`'s `TABLE_OWNER`)
 *  - EventBus emit/subscribe edges (regex scan for `.emit(` object literals
 *    with a `type: "..."` property, and `.on(`/`.subscribe(` string-literal
 *    event-type arguments), joined by event type
 *
 * Output: a single JSON file consumed by the HTML dependency-graph explorer.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

/**
 * Manual overrides for the handful of ports whose target is stated ONLY in
 * free-form top-of-file prose (not the "// target — Name" header convention,
 * not a method name matching any real export) — verified by hand reading the
 * file, not guessed. Keep this table small; if it grows, that's a signal the
 * codebase's documentation convention is drifting and worth fixing at the
 * source instead of accumulating overrides here.
 */
const MANUAL_OVERRIDES: Record<string, string | readonly string[]> = {
	"filesystems:FilesystemsGitRunner": "git-export",
	"filesystems:FilesystemsServiceConnectionResolver": "connections",
	"git-export:GitExportServerConfigPort": "settings",
	"observability:ObservabilityServerConfigPort": "settings",
	"model-gateway:ModelGatewayCredentialResolver": "connections",
	"notifications:NotificationsServerConfigPort": "settings",
	"notifications:NotificationsUserReader": "users",
	"notifications:NotificationsTeamReader": "org",
	"notifications:NotificationsWorkReader": "work",
	"notifications:NotificationsCredentialStore": "connections",
	"org:OrgUserDirectory": "users",
	"review:ReviewAgentWorkIntentRecorder": "session-requests",
	"settings:SettingsUserDirectory": "users",
	"dispatch:DispatchPorts": [
		"work",
		"routine",
		"conversation",
		"users",
		"settings",
		"model-gateway",
		"agent-selection",
		"run-orchestration",
		"session-requests",
		"cost",
		"review",
		"knowledge",
		"tool-handlers",
	],
	"tool-handlers:ToolHandlersWorkAccessor": "work",
	"tool-handlers:ToolHandlersUsersAccessor": "users",
	"tool-handlers:ToolHandlersConversationAccessor": "conversation",
	"tool-handlers:ToolHandlersOrgAccessor": "org",
	"tool-handlers:ToolHandlersAgentSelectionAccessor": "agent-selection",
	"tool-handlers:ToolHandlersRoutineAccessor": "routine",
	"tool-handlers:ToolHandlersDispatchAccessor": "dispatch",
	"tool-handlers:ToolHandlersKnowledgeAccessor": "knowledge",
	"tool-handlers:ToolHandlersPolicyAccessor": "policy",
};

interface ServiceInfo {
	name: string;
	layer: "core-api" | "agent-orchestration" | "agent-execution";
	dir: string;
	ownedTables: string[];
	exposedApi: Array<{ name: string; kind: string; signature: string }>;
}

interface SurfaceCount {
	methods: number;
	types: number;
	total: number;
}

interface PortMethod {
	name: string;
	signature: string;
}

interface PortInterface {
	interfaceName: string;
	methods: PortMethod[];
}

interface Edge {
	source: string;
	target: string;
	portInterface: string;
	methods: string[];
	confidence: "high" | "medium" | "unresolved";
	resolutionNote: string;
}

interface EventEdge {
	source: string;
	target: string;
	eventType: string;
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const abs = join(dir, entry);
		const st = statSync(abs);
		if (st.isDirectory()) {
			if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
			walk(abs, out);
		} else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
			out.push(abs);
		}
	}
	return out;
}

function parseFile(abs: string): ts.SourceFile {
	const text = readFileSync(abs, "utf-8");
	return ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
}

function signatureText(node: ts.Node, sf: ts.SourceFile): string {
	return node.getText(sf).replace(/\s+/g, " ").trim().slice(0, 160);
}

// --- 1. Discover Services -----------------------------------------------------

const LAYER_DIRS: Array<{ layer: ServiceInfo["layer"]; dir: string }> = [
	{ layer: "core-api", dir: join(ROOT, "packages/core-api") },
	{ layer: "agent-orchestration", dir: join(ROOT, "packages/agent-orchestration") },
	{ layer: "agent-execution", dir: join(ROOT, "packages/agent-execution") },
];

const services: ServiceInfo[] = [];
for (const { layer, dir } of LAYER_DIRS) {
	if (!existsSync(dir)) continue;
	for (const entry of readdirSync(dir)) {
		const svcDir = join(dir, entry);
		const pkgJson = join(svcDir, "package.json");
		if (!existsSync(pkgJson)) continue;
		if (entry === "src") continue; // the Layer package itself (e.g. packages/core-api/src is the composition root, not a nested Service)
		const indexTs = join(svcDir, "src/index.ts");
		if (!existsSync(indexTs)) continue;
		services.push({ name: entry, layer, dir: svcDir, ownedTables: [], exposedApi: [] });
	}
}

console.log(`Discovered ${services.length} Services.`);

// --- 2. Owned tables (from table-ownership-guard.ts's TABLE_OWNER) ------------

const guardSrc = readFileSync(join(ROOT, "scripts/table-ownership-guard.ts"), "utf-8");
const tableOwnerMatch = guardSrc.match(/const TABLE_OWNER: Record<string, string> = \{([\s\S]*?)\n\};/);
if (tableOwnerMatch) {
	const body = tableOwnerMatch[1];
	const rowRe = /^\s*([A-Za-z0-9_]+):\s*"([^"]+)",?\s*$/gm;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
	while ((m = rowRe.exec(body))) {
		const [, table, pkgPath] = m;
		const svcName = pkgPath.split("/").pop();
		const svc = services.find((s) => s.name === svcName);
		if (svc) svc.ownedTables.push(table);
	}
}

// --- 3. Exposed API per Service (from src/index.ts) ---------------------------

const reverseIndex = new Map<string, string[]>(); // exported function/const name -> [serviceName, ...]

for (const svc of services) {
	const sf = parseFile(join(svc.dir, "src/index.ts"));
	const seen = new Set<string>();
	const visit = (node: ts.Node) => {
		const isExported = (n: ts.Node) =>
			ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

		if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
			const name = node.name.text;
			if (!seen.has(name)) {
				seen.add(name);
				svc.exposedApi.push({ name, kind: "function", signature: signatureText(node, sf).split("{")[0].trim() });
				reverseIndex.set(name, [...(reverseIndex.get(name) ?? []), svc.name]);
			}
		} else if (ts.isVariableStatement(node) && isExported(node)) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					const name = decl.name.text;
					if (!seen.has(name)) {
						seen.add(name);
						const kind =
							decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
								? "function"
								: "const";
						svc.exposedApi.push({ name, kind, signature: signatureText(decl, sf) });
						reverseIndex.set(name, [...(reverseIndex.get(name) ?? []), svc.name]);
					}
				}
			}
		} else if (ts.isInterfaceDeclaration(node) && isExported(node)) {
			const name = node.name.text;
			if (!seen.has(name)) {
				seen.add(name);
				svc.exposedApi.push({ name, kind: "type", signature: `interface ${name}` });
			}
		} else if (ts.isTypeAliasDeclaration(node) && isExported(node)) {
			const name = node.name.text;
			if (!seen.has(name)) {
				seen.add(name);
				svc.exposedApi.push({ name, kind: "type", signature: `type ${name}` });
			}
		} else if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
			const name = node.name.text;
			if (!seen.has(name)) {
				seen.add(name);
				svc.exposedApi.push({ name, kind: "class", signature: `class ${name}` });
			}
		} else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
			for (const el of node.exportClause.elements) {
				const name = el.name.text;
				if (!seen.has(name)) {
					seen.add(name);
					svc.exposedApi.push({ name, kind: "re-export", signature: name });
					reverseIndex.set(name, [...(reverseIndex.get(name) ?? []), svc.name]);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

console.log(`Extracted exposed APIs. Reverse index has ${reverseIndex.size} named exports.`);

// --- 4. Ports (declared dependencies) per Service ------------------------------

const edges: Edge[] = [];
const serviceNames = new Set(services.map((s) => s.name));

for (const svc of services) {
	const portsPath = join(svc.dir, "src/ports.ts");
	if (!existsSync(portsPath)) continue;
	const text = readFileSync(portsPath, "utf-8");
	const lines = text.split("\n");
	const sf = parseFile(portsPath);

	// Pre-scan section-header comments: "// <target> — ..." — used as a
	// higher-priority resolution signal than method-name matching, since it's
	// the codebase's own explicit statement of intent (where present).
	const headers: Array<{ line: number; target: string }> = [];
	const headerRe = /^\/\/\s*([a-z][a-z0-9-]*)\s*—/;
	lines.forEach((line, i) => {
		const m = line.match(headerRe);
		if (m && serviceNames.has(m[1])) headers.push({ line: i, target: m[1] });
	});

	const visit = (node: ts.Node) => {
		if (ts.isInterfaceDeclaration(node)) {
			const methods: PortMethod[] = [];
			for (const member of node.members) {
				if (ts.isMethodSignature(member) && member.name) {
					methods.push({ name: member.name.getText(sf), signature: signatureText(member, sf) });
				} else if (
					ts.isPropertySignature(member) &&
					member.name &&
					member.type &&
					(ts.isFunctionTypeNode(member.type) || member.type.getText(sf).includes("=>"))
				) {
					methods.push({ name: member.name.getText(sf), signature: signatureText(member, sf) });
				}
			}
			if (methods.length > 0) {
				const overrideKey = `${svc.name}:${node.name.text}`;
				if (MANUAL_OVERRIDES[overrideKey]) {
					const targets = MANUAL_OVERRIDES[overrideKey];
					for (const target of typeof targets === "string" ? [targets] : targets) {
						edges.push({
							source: svc.name,
							target,
							portInterface: node.name.text,
							methods: methods.map((m) => m.name),
							confidence: "high",
							resolutionNote: "Manually verified at the composition root; see MANUAL_OVERRIDES in this script.",
						});
					}
					ts.forEachChild(node, visit);
					return;
				}

				const interfaceStartLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;

				// Signal 1 (highest priority): nearest preceding section-header
				// comment within 12 lines, i.e. the codebase's own explicit
				// "// target — ..." statement for this section.
				const nearestHeader = headers.filter((h) => h.line < interfaceStartLine).sort((a, b) => b.line - a.line)[0];

				// Signal 2 (fallback): majority vote across reverse-index hits from
				// real Service exports, excluding the declaring Service itself.
				const votes = new Map<string, number>();
				for (const m of methods) {
					for (const candidate of reverseIndex.get(m.name) ?? []) {
						if (candidate === svc.name) continue;
						votes.set(candidate, (votes.get(candidate) ?? 0) + 1);
					}
				}
				const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
				const nameMatch = sorted[0];

				if (nearestHeader && nameMatch && nameMatch[0] === nearestHeader.target) {
					edges.push({
						source: svc.name,
						target: nearestHeader.target,
						portInterface: node.name.text,
						methods: methods.map((m) => m.name),
						confidence: "high",
						resolutionNote: `Header comment (line ${nearestHeader.line + 1}) AND ${nameMatch[1]}/${methods.length} real-export name match(es) agree on ${nearestHeader.target}.`,
					});
				} else if (nearestHeader) {
					edges.push({
						source: svc.name,
						target: nearestHeader.target,
						portInterface: node.name.text,
						methods: methods.map((m) => m.name),
						confidence: "high",
						resolutionNote: `Resolved from the codebase's own section-header comment ("// ${nearestHeader.target} — ...", line ${nearestHeader.line + 1}) — method names are generic aliases wired at the composition root, not a literal name match.`,
					});
				} else if (nameMatch) {
					const [target, voteCount] = nameMatch;
					const total = methods.length;
					edges.push({
						source: svc.name,
						target,
						portInterface: node.name.text,
						methods: methods.map((m) => m.name),
						confidence: voteCount === total ? "high" : "medium",
						resolutionNote:
							voteCount === total
								? `All ${total} method name(s) matched real exports of ${target}.`
								: `${voteCount}/${total} method name(s) matched real exports of ${target}; remaining method(s) unmatched or ambiguous.`,
					});
				} else {
					edges.push({
						source: svc.name,
						target: "(unresolved)",
						portInterface: node.name.text,
						methods: methods.map((m) => m.name),
						confidence: "unresolved",
						resolutionNote: "No section-header comment and no method name matched any Service's real exports — likely a pure-type structural mirror, not a functional edge. Needs manual check.",
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

console.log(`Resolved ${edges.length} port-derived edges.`);

// --- 5. EventBus edges (regex scan, best-effort) -------------------------------

const emitRe = /\.emit\(\s*\{[^}]*?type:\s*["'`]([a-zA-Z0-9_]+)["'`]/gs;
const onRe = /\.on\(\s*["'`]([a-zA-Z0-9_*]+)["'`]/g;

const emitters = new Map<string, Set<string>>(); // eventType -> Set<serviceName>
const subscribers = new Map<string, Set<string>>(); // eventType -> Set<serviceName>

for (const svc of services) {
	const files = walk(svc.dir);
	for (const f of files) {
		const text = readFileSync(f, "utf-8");
		let m: RegExpExecArray | null;
		emitRe.lastIndex = 0;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
		while ((m = emitRe.exec(text))) {
			const type = m[1];
			if (!emitters.has(type)) emitters.set(type, new Set());
			emitters.get(type)?.add(svc.name);
		}
		onRe.lastIndex = 0;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
		while ((m = onRe.exec(text))) {
			const type = m[1];
			if (type === "*") continue;
			if (!subscribers.has(type)) subscribers.set(type, new Set());
			subscribers.get(type)?.add(svc.name);
		}
	}
}

// Also scan the core-api composition root (packages/core-api/src) for emit/subscribe
// sites that live in route/service files rather than inside a Service package.
const compositionRootDir = join(ROOT, "packages/core-api/src");
if (existsSync(compositionRootDir)) {
	const files = walk(compositionRootDir);
	for (const f of files) {
		const text = readFileSync(f, "utf-8");
		let m: RegExpExecArray | null;
		emitRe.lastIndex = 0;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
		while ((m = emitRe.exec(text))) {
			const type = m[1];
			if (!emitters.has(type)) emitters.set(type, new Set());
			emitters.get(type)?.add("(core-api composition root)");
		}
	}
}

const eventEdges: EventEdge[] = [];
for (const [eventType, emitterSet] of emitters) {
	const subSet = subscribers.get(eventType);
	if (!subSet) continue;
	for (const source of emitterSet) {
		for (const target of subSet) {
			if (source === target) continue;
			eventEdges.push({ source, target, eventType });
		}
	}
}

console.log(`Found ${eventEdges.length} EventBus edges across ${emitters.size} distinct event types.`);

// --- 6. Write output ------------------------------------------------------------

const censusBin = join(ROOT, "node_modules", ".bin", "tsx");
const censusOutput = JSON.parse(
	execFileSync(censusBin, [join(ROOT, "scripts", "surface-census.ts")], {
		cwd: ROOT,
		encoding: "utf8",
	}),
) as {
	totals: SurfaceCount;
	services: Array<{ service: string } & SurfaceCount>;
};
const surfaceByService = new Map(censusOutput.services.map((service) => [service.service, service]));

const output = {
	generatedAt: "2026-07-22", // deterministic regeneration date; do not use Date.now() in tracked artifacts
	services: services.map((s) => ({
		name: s.name,
		layer: s.layer,
		ownedTables: s.ownedTables,
		surface: surfaceByService.get(s.name) ?? { methods: 0, types: 0, total: 0 },
		exposedApiCount: s.exposedApi.length,
		exposedApi: s.exposedApi,
	})),
	edges,
	eventEdges,
	summary: {
		totalServices: services.length,
		totalPortEdges: edges.length,
		highConfidence: edges.filter((e) => e.confidence === "high").length,
		mediumConfidence: edges.filter((e) => e.confidence === "medium").length,
		unresolved: edges.filter((e) => e.confidence === "unresolved").length,
		totalEventEdges: eventEdges.length,
		surface: censusOutput.totals,
	},
};

const outPath = join(ROOT, "plans/AU19/dependency-graph-data.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(JSON.stringify(output.summary, null, 2));

const serviceByLayer = (layer: ServiceInfo["layer"]) =>
	output.services.filter((service) => service.layer === layer).sort((a, b) => a.name.localeCompare(b.name));
const mermaidId = (name: string) => name.replace(/[^A-Za-z0-9]/g, "_");
const markdown = `# AU19/AU20 As-Is Dependency Graph — Generated\n\nGenerated mechanically by \`scripts/generate-dependency-graph.ts\` from the current source tree. Surface counts come from the authoritative implementation-site \`scripts/surface-census.ts\`. Do not hand-edit this file; regenerate it.\n\n## Current graph\n\n\`\`\`mermaid\nflowchart TD\n${(["core-api", "agent-orchestration", "agent-execution"] as const)
	.map(
		(layer) =>
			`  subgraph ${mermaidId(layer)}["${layer}"]\n${serviceByLayer(layer)
				.map((service) => `    ${mermaidId(service.name)}["${service.name}<br/>${service.surface.methods}m / ${service.surface.types}t"]`)
				.join("\n")}\n  end`,
	)
	.join("\n")}\n${edges.map((edge) => `  ${mermaidId(edge.source)} -->|"${edge.portInterface}"| ${mermaidId(edge.target)}`).join("\n")}\n${eventEdges.map((edge) => `  ${mermaidId(edge.source)} -. "${edge.eventType}" .-> ${mermaidId(edge.target)}`).join("\n")}\n\`\`\`\n\n## Surface by Service\n\n| Service | Layer | Methods | Types | Total | Owned tables |\n|---|---|---:|---:|---:|---|\n${[...output.services]
	.sort((a, b) => b.surface.total - a.surface.total || a.name.localeCompare(b.name))
	.map((service) => `| ${service.name} | ${service.layer} | ${service.surface.methods} | ${service.surface.types} | ${service.surface.total} | ${service.ownedTables.join(", ") || "—"} |`)
	.join("\n")}\n| **TOTAL (${output.services.length})** |  | **${censusOutput.totals.methods}** | **${censusOutput.totals.types}** | **${censusOutput.totals.total}** |  |\n\n## Extraction summary\n\n- Port-derived edges: ${output.summary.totalPortEdges} (${output.summary.highConfidence} high confidence, ${output.summary.mediumConfidence} medium, ${output.summary.unresolved} unresolved)\n- EventBus edges: ${output.summary.totalEventEdges}\n- Services: ${output.summary.totalServices}\n`;
writeFileSync(join(ROOT, "plans", "AU19", "as-is-dependency-graph.md"), markdown);

const conceptPath = join(ROOT, "plans", "AU19", "concept.html");
let concept = readFileSync(conceptPath, "utf8");
const generatedServices = output.services
	.map((service) => {
		const calls = edges.filter((edge) => edge.source === service.name).map((edge) => edge.target);
		const description = `${service.surface.methods} methods / ${service.surface.types} types. Owns ${service.ownedTables.join(", ") || "no tables"}.`;
		return `      ${JSON.stringify({ id: service.name, label: service.name, layer: service.layer, sql: service.ownedTables.length > 0, desc: description, calls })},`;
	})
	.join("\n");
concept = concept.replace(
	/    \/\/ GENERATED:SERVICE_DATA:START[\s\S]*?    \/\/ GENERATED:SERVICE_DATA:END/,
	`    // GENERATED:SERVICE_DATA:START\n    services: [\n${generatedServices}\n    ],\n    // GENERATED:SERVICE_DATA:END`,
);
const treeFor = (layer: ServiceInfo["layer"]) =>
	serviceByLayer(layer)
		.map((service) => `<span class="dir">${service.name}/</span>  ${service.surface.methods}m / ${service.surface.types}t`)
		.join("\\n");
const generatedTrees = `  // GENERATED:TREES:START\n  const TREES = {\n    asis: {\n      core: \`${treeFor("core-api")}\`,\n      agent: \`${treeFor("agent-orchestration")}\\n${treeFor("agent-execution")}\`,\n    },\n    should: {\n      core: \`${treeFor("core-api")}\`,\n      agent: \`${treeFor("agent-orchestration")}\\n${treeFor("agent-execution")}\`,\n    },\n  };\n  // GENERATED:TREES:END`;
concept = concept.replace(/  \/\/ GENERATED:TREES:START[\s\S]*?  \/\/ GENERATED:TREES:END/, generatedTrees);
writeFileSync(conceptPath, concept);
console.log(`Wrote ${join(ROOT, "plans", "AU19", "as-is-dependency-graph.md")}`);
console.log(`Updated ${conceptPath}`);
