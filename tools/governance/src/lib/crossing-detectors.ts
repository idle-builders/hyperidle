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
 * Thrown when a file the census classifies `production` sits in no workspace package and still
 * produces a crossing.
 *
 * @lore AU28: this is a MISCONFIGURATION failing open, which is the worst direction. `actorFor`
 * conflated two different situations — "outside the package tree" (a config file at the repo root,
 * legitimately the repo root) and "unregistered inside it" (a directory under `layers/` with no
 * `package.json`). The second resolved to the repo-root actor, which `architecture.json` declares a
 * COMPOSITION ROOT, so `layers/rogue/src/backdoor.ts` could import across every layer and be
 * adjudicated allowed, while the AST detectors skipped it entirely and it could write any table it
 * liked. Recording that as a known violation would be nonsense — the census would be forgiving a hole
 * in itself — so it throws, like every sibling census misconfiguration already does.
 */
export class UnclaimedProductionFileError extends Error {
	constructor(readonly file: string) {
		super(
			`crossings: ${file} is production code but sits in no workspace package, so it resolves to the ` +
				"repo-root actor — a declared composition root. Add a package.json and a `workspaces` glob, " +
				"or move the file out of a production role root. A production file may never act as the repo root.",
		);
		this.name = "UnclaimedProductionFileError";
	}
}

/**
 * Specifier as written → the census file it resolves to, per source file.
 *
 * Built once per census and memoized. Three detectors need this map and each used to rebuild it by
 * scanning every edge in the census, per file.
 */
const specifierIndexes = new WeakMap<Census, Map<string, Map<string, string>>>();

function specifiersOf(census: Census, file: string): ReadonlyMap<string, string> {
	let index = specifierIndexes.get(census);
	if (index === undefined) {
		index = new Map<string, Map<string, string>>();
		for (const edge of census.edges) {
			const forFile = index.get(edge.from) ?? new Map<string, string>();
			forFile.set(edge.specifier, edge.to);
			index.set(edge.from, forFile);
		}
		specifierIndexes.set(census, index);
	}
	return index.get(file) ?? new Map<string, string>();
}

/** What a file can say to name a table, resolved through its BINDINGS rather than its spelling. */
export interface TableRefs {
	/** The table an expression names, or null when it names none. */
	readonly resolve: (expr: ts.Expression) => string | null;
	/** Local names bound to a whole-database namespace import, so `schema.bets` resolves. */
	readonly namespaces: ReadonlySet<string>;
}

/**
 * Resolve a table through the import binding, not the identifier text.
 *
 * @lore AU28: table detection used to be `input.tables.has(arg.text)` — the local identifier had to
 * EQUAL the schema export name. Three spellings of the same write:
 *
 *     import { teams } from "@hyperidle/db";                    insert(teams)  → caught
 *     import { teams as T } from "@hyperidle/db";               insert(T)      → invisible
 *     import { teams } from "@hyperidle/db"; const t = teams;   insert(t)      → invisible
 *
 * Renaming an import is an ordinary style choice, not concealment, so the whole table ACL was one
 * keystroke deep. It cut both ways: `buildWriteSets` also failed to CREDIT an aliased companion
 * write, so a fixture that did supply the companion under an alias was reported as a violation.
 *
 * @lore AU28: the census's `ImportEdge.symbols` carries `propertyName ?? name` — the ORIGINAL export
 * name — so it cannot supply the local alias. The alias has to come from the re-parse the detectors
 * already do. Do not try to read it off the edge.
 *
 * @lore AU28 — the deliberate BOUNDARY. This resolves exactly one level of NAMING indirection:
 * import alias, `const` alias (to a fixed point), namespace destructure, namespace property access.
 * Value flow is out of scope — `const T = { bets }; insert(T.bets)`, a table returned from a
 * function, a table in a `Map`. That is hiding, not a style, and a partial value-flow analysis reads
 * as complete while being trivially escapable. The bare-name fallback is kept last so behaviour for
 * unaliased code is byte-identical and no count moves.
 */
export function buildTableRefs(
	sf: ts.SourceFile,
	file: string,
	input: Pick<AstDetectorInput, "census" | "locate" | "tables">,
): TableRefs {
	const specifiers = specifiersOf(input.census, file);
	const namespaces = new Set<string>();
	const local = new Map<string, string>();

	// The specifier must land in the DATABASE package. Without this the resolver degrades back into
	// a name-matcher: a local module that happens to export a symbol called `teams` would bind it.
	const isDatabaseModule = (specifier: string): boolean =>
		specifier.startsWith("@hyperidle/db") ||
		input.locate(specifiers.get(specifier) ?? "")?.name === "db";

	for (const statement of sf.statements) {
		if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)))
			continue;
		if (!isDatabaseModule(statement.moduleSpecifier.text)) continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings === undefined) continue;
		if (ts.isNamespaceImport(bindings)) {
			namespaces.add(bindings.name.text);
			continue;
		}
		for (const element of bindings.elements) {
			if (element.isTypeOnly === true) continue;
			const original = (element.propertyName ?? element.name).text;
			if (input.tables.has(original)) local.set(element.name.text, original);
		}
	}

	// `const t = teams`, `const { bets } = schema` — resolved to a fixed point so `const b = a` works.
	for (let pass = 0; pass < 8; pass += 1) {
		let grew = false;
		const walk = (node: ts.Node): void => {
			if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
				const init = node.initializer;
				if (ts.isIdentifier(node.name) && ts.isIdentifier(init)) {
					const table = local.get(init.text);
					if (table !== undefined && !local.has(node.name.text)) {
						local.set(node.name.text, table);
						grew = true;
					} else if (namespaces.has(init.text) && !namespaces.has(node.name.text)) {
						namespaces.add(node.name.text);
						grew = true;
					}
				} else if (
					ts.isObjectBindingPattern(node.name) &&
					ts.isIdentifier(init) &&
					namespaces.has(init.text)
				) {
					for (const element of node.name.elements) {
						if (!ts.isIdentifier(element.name)) continue;
						const key = element.propertyName ?? element.name;
						if (!(ts.isIdentifier(key) && input.tables.has(key.text))) continue;
						if (local.has(element.name.text)) continue;
						local.set(element.name.text, key.text);
						grew = true;
					}
				}
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
		if (!grew) break;
	}

	const resolve = (expr: ts.Expression): string | null => {
		if (ts.isIdentifier(expr)) {
			return local.get(expr.text) ?? (input.tables.has(expr.text) ? expr.text : null);
		}
		if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
			if (namespaces.has(expr.expression.text) && input.tables.has(expr.name.text))
				return expr.name.text;
		}
		return null;
	};

	return { resolve, namespaces };
}

/**
 * Local names bound to a fixed STRING, so a command spelled as a constant resolves to its value.
 *
 * @lore AU28 Ruling 14/15: the one-door rule is the strongest in the set and it required the binary to
 * be written as a literal at the call site. `spawn("claude", …)` errored; `const AGENT_CLI = "claude";
 * spawn(AGENT_CLI, …)` was silent. Lifting a command out into a named constant is ordinary style — it
 * is what anyone does the second time they need the name — so the strongest rule in the set was one
 * refactor deep. This is the same act as `buildTableRefs` performs for tables: resolve the BINDING,
 * not the spelling.
 *
 * @lore AU28 — the same deliberate boundary as the table resolver. One level of NAMING indirection to
 * a fixed point: `const a = "claude"`, `const b = a`. Value flow is out of scope — a string in an
 * object, a string returned from a function, a template with a substitution. That is hiding rather
 * than style, and a partial value-flow analysis reads as complete while being trivially escapable.
 */
function buildStringConstants(sf: ts.SourceFile): ReadonlyMap<string, string> {
	const values = new Map<string, string>();
	const aliases: { readonly name: string; readonly of: string }[] = [];
	const walk = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined
		) {
			const init = node.initializer;
			// A `no-substitution` template literal is a string literal wearing backticks.
			if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))
				values.set(node.name.text, init.text);
			else if (ts.isIdentifier(init)) aliases.push({ name: node.name.text, of: init.text });
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);
	for (let pass = 0; pass < 8; pass += 1) {
		let grew = false;
		for (const alias of aliases) {
			const value = values.get(alias.of);
			if (value !== undefined && !values.has(alias.name)) {
				values.set(alias.name, value);
				grew = true;
			}
		}
		if (!grew) break;
	}
	return values;
}

/**
 * Local names bound to drizzle's `sql` tag, so a raw template is recognised however it is imported.
 *
 * Only the tag is resolved here; which TABLE the template names is a string match against the
 * physical names — see `rawSqlTables`.
 */
function drizzleSqlNames(sf: ts.SourceFile): Set<string> {
	const out = new Set<string>();
	for (const statement of sf.statements) {
		if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)))
			continue;
		if (!/^drizzle-orm(\/|$)/.test(statement.moduleSpecifier.text)) continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings === undefined || ts.isNamespaceImport(bindings)) continue;
		for (const element of bindings.elements) {
			if ((element.propertyName ?? element.name).text === "sql") out.add(element.name.text);
		}
	}
	return out;
}

/**
 * Statement verbs that make a raw SQL template a WRITE. Anything else naming a table reads it.
 *
 * The STATEMENT verb decides, not the keyword in front of the table name — otherwise `delete from x`
 * would count as a read as well as a write.
 *
 * @lore AU28: ANY write verb in the template decides, not the LEADING one. The leading verb was the
 * original rule and a CTE walks straight past it: ``sql`with recent as (select id from tasks) update
 * teams set …` `` leads with `with`, so the whole statement was reported `table:read`. In the
 * development world that is not a smaller mistake but a total escape — a foreign READ is relaxed and
 * only the WRITE is held by the Ruling-13 companion clause, so a CTE-first update in a fixture was
 * invisible. Reading a write as a write costs at worst a stricter verdict on a template that mentions
 * a write verb in passing; reading a write as a read costs the rule.
 */
const SQL_WRITE_VERBS = /\b(insert|update|delete|alter|truncate|create|drop)\b/i;

/**
 * The tables a raw SQL template names, and whether the statement reads or writes them.
 *
 * @lore AU28: `READ_OPS`/`WRITE_OPS` only ever saw the Drizzle query builder, so a table named
 * inside a `sql` template was a STRING and no crossing at all —
 * ``db.execute(sql`insert into teams (id) values ('x')`)`` passed with the crossing count unchanged.
 * The shape is already the live style in three production services; all of them happen to touch
 * their own tables today, which is luck rather than enforcement.
 *
 * @lore AU28: the keyword anchor (`from|into|update|join|table|truncate|on` before the name) is
 * load-bearing. Without it the generic physical names — `users`, `items`, `sessions`, `teams` —
 * collide with prose in comments and with interpolated Drizzle column references, and the detector
 * starts inventing crossings. Measured against the live tree the anchored form yields exactly the
 * real sites and no false positives.
 *
 * @lore AU28: the anchor also allows an optional SCHEMA QUALIFIER — `insert into public.teams` is the
 * same act as `insert into teams` and `insert into "teams"`, and only the last two were seen. Postgres
 * accepts all three interchangeably, so the qualifier was a one-word bypass of the whole table ACL.
 * The qualifier is matched loosely (any identifier, quoted or not) rather than against a list of
 * schema names: `public` is the only one this repo uses today and a list would be one more thing to
 * keep in step with a migration.
 */
const SQL_SCHEMA_QUALIFIER = '(?:"?[A-Za-z_][A-Za-z0-9_$]*"?\\.)?';

function rawSqlTables(
	text: string,
	physicalNames: ReadonlyMap<string, string>,
): Map<string, "table:read" | "table:write"> {
	const found = new Map<string, "table:read" | "table:write">();
	const kind = SQL_WRITE_VERBS.test(text) ? "table:write" : "table:read";
	for (const [physical, symbol] of physicalNames) {
		const anchored = new RegExp(
			`\\b(?:from|into|update|join|table|truncate|on)\\s+${SQL_SCHEMA_QUALIFIER}"?${physical}"?\\b`,
			"i",
		);
		if (anchored.test(text)) found.set(symbol, kind);
	}
	return found;
}

/**
 * Exported constants, per package.
 *
 * @lore AU28: an imported CONSTANT handed to a call is an ordinary import, not an injected port. The
 * `di` heuristic cannot tell them apart by shape, so without this suppression a frozen array passed
 * to `z.enum(...)` scores as a wired-in dependency — 26 such false positives had to be removed by
 * hand on the first census run. Only literal values count: an exported object OF FUNCTIONS is a
 * plausible port and suppressing it would hide a real crossing.
 */
export function buildConstantExports(
	input: Pick<AstDetectorInput, "census" | "readFile" | "locate">,
): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	const unwrap = (expression: ts.Expression): ts.Expression => {
		let current = expression;
		for (;;) {
			if (ts.isAsExpression(current) || ts.isParenthesizedExpression(current))
				current = current.expression;
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

/**
 * Tables an owner writes together in a single call.
 *
 * @lore AU28 Ruling 13: this is what replaced "a test must write foreign tables through the owner's
 * writer". That rule cost 2,016 sites and 63% of them would have routed through a function that is
 * literally `exec.insert(X).values(values)` — byte-identical SQL, one more indirection to read
 * through. What it was actually protecting was narrower: an owner that writes two rows in one call
 * has a cross-row invariant, and a test writing only one of them builds a state production cannot
 * produce. Fixtures that create a team with no membership row, or a knowledge item with no
 * projection, are the bugs — and this is how they are found.
 *
 * Derived, never listed: a group is any exported function in the OWNING package that inserts two or
 * more tables unconditionally. A `switch` that dispatches to one insert per branch is not a group —
 * `work.create()` writes four tables but any one call writes exactly one.
 */
export function buildCompanionGroups(
	input: Pick<AstDetectorInput, "census" | "readFile" | "locate" | "tables">,
	ownerOf: (table: string) => string | null,
): Map<string, ReadonlySet<string>> {
	const groups = new Map<string, Set<string>>();

	/**
	 * Tables the owner ever REVISES — updates or deletes a row of, independently.
	 *
	 * @lore AU28 Ruling 13a: a companion the owner only ever appends to and never revises is a LOG,
	 * not part of the entity's state. Nothing reads it to decide what the entity is, and its foreign
	 * key points AT the entity rather than the other way round — so a test that omits it produces the
	 * same mutable state production would. `knowledgeEditLog` and `knowledgeAccessLog` have zero
	 * updates between them; `knowledgeAppProjection` is updated by its owner and
	 * is genuinely part of the row set. Requiring a fabricated audit row in 51 test sites would have
	 * been exactly the ceremony Ruling 13 removed, one scale smaller.
	 */
	const revised = new Set<string>();
	for (const record of input.census.files) {
		if (record.kind !== "production" || !/\.tsx?$/.test(record.path)) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}
		const refs = buildTableRefs(sf, record.path, input);
		const walk = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const method = node.expression.name.text;
				const arg = node.arguments[0];
				const table =
					method === "update" || method === "delete"
						? arg === undefined
							? null
							: refs.resolve(arg)
						: null;
				if (table !== null) revised.add(table);
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
	}

	/** Tables INSERTED on every path through this function — not inside a branch. */
	const unconditionalInserts = (fn: ts.FunctionDeclaration, refs: TableRefs): Set<string> => {
		const found = new Set<string>();
		const walk = (node: ts.Node, branched: boolean): void => {
			const nowBranched =
				branched ||
				ts.isCaseClause(node) ||
				ts.isDefaultClause(node) ||
				ts.isConditionalExpression(node);
			if (
				!nowBranched &&
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				const arg = node.arguments[0];
				const table =
					node.expression.name.text === "insert" && arg !== undefined ? refs.resolve(arg) : null;
				if (table !== null) found.add(table);
			}
			ts.forEachChild(node, (child) => walk(child, nowBranched));
		};
		if (fn.body !== undefined) ts.forEachChild(fn.body, (child) => walk(child, false));
		return found;
	};

	for (const record of input.census.files) {
		if (record.kind !== "production" || !/\.tsx?$/.test(record.path)) continue;
		const owner = input.locate(record.path);
		if (owner === undefined) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}
		const refs = buildTableRefs(sf, record.path, input);
		for (const statement of sf.statements) {
			if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) continue;
			if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
			const written = unconditionalInserts(statement, refs);
			if (written.size < 2) continue;
			// A seeder in the database package writes every table in the schema and is not a door any
			// test would go through, so the owner check below also excludes it.
			// Only the OWNING service's writer counts, and only tables the owner actually revises —
			// an append-only log is history, not state.
			const owned = [...written].filter(
				(table) => ownerOf(table) === owner.name && revised.has(table),
			);
			if (owned.length < 2) continue;
			for (const table of owned) {
				const group = groups.get(table) ?? new Set<string>();
				for (const companion of owned) if (companion !== table) group.add(companion);
				groups.set(table, group);
			}
		}
	}
	return groups;
}

export interface AstDetectorInput {
	readonly census: Census;
	readonly readFile: (path: string) => string;
	readonly locate: (file: string) => WorkspacePackage | undefined;
	/** Every table the schema declares — from the schema source, never a list. */
	readonly tables: ReadonlySet<string>;
	/** Physical SQL name → export symbol, so a table named inside a `sql` template resolves. */
	readonly physicalNames: ReadonlyMap<string, string>;
	readonly ownerOf: (table: string) => string | null;
	/** The layer that hosts the MCP router, and the one that may hold raw runtimes. */
	readonly mcpRouterHost: string;
	/** Module declaring every event the bus can carry. */
	readonly eventTypesModule: string;
	/** Table → the tables its owner always writes alongside it. */
	readonly companions: ReadonlyMap<string, ReadonlySet<string>>;
	/** Tables each file writes, including through the development helpers it imports. */
	readonly writeSetOf: (file: string) => ReadonlySet<string>;
}

/**
 * Tables each file writes — including through the development helpers it imports.
 *
 * A test that calls a shared `seedBase()` helper has written whatever the helper writes. Judging the
 * file alone would report a companion as missing when a fixture module three lines away supplies it,
 * and a rule that cries wolf on the shared helper is a rule people switch off.
 *
 * @lore AU28: this side of the table resolver matters as much as the detection side. A fixture that
 * DOES write the companion, under an alias or in a `sql` template, must be credited for it — an
 * under-reading write set turns the companion rule into a false positive, which is the failure mode
 * that gets a rule switched off rather than fixed.
 */
export function buildWriteSets(
	input: Pick<AstDetectorInput, "census" | "readFile" | "locate" | "tables" | "physicalNames">,
): (file: string) => ReadonlySet<string> {
	const own = new Map<string, Set<string>>();
	for (const record of input.census.files) {
		if (!/\.tsx?$/.test(record.path)) continue;
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}
		const refs = buildTableRefs(sf, record.path, input);
		const sqlNames = drizzleSqlNames(sf);
		const found = new Set<string>();
		const walk = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const arg = node.arguments[0];
				const table =
					WRITE_OPS.has(node.expression.name.text) && arg !== undefined ? refs.resolve(arg) : null;
				if (table !== null) found.add(table);
			}
			if (
				ts.isTaggedTemplateExpression(node) &&
				ts.isIdentifier(node.tag) &&
				sqlNames.has(node.tag.text)
			) {
				for (const [table, kind] of rawSqlTables(node.template.getText(sf), input.physicalNames)) {
					if (kind === "table:write") found.add(table);
				}
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
		own.set(record.path, found);
	}

	const importsOf = new Map<string, string[]>();
	for (const edge of input.census.edges) {
		importsOf.set(edge.from, [...(importsOf.get(edge.from) ?? []), edge.to]);
	}

	const cache = new Map<string, Set<string>>();
	const resolve = (file: string, seen: Set<string>): Set<string> => {
		const cached = cache.get(file);
		if (cached !== undefined) return cached;
		if (seen.has(file)) return new Set();
		seen.add(file);
		const out = new Set(own.get(file) ?? []);
		for (const target of importsOf.get(file) ?? []) {
			// Only development helpers count. A production writer the test calls is the owner's door,
			// which is a different question entirely.
			if (input.census.byPath.get(target)?.kind !== "development") continue;
			for (const table of resolve(target, seen)) out.add(table);
		}
		cache.set(file, out);
		return out;
	};
	return (file: string) => resolve(file, new Set());
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

/**
 * The two spellings of ONE act: a model or agent call that does not go through `agent-execution`.
 *
 * @lore AU28 Ruling 14: `RAW_RUNTIME_SPECIFIERS` and `HARNESS_BINARIES` emit the SAME target sort.
 * They used to emit two — `raw-runtime` for a vendor SDK import, `harness` for an agent CLI spawn —
 * and that split was a detector detail (one is an import, the other a process spawn) that leaked
 * into the rule vocabulary and let the development world hold one half and wave the other through.
 * Two lists, one target: a new vendor SDK or a new agent CLI is still invisible until its list grows,
 * which is a coverage limit and stated as one, not a rule.
 */
const RAW_RUNTIME_SPECIFIERS = [
	/^openai$/,
	/^@anthropic-ai\/sdk/,
	/^@google\/generative-ai/,
	/^@modelcontextprotocol\/sdk/,
];

/**
 * Agent CLIs — the binaries that run a model.
 *
 * @lore AU28 Ruling 15: `gh` is NOT here and must never be. A harness is the thing that runs a
 * model; `gh` is the GitHub CLI and its one production use is `gh auth status`, which makes no model
 * call. Putting "every model and agent call goes through one door so it can be recorded, priced and
 * replayed" on top of a credential probe is the absurdity that ruling removes.
 */
const HARNESS_BINARIES = new Set(["claude", "codex", "opencode", "cursor-agent"]);

/**
 * @lore AU28: `exec`/`execSync` take a whole COMMAND STRING, not a binary name, so the first
 * argument is split on whitespace for those two and passed whole for the rest. Without that,
 * `execSync("claude -p 'do the thing'")` never matched the binary list — the same act as
 * `spawn("claude", [...])`, invisible because the API shape differs.
 */
const SPAWN_FUNCTIONS = new Set([
	"spawn",
	"spawnSync",
	"exec",
	"execSync",
	"execFile",
	"execFileSync",
	"fork",
]);
const COMMAND_STRING_SPAWNS = new Set(["exec", "execSync"]);

const MCP_CONSTRUCTORS = /^createMcp(Router|ToolBridge|Session)$/;

const parseFile = (path: string, source: string): ts.SourceFile =>
	ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
	sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// ---------------------------------------------------------------------------------------------
// Which layer serves which /api path
// ---------------------------------------------------------------------------------------------

const ROUTE_FUNCTIONS = new Set([
	"route",
	"use",
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"all",
	"on",
]);

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
				if (
					first !== undefined &&
					ts.isStringLiteral(first) &&
					first.text.startsWith("/") &&
					first.text.length > 1
				) {
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
		if (
			have.length > want.length &&
			!have.slice(want.length).every((segment) => segment.startsWith(":"))
		)
			continue;
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
function importOrigins(
	sf: ts.SourceFile,
	file: string,
	input: AstDetectorInput,
): Map<string, WorkspacePackage> {
	const out = new Map<string, WorkspacePackage>();
	const resolved = specifiersOf(input.census, file);
	for (const statement of sf.statements) {
		if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)))
			continue;
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
		else
			for (const element of bindings.elements)
				if (element.isTypeOnly !== true) out.set(element.name.text, target);
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
		if (
			ts.isPropertySignature(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "type" &&
			node.type !== undefined
		) {
			if (ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal))
				out.add(node.type.literal.text);
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);
	if (out.size === 0) {
		throw new Error(
			`crossing-detectors: ${module} declared no event types. An empty set silently disables the event detector.`,
		);
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
		// A production file in no package used to be SKIPPED here — silently, so the same directory
		// could also write any table it liked and be invisible. It fails closed now; see the error.
		if (owner === undefined) {
			if (record.kind === "production") throw new UnclaimedProductionFileError(record.path);
			continue;
		}
		let sf: ts.SourceFile;
		try {
			sf = parseFile(record.path, input.readFile(record.path));
		} catch {
			continue;
		}

		const world = record.kind;
		const source: Crossing["source"] = {
			sort: "package",
			name: owner.name,
			role: owner.role,
			layer: owner.layer,
		};
		const origins = importOrigins(sf, record.path, input);
		const tableRefs = buildTableRefs(sf, record.path, input);
		const dbNamespaces = tableRefs.namespaces;
		const sqlNames = drizzleSqlNames(sf);
		const stringConstants = buildStringConstants(sf);
		/** The fixed string an expression names — written out, or bound to a constant. Null otherwise. */
		const fixedString = (expr: ts.Expression): string | null =>
			ts.isStringLiteralLike(expr)
				? expr.text
				: ts.isIdentifier(expr)
					? (stringConstants.get(expr.text) ?? null)
					: null;

		// Identifiers holding a typed cross-layer port, and which layer each one reaches.
		const portRoots = new Map<string, string>();
		const collectPortRoots = (n: ts.Node): void => {
			if (
				(ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n)) &&
				ts.isIdentifier(n.name)
			) {
				const declared = n.type === undefined ? null : portKind(n.type.getText(sf));
				const init = (n as { initializer?: ts.Expression }).initializer;
				const constructed =
					init !== undefined && ts.isCallExpression(init) && ts.isIdentifier(init.expression)
						? portKind(init.expression.text)
						: null;
				const served = declared ?? constructed;
				if (served !== null) portRoots.set(n.name.text, served);
			}
			ts.forEachChild(n, collectPortRoots);
		};
		collectPortRoots(sf);

		const add = (kind: Kind, target: Target, node: ts.Node, detail: string): void => {
			out.push({
				crossing: { kind, source, target },
				file: record.path,
				line: lineOf(sf, node),
				world,
				detail,
			});
		};
		const written = input.writeSetOf(record.path);
		const tableTarget = (table: string): Target => {
			const companions = input.companions.get(table);
			const missing =
				companions === undefined ? [] : [...companions].filter((c) => !written.has(c)).sort();
			return {
				sort: "table",
				table,
				owner: input.ownerOf(table),
				...(missing.length > 0 ? { missingCompanions: missing } : {}),
			};
		};

		// --- specifier-level: raw runtimes -----------------------------------------------------
		for (const statement of sf.statements) {
			if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)))
				continue;
			const specifier = statement.moduleSpecifier.text;
			if (RAW_RUNTIME_SPECIFIERS.some((re) => re.test(specifier))) {
				add(
					"capability",
					{ sort: "raw-runtime" },
					statement,
					`imports the vendor SDK ${specifier}`,
				);
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
					const table = arg === undefined ? null : tableRefs.resolve(arg);
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
					add(
						"table:read",
						tableTarget(node.name.text),
						node,
						`reaches \`${node.expression.text}.${node.name.text}\``,
					);
				}
			}

			// --- table: a raw `sql` template naming the table as a string ----------------------
			// The TEMPLATE is what is detected, not `db.execute(...)` — that also covers `tx.execute`,
			// `exec.execute`, and a fragment handed anywhere else.
			if (
				ts.isTaggedTemplateExpression(node) &&
				ts.isIdentifier(node.tag) &&
				sqlNames.has(node.tag.text)
			) {
				for (const [table, kind] of rawSqlTables(node.template.getText(sf), input.physicalNames)) {
					add(
						kind,
						tableTarget(table),
						node,
						`raw \`sql\` template ${kind === "table:write" ? "writes" : "reads"} \`${table}\``,
					);
				}
			}

			if (ts.isCallExpression(node)) {
				const callee = node.expression;
				const name = ts.isIdentifier(callee)
					? callee.text
					: ts.isPropertyAccessExpression(callee)
						? callee.name.text
						: "";

				// --- capability: spawning an agent CLI -----------------------------------------
				if (SPAWN_FUNCTIONS.has(name)) {
					const arg = node.arguments[0];
					const spelled = arg === undefined ? null : fixedString(arg);
					if (spelled !== null) {
						const command = COMMAND_STRING_SPAWNS.has(name)
							? (spelled.trim().split(/\s+/)[0] ?? "")
							: spelled;
						const binary = command.split("/").pop() ?? command;
						if (HARNESS_BINARIES.has(binary))
							add("capability", { sort: "raw-runtime" }, node, `spawns the \`${binary}\` binary`);
					}
				}

				// --- capability: a dynamically imported vendor SDK -----------------------------
				if (callee.kind === ts.SyntaxKind.ImportKeyword) {
					const arg = node.arguments[0];
					const spelled = arg === undefined ? null : fixedString(arg);
					if (spelled !== null && RAW_RUNTIME_SPECIFIERS.some((re) => re.test(spelled))) {
						add(
							"capability",
							{ sort: "raw-runtime" },
							node,
							`dynamically imports the vendor SDK ${spelled}`,
						);
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
											.find((p) => ts.isIdentifier(p.name) && p.name.text === "type")
											?.initializer as ts.StringLiteralLike | undefined
									)?.text ?? null)
								: null;
					// A wildcard subscription is a bus subscription by definition.
					if (label !== null && (label === "*" || eventTypes.has(label))) {
						add(
							"event",
							{ sort: "event-bus" },
							callee.name,
							`${name === "on" ? "subscribes to" : "emits"} \`${label}\` (${base})`,
						);
					}
				}

				// --- mcp: constructing, registering on, or opening the router ------------------
				if (MCP_CONSTRUCTORS.test(name))
					add("mcp", { sort: "mcp-router" }, node, `calls \`${name}\``);
				if (name === "registerTool")
					add("mcp", { sort: "mcp-router" }, node, "registers a tool on the router");
				if (
					ts.isPropertyAccessExpression(callee) &&
					name === "open" &&
					/mcp/i.test(callee.expression.getText(sf))
				) {
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
					add(
						"api",
						{ sort: "http-api", layer: "core-api" },
						node,
						"subscribes over the websocket",
					);
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
						add(
							"api",
							{ sort: "http-api", layer: served },
							node,
							`calls \`${chain.join(".")}\` on the ${served} port`,
						);
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
								target: {
									sort: "package",
									name: provider.name,
									role: provider.role,
									layer: provider.layer,
								},
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
								if (ts.isPropertyAssignment(property))
									scanArgument(property.initializer, depth + 1);
								else if (ts.isShorthandPropertyAssignment(property))
									consider(property.name.text, "receives", property);
							}
							return;
						}
						if (ts.isArrayLiteralExpression(arg)) {
							for (const element of arg.elements) scanArgument(element, depth + 1);
							return;
						}
						if (ts.isCallExpression(arg)) {
							if (ts.isIdentifier(arg.expression))
								consider(arg.expression.text, "receives the result of", arg);
							for (const inner of arg.arguments) scanArgument(inner, depth + 1);
							return;
						}
						if (
							ts.isAsExpression(arg) ||
							ts.isParenthesizedExpression(arg) ||
							ts.isSatisfiesExpression(arg)
						) {
							scanArgument(arg.expression, depth);
						}
					};
					for (const arg of node.arguments) scanArgument(arg, 0);
				}
			}

			// --- mcp: a router definition or a mount point -------------------------------------
			if (
				ts.isFunctionDeclaration(node) &&
				node.name !== undefined &&
				MCP_CONSTRUCTORS.test(node.name.text)
			) {
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
						host !== undefined &&
						ts.isCallExpression(host) &&
						ts.isIdentifier(host.expression) &&
						host.expression.text === "fetch"
							? "raw fetch"
							: host !== undefined &&
									ts.isNewExpression(host) &&
									/websocket/i.test(host.expression.getText(sf))
								? "raw websocket"
								: host !== undefined &&
										ts.isVariableDeclaration(host) &&
										ts.isIdentifier(host.name) &&
										/url$/i.test(host.name.text)
									? "url built inline"
									: null;
					if (shape !== null) {
						const served = layerServing(routes, match[0]);
						if (served !== null && served !== owner.layer) {
							add(
								"api",
								{ sort: "http-api", layer: served },
								node,
								`${shape} to ${match[0]} (served by ${served})`,
							);
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
	if (/AgentOrchestration\w*Port|buildAgentOrchestrationPort/.test(text))
		return "agent-orchestration";
	if (/CoreApi\w*Port|buildCoreApiPort/.test(text)) return "core-api";
	return null;
}
