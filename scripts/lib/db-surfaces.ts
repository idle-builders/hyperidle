/**
 * AU28 — which surface of the database package an import actually lands on.
 *
 * `@hyperidle/db` is one specifier hiding eight different acts: holding a client, naming a row type,
 * reaching a table, taking the whole schema at once, seeding first boot. The rules differ per act, so
 * the specifier alone is useless — the SYMBOL decides.
 *
 * @lore AU28: tables and row types are detected from the schema source, never listed. A hand-written
 * table list goes stale the day someone adds a table, and a stale list under-detects silently, which
 * is the one failure mode the whole census design exists to prevent. The module→surface map in
 * `governance/architecture.json` is the opposite case: it is a fact about a layout that only changes
 * when someone moves a file, and a module missing from it resolves to `db:unknown` and is REPORTED
 * rather than guessed at.
 */

import ts from "typescript";

export type DbSurface =
	| "db:table"
	| "db:row-type"
	| "db:schema-ns"
	| "db:client"
	| "db:bootstrap"
	| "db:util"
	| "db:testing"
	| "db:unknown";

export interface DatabasePackageConfig {
	readonly packageName: string;
	readonly sourceRoot: string;
	readonly barrel: string;
	readonly schemaModule: string;
	readonly zodModule: string;
	readonly moduleSurface: Readonly<Record<string, DbSurface>>;
}

export interface DbResolution {
	readonly surface: DbSurface;
	/** For `db:table`, the table the symbol reaches. Otherwise undefined. */
	readonly table?: string;
	/** Why the symbol could not be placed, when the surface is `db:unknown`. */
	readonly unknownReason?: string;
}

export interface DbSurfaceIndex {
	/** Classify one imported symbol from one resolved file inside the database package. */
	readonly resolve: (toFile: string, symbol: string, namespace: boolean) => DbResolution;
	/** Every table the schema declares. */
	readonly tables: ReadonlySet<string>;
	/** Every row type the schema declares. */
	readonly rowTypes: ReadonlySet<string>;
	/** Symbols that could not be placed, symbol → reason. Reported, never silently absorbed. */
	readonly unplaced: ReadonlyMap<string, string>;
}

const parse = (path: string, source: string): ts.SourceFile =>
	ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/**
 * Build the index.
 *
 * @param readFile injected — this module does no I/O, like every other census library.
 * @throws when the schema declares no tables. A zero-table index would classify every table import
 * as `db:unknown` and quietly dissolve the ownership rule.
 */
export function buildDbSurfaceIndex(config: DatabasePackageConfig, readFile: (path: string) => string): DbSurfaceIndex {
	const unplaced = new Map<string, string>();

	// --- tables and row types, read from the schema itself -----------------------------------
	const tables = new Set<string>();
	const rowTypes = new Set<string>();
	const schema = parse(config.schemaModule, readFile(config.schemaModule));
	for (const statement of schema.statements) {
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) continue;
				const init = declaration.initializer;
				if (init !== undefined && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "pgTable") {
					tables.add(declaration.name.text);
				}
			}
		} else if (ts.isTypeAliasDeclaration(statement) && /\$infer(Select|Insert)/.test(statement.type.getText(schema))) {
			rowTypes.add(statement.name.text);
		}
	}
	if (tables.size === 0) {
		throw new Error(
			`db-surfaces: ${config.schemaModule} declared no pgTable. An index with no tables would classify every ` +
				"table reach as unknown and dissolve the ownership rule — refusing to build one.",
		);
	}

	// --- zod schemas are the same table wearing a different hat ------------------------------
	// `createSelectSchema(bets)` is a reach into `bets`. Allowing the generated schema while
	// forbidding the table would be a hole straight around the ownership rule.
	const zodTable = new Map<string, string>();
	const zod = parse(config.zodModule, readFile(config.zodModule));
	for (const statement of zod.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
			if (!ts.isCallExpression(declaration.initializer)) continue;
			const fn = declaration.initializer.expression;
			if (!ts.isIdentifier(fn) || !/^create(Select|Insert)Schema$/.test(fn.text)) continue;
			const arg = declaration.initializer.arguments[0];
			if (arg !== undefined && ts.isIdentifier(arg) && tables.has(arg.text)) zodTable.set(declaration.name.text, arg.text);
		}
	}

	// --- the barrel: symbol → the module it came from -----------------------------------------
	const barrelSurface = new Map<string, DbSurface>();
	const barrelTable = new Map<string, string>();
	const barrel = parse(config.barrel, readFile(config.barrel));
	for (const statement of barrel.statements) {
		if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) continue;
		if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
		const module = statement.moduleSpecifier.text.replace(/^\.\//, "").replace(/\.js$/, ".ts");
		const clause = statement.exportClause;
		if (clause === undefined) continue;
		if (ts.isNamespaceExport(clause)) {
			// `export * as schema from "./schema.js"` — the whole-schema door.
			barrelSurface.set(clause.name.text, "db:schema-ns");
			continue;
		}
		const schemaBase = config.schemaModule.slice(`${config.sourceRoot}/`.length);
		for (const element of clause.elements) {
			const symbol = element.name.text;
			if (module === schemaBase) {
				if (tables.has(symbol)) {
					barrelSurface.set(symbol, "db:table");
					barrelTable.set(symbol, symbol);
				} else if (rowTypes.has(symbol)) {
					barrelSurface.set(symbol, "db:row-type");
				} else {
					barrelSurface.set(symbol, "db:unknown");
					unplaced.set(symbol, `exported from ${schemaBase} but neither a pgTable nor a row type`);
				}
				continue;
			}
			const surface = config.moduleSurface[module];
			if (surface === undefined) {
				barrelSurface.set(symbol, "db:unknown");
				unplaced.set(symbol, `re-exported from ./${module}, a module governance/architecture.json does not name`);
			} else {
				barrelSurface.set(symbol, surface);
			}
		}
	}

	const prefix = `${config.sourceRoot}/`;

	const resolve = (toFile: string, symbol: string, namespace: boolean): DbResolution => {
		const base = toFile.startsWith(prefix) ? toFile.slice(prefix.length) : toFile;

		if (base.startsWith("__testing__/") || base.startsWith("__tests__/")) return { surface: "db:testing" };

		if (toFile === config.zodModule) {
			const table = zodTable.get(symbol);
			if (table !== undefined) return { surface: "db:table", table };
			if (namespace) return { surface: "db:schema-ns" };
			unplaced.set(`zod:${symbol}`, "exported from the zod module but not generated from a table");
			return { surface: "db:unknown", unknownReason: "not generated from a table" };
		}

		if (toFile === config.schemaModule) {
			if (namespace) return { surface: "db:schema-ns" };
			if (tables.has(symbol)) return { surface: "db:table", table: symbol };
			if (rowTypes.has(symbol)) return { surface: "db:row-type" };
			unplaced.set(symbol, "imported from the schema directly but neither a pgTable nor a row type");
			return { surface: "db:unknown", unknownReason: "neither a table nor a row type" };
		}

		if (toFile === config.barrel) {
			if (namespace) return { surface: "db:schema-ns" };
			const surface = barrelSurface.get(symbol);
			if (surface === undefined) {
				unplaced.set(symbol, "not present in the database package's re-export list");
				return { surface: "db:unknown", unknownReason: "not in the barrel's re-export list" };
			}
			const table = barrelTable.get(symbol);
			return table === undefined ? { surface } : { surface, table };
		}

		const surface = config.moduleSurface[base];
		if (surface !== undefined) return { surface };
		unplaced.set(`${base}:${symbol}`, `deep import of ${prefix}${base}, a module governance/architecture.json does not name`);
		return { surface: "db:unknown", unknownReason: `${base} is not a named surface` };
	};

	return { resolve, tables, rowTypes, unplaced };
}
