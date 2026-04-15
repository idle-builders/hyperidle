import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as sqliteSchema from "../schema.js";
import * as pgSchema from "../schema.pg.js";

// Collect all table exports from each schema by checking for table-like objects
function getTableExports(
	schema: Record<string, unknown>,
): Record<string, { tableName: string; columnNames: string[] }> {
	const tables: Record<string, { tableName: string; columnNames: string[] }> = {};

	for (const [key, value] of Object.entries(schema)) {
		// Skip type exports and non-table values
		if (
			value === null ||
			value === undefined ||
			typeof value !== "object" ||
			typeof value === "function"
		) {
			continue;
		}

		// Try to get table name — will throw for non-tables
		try {
			const tableName = getTableName(value as Parameters<typeof getTableName>[0]);
			const columns = getTableColumns(value as Parameters<typeof getTableColumns>[0]);
			tables[key] = {
				tableName,
				columnNames: Object.keys(columns).sort(),
			};
		} catch {
			// Not a table export, skip
		}
	}

	return tables;
}

describe("Schema parity: SQLite and PostgreSQL", () => {
	it("both schemas export the same table names", () => {
		const sqliteTables = getTableExports(sqliteSchema);
		const pgTables = getTableExports(pgSchema);

		const sqliteTableNames = Object.values(sqliteTables)
			.map((t) => t.tableName)
			.sort();
		const pgTableNames = Object.values(pgTables)
			.map((t) => t.tableName)
			.sort();

		expect(sqliteTableNames).toEqual(pgTableNames);
	});

	it("both schemas have the same export keys for tables", () => {
		const sqliteTables = getTableExports(sqliteSchema);
		const pgTables = getTableExports(pgSchema);

		const sqliteKeys = Object.keys(sqliteTables).sort();
		const pgKeys = Object.keys(pgTables).sort();

		expect(sqliteKeys).toEqual(pgKeys);
	});

	it("every table has the same column names in both schemas", () => {
		const sqliteTables = getTableExports(sqliteSchema);
		const pgTables = getTableExports(pgSchema);

		for (const key of Object.keys(sqliteTables)) {
			const sqliteTable = sqliteTables[key];
			const pgTable = pgTables[key];

			expect(pgTable, `PG schema missing table export: ${key}`).toBeDefined();
			if (sqliteTable && pgTable) {
				expect(pgTable.columnNames, `Column mismatch in table ${key}`).toEqual(
					sqliteTable.columnNames,
				);
			}
		}
	});
});
