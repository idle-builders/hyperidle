/**
 * AU28 — the AST detectors: table, di, api, mcp, event, capability.
 *
 * One pass per source file. `import` and `manifest` are detected from the census in `crossings.ts`;
 * these six need to look at what the code DOES, not just what it names.
 *
 * @lore AU28: three of these are honest about being partial, and the honesty matters more than the
 * coverage. `di` is a heuristic — an argument that looks like an injected port. `capability` is a
 * fixed list of SDK names and harness binaries, so a new SDK is invisible until the list grows.
 * `mcp` cannot tell a dial from a URL built and handed to a subprocess. They are regression guards,
 * not true measures, and anything that reports them as complete coverage is lying.
 *
 * @lore AU28: events are STRUCTURALLY limited, not merely under-detected. `EventBus` is anonymous
 * pub/sub: an emitter names an event type, never a package. "Which service may send which event to
 * which service" is inexpressible without a named-channel bus, so every event crossing targets the
 * bus itself. An earlier pass credited whichever package happened to hold a subscriber and
 * manufactured two rules that were pure counting artefacts.
 */

import ts from "typescript";

import type { Crossing, Kind, Target } from "./governance-model.js";
import type { Census, WorkspacePackage } from "./repo-census.js";

/**
 * Exported constants, per package.
 *
 * @lore AU28: an imported CONSTANT handed to a call is an ordinary import, not an injected port. The
 * `di` heuristic cannot tell them apart by shape, so without this suppression a frozen array passed
 * to `z.enum(...)` scores as a wired-in dependency — 26 such false positives had to be removed by
 * hand on the first census run. Only literal values count: an exported object OF FUNCTIONS is a
 * plausible port and suppressing it would hide a real crossing.
 */
export function buildConstantExports(input: Pick<AstDetectorInput, "census" | "readFile" | "locate">): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	const unwrap = (expression: ts.Expression): ts.Expression => {
		let current = expression;
		for (;;) {
			if (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression;
			else if (
				ts.isCallExpression(current) &&
				ts.isPropertyAccessExpression(current.expression) &&
				current.expression.name.text === "freeze" &&
				current.arguments[0] !== undefined
			) {
				current = current.arguments[0];
			} else return current;
		}
	};
	const isConstantValue = (expression: ts.Expression): boolean => {
		const value = unwrap(expression);
		return (
			ts.isArrayLiteralExpression(value) ||
			ts.isStringLiteralLike(value) ||
			ts.isNumericLiteral(value) ||
			value.kind === ts.SyntaxKind.TrueKeyword ||
			value.kind === ts.SyntaxKind.FalseKeyword
		);
	};
	for (const record of input.census.files) {
		if (!/\.tsx?$/.test(record.path)) continue;
		const owner = input.locate(record.path);
		if (owner === undefined) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}
		for (const statement of sf.statements) {
			if (!ts.isVariableStatement(statement)) continue;
			if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
				if (!isConstantValue(declaration.initializer)) continue;
				const set = out.get(owner.name) ?? new Set<string>();
				set.add(declaration.name.text);
				out.set(owner.name, set);
			}
		}
	}
	return out;
}

export interface AstDetectorInput {
	readonly census: Census;
	readonly readFile: (path: string) => string;
	readonly locate: (file: string) => WorkspacePackage | undefined;
	/** Every table the schema declares — from the schema source, never a list. */
	readonly tables: ReadonlySet<string>;
	readonly ownerOf: (table: string) => string | null;
	/** The layer that hosts the MCP router, and the one that may hold raw runtimes. */
	readonly mcpRouterHost: string;
	/** Module declaring every event the bus can carry. */
	readonly eventTypesModule: string;
}

export interface AstFinding {
	readonly crossing: Crossing;
	readonly file: string;
	readonly line: number;
	readonly world: "production" | "development";
	readonly detail: string;
}

/** Drizzle query-builder methods, and what each one does to the table. */
const READ_OPS = new Set(["from", "leftJoin", "innerJoin", "rightJoin", "fullJoin"]);
const WRITE_OPS = new Set(["insert", "update", "delete"]);

/** Vendor SDKs that ARE a raw runtime. A new one is invisible until it is added here. */
const RAW_RUNTIME_SPECIFIERS = [/^openai$/, /^@anthropic-ai\/sdk/, /^@google\/generative-ai/, /^@modelcontextprotocol\/sdk/];

/** Agent CLIs. Spawning one directly is holding the harness. */
const HARNESS_BINARIES = new Set(["claude", "codex", "opencode", "cursor-agent", "gh"]);
const SPAWN_FUNCTIONS = new Set(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]);

const MCP_CONSTRUCTORS = /^createMcp(Router|ToolBridge|Session)$/;

const parseFile = (path: string, source: string): ts.SourceFile =>
	ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const lineOf = (sf: ts.SourceFile, node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// ---------------------------------------------------------------------------------------------
// Which layer serves which /api path
// ---------------------------------------------------------------------------------------------

const ROUTE_FUNCTIONS = new Set(["route", "use", "get", "post", "put", "patch", "delete", "all", "on"]);

interface Route {
	readonly path: string;
	readonly layer: string;
}

/**
 * Index every route a layer registers, so a dialled path resolves to the layer that declares it.
 *
 * @lore AU28: the arity test (`>= 2` arguments) is load-bearing. A route registration always passes
 * a path AND a handler; without it `someMap.get("/x")` and `set.delete("/x")` land in the index and
 * mis-attribute real dials — which is how `/api/mcp/` first resolved to the wrong layer.
 */
export function buildRouteIndex(input: AstDetectorInput): Route[] {
	const routes: Route[] = [];
	for (const record of input.census.files) {
		if (record.kind !== "production" || !/\.tsx?$/.test(record.path)) continue;
		const owner = input.locate(record.path);
		const layer = owner?.layer;
		if (layer === undefined) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}
		const walk = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				ROUTE_FUNCTIONS.has(node.expression.name.text) &&
				node.arguments.length >= 2
			) {
				const first = node.arguments[0];
				if (first !== undefined && ts.isStringLiteral(first) && first.text.startsWith("/") && first.text.length > 1) {
					routes.push({ path: first.text.replace(/\/$/, ""), layer });
				}
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
	}
	return routes.sort((a, b) => b.path.length - a.path.length);
}

/**
 * Resolve a dialled `/api/...` path to the layer that declares it, or null.
 *
 * Segment-wise, because a registered `:param` matches any one segment and an interpolated tail stops
 * the dialled path early. The FIRST segment must match literally — without that, a route registered
 * as `/:id` matches every URL on earth, including third-party ones that are not our API at all.
 */
export function layerServing(routes: readonly Route[], apiPath: string): string | null {
	const want = apiPath
		.replace(/^\/api/, "")
		.replace(/[?#].*$/, "")
		.split("/")
		.filter((segment) => segment !== "");
	if (want.length === 0) return null;

	let best: { depth: number; layer: string } | null = null;
	for (const route of routes) {
		const have = route.path.split("/").filter((segment) => segment !== "");
		const head = have[0];
		if (head === undefined || head.startsWith(":") || head !== want[0]) continue;
		// A route longer than the dialled path can only serve it if every extra segment is a
		// parameter. `/ws/worker` cannot serve `/api/ws`; `/mcp/:token` can serve `/api/mcp/`,
		// which is what an interpolated tail leaves behind.
		if (have.length > want.length && !have.slice(want.length).every((segment) => segment.startsWith(":"))) continue;
		const depth = Math.min(have.length, want.length);
		let ok = true;
		for (let i = 0; i < depth; i += 1) {
			const segment = have[i];
			if (segment === undefined || segment.startsWith(":")) continue;
			if (segment !== want[i]) {
				ok = false;
				break;
			}
		}
		if (ok && (best === null || depth > best.depth)) best = { depth, layer: route.layer };
	}
	return best?.layer ?? null;
}

// ---------------------------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------------------------

/** Identifier → the package it was imported from. The basis of the `di` heuristic. */
function importOrigins(sf: ts.SourceFile, file: string, input: AstDetectorInput): Map<string, WorkspacePackage> {
	const out = new Map<string, WorkspacePackage>();
	const resolved = new Map<string, string>();
	for (const edge of input.census.edges) {
		if (edge.from === file) resolved.set(edge.specifier, edge.to);
	}
	for (const statement of sf.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
		if (statement.importClause?.isTypeOnly === true) continue;
		const to = resolved.get(statement.moduleSpecifier.text);
		if (to === undefined) continue;
		const target = input.locate(to);
		if (target === undefined) continue;
		const clause = statement.importClause;
		if (clause === undefined) continue;
		if (clause.name !== undefined) out.set(clause.name.text, target);
		const bindings = clause.namedBindings;
		if (bindings === undefined) continue;
		if (ts.isNamespaceImport(bindings)) out.set(bindings.name.text, target);
		else for (const element of bindings.elements) if (element.isTypeOnly !== true) out.set(element.name.text, target);
	}
	return out;
}

/** Names bound to a whole-database namespace import, so `schema.bets` resolves to the table. */
function databaseNamespaces(sf: ts.SourceFile, file: string, input: AstDetectorInput): Set<string> {
	const out = new Set<string>();
	const resolved = new Map<string, string>();
	for (const edge of input.census.edges) {
		if (edge.from === file) resolved.set(edge.specifier, edge.to);
	}
	for (const statement of sf.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
		const to = resolved.get(statement.moduleSpecifier.text) ?? "";
		const isDatabase = statement.moduleSpecifier.text.startsWith("@hyperidle/db") || input.locate(to)?.name === "db";
		const bindings = statement.importClause?.namedBindings;
		if (isDatabase && bindings !== undefined && ts.isNamespaceImport(bindings)) out.add(bindings.name.text);
	}
	return out;
}

/**
 * Every event type the bus can carry, read from the module that declares them.
 *
 * @lore AU28: without this filter `.emit()` and `.on()` on ANY object score as bus crossings —
 * an EventEmitter, a DOM node, a mock. Counting only declared event types is what separates the two,
 * and it is read from the source so it can never go stale against a hand list.
 */
export function readEventTypes(module: string, readFile: (path: string) => string): Set<string> {
	const out = new Set<string>();
	const sf = parseFile(module, readFile(module));
	const walk = (node: ts.Node): void => {
		if (ts.isPropertySignature(node) && ts.isIdentifier(node.name) && node.name.text === "type" && node.type !== undefined) {
			if (ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal)) out.add(node.type.literal.text);
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);
	if (out.size === 0) {
		throw new Error(`crossing-detectors: ${module} declared no event types. An empty set silently disables the event detector.`);
	}
	return out;
}

export function detectAstCrossings(input: AstDetectorInput): AstFinding[] {
	const routes = buildRouteIndex(input);
	const constantExports = buildConstantExports(input);
	const eventTypes = readEventTypes(input.eventTypesModule, input.readFile);
	const out: AstFinding[] = [];

	for (const record of input.census.files) {
		if (!/\.tsx?$/.test(record.path)) continue;
		const owner = input.locate(record.path);
		if (owner === undefined) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}

		const world = record.kind;
		const source: Crossing["source"] = { sort: "package", name: owner.name, role: owner.role, layer: owner.layer };
		const origins = importOrigins(sf, record.path, input);
		const dbNamespaces = databaseNamespaces(sf, record.path, input);

		// Identifiers holding a typed cross-layer port, and which layer each one reaches.
		const portRoots = new Map<string, string>();
		const collectPortRoots = (n: ts.Node): void => {
			if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n)) && ts.isIdentifier(n.name)) {
				const declared = n.type === undefined ? null : portKind(n.type.getText(sf));
				const init = (n as { initializer?: ts.Expression }).initializer;
				const constructed =
					init !== undefined && ts.isCallExpression(init) && ts.isIdentifier(init.expression) ? portKind(init.expression.text) : null;
				const served = declared ?? constructed;
				if (served !== null) portRoots.set(n.name.text, served);
			}
			ts.forEachChild(n, collectPortRoots);
		};
		collectPortRoots(sf);

		const add = (kind: Kind, target: Target, node: ts.Node, detail: string): void => {
			out.push({ crossing: { kind, source, target }, file: record.path, line: lineOf(sf, node), world, detail });
		};
		const tableTarget = (table: string): Target => ({ sort: "table", table, owner: input.ownerOf(table) });

		// --- specifier-level: raw runtimes -----------------------------------------------------
		for (const statement of sf.statements) {
			if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
			const specifier = statement.moduleSpecifier.text;
			if (RAW_RUNTIME_SPECIFIERS.some((re) => re.test(specifier))) {
				add("capability", { sort: "raw-runtime" }, statement, `imports the vendor SDK ${specifier}`);
			}
		}

		const visit = (node: ts.Node): void => {
			// --- table: a Drizzle query builder naming a table ---------------------------------
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const method = node.expression.name.text;
				const isRead = READ_OPS.has(method);
				const isWrite = WRITE_OPS.has(method);
				if (isRead || isWrite) {
					const arg = node.arguments[0];
					let table: string | null = null;
					if (arg !== undefined && ts.isIdentifier(arg) && input.tables.has(arg.text)) table = arg.text;
					else if (
						arg !== undefined &&
						ts.isPropertyAccessExpression(arg) &&
						ts.isIdentifier(arg.expression) &&
						dbNamespaces.has(arg.expression.text) &&
						input.tables.has(arg.name.text)
					) {
						table = arg.name.text;
					}
					if (table !== null) {
						add(
							isWrite ? "table:write" : "table:read",
							tableTarget(table),
							node.expression.name,
							`\`${method}(${table})\` — ${isWrite ? "writes" : "reads"} the table`,
						);
					}
				}
			}

			// --- table: dereferencing the whole-schema namespace -------------------------------
			if (
				ts.isPropertyAccessExpression(node) &&
				ts.isIdentifier(node.expression) &&
				dbNamespaces.has(node.expression.text) &&
				input.tables.has(node.name.text)
			) {
				const parent = node.parent;
				const alreadyCounted =
					parent !== undefined &&
					ts.isCallExpression(parent) &&
					ts.isPropertyAccessExpression(parent.expression) &&
					(READ_OPS.has(parent.expression.name.text) || WRITE_OPS.has(parent.expression.name.text));
				if (!alreadyCounted) {
					add("table:read", tableTarget(node.name.text), node, `reaches \`${node.expression.text}.${node.name.text}\``);
				}
			}

			if (ts.isCallExpression(node)) {
				const callee = node.expression;
				const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";

				// --- capability: spawning an agent CLI -----------------------------------------
				if (SPAWN_FUNCTIONS.has(name)) {
					const arg = node.arguments[0];
					if (arg !== undefined && ts.isStringLiteralLike(arg)) {
						const binary = arg.text.split("/").pop() ?? arg.text;
						if (HARNESS_BINARIES.has(binary)) add("capability", { sort: "harness" }, node, `spawns the \`${binary}\` binary`);
					}
				}

				// --- capability: a dynamically imported vendor SDK -----------------------------
				if (callee.kind === ts.SyntaxKind.ImportKeyword) {
					const arg = node.arguments[0];
					if (arg !== undefined && ts.isStringLiteralLike(arg) && RAW_RUNTIME_SPECIFIERS.some((re) => re.test(arg.text))) {
						add("capability", { sort: "raw-runtime" }, node, `dynamically imports the vendor SDK ${arg.text}`);
					}
				}

				// --- event: touching the bus ---------------------------------------------------
				// Both directions are the same crossing. The bus is anonymous, so an emitter names an
				// event type and never a package — see the note at the top of this file.
				if (ts.isPropertyAccessExpression(callee) && (name === "emit" || name === "on")) {
					const base = callee.expression.getText(sf);
					const arg = node.arguments[0];
					const label =
						arg !== undefined && ts.isStringLiteralLike(arg)
							? arg.text
							: arg !== undefined && ts.isObjectLiteralExpression(arg)
								? ((
										arg.properties
											.filter((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p))
											.find((p) => ts.isIdentifier(p.name) && p.name.text === "type")?.initializer as
											| ts.StringLiteralLike
											| undefined
									)?.text ?? null)
								: null;
					// A wildcard subscription is a bus subscription by definition.
					if (label !== null && (label === "*" || eventTypes.has(label))) {
						add("event", { sort: "event-bus" }, callee.name, `${name === "on" ? "subscribes to" : "emits"} \`${label}\` (${base})`);
					}
				}

				// --- mcp: constructing, registering on, or opening the router ------------------
				if (MCP_CONSTRUCTORS.test(name)) add("mcp", { sort: "mcp-router" }, node, `calls \`${name}\``);
				if (name === "registerTool") add("mcp", { sort: "mcp-router" }, node, "registers a tool on the router");
				if (ts.isPropertyAccessExpression(callee) && name === "open" && /mcp/i.test(callee.expression.getText(sf))) {
					add("mcp", { sort: "mcp-router" }, node, "opens an MCP session");
				}

				// --- api: the typed seam and the websocket client ------------------------------
				// Both only ever talk to core-api; that is what makes them a seam rather than a dial.
				if (ts.isIdentifier(callee) && name === "apiFetch") {
					add("api", { sort: "http-api", layer: "core-api" }, node, "calls apiFetch");
				}
				if (
					ts.isPropertyAccessExpression(callee) &&
					name === "subscribe" &&
					/\bws|wsClient|socket/i.test(callee.expression.getText(sf))
				) {
					add("api", { sort: "http-api", layer: "core-api" }, node, "subscribes over the websocket");
				}

				// --- api: a typed port seam ----------------------------------------------------
				// A value declared as a `CoreApiPort` / `AgentOrchestrationPort` IS the cross-layer
				// call; every method on it is a dial of that layer.
				if (ts.isPropertyAccessExpression(callee)) {
					let root: ts.Expression = callee;
					const chain: string[] = [];
					while (ts.isPropertyAccessExpression(root)) {
						chain.unshift(root.name.text);
						root = root.expression;
					}
					const served = ts.isIdentifier(root)
						? (portRoots.get(root.text) ?? null)
						: ts.isCallExpression(root) && ts.isIdentifier(root.expression)
							? portKind(root.expression.text)
							: null;
					if (served !== null && chain.length >= 1) {
						add("api", { sort: "http-api", layer: served }, node, `calls \`${chain.join(".")}\` on the ${served} port`);
					}
				}

				// --- di: an injected port ------------------------------------------------------
				// The crossing is between the package whose factory is CALLED and the package the
				// injected value came from — NOT the file doing the wiring. A composition root wiring
				// `makeThing(fromA, fromB)` records `thing's package → A` and `thing's package → B`,
				// because those are the dependencies the callee actually receives.
				const calleeRoot = ts.isIdentifier(callee)
					? callee.text
					: ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
						? callee.expression.text
						: null;
				const consumer = calleeRoot === null ? undefined : origins.get(calleeRoot);
				if (consumer !== undefined) {
					const consumerSource: Crossing["source"] = {
						sort: "package",
						name: consumer.name,
						role: consumer.role,
						layer: consumer.layer,
					};
					const seen = new Set<string>();
					const consider = (identifier: string, how: string, at: ts.Node): void => {
						// A TABLE symbol passed as an argument is a table access, already counted under
						// `table`. Counting it here too produced 1,681 phantom edges from `fn(db, bets)`.
						if (input.tables.has(identifier)) return;
						const provider = origins.get(identifier);
						if (provider === undefined || provider.dir === consumer.dir) return;
						// An imported constant handed to a call is an ordinary import, not an injected port.
						if (constantExports.get(provider.name)?.has(identifier) === true) return;
						// Only a value can be injected. A type name carries nothing at runtime.
						if (!/^[a-z]/.test(identifier)) return;
						const key = `${provider.name}|${identifier}`;
						if (seen.has(key)) return;
						seen.add(key);
						out.push({
							crossing: {
								kind: "di",
								source: consumerSource,
								target: { sort: "package", name: provider.name, role: provider.role, layer: provider.layer },
							},
							file: record.path,
							line: lineOf(sf, at),
							world,
							detail: `${consumer.name} ${how} \`${identifier}\` from ${provider.name}`,
						});
					};
					const scanArgument = (arg: ts.Node, depth: number): void => {
						if (depth > 4) return;
						if (ts.isIdentifier(arg)) {
							consider(arg.text, "receives", arg);
							return;
						}
						if (ts.isObjectLiteralExpression(arg)) {
							for (const property of arg.properties) {
								if (ts.isPropertyAssignment(property)) scanArgument(property.initializer, depth + 1);
								else if (ts.isShorthandPropertyAssignment(property)) consider(property.name.text, "receives", property);
							}
							return;
						}
						if (ts.isArrayLiteralExpression(arg)) {
							for (const element of arg.elements) scanArgument(element, depth + 1);
							return;
						}
						if (ts.isCallExpression(arg)) {
							if (ts.isIdentifier(arg.expression)) consider(arg.expression.text, "receives the result of", arg);
							for (const inner of arg.arguments) scanArgument(inner, depth + 1);
							return;
						}
						if (ts.isAsExpression(arg) || ts.isParenthesizedExpression(arg) || ts.isSatisfiesExpression(arg)) {
							scanArgument(arg.expression, depth);
						}
					};
					for (const arg of node.arguments) scanArgument(arg, 0);
				}
			}

			// --- mcp: a router definition or a mount point -------------------------------------
			if (ts.isFunctionDeclaration(node) && node.name !== undefined && MCP_CONSTRUCTORS.test(node.name.text)) {
				add("mcp", { sort: "mcp-router" }, node, `defines \`${node.name.text}\``);
			}

			// --- api: a raw dial, as opposed to the seam -----------------------------------
			// Narrow on purpose: an argument to `fetch(...)`, an argument to `new WebSocket(...)`, or
			// the initializer of a variable whose name ends in `url`. Anything looser re-counts every
			// seam path literal as a second crossing. A detached process that cannot compose layers
			// in-process is the reason this shape exists at all.
			if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
				const text = ts.isTemplateExpression(node) ? node.getText(sf) : node.text;
				const match = /\/api\/[A-Za-z0-9\-_/]*/.exec(text);
				if (match !== null) {
					let current: ts.Node = node;
					while (
						current.parent !== undefined &&
						(ts.isBinaryExpression(current.parent) ||
							ts.isTemplateExpression(current.parent) ||
							ts.isTemplateSpan(current.parent) ||
							ts.isParenthesizedExpression(current.parent) ||
							ts.isAsExpression(current.parent))
					) {
						current = current.parent;
					}
					const host = current.parent;
					const shape =
						host !== undefined && ts.isCallExpression(host) && ts.isIdentifier(host.expression) && host.expression.text === "fetch"
							? "raw fetch"
							: host !== undefined && ts.isNewExpression(host) && /websocket/i.test(host.expression.getText(sf))
								? "raw websocket"
								: host !== undefined && ts.isVariableDeclaration(host) && ts.isIdentifier(host.name) && /url$/i.test(host.name.text)
									? "url built inline"
									: null;
					if (shape !== null) {
						const served = layerServing(routes, match[0]);
						if (served !== null && served !== owner.layer) {
							add("api", { sort: "http-api", layer: served }, node, `${shape} to ${match[0]} (served by ${served})`);
						}
					}
				}
			}

			ts.forEachChild(node, visit);
		};
		visit(sf);
	}

	return out;
}

/** Which layer a typed port reaches, from its type or factory name. Null when it is not a port. */
function portKind(text: string): string | null {
	if (/AgentOrchestration\w*Port|buildAgentOrchestrationPort/.test(text)) return "agent-orchestration";
	if (/CoreApi\w*Port|buildCoreApiPort/.test(text)) return "core-api";
	return null;
}
