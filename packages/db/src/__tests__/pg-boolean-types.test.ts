import { describe, expect, it } from "vitest";
import * as sqliteSchema from "../schema.js";
import * as pgSchema from "../schema.pg.js";

/**
 * I3 — PG schema alignment acceptance tests.
 *
 * Per AC (TRACK-I.md L161-164):
 *  - Boolean columns (`delegationAllowed`, `humanReview`, `silent`, `active`,
 *    `pinned`, `blocking`) use `boolean()` in PG schema.
 *  - The schema-parity test is updated to account for the dialect-level
 *    bool/int divergence.
 *  - @lore O2: `tasks.crossTeam` stripped from the kernel tasks table as
 *    part of kernel/strategy separation. Removed from this test.
 *
 * Per plan §3.8 we choose Option A (diverge per-dialect): PG uses native
 * `boolean`, SQLite keeps `integer` (since SQLite has no native bool and the
 * 800+ existing call sites write 0/1). The intentional divergence is pinned
 * by the test below — SQLite columns must remain `integer` ('SQLiteInteger')
 * while the PG counterparts must be 'PgBoolean'.
 */

const BOOLEAN_COLUMN_LOCATIONS: Array<{
	tableName: keyof typeof pgSchema;
	columnName: string;
}> = [
	{ tableName: "routines", columnName: "delegationAllowed" },
	{ tableName: "routines", columnName: "humanReview" },
	{ tableName: "routines", columnName: "silent" },
	{ tableName: "routines", columnName: "active" },
	{ tableName: "threads", columnName: "pinned" },
	{ tableName: "items", columnName: "blocking" },
];

interface DrizzleColumn {
	name: string;
	columnType: string;
	dataType: string;
}

function getColumn(
	schemaModule: Record<string, unknown>,
	tableExportName: string,
	columnName: string,
): DrizzleColumn | undefined {
	const table = schemaModule[tableExportName] as Record<string, unknown> | undefined;
	if (!table) return undefined;
	const col = table[columnName] as DrizzleColumn | undefined;
	if (!col || typeof col !== "object" || !("columnType" in col)) {
		return undefined;
	}
	return col;
}

describe("I3: PG boolean column types", () => {
	for (const { tableName, columnName } of BOOLEAN_COLUMN_LOCATIONS) {
		it(`${String(tableName)}.${columnName} is a PG boolean column`, () => {
			const col = getColumn(pgSchema, String(tableName), columnName);
			expect(col, `expected ${String(tableName)}.${columnName} to exist`).toBeDefined();
			// Drizzle's boolean column registers `columnType: 'PgBoolean'`.
			expect(col?.columnType).toBe("PgBoolean");
		});
	}
});

describe("I3: intentional SQLite/PG dialect divergence (boolean vs integer)", () => {
	for (const { tableName, columnName } of BOOLEAN_COLUMN_LOCATIONS) {
		it(`${String(tableName)}.${columnName} stays SQLiteInteger on the SQLite side`, () => {
			const col = getColumn(
				sqliteSchema as unknown as Record<string, unknown>,
				String(tableName),
				columnName,
			);
			expect(col, `expected SQLite ${String(tableName)}.${columnName} to exist`).toBeDefined();
			// Documents the divergence: SQLite uses integer, PG uses boolean.
			expect(col?.columnType).toBe("SQLiteInteger");
		});
	}
});
