import { describe, expect, it } from "vitest";
import * as sqliteSchema from "../schema.js";
import * as pgSchema from "../schema.pg.js";

/**
 * AC5: Dual-driver support proven.
 * This test verifies that the PostgreSQL schema defines the same tables
 * and columns as the SQLite schema, ensuring dual-driver parity.
 */
describe("A2: PostgreSQL schema parity", () => {
	it("pg schema exports the same table names as sqlite schema", () => {
		const sqliteTableNames = Object.keys(sqliteSchema)
			.filter((key) => {
				const val = sqliteSchema[key as keyof typeof sqliteSchema];
				return (
					val &&
					typeof val === "object" &&
					Symbol.for("drizzle:Name") in (val as Record<symbol, unknown>)
				);
			})
			.sort();

		const pgTableNames = Object.keys(pgSchema)
			.filter((key) => {
				const val = pgSchema[key as keyof typeof pgSchema];
				return (
					val &&
					typeof val === "object" &&
					Symbol.for("drizzle:Name") in (val as Record<symbol, unknown>)
				);
			})
			.sort();

		expect(pgTableNames).toEqual(sqliteTableNames);
	});

	it("each pg table has the same column names as its sqlite counterpart", () => {
		// Get table objects from both schemas
		const sqliteTables = getTableEntries(sqliteSchema);
		const pgTables = getTableEntries(pgSchema);

		for (const [name, sqliteTable] of sqliteTables) {
			const pgTable = pgTables.get(name);
			expect(pgTable, `PG schema missing table: ${name}`).toBeDefined();

			if (pgTable) {
				const sqliteCols = getColumnNames(sqliteTable);
				const pgCols = getColumnNames(pgTable);
				expect(pgCols, `Column mismatch in table ${name}`).toEqual(sqliteCols);
			}
		}
	});
});

function getTableEntries(
	schemaModule: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
	const tables = new Map<string, Record<string, unknown>>();
	for (const [, val] of Object.entries(schemaModule)) {
		if (
			val &&
			typeof val === "object" &&
			Symbol.for("drizzle:Name") in (val as Record<symbol, unknown>)
		) {
			const tableName = (val as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] as string;
			tables.set(tableName, val as Record<string, unknown>);
		}
	}
	return tables;
}

function getColumnNames(table: Record<string, unknown>): string[] {
	const cols: string[] = [];
	for (const [, val] of Object.entries(table)) {
		if (
			val &&
			typeof val === "object" &&
			"name" in (val as Record<string, unknown>) &&
			"columnType" in (val as Record<string, unknown>)
		) {
			cols.push((val as Record<string, unknown>).name as string);
		}
	}
	return cols.sort();
}
