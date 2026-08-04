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
 *  - **AU21 fold**: the hidden composition-bundle pattern (`scripts/scan-hidden-
 *    composition-edges.ts`, folded in below as `detectHiddenCompositionEdges`) —
 *    a Service whose "Deps"-shaped interface is DEFINED in its own package but
 *    COMPOSED in `packages/core-api/src/services/*.ts`, where core-api functions
 *    are wired into it. The `ports.ts` scan alone is blind to this class of edge
 *    (see AU21 architecture.md §3 / edge-disposition.md); folding it in here
 *    means one script sees both mechanisms, and `composition-edge-anti-regrowth-
 *    guard.ts` can import both as pure functions (no CLI side effects at import
 *    time — see the `isMain` guard at the bottom).
 *
 * Output: a single JSON file consumed by the HTML dependency-graph explorer.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import ts from "typescript";

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
	// @lore detector fix (2026-08-03): `observability:ObservabilityServerConfigPort`
	// override REMOVED — found dead by the new unused-override sanity check.
	// `packages/core-api/observability/src` has no `ports.ts` file at all
	// anymore; the dependency this override targeted was refactored away at
	// some earlier, undated point and nobody noticed, because nothing checked
	// whether a registered override was ever actually reachable.
	// @lore AU21 Increment 14b: the `model-gateway:ModelGatewayCredentialResolver`
	// override is REMOVED — `@hyperidle/model-gateway` is dissolved into
	// `@hyperidle/shared` (Decision L2); there is no such Service left to
	// resolve an override for.
	"notifications:NotificationsServerConfigPort": "settings",
	"notifications:NotificationsUserReader": "users",
	"notifications:NotificationsTeamReader": "org",
	"notifications:NotificationsWorkReader": "work",
	"notifications:NotificationsCredentialStore": "connections",
	"org:OrgUserDirectory": "users",
	// @lore detector fix (2026-08-03): `work`'s dependency on `session-requests`
	// is a TYPE ALIAS (`type AgentWorkIntentRecorder =
	// SharedAgentWorkIntentRecorder<WriteExecutor>`, work/src/ports.ts), not a
	// locally-declared interface — resolvePortEdges now visits type aliases too
	// (see `resolveLeafPackageMembers`), but the alias's only real method
	// (`record`) is never a BARE top-level export of any Service (it's always a
	// method on an injected object), so the reverse-index name-vote fallback
	// would leave this "(unresolved)" without an explicit override, exactly
	// like `review:ReviewAgentWorkIntentRecorder` below already needed.
	"work:AgentWorkIntentRecorder": "session-requests",
	"review:ReviewAgentWorkIntentRecorder": "session-requests",
	"settings:SettingsUserDirectory": "users",
	// @lore AU21 §9 Increment 9: `dispatch:DispatchPorts`'s former 12-target
	// array override (dating to a flat pre-Increment-4 interface shape) is
	// REMOVED — `DispatchPorts` is now a nested-composition-group interface
	// (`readonly work: {...}`, `readonly routine: {...}`, etc., one group per
	// real target); it resolves correctly via `resolveNestedGroupEdges` below
	// (per-group kebab-name -> real Service match), which also fixes the two
	// bugs the blanket override was masking: (1) it always attributed ALL 12
	// historical targets regardless of which groups the interface still
	// declares (`review`/`knowledge`/`cost`/`session-requests`/`tool-handlers`
	// groups no longer exist on this interface at all — confirmed by reading
	// `dispatch/src/ports.ts`), and (2) the "methods" it reported for every
	// edge were never real per-group method names — they were the outer
	// interface's own group-property names ("runOrchestration"/"toolHandlers")
	// that happened to textually contain "=>" (an arrow-typed field nested
	// deep inside those two groups' object types), a false signal for the
	// flat-interface method scan below.
	// @lore detector fix (2026-08-03): `tool-handlers:ToolHandlersWorkAccessor`
	// and `tool-handlers:ToolHandlersDispatchAccessor` overrides REMOVED — found
	// dead by the new unused-override sanity check. `tool-handlers/src/ports.ts`
	// no longer declares either interface; every real port collapsed onto the
	// single `ToolHandlersPorts.coreApi` nested group (a `SEAM_INTERFACES`
	// entry), the same consolidation this file's own Increment 9 comment below
	// already documented for `DispatchPorts`'s sibling override — these two
	// were the same class of drift, just never actually caught until now.
	// @lore AU21 §9 Increment 9: `ToolHandlersUsersAccessor`/
	// `ToolHandlersConversationAccessor`/`ToolHandlersOrgAccessor`/
	// `ToolHandlersRoutineAccessor`/`ToolHandlersPolicyAccessor`/
	// `ToolHandlersKnowledgeAccessor` overrides REMOVED — none of these
	// interfaces exist anymore (Increment 2 collapsed every one of them onto
	// `ToolHandlersCoreApiAccessor`, the seam accessor; confirmed by reading
	// `tool-handlers/src/ports.ts`'s real interface declarations). Stale
	// overrides for interfaces that no longer exist are harmless (they never
	// match) but are documentation debt — removed rather than left to drift
	// further. `ToolHandlersCoreApiAccessor` itself is NOT a raw-port target
	// at all (see `SEAM_INTERFACES` below).
};

/**
 * AU21 §9 Increment 9: interfaces whose methods are satisfied EXCLUSIVELY via
 * the `CoreApiPort` seam at the composition root (`buildCoreApiPort`/
 * `seamPortForActor` — a real HTTP-route-shaped call, not same-process DI at
 * all) — verified by reading the real composition-root wiring, not guessed.
 * Without this, the raw-port name-vote fallback (Signal 2 below) mis-resolves
 * `ToolHandlersCoreApiAccessor` to a "best guess" single target (`conversation`,
 * at only 4/40 real method-name matches) even though EVERY method actually
 * routes through the seam to whichever core-api route it needs — a
 * structurally different, already-sanctioned edge kind (Increment 1/2), not a
 * raw DI violation. Keep this list source-verified, same bar as
 * `MANUAL_OVERRIDES`/`ALLOWLIST`.
 */
const SEAM_INTERFACES: ReadonlySet<string> = new Set(["tool-handlers:ToolHandlersCoreApiAccessor"]);

/**
 * AU21 §9 Increment 13: the per-GROUP analogue of `SEAM_INTERFACES` — for a
 * nested-composition-group interface (`resolveNestedGroupEdges` below) where
 * only SOME groups are seam-satisfied, not the whole interface (unlike
 * `ToolHandlersCoreApiAccessor`, every one of whose groups routes through the
 * seam). Keyed `${svcName}:${interfaceName}:${groupName}` so any FUTURE group
 * added to a nested-group interface is still caught by
 * `resolveNestedGroupEdges` unless independently verified and added here.
 * Keep this list source-verified, same bar as `SEAM_INTERFACES`.
 *
 * `SEAM_GROUPS` is currently empty — the mechanism stays live for the next
 * nested-group seam case (`DEFERRED_FOLLOWUP` below follows the same "empty
 * but ready" precedent). Add ZERO entries without independent verification.
 */
const SEAM_GROUPS: ReadonlySet<string> = new Set([]);

/**
 * Detector fix (2026-08-03): a Service's declared dependency is sometimes a
 * TYPE ALIAS referencing a generic interface from a leaf package (e.g.
 * `type AgentWorkIntentRecorder = SharedAgentWorkIntentRecorder<WriteExecutor>`,
 * importing `AgentWorkIntentRecorder` from `@hyperidle/shared`), not a locally
 * declared interface — `resolvePortEdges` used to visit ONLY
 * `ts.isInterfaceDeclaration` nodes, so these were invisible outright (not
 * even attempted), which silently orphaned the `review:ReviewAgentWorkIntentRecorder`
 * override above (registered, but unreachable) and left `work`'s identical
 * edge undetected with no override at all. This is deliberately NOT a general
 * cross-package type resolver — only leaf packages every Layer already
 * depends on qualify, and only their single-level `export {...} from "./x.js"`
 * barrel re-export shape is followed (the one real pattern in use today, see
 * `resolveLeafPackageMembers`). Extend this map only when a new real case is
 * found, verified by reading the source, same bar as `MANUAL_OVERRIDES`.
 */
const RESOLVABLE_LEAF_PACKAGES: ReadonlyMap<string, string> = new Map([["@hyperidle/shared", "packages/shared"]]);

export interface ServiceInfo {
	name: string;
	layer: "core-api" | "agent-orchestration" | "agent-execution";
	dir: string;
	ownedTables: string[];
	exposedApi: Array<{ name: string; kind: string; signature: string }>;
}

type Layer = ServiceInfo["layer"];

export interface SurfaceCount {
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

export interface Edge {
	source: string;
	target: string;
	portInterface: string;
	methods: string[];
	confidence: "high" | "medium" | "unresolved";
	resolutionNote: string;
}

export interface EventEdge {
	source: string;
	target: string;
	eventType: string;
}

/** AU21 fold — a hidden composition-bundle edge (see top-of-file note). */
export interface HiddenEdge {
	consumer: string;
	consumerLayer: Layer;
	provider: string;
	providerLayer: Layer;
	methods: string[];
	viaType: string;
	file: string;
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

function walkServiceSource(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
		const abs = join(dir, entry);
		const st = statSync(abs);
		if (st.isDirectory()) walkServiceSource(abs, out);
		else if (/\.tsx?$/.test(entry) && !/\.(integration|spec|stories|test)\./.test(entry)) {
			out.push(abs);
		}
	}
	return out;
}

function parseFile(abs: string): ts.SourceFile {
	const text = readFileSync(abs, "utf-8");
	return ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
}

function isExported(node: ts.Node): boolean {
	return (
		ts.canHaveModifiers(node) &&
		Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
	);
}

function implementationExports(service: ServiceInfo): Array<{ name: string; kind: "method" | "type" }> {
	const declarations = new Map<string, { name: string; kind: "method" | "type" }>();
	for (const abs of walkServiceSource(join(service.dir, "src"))) {
		const sf = parseFile(abs);
		for (const node of sf.statements) {
			if (!isExported(node)) continue;
			const record = (name: string, kind: "method" | "type") => declarations.set(`${kind}:${name}`, { name, kind });
			if (ts.isFunctionDeclaration(node) && node.name) record(node.name.text, "method");
			else if (ts.isClassDeclaration(node) && node.name) record(node.name.text, "method");
			else if (ts.isEnumDeclaration(node)) record(node.name.text, "method");
			else if (ts.isVariableStatement(node)) {
				for (const declaration of node.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) record(declaration.name.text, "method");
				}
			} else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
				record(node.name.text, "type");
			}
		}
	}
	return [...declarations.values()].sort((left, right) =>
		`${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`),
	);
}

function receiverAccessKinds(service: ServiceInfo, methods: readonly string[]): string[] {
	const byMethod = new Map(methods.map((method) => [method, new Set<string>()]));
	for (const abs of walkServiceSource(join(service.dir, "src"))) {
		if (abs.endsWith("/ports.ts")) continue;
		const sf = parseFile(abs);
		const visit = (node: ts.Node) => {
			if (ts.isBindingElement(node)) {
				const property = node.propertyName ?? node.name;
				if (ts.isIdentifier(property) && byMethod.has(property.text)) {
					byMethod.get(property.text)?.add("destructured");
				}
			}
			if (ts.isPropertyAccessExpression(node) && byMethod.has(node.name.text)) {
				const parent = node.parent;
				if (
					ts.isVariableDeclaration(parent) &&
					parent.initializer === node &&
					ts.isIdentifier(parent.name) &&
					parent.name.text !== node.name.text
				) {
					byMethod.get(node.name.text)?.add("aliased");
				} else {
					byMethod.get(node.name.text)?.add("direct");
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	return [...new Set([...byMethod.values()].flatMap((kinds) => [...kinds]))].sort();
}

interface DemandReceiver {
	consumer: string;
	port: string;
	requests: string[];
	accessKinds: string[];
}

function demandReceiversByProvider(
	serviceInventory: readonly ServiceInfo[],
	providersByMethod: ReadonlyMap<string, string[]>,
): Map<string, DemandReceiver[]> {
	const names = new Set(serviceInventory.map(({ name }) => name));
	const receivers = new Map(serviceInventory.map(({ name }) => [name, [] as DemandReceiver[]]));

	for (const consumer of serviceInventory) {
		const portsPath = join(consumer.dir, "src/ports.ts");
		if (!existsSync(portsPath)) continue;
		const text = readFileSync(portsPath, "utf8");
		const lines = text.split("\n");
		const parsed = parseFile(portsPath);
		const interfaces = new Map(
			parsed.statements.filter(ts.isInterfaceDeclaration).map((declaration) => [declaration.name.text, declaration]),
		);
		const headers: Array<{ line: number; target: string }> = [];
		for (const [line, value] of lines.entries()) {
			const match = value.match(/^\/\/\s*([a-z][a-z0-9-]*)\s*—/);
			if (match && names.has(match[1])) headers.push({ line, target: match[1] });
		}
		const methodsFromMembers = (members: ts.NodeArray<ts.TypeElement>): string[] => {
			const methods: string[] = [];
			for (const member of members) {
				if (ts.isMethodSignature(member) && member.name) {
					methods.push(member.name.getText(parsed));
				} else if (
					ts.isPropertySignature(member) &&
					member.name &&
					member.type &&
					ts.isFunctionTypeNode(member.type)
				) {
					methods.push(member.name.getText(parsed));
				}
			}
			return [...new Set(methods)].sort();
		};
		const methodsFromGroupType = (type: ts.TypeNode): string[] => {
			if (ts.isTypeLiteralNode(type)) return methodsFromMembers(type.members);
			if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
				const declaration = interfaces.get(type.typeName.text);
				return declaration ? methodsFromMembers(declaration.members) : [];
			}
			return [];
		};
		const addReceiver = (provider: string, port: string, requests: string[]) => {
			const providerReceivers = receivers.get(provider);
			if (!providerReceivers) throw new Error(`Unknown DI provider ${provider}`);
			providerReceivers.push({
				consumer: consumer.name,
				port,
				requests,
				accessKinds: receiverAccessKinds(consumer, requests),
			});
		};

		for (const declaration of interfaces.values()) {
			if (!isExported(declaration)) continue;
			const flatRequests = methodsFromMembers(declaration.members);
			if (flatRequests.length > 0) {
				const override = MANUAL_OVERRIDES[`${consumer.name}:${declaration.name.text}`];
				const startLine = parsed.getLineAndCharacterOfPosition(declaration.getStart(parsed)).line;
				const header = headers
					.filter(({ line }) => line < startLine)
					.sort((left, right) => right.line - left.line)[0];
				const votes = new Map<string, number>();
				for (const request of flatRequests) {
					for (const provider of providersByMethod.get(request) ?? []) {
						if (provider !== consumer.name) {
							votes.set(provider, (votes.get(provider) ?? 0) + 1);
						}
					}
				}
				const bestVote = [...votes].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
				const targets = override
					? typeof override === "string"
						? [override]
						: [...override]
					: header
						? [header.target]
						: bestVote
							? [bestVote]
							: [];
				if (targets.length === 0) {
					throw new Error(`Cannot resolve source DI receiver ${consumer.name}:${declaration.name.text}`);
				}
				for (const provider of targets) {
					addReceiver(provider, declaration.name.text, flatRequests);
				}
			}

			for (const member of declaration.members) {
				if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
				const requests = methodsFromGroupType(member.type);
				if (requests.length === 0) continue;
				const groupName = member.name.getText(parsed);
				const provider = groupName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
				// Non-service groups are composition adapters. Never guess a
				// provider from generic method names such as `create`.
				if (!names.has(provider)) continue;
				addReceiver(provider, `${declaration.name.text}.${groupName}`, requests);
			}
		}
	}

	for (const providerReceivers of receivers.values()) {
		providerReceivers.sort((left, right) => `${left.consumer}:${left.port}`.localeCompare(`${right.consumer}:${right.port}`));
	}
	return receivers;
}

function signatureText(node: ts.Node, sf: ts.SourceFile): string {
	return node.getText(sf).replace(/\s+/g, " ").trim().slice(0, 160);
}

// --- 1. Discover Services -----------------------------------------------------

export function discoverServices(root: string): ServiceInfo[] {
	const layerDirs: Array<{ layer: Layer; dir: string }> = [
		{ layer: "core-api", dir: join(root, "packages/core-api") },
		{ layer: "agent-orchestration", dir: join(root, "packages/agent-orchestration") },
		{ layer: "agent-execution", dir: join(root, "packages/agent-execution") },
	];

	const services: ServiceInfo[] = [];
	for (const { layer, dir } of layerDirs) {
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
	return services;
}

// --- 2. Owned tables (from table-ownership-guard.ts's TABLE_OWNER) ------------

export function loadOwnedTables(root: string, services: ServiceInfo[]): void {
	const guardPath = join(root, "scripts/table-ownership-guard.ts");
	if (!existsSync(guardPath)) return;
	const guardSrc = readFileSync(guardPath, "utf-8");
	const tableOwnerMatch = guardSrc.match(/const TABLE_OWNER: Record<string, string> = \{([\s\S]*?)\n\};/);
	if (!tableOwnerMatch) return;
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

export function buildExposedApis(services: ServiceInfo[]): Map<string, string[]> {
	const reverseIndex = new Map<string, string[]>(); // exported function/const name -> [serviceName, ...]

	for (const svc of services) {
		const sf = parseFile(join(svc.dir, "src/index.ts"));
		const seen = new Set<string>();
		const visit = (node: ts.Node) => {
			const isExportedNode = (n: ts.Node) =>
				ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

			if (ts.isFunctionDeclaration(node) && node.name && isExportedNode(node)) {
				const name = node.name.text;
				if (!seen.has(name)) {
					seen.add(name);
					svc.exposedApi.push({ name, kind: "function", signature: signatureText(node, sf).split("{")[0].trim() });
					reverseIndex.set(name, [...(reverseIndex.get(name) ?? []), svc.name]);
				}
			} else if (ts.isVariableStatement(node) && isExportedNode(node)) {
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
			} else if (ts.isInterfaceDeclaration(node) && isExportedNode(node)) {
				const name = node.name.text;
				if (!seen.has(name)) {
					seen.add(name);
					svc.exposedApi.push({ name, kind: "type", signature: `interface ${name}` });
				}
			} else if (ts.isTypeAliasDeclaration(node) && isExportedNode(node)) {
				const name = node.name.text;
				if (!seen.has(name)) {
					seen.add(name);
					svc.exposedApi.push({ name, kind: "type", signature: `type ${name}` });
				}
			} else if (ts.isClassDeclaration(node) && node.name && isExportedNode(node)) {
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
	return reverseIndex;
}

// --- 4. Ports (declared dependencies) per Service ------------------------------

/**
 * AU21 §9 Increment 9: a nested-composition-group interface (every top-level
 * member is itself a `{ ...methods... }` group — e.g. `DispatchPorts`'s
 * `readonly work: {...}`, `readonly routine: {...}`) needs PER-GROUP
 * resolution — the flat single-interface method scan in `resolvePortEdges`
 * can't see through the nesting (a nested group's real methods never surface
 * as this interface's own top-level "methods"; the only top-level "methods"
 * the flat scan CAN see are property names whose (often deeply nested) type
 * happens to textually contain "=>" somewhere, which is a false signal, not
 * the real method surface).
 */
function isNestedGroupInterface(node: ts.InterfaceDeclaration): boolean {
	return (
		node.members.length > 0 &&
		node.members.every(
			(member) => ts.isPropertySignature(member) && member.type !== undefined && ts.isTypeLiteralNode(member.type),
		)
	);
}

/** Real method names declared directly inside a nested composition-group's own object type. */
function methodNamesFromGroupType(type: ts.TypeNode, sf: ts.SourceFile): string[] {
	if (!ts.isTypeLiteralNode(type)) return [];
	const methods: string[] = [];
	for (const member of type.members) {
		if (ts.isMethodSignature(member) && member.name) {
			methods.push(member.name.getText(sf));
		} else if (
			ts.isPropertySignature(member) &&
			member.name &&
			member.type &&
			ts.isFunctionTypeNode(member.type)
		) {
			methods.push(member.name.getText(sf));
		}
	}
	return [...new Set(methods)].sort();
}

/**
 * Resolve a nested-composition-group interface's edges — one per group whose
 * kebab-cased property name matches a real Service name (the same
 * name-derivation `demandReceiversByProvider`'s `methodsFromGroupType` group
 * loop already uses for doc generation), carrying that group's OWN real
 * method names (never the outer interface's).
 */
function resolveNestedGroupEdges(
	svcName: string,
	node: ts.InterfaceDeclaration,
	sf: ts.SourceFile,
	serviceNames: ReadonlySet<string>,
	usedSeamGroups: Set<string>,
): Edge[] {
	const edges: Edge[] = [];
	for (const member of node.members) {
		if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
		const groupMethods = methodNamesFromGroupType(member.type, sf);
		if (groupMethods.length === 0) continue;
		const groupName = member.name.getText(sf);
		const provider = groupName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
		if (provider === svcName || !serviceNames.has(provider)) continue;
		const seamGroupKey = `${svcName}:${node.name.text}:${groupName}`;
		if (SEAM_GROUPS.has(seamGroupKey)) {
			usedSeamGroups.add(seamGroupKey);
			continue;
		}
		edges.push({
			source: svcName,
			target: provider,
			portInterface: `${node.name.text}.${groupName}`,
			methods: groupMethods,
			confidence: "high",
			resolutionNote: `Resolved from the nested composition-group name ("${groupName}" -> "${provider}") — a per-domain sub-port, not a flat method interface.`,
		});
	}
	return edges;
}

/** Shared by the interface branch and the type-alias branch below — a flat `{...}`-shaped member list. */
function extractMethodsFromTypeMembers(members: ts.NodeArray<ts.TypeElement>, sf: ts.SourceFile): PortMethod[] {
	const methods: PortMethod[] = [];
	for (const member of members) {
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
	return methods;
}

/**
 * Resolve `exportName`'s real method list by following a leaf package's own
 * barrel (`<pkgRoot>/src/index.ts`) one level — `export {...} from "./x.js"` —
 * to the file that actually declares it, then reading that interface's (or
 * type-literal alias's) members. Cached per package root so repeated lookups
 * (e.g. `AgentWorkIntentRecorder` resolved once per consuming Service) don't
 * re-parse the barrel every time. Returns `undefined` if the barrel doesn't
 * re-export the name, or the target declaration isn't a flat member list
 * (e.g. it's itself a further type reference — not handled, no real case
 * needs it today).
 */
const leafBarrelCache = new Map<string, ReadonlyMap<string, string>>();
function resolveLeafPackageMembers(root: string, pkgRoot: string, exportName: string): PortMethod[] | undefined {
	let barrelMap = leafBarrelCache.get(pkgRoot);
	if (!barrelMap) {
		const built = new Map<string, string>();
		const indexPath = join(root, pkgRoot, "src/index.ts");
		if (existsSync(indexPath)) {
			const sf = parseFile(indexPath);
			for (const stmt of sf.statements) {
				if (!ts.isExportDeclaration(stmt)) continue;
				if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
				if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
				for (const el of stmt.exportClause.elements) {
					built.set(el.name.text, stmt.moduleSpecifier.text);
				}
			}
		}
		barrelMap = built;
		leafBarrelCache.set(pkgRoot, barrelMap);
	}
	const relFile = barrelMap.get(exportName);
	if (!relFile) return undefined;
	const targetPath = join(root, pkgRoot, "src", relFile.replace(/\.js$/, ".ts").replace(/^\.\//, ""));
	if (!existsSync(targetPath)) return undefined;
	const targetSf = parseFile(targetPath);
	for (const stmt of targetSf.statements) {
		if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === exportName) {
			return extractMethodsFromTypeMembers(stmt.members, targetSf);
		}
		if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === exportName && ts.isTypeLiteralNode(stmt.type)) {
			return extractMethodsFromTypeMembers(stmt.type.members, targetSf);
		}
	}
	return undefined;
}

/**
 * A type alias may be a Deps-shaped port two ways: (a) a local `{...}`
 * type-literal (`type Foo = { record(...): ...; }` — same shape as an
 * interface, extract directly), or (b) a reference to a generic type
 * imported from a leaf package (`type Foo = SharedFoo<Bar>` — resolve via
 * `resolveLeafPackageMembers`, following the alias's own import statement
 * back to the real exported name and its origin package).
 */
function methodsFromTypeAlias(
	node: ts.TypeAliasDeclaration,
	sf: ts.SourceFile,
	root: string,
): PortMethod[] {
	if (ts.isTypeLiteralNode(node.type)) {
		return extractMethodsFromTypeMembers(node.type.members, sf);
	}
	if (ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName)) {
		const localName = node.type.typeName.text;
		for (const stmt of sf.statements) {
			if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
			const pkgRoot = RESOLVABLE_LEAF_PACKAGES.get(stmt.moduleSpecifier.text);
			if (!pkgRoot) continue;
			const nb = stmt.importClause?.namedBindings;
			if (!nb || !ts.isNamedImports(nb)) continue;
			for (const el of nb.elements) {
				if (el.name.text !== localName) continue;
				const realName = (el.propertyName ?? el.name).text;
				const resolved = resolveLeafPackageMembers(root, pkgRoot, realName);
				if (resolved) return resolved;
			}
		}
	}
	return [];
}

export function resolvePortEdges(
	root: string,
	services: ServiceInfo[],
	reverseIndex: ReadonlyMap<string, string[]>,
	options?: { verifyExemptionsReachable?: boolean },
): Edge[] {
	const edges: Edge[] = [];
	const serviceNames = new Set(services.map((s) => s.name));

	// Sanity-check state (in-code check, per the review-override lesson: a
	// config entry that's registered but never consulted is exactly the bug
	// that let `review:ReviewAgentWorkIntentRecorder` silently do nothing).
	// Populated as each entry is actually reached below; verified unused-free
	// at the end of this function.
	const usedOverrideKeys = new Set<string>();
	const usedSeamInterfaces = new Set<string>();
	const usedSeamGroups = new Set<string>();

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

		// Shared resolution cascade (MANUAL_OVERRIDES -> header comment ->
		// name-vote -> unresolved) — used by both the interface branch and the
		// type-alias branch below, so a Deps-shaped dependency resolves
		// identically regardless of which TS construct declares it.
		const resolveAndPushEdge = (methods: PortMethod[], portName: string, startLine: number) => {
			if (methods.length === 0) return;
			const overrideKey = `${svc.name}:${portName}`;
			if (MANUAL_OVERRIDES[overrideKey]) {
				usedOverrideKeys.add(overrideKey);
				const targets = MANUAL_OVERRIDES[overrideKey];
				for (const target of typeof targets === "string" ? [targets] : targets) {
					edges.push({
						source: svc.name,
						target,
						portInterface: portName,
						methods: methods.map((m) => m.name),
						confidence: "high",
						resolutionNote: "Manually verified at the composition root; see MANUAL_OVERRIDES in this script.",
					});
				}
				return;
			}

			// Signal 1 (highest priority): nearest preceding section-header
			// comment within 12 lines, i.e. the codebase's own explicit
			// "// target — ..." statement for this section.
			const nearestHeader = headers.filter((h) => h.line < startLine).sort((a, b) => b.line - a.line)[0];

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
					portInterface: portName,
					methods: methods.map((m) => m.name),
					confidence: "high",
					resolutionNote: `Header comment (line ${nearestHeader.line + 1}) AND ${nameMatch[1]}/${methods.length} real-export name match(es) agree on ${nearestHeader.target}.`,
				});
			} else if (nearestHeader) {
				edges.push({
					source: svc.name,
					target: nearestHeader.target,
					portInterface: portName,
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
					portInterface: portName,
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
					portInterface: portName,
					methods: methods.map((m) => m.name),
					confidence: "unresolved",
					resolutionNote:
						"No section-header comment and no method name matched any Service's real exports — likely a pure-type structural mirror, not a functional edge. Needs manual check.",
				});
			}
		};

		const visit = (node: ts.Node) => {
			if (ts.isInterfaceDeclaration(node)) {
				const declKey = `${svc.name}:${node.name.text}`;

				// AU21 §9 Increment 9: a known seam-accessor interface is satisfied
				// exclusively via the `CoreApiPort` seam at the composition root — not
				// same-process DI at all. Never resolve it as a raw-port edge,
				// regardless of how strongly its method names name-match a real
				// Service's exports (see `SEAM_INTERFACES`'s own doc comment).
				if (SEAM_INTERFACES.has(declKey)) {
					usedSeamInterfaces.add(declKey);
					ts.forEachChild(node, visit);
					return;
				}

				// AU21 §9 Increment 9: nested-composition-group interfaces (every
				// top-level member its own `{...}` group) resolve per-group, not as
				// one flat interface (see `resolveNestedGroupEdges`'s doc comment).
				if (isNestedGroupInterface(node)) {
					edges.push(...resolveNestedGroupEdges(svc.name, node, sf, serviceNames, usedSeamGroups));
					ts.forEachChild(node, visit);
					return;
				}

				const methods = extractMethodsFromTypeMembers(node.members, sf);
				const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
				resolveAndPushEdge(methods, node.name.text, startLine);
			} else if (ts.isTypeAliasDeclaration(node)) {
				// Detector fix (2026-08-03): a Deps-shaped dependency declared as a
				// type alias (`type Foo = {...}` or `type Foo = SharedFoo<Bar>`) —
				// see `methodsFromTypeAlias`'s doc comment for the two shapes handled.
				const methods = methodsFromTypeAlias(node, sf, root);
				const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
				resolveAndPushEdge(methods, node.name.text, startLine);
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}

	// In-code sanity check: every hand-maintained exemption/override table
	// must be REACHABLE, not just registered. `review:ReviewAgentWorkIntentRecorder`
	// sat in MANUAL_OVERRIDES for an unknown period, doing nothing, because the
	// type alias it targets was never visited at all — a silently dead config
	// entry is worse than no entry, since it reads as "handled" to a future
	// reader. Fail loud, the same bar `MANUAL_OVERRIDES`/`SEAM_INTERFACES`/
	// `SEAM_GROUPS` themselves demand of every edge they exempt.
	//
	// Skippable via `options.verifyExemptionsReachable === false` — every entry
	// in these tables names a REAL service in the real repo tree, so a caller
	// scanning a synthetic/fixture tree (composition-edge-anti-regrowth-guard.ts's
	// `--fixtures` self-test) would otherwise see EVERY real-world entry as
	// "unreachable" by construction, which is a fixture-scope mismatch, not a
	// real dead-config finding.
	const verifyExemptionsReachable = options?.verifyExemptionsReachable !== false;
	const unusedOverrides = verifyExemptionsReachable
		? Object.keys(MANUAL_OVERRIDES).filter((key) => !usedOverrideKeys.has(key))
		: [];
	if (unusedOverrides.length > 0) {
		throw new Error(
			`MANUAL_OVERRIDES has unreachable entries (never matched a visited declaration): ${unusedOverrides.join(", ")}. Either the target interface/type alias was renamed/removed, or this override was never reachable — verify against the real source and fix or remove it.`,
		);
	}
	const unusedSeamInterfaces = verifyExemptionsReachable
		? [...SEAM_INTERFACES].filter((key) => !usedSeamInterfaces.has(key))
		: [];
	if (unusedSeamInterfaces.length > 0) {
		throw new Error(
			`SEAM_INTERFACES has unreachable entries: ${unusedSeamInterfaces.join(", ")}. Verify the interface still exists under this name and fix or remove it.`,
		);
	}
	const unusedSeamGroups = verifyExemptionsReachable
		? [...SEAM_GROUPS].filter((key) => !usedSeamGroups.has(key))
		: [];
	if (unusedSeamGroups.length > 0) {
		throw new Error(
			`SEAM_GROUPS has unreachable entries: ${unusedSeamGroups.join(", ")}. Verify the nested composition-group still exists under this name and fix or remove it.`,
		);
	}

	return edges;
}

// --- 4b. AU21 fold — hidden composition-bundle edges ---------------------------
// Folded bodily from `scripts/scan-hidden-composition-edges.ts` (now retired —
// this is its one home). See the top-of-file note for the WHY/MECHANISM.

interface Binding {
	readonly local: string;
	readonly imported: string; // the exported name (namespace: "*")
	readonly service: string;
	readonly layer: Layer;
	readonly isType: boolean;
	readonly isNamespace: boolean;
}

/** `@hyperidle/<pkg>` import specifier -> { service, layer }, built from the already-discovered Services. */
function packageNameToService(services: readonly ServiceInfo[]): Map<string, { name: string; layer: Layer }> {
	const map = new Map<string, { name: string; layer: Layer }>();
	for (const svc of services) {
		const pkgJsonPath = join(svc.dir, "package.json");
		if (!existsSync(pkgJsonPath)) continue;
		const pkgName = (JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name?: string }).name;
		if (pkgName) map.set(pkgName, { name: svc.name, layer: svc.layer });
	}
	return map;
}

export function detectHiddenCompositionEdges(root: string, services: readonly ServiceInfo[]): HiddenEdge[] {
	const pkgToService = packageNameToService(services);

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

	function isImportSite(node: ts.Node): boolean {
		let p: ts.Node | undefined = node.parent;
		while (p) {
			if (ts.isImportDeclaration(p)) return true;
			p = p.parent;
		}
		return false;
	}

	/** Collect provider usages: bare value identifiers, and `namespace.member` accesses. */
	function collectUsages(
		root2: ts.Node,
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
				const b = bindings.get(node.text);
				if (b && !b.isNamespace && !isImportSite(node)) {
					record(b.service, b.imported === "default" ? node.text : b.imported);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(root2);
	}

	/** Identifiers spread with `...x` inside object literals under root. */
	function collectSpreadIdentifiers(root2: ts.Node): string[] {
		const out: string[] = [];
		const visit = (node: ts.Node) => {
			if (ts.isSpreadAssignment(node) && ts.isIdentifier(node.expression)) out.push(node.expression.text);
			ts.forEachChild(node, visit);
		};
		visit(root2);
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

	// composition-root files to scan: `packages/core-api/src/services/*.ts`.
	// NOTE: `server-factory.ts` / `app.ts` are the top-level APPLICATION composition
	// root — cross-layer wiring there is the legitimate DI seam (HarnessPort, routes,
	// EventBus, the whole assembly), not a hidden Service-to-Service edge. They are
	// deliberately excluded; the hidden-edge pathology is a per-Service "Deps" bundle
	// built inside `services/*.ts`.
	const compositionFiles: string[] = [];
	const servicesDir = join(root, "packages/core-api/src/services");
	if (existsSync(servicesDir)) {
		for (const f of readdirSync(servicesDir)) {
			if (f.endsWith(".ts") && !f.endsWith(".test.ts")) compositionFiles.push(join(servicesDir, f));
		}
	}

	const edges: HiddenEdge[] = [];

	for (const file of compositionFiles) {
		const text = readFileSync(file, "utf-8");
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
		const rel = relative(root, file);

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
		const valueBindings = [...bindings.values()].filter((b) => !b.isType);

		// 4. For each consumer type, find the node(s) annotated/returning it, and
		//    collect provider usages within that node's subtree. Fall back to
		//    file-scope when the type has no locatable annotation (rare).
		for (const consumer of consumerTypes) {
			const scopes = findTypeAnnotatedScopes(sf, consumer.local);
			const searchRoots: ts.Node[] = scopes.length > 0 ? scopes : [sf];
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
				collectUsages(rootNode, bindings, valueBindings, record);
				// Also follow spreads of module-level const objects (e.g. `{ db, ...ports }`).
				for (const spreadName of collectSpreadIdentifiers(rootNode)) {
					const decl = findConstObject(sf, spreadName);
					if (decl) collectUsages(decl, bindings, valueBindings, record);
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

	// dedupe (consumer, provider, viaType, file) merging methods
	const merged = new Map<string, HiddenEdge>();
	for (const e of edges) {
		const key = `${e.consumer}::${e.provider}::${e.viaType}::${e.file}`;
		const ex = merged.get(key);
		if (ex) ex.methods = [...new Set([...ex.methods, ...e.methods])].sort();
		else merged.set(key, { ...e });
	}
	return [...merged.values()].sort((a, b) => a.consumer.localeCompare(b.consumer) || a.provider.localeCompare(b.provider));
}

// --- 5. EventBus edges (regex scan, best-effort) -------------------------------

/**
 * AU21 §9 Increment 9 (forensic-triage wave, second pass): `.emit({type:...})`
 * literal-scanning is blind to an EventBus emission built INSIDE a shared
 * construction+emission helper (e.g. `reportAdmissionFailure`,
 * `packages/shared/src/agent-run-admission.ts`) and called from a Service —
 * `packages/shared` is a leaf every layer imports, never walked as a
 * "Service" directory, so the literal `.emit({type:"agent_run_admission_failed"...})`
 * inside it is invisible, and the CALL SITE (`reportAdmissionFailure(bus, {...})`)
 * carries no `type:` literal for the regex to match either. Keyed by the
 * helper's exported name -> the fixed event type it always constructs. Keep
 * this short and source-verified, same bar as `ALLOWLIST`-style exemptions —
 * add an entry only for a genuine indirection, not as a shortcut.
 */
const INDIRECT_EMIT_HELPERS: ReadonlyMap<string, string> = new Map([
	["reportAdmissionFailure", "agent_run_admission_failed"],
]);

export function detectEventEdges(root: string, services: readonly ServiceInfo[]): EventEdge[] {
	const emitRe = /\.emit\(\s*\{[^}]*?type:\s*["'`]([a-zA-Z0-9_]+)["'`]/gs;
	const onRe = /\.on\(\s*["'`]([a-zA-Z0-9_*]+)["'`]/g;
	const indirectEmitRe = new RegExp(`\\b(${[...INDIRECT_EMIT_HELPERS.keys()].join("|")})\\(`, "g");

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
			indirectEmitRe.lastIndex = 0;
			// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
			while ((m = indirectEmitRe.exec(text))) {
				const helperName = m[1];
				if (!helperName) continue;
				const type = INDIRECT_EMIT_HELPERS.get(helperName);
				if (!type) continue;
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
	const compositionRootDir = join(root, "packages/core-api/src");
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
			// AU21 §9 Increment 9 (forensic-triage wave, second pass): the
			// composition root was scanned for `.emit(` but never `.on(` —
			// `agent-run-admission-reactions.ts` (a real core-api subscriber to
			// the new `agent_run_admission_failed` inversion) lives here, not
			// inside a Service package dir, so it was invisible as a subscriber.
			onRe.lastIndex = 0;
			// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
			while ((m = onRe.exec(text))) {
				const type = m[1];
				if (type === "*") continue;
				if (!subscribers.has(type)) subscribers.set(type, new Set());
				subscribers.get(type)?.add("(core-api composition root)");
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
	return eventEdges;
}

// --- 6. CLI entrypoint: extract everything + write output ---------------------

function main(): void {
	const ROOT = process.cwd();

	const services = discoverServices(ROOT);
	console.log(`Discovered ${services.length} Services.`);

	loadOwnedTables(ROOT, services);

	const reverseIndex = buildExposedApis(services);
	console.log(`Extracted exposed APIs. Reverse index has ${reverseIndex.size} named exports.`);

	const edges = resolvePortEdges(ROOT, services, reverseIndex);
	console.log(`Resolved ${edges.length} port-derived edges.`);

	const hiddenEdges = detectHiddenCompositionEdges(ROOT, services);
	const hiddenCrossToCore = hiddenEdges.filter(
		(e) => e.consumerLayer === "agent-orchestration" && e.providerLayer === "core-api",
	);
	console.log(
		`Found ${hiddenEdges.length} hidden cross-layer composition edges (folded from scan-hidden-composition-edges.ts); ${hiddenCrossToCore.length} are agent-orchestration -> core-api.`,
	);

	const eventEdges = detectEventEdges(ROOT, services);
	console.log(`Found ${eventEdges.length} EventBus edges across ${new Set(eventEdges.map((e) => e.eventType)).size} distinct event types.`);

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

	const serviceDataOutputFlag = process.argv.indexOf("--service-data-output");
	if (serviceDataOutputFlag >= 0) {
		const requestedPath = process.argv[serviceDataOutputFlag + 1];
		if (!requestedPath) throw new Error("--service-data-output requires a path");

		const sourceReceivers = demandReceiversByProvider(services, reverseIndex);
		const demandPackage = [...services]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((service) => {
				const exported = implementationExports(service);
				const methods = exported.filter(({ kind }) => kind === "method").length;
				const types = exported.filter(({ kind }) => kind === "type").length;
				const surface = { methods, types, total: methods + types };
				const censusSurface = surfaceByService.get(service.name);
				if (
					!censusSurface ||
					surface.methods !== censusSurface.methods ||
					surface.types !== censusSurface.types ||
					surface.total !== censusSurface.total
				) {
					throw new Error(`${service.name} export scan diverges from implementation-site census`);
				}

				const diReceivers = sourceReceivers.get(service.name) ?? [];
				const requestsByConsumer = new Map<string, Set<string>>();
				for (const receiver of diReceivers) {
					const requests = requestsByConsumer.get(receiver.consumer) ?? new Set<string>();
					for (const request of receiver.requests) requests.add(request);
					requestsByConsumer.set(receiver.consumer, requests);
				}
				const consumers = [...requestsByConsumer]
					.map(([consumer, requests]) => ({ consumer, requests: [...requests].sort() }))
					.sort((left, right) => left.consumer.localeCompare(right.consumer));

				return {
					name: service.name,
					layer: service.layer,
					ownedTables: [...service.ownedTables].sort(),
					surface,
					exports: exported,
					diReceivers,
					consumers,
				};
			});

		writeFileSync(requestedPath, `${JSON.stringify(demandPackage, null, 2)}\n`);
		console.log(`Wrote ${requestedPath}`);
		process.exit(0);
	}

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
		hiddenCompositionEdges: hiddenEdges,
		summary: {
			totalServices: services.length,
			totalPortEdges: edges.length,
			highConfidence: edges.filter((e) => e.confidence === "high").length,
			mediumConfidence: edges.filter((e) => e.confidence === "medium").length,
			unresolved: edges.filter((e) => e.confidence === "unresolved").length,
			totalEventEdges: eventEdges.length,
			totalHiddenCompositionEdges: hiddenEdges.length,
			hiddenAgentOrchToCoreApi: hiddenCrossToCore.length,
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
		.join("\n")}\n| **TOTAL (${output.services.length})** |  | **${censusOutput.totals.methods}** | **${censusOutput.totals.types}** | **${censusOutput.totals.total}** |  |\n\n## Extraction summary\n\n- Port-derived edges: ${output.summary.totalPortEdges} (${output.summary.highConfidence} high confidence, ${output.summary.mediumConfidence} medium, ${output.summary.unresolved} unresolved)\n- EventBus edges: ${output.summary.totalEventEdges}\n- Hidden composition-bundle edges: ${output.summary.totalHiddenCompositionEdges} (${output.summary.hiddenAgentOrchToCoreApi} agent-orchestration -> core-api)\n- Services: ${output.summary.totalServices}\n`;
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
}

// Guard the side-effecting CLI body behind a "run as main module" check so
// `composition-edge-anti-regrowth-guard.ts` (and any other consumer) can
// import the pure functions above (discoverServices/buildExposedApis/
// resolvePortEdges/detectHiddenCompositionEdges) without triggering a full
// doc-regeneration run (file writes, census subprocess, `plans/AU19/concept.html`
// read) as an import-time side effect.
const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	main();
}
