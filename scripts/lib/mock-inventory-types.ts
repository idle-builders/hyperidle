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
	/**
	 * AU17: services/ split off packages/server/src into two new workspace
	 * packages — scan them too so a file that moved (e.g.
	 * connection-provisioning.ts, lifecycle-propagation.ts) doesn't silently
	 * drop out of the inventory.
	 */
	coreAppSrc?: string | null;
	agentLayerSrc?: string | null;
}

export interface RunInventoryCheckOptions extends RunInventoryOptions {
	inventoryPath: string;
	/**
	 * Optional repo root. When set, walked paths are relativized to this prefix
	 * before comparing against the on-disk inventory so the check is portable
	 * across machines (local macOS vs CI Linux).
	 */
	repoRoot?: string;
}
