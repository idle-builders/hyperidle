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
	/**
	 * @lore AU19 Increment 5 item 6: replaces the old singular `serverSrc:
	 * string | null` (a single `packages/server/src` walk). AU19 dissolved
	 * `packages/server` into many packages (`core-api`/`agent-orchestration`/
	 * `agent-execution` Layer composition roots + their nested Service
	 * packages + the `remote-server`/`remote-worker` Application bootstraps)
	 * — a single dir no longer covers the equivalent surface, so this is now
	 * a list. See `collectAU19SrcDirs()` at the CLI entrypoint below for how
	 * the list is discovered.
	 */
	serverSrcDirs: string[];
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
