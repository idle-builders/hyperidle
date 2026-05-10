/**
 * Types for the mock-data inventory script (M1).
 * Architecture ref: architecture.md § Phase D — File 7
 */

export interface InventoryRow {
	path: string;
	line: number;
	symbol: string;
	kind: "import" | "symbol" | "literal-id";
	shape: string;
	importerCount: number;
	triageHint: "straight-swap" | "needs-contract" | "borderline";
}

export interface InventoryCheckResult {
	ok: boolean;
	exitCode: 0 | 1;
	added?: InventoryRow[];
	removed?: InventoryRow[];
}

export interface RunInventoryOptions {
	webSrc: string | null;
	serverSrc: string | null;
}

export interface RunInventoryCheckOptions extends RunInventoryOptions {
	inventoryPath: string;
}
